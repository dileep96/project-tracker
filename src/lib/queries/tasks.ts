import {
  db,
  type DependencyType,
  type RecurrenceEndType,
  type RecurrenceFrequency,
  type Subtask,
  type Task,
  type TaskDependency,
  type TaskPriority,
} from "@/lib/db";
import { generateId, now } from "@/lib/ids";
import { normalizeDependencyEdges, wouldCreateCycle } from "@/lib/dependency-graph";
import { runStatusChangedAutomations, runTaskCreatedAutomations } from "@/lib/queries/automations";
import { recordTaskFieldChanges, taskPatchTouchesTrackedFields } from "@/lib/queries/activity";

export interface CreateTaskInput {
  projectId: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  startDate?: number | null;
  dueDate?: number | null;
  statusId: string;
  assignee?: string;
  tags?: string[];
  milestoneId?: string | null;
  /** Set only by the recurrence generator when cloning a new occurrence. */
  recurrenceParentId?: string | null;
  estimatedHours?: number | null;
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const timestamp = now();
  const row: Task = {
    id: generateId(),
    projectId: input.projectId,
    title: input.title,
    description: input.description ?? "",
    priority: input.priority ?? "medium",
    startDate: input.startDate ?? null,
    dueDate: input.dueDate ?? null,
    statusId: input.statusId,
    assignee: input.assignee ?? "",
    tags: input.tags ?? [],
    milestoneId: input.milestoneId ?? null,
    isRecurring: false,
    recurrenceParentId: input.recurrenceParentId ?? null,
    estimatedHours: input.estimatedHours ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
  };
  await db.tasks.add(row);
  // Fire-and-forget: runTaskCreatedAutomations never throws (see automations.ts) and task
  // creation shouldn't wait on rule evaluation to resolve.
  void runTaskCreatedAutomations(row);
  return row;
}

export async function updateTask(id: string, patch: Partial<Omit<Task, "id" | "createdAt">>): Promise<void> {
  // Only fetched when the patch actually touches statusId (for automations) or a Phase 6 tracked
  // field (for the activity log) — every other call site (e.g. a description edit) skips this
  // extra read entirely.
  const needsBefore = patch.statusId !== undefined || taskPatchTouchesTrackedFields(patch);
  const before = needsBefore ? await db.tasks.get(id) : undefined;
  await db.tasks.update(id, { ...patch, updatedAt: now() });
  if (before && patch.statusId !== undefined && patch.statusId !== before.statusId) {
    const after = await db.tasks.get(id);
    if (after) void runStatusChangedAutomations(after, before.statusId);
  }
  // Fire-and-forget, same as the automation trigger above — an activity-log write shouldn't make
  // every task edit wait on it.
  if (before) void recordTaskFieldChanges(before, patch);
}

/** Marks a task done/not-done, keeping completedAt in sync for future analytics (cycle time, burndown). */
export async function setTaskCompleted(id: string, completed: boolean): Promise<void> {
  await db.tasks.update(id, { completedAt: completed ? now() : null, updatedAt: now() });
}

/**
 * Deletes a task and, when it's a recurrence template, every instance generated from it too —
 * otherwise those instances would keep pointing at a `recurrenceParentId` that no longer exists.
 * Generated instances never have instances of their own, so this recurses at most one level.
 */
export async function deleteTask(id: string): Promise<void> {
  const instanceIds = await db.tasks.where("recurrenceParentId").equals(id).primaryKeys();
  await cascadeDeleteTasks([id, ...(instanceIds as string[])]);
}

async function cascadeDeleteTasks(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.transaction(
    "rw",
    [
      db.tasks,
      db.subtasks,
      db.attachments,
      db.customFieldValues,
      db.taskDependencies,
      db.recurrenceRules,
      db.timeEntries,
      db.activeTimers,
      db.comments,
      db.notificationReadState,
    ],
    async () => {
      for (const id of ids) {
        await db.subtasks.where("taskId").equals(id).delete();
        await db.attachments.where("taskId").equals(id).delete();
        await db.customFieldValues.where("taskId").equals(id).delete();
        await db.taskDependencies.where("taskId").equals(id).delete();
        await db.taskDependencies.where("dependsOnTaskId").equals(id).delete();
        await db.recurrenceRules.where("taskId").equals(id).delete();
        // Phase 4: time logged against a deleted task is task-owned data, same as its subtasks/
        // attachments above — it goes with the task rather than surviving as an orphan. If a timer
        // happens to be running for this exact task, stop it too instead of leaving it pointing at
        // a task that no longer exists.
        await db.timeEntries.where("taskId").equals(id).delete();
        const runningTimer = await db.activeTimers.get("current");
        if (runningTimer?.taskId === id) await db.activeTimers.delete("current");
        // Phase 6: a task's own comment thread is owned content, deleted with it (same treatment
        // as subtasks/attachments above) — unlike `fieldChangeLog`/`automationRunLog`, which are
        // historical logs deliberately left in place, see AGENTS.md. Deadline-notification
        // read-state for this task is cleaned up too; automation/risk read-state rows are left
        // (see `NotificationReadState.taskId`'s doc comment in db.ts).
        await db.comments.where("entityId").equals(id).delete();
        await db.notificationReadState.where("taskId").equals(id).delete();
      }
      await db.tasks.bulkDelete(ids);
    }
  );
}

// ---------------------------------------------------------------------------
// Subtasks / checklist
// ---------------------------------------------------------------------------

export async function listSubtasksForTask(taskId: string): Promise<Subtask[]> {
  const rows = await db.subtasks.where("taskId").equals(taskId).toArray();
  return rows.sort((a, b) => a.order - b.order);
}

export async function addSubtask(taskId: string, text: string): Promise<Subtask> {
  const existing = await listSubtasksForTask(taskId);
  const row: Subtask = { id: generateId(), taskId, text, done: false, order: existing.length };
  await db.subtasks.add(row);
  return row;
}

export async function updateSubtask(id: string, patch: Partial<Omit<Subtask, "id" | "taskId">>): Promise<void> {
  await db.subtasks.update(id, patch);
}

export async function deleteSubtask(id: string): Promise<void> {
  await db.subtasks.delete(id);
}

export async function reorderSubtasks(taskId: string, orderedIds: string[]): Promise<void> {
  await db.transaction("rw", db.subtasks, async () => {
    await Promise.all(orderedIds.map((id, index) => db.subtasks.update(id, { order: index })));
  });
  void taskId; // kept for call-site clarity; order is derived purely from orderedIds
}

// ---------------------------------------------------------------------------
// Dependencies (cross-project safe: dependsOnTaskId is not scoped to taskId's project)
// ---------------------------------------------------------------------------

export async function listDependenciesForTask(taskId: string): Promise<TaskDependency[]> {
  return db.taskDependencies.where("taskId").equals(taskId).toArray();
}

export type AddDependencyResult = { ok: true; dependency: TaskDependency } | { ok: false; reason: string };

/**
 * Rejects self-dependencies and anything that would close a cycle in the cross-project
 * precedence graph (dependencies aren't project-scoped, so the check runs over every
 * dependency row, not just this task's own). The Gantt critical-path pass assumes an acyclic
 * graph — this is what keeps that assumption true instead of it silently producing nonsense.
 */
export async function addDependency(
  taskId: string,
  dependsOnTaskId: string,
  type: DependencyType
): Promise<AddDependencyResult> {
  if (taskId === dependsOnTaskId) {
    return { ok: false, reason: "A task can't depend on itself." };
  }
  const [predecessorId, successorId] = type === "blocked-by" ? [dependsOnTaskId, taskId] : [taskId, dependsOnTaskId];
  const existingEdges = normalizeDependencyEdges(await db.taskDependencies.toArray());
  if (wouldCreateCycle(existingEdges, predecessorId, successorId)) {
    return { ok: false, reason: "That would create a circular dependency." };
  }
  const row: TaskDependency = { id: generateId(), taskId, dependsOnTaskId, type, createdAt: now() };
  await db.taskDependencies.add(row);
  return { ok: true, dependency: row };
}

export async function removeDependency(id: string): Promise<void> {
  await db.taskDependencies.delete(id);
}

// ---------------------------------------------------------------------------
// Recurrence — schema-complete stub. Instance generation lands in Phase 2.
// ---------------------------------------------------------------------------

export interface RecurrenceRuleInput {
  frequency: RecurrenceFrequency;
  interval: number;
  endType: RecurrenceEndType;
  endDate?: number | null;
  endCount?: number | null;
}

export async function setRecurrence(taskId: string, rule: RecurrenceRuleInput): Promise<void> {
  await db.transaction("rw", db.recurrenceRules, db.tasks, async () => {
    const existing = await db.recurrenceRules.where("taskId").equals(taskId).first();
    if (existing) {
      await db.recurrenceRules.update(existing.id, {
        frequency: rule.frequency,
        interval: rule.interval,
        endType: rule.endType,
        endDate: rule.endDate ?? null,
        endCount: rule.endCount ?? null,
      });
    } else {
      await db.recurrenceRules.add({
        id: generateId(),
        taskId,
        frequency: rule.frequency,
        interval: rule.interval,
        endType: rule.endType,
        endDate: rule.endDate ?? null,
        endCount: rule.endCount ?? null,
        createdAt: now(),
      });
    }
    await db.tasks.update(taskId, { isRecurring: true, updatedAt: now() });
  });
}

export async function clearRecurrence(taskId: string): Promise<void> {
  await db.transaction("rw", db.recurrenceRules, db.tasks, async () => {
    await db.recurrenceRules.where("taskId").equals(taskId).delete();
    await db.tasks.update(taskId, { isRecurring: false, updatedAt: now() });
  });
}

// ---------------------------------------------------------------------------
// Custom field values
// ---------------------------------------------------------------------------

export async function getCustomFieldValuesForTask(taskId: string): Promise<Record<string, string>> {
  const rows = await db.customFieldValues.where("taskId").equals(taskId).toArray();
  return Object.fromEntries(rows.map((r) => [r.fieldId, r.value]));
}

export async function setCustomFieldValue(taskId: string, fieldId: string, value: string): Promise<void> {
  const existing = await db.customFieldValues.where("[taskId+fieldId]").equals([taskId, fieldId]).first();
  if (existing) {
    await db.customFieldValues.update(existing.id, { value });
  } else {
    await db.customFieldValues.add({ id: generateId(), taskId, fieldId, value });
  }
}
