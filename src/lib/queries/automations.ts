import { toast } from "sonner";
import {
  db,
  type AutomationAction,
  type AutomationCondition,
  type AutomationRule,
  type AutomationRunLogEntry,
  type AutomationTrigger,
  type AutomationTriggerType,
  type Task,
} from "@/lib/db";
import { generateId, now } from "@/lib/ids";
import { setCustomFieldValue } from "@/lib/queries/tasks";

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listRulesForProject(projectId: string): Promise<AutomationRule[]> {
  const rows = await db.automationRules.where("projectId").equals(projectId).toArray();
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export interface AutomationRuleInput {
  projectId: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  condition: AutomationCondition | null;
  actions: AutomationAction[];
}

export async function createAutomationRule(input: AutomationRuleInput): Promise<AutomationRule> {
  const timestamp = now();
  const row: AutomationRule = { id: generateId(), createdAt: timestamp, updatedAt: timestamp, ...input };
  await db.automationRules.add(row);
  // Mirrors setRecurrence's "run generation immediately on save" — a rule aimed at already-overdue
  // tasks should show a result right away instead of waiting for the next sweep (mount or interval).
  if (row.enabled && row.trigger.type === "taskOverdue") await runOverdueAutomationSweep();
  return row;
}

export async function updateAutomationRule(id: string, patch: Partial<AutomationRuleInput>): Promise<void> {
  await db.automationRules.update(id, { ...patch, updatedAt: now() });
  const updated = await db.automationRules.get(id);
  if (updated?.enabled && updated.trigger.type === "taskOverdue") await runOverdueAutomationSweep();
}

export async function setAutomationRuleEnabled(id: string, enabled: boolean): Promise<void> {
  await updateAutomationRule(id, { enabled });
}

export async function deleteAutomationRule(id: string): Promise<void> {
  await db.automationRules.delete(id);
}

// ---------------------------------------------------------------------------
// Condition matching
// ---------------------------------------------------------------------------

function conditionMatches(condition: AutomationCondition | null, task: Task): boolean {
  if (!condition) return true;
  const value = condition.value.trim().toLowerCase();
  switch (condition.field) {
    case "priority":
      return task.priority === condition.value;
    case "tag":
      return task.tags.some((t) => t.toLowerCase() === value);
    case "assignee":
      return task.assignee.trim().toLowerCase() === value;
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Action execution
// ---------------------------------------------------------------------------

/**
 * Applies one action directly via `db.tasks.update` — deliberately NOT through
 * `queries/tasks.ts`'s `updateTask`, which is what fires `statusChanged` automations in the first
 * place. Routing an action's own mutation back through that hook would let a rule chain-trigger
 * more rules (or itself) from the same firing — a misconfigured rule ("on status -> X, set status
 * -> X") would infinite-loop. Automation actions intentionally evaluate only against the ORIGINAL
 * triggering event, never cascade into new trigger evaluation — see AGENTS.md.
 */
async function applyAction(action: AutomationAction, task: Task): Promise<string | null> {
  switch (action.type) {
    case "changeStatus": {
      if (!action.statusId || action.statusId === task.statusId) return null;
      const status = await db.taskStatuses.get(action.statusId);
      if (!status || status.projectId !== task.projectId) return null;
      await db.tasks.update(task.id, { statusId: action.statusId, updatedAt: now() });
      return `set status to "${status.name}"`;
    }
    case "changePriority": {
      if (!action.priority || action.priority === task.priority) return null;
      await db.tasks.update(task.id, { priority: action.priority, updatedAt: now() });
      return `set priority to ${action.priority}`;
    }
    case "addTag": {
      const tag = action.tag?.trim();
      if (!tag || task.tags.includes(tag)) return null;
      await db.tasks.update(task.id, { tags: [...task.tags, tag], updatedAt: now() });
      return `added tag "${tag}"`;
    }
    case "setAssignee": {
      const assignee = action.assignee?.trim() ?? "";
      if (assignee === task.assignee) return null;
      await db.tasks.update(task.id, { assignee, updatedAt: now() });
      return `set assignee to ${assignee || "unassigned"}`;
    }
    case "setCustomField": {
      if (!action.customFieldId) return null;
      const field = await db.customFieldDefs.get(action.customFieldId);
      if (!field) return null;
      await setCustomFieldValue(task.id, action.customFieldId, action.customFieldValue ?? "");
      return `set "${field.name}" to "${action.customFieldValue ?? ""}"`;
    }
    case "notify": {
      const message = action.message?.trim();
      return message ? `notify: ${message}` : "notify";
    }
    default:
      return null;
  }
}

/** Evaluates the rule's condition, applies every action, and — only if at least one action actually did something — writes one run-log row and shows one toast for the whole firing. */
async function executeRule(rule: AutomationRule, task: Task, trigger: AutomationTriggerType): Promise<void> {
  if (!conditionMatches(rule.condition, task)) return;
  const parts: string[] = [];
  for (const action of rule.actions) {
    try {
      const result = await applyAction(action, task);
      if (result) parts.push(result);
    } catch (error) {
      console.error(`Automation "${rule.name}" action failed`, error);
    }
  }
  if (parts.length === 0) return;
  const summary = parts.join("; ");
  await db.automationRunLog.add({
    id: generateId(),
    ruleId: rule.id,
    ruleName: rule.name,
    projectId: rule.projectId,
    taskId: task.id,
    taskTitle: task.title,
    trigger,
    summary,
    firedAt: now(),
  });
  toast.success(`Automation "${rule.name}" ran`, { description: `${task.title} — ${summary}` });
}

// ---------------------------------------------------------------------------
// Event entry points — called from queries/tasks.ts and App.tsx's overdue sweep. Every entry
// point swallows its own errors so a broken rule can never break the task mutation that triggered
// it or the app-startup sweep — see AGENTS.md.
// ---------------------------------------------------------------------------

async function enabledRulesForProject(projectId: string, type: AutomationTriggerType): Promise<AutomationRule[]> {
  const rows = await db.automationRules.where("projectId").equals(projectId).toArray();
  return rows.filter((r) => r.enabled && r.trigger.type === type);
}

export async function runTaskCreatedAutomations(task: Task): Promise<void> {
  try {
    const rules = await enabledRulesForProject(task.projectId, "taskCreated");
    for (const rule of rules) await executeRule(rule, task, "taskCreated");
  } catch (error) {
    console.error("Automation (task created) failed", error);
  }
}

export async function runStatusChangedAutomations(task: Task, previousStatusId: string): Promise<void> {
  try {
    if (task.statusId === previousStatusId) return;
    const rules = await enabledRulesForProject(task.projectId, "statusChanged");
    for (const rule of rules) {
      if (rule.trigger.statusId === task.statusId) await executeRule(rule, task, "statusChanged");
    }
  } catch (error) {
    console.error("Automation (status changed) failed", error);
  }
}

/**
 * Scans every project's "task became overdue" rules against every open, overdue task, dedupe'd
 * against `automationRunLog` (has this rule already fired for this task, via this trigger, ever?)
 * so a task that's been overdue for a week doesn't re-toast on every sweep. There's no "un-fire"
 * on completing then re-opening a task past its due date again — a deliberately simple ledger, not
 * a resettable state machine; see AGENTS.md. Called on app startup, on an interval, and immediately
 * after saving a rule with this trigger (see createAutomationRule/updateAutomationRule above).
 */
export async function runOverdueAutomationSweep(): Promise<{ fired: number }> {
  try {
    const rules = (await db.automationRules.toArray()).filter((r) => r.enabled && r.trigger.type === "taskOverdue");
    if (rules.length === 0) return { fired: 0 };
    const tasks = await db.tasks.toArray();
    const nowTs = now();
    let fired = 0;
    for (const rule of rules) {
      const candidates = tasks.filter(
        (t) => t.projectId === rule.projectId && t.completedAt === null && t.dueDate !== null && t.dueDate < nowTs
      );
      for (const task of candidates) {
        const alreadyFired = await db.automationRunLog
          .where("[ruleId+taskId]")
          .equals([rule.id, task.id])
          .and((e) => e.trigger === "taskOverdue")
          .count();
        if (alreadyFired > 0) continue;
        const before = await db.automationRunLog.count();
        await executeRule(rule, task, "taskOverdue");
        const after = await db.automationRunLog.count();
        if (after > before) fired++;
      }
    }
    return { fired };
  } catch (error) {
    console.error("Automation (overdue sweep) failed", error);
    return { fired: 0 };
  }
}

// ---------------------------------------------------------------------------
// Run log
// ---------------------------------------------------------------------------

export async function listRunLogForProject(projectId: string, limit = 50): Promise<AutomationRunLogEntry[]> {
  const rows = await db.automationRunLog.where("projectId").equals(projectId).toArray();
  return rows.sort((a, b) => b.firedAt - a.firedAt).slice(0, limit);
}
