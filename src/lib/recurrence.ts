import { db, type RecurrenceFrequency, type RecurrenceRule, type Task } from "@/lib/db";
import { listStatusesForProject } from "@/lib/queries/task-statuses";
import { createTask } from "@/lib/queries/tasks";

const DAY_MS = 86_400_000;

/**
 * Bounded lookahead — instances are only ever materialized up to this many days out, never to
 * "the end of time." Re-running generation is idempotent (see the dedupe check below), so
 * shrinking or growing this constant later just changes how far future occurrences reach on the
 * next run; it never has to backfill or truncate anything retroactively.
 */
export const RECURRENCE_LOOKAHEAD_DAYS = 60;

/** A hard iteration backstop, independent of the lookahead window, so a future bug in the date
 *  math (e.g. an interval of 0 slipping past validation) degrades to "stops generating" instead
 *  of a runaway loop. Never realistically reached — 60 days of daily/interval-1 occurrences is ~60. */
const MAX_OCCURRENCES_PER_RUN = 500;

function addInterval(epochMs: number, frequency: RecurrenceFrequency, steps: number): number {
  const d = new Date(epochMs);
  switch (frequency) {
    case "daily":
      d.setDate(d.getDate() + steps);
      break;
    case "weekly":
      d.setDate(d.getDate() + steps * 7);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + steps);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + steps);
      break;
  }
  return d.getTime();
}

/**
 * Generates any not-yet-created occurrences of `task`'s recurrence rule that fall within the
 * lookahead window, cloning the template's fields onto each new Task row.
 *
 * Occurrence dates are computed as `anchor + rule.interval * n` steps from the template's own
 * date (never chained off the previously-generated instance), so re-running this after an
 * instance was deleted or the window changed can't drift or duplicate — the same n always
 * produces the same date, and that date is the dedupe key.
 */
export async function generateInstancesForTask(task: Task, rule: RecurrenceRule): Promise<number> {
  // A task needs at least one date to recur from — recur off the due date when present (so
  // duration to a start date is preserved), otherwise off the start date alone.
  const anchorField: "due" | "start" | null = task.dueDate !== null ? "due" : task.startDate !== null ? "start" : null;
  if (anchorField === null) return 0;

  const anchorDate = anchorField === "due" ? task.dueDate! : task.startDate!;
  const durationMs = anchorField === "due" && task.startDate !== null ? task.dueDate! - task.startDate : null;

  const existingInstances = await db.tasks.where("recurrenceParentId").equals(task.id).toArray();
  const existingAnchorDates = new Set(existingInstances.map((t) => (anchorField === "due" ? t.dueDate : t.startDate)));

  const windowEnd = Date.now() + RECURRENCE_LOOKAHEAD_DAYS * DAY_MS;
  const defaultStatusId = (await listStatusesForProject(task.projectId)).find((s) => s.isDefault)?.id ?? task.statusId;

  let created = 0;
  for (let n = 1; n <= MAX_OCCURRENCES_PER_RUN; n++) {
    // endCount counts total occurrences including the template itself as #1, so the n-th
    // generated instance is occurrence (n + 1).
    if (rule.endType === "afterCount" && rule.endCount !== null && n + 1 > rule.endCount) break;

    const occurrenceAnchor = addInterval(anchorDate, rule.frequency, rule.interval * n);
    if (occurrenceAnchor > windowEnd) break;
    if (rule.endType === "onDate" && rule.endDate !== null && occurrenceAnchor > rule.endDate) break;

    if (!existingAnchorDates.has(occurrenceAnchor)) {
      const dueDate = anchorField === "due" ? occurrenceAnchor : null;
      const startDate =
        anchorField === "due" ? (durationMs !== null ? occurrenceAnchor - durationMs : null) : occurrenceAnchor;
      await createTask({
        projectId: task.projectId,
        title: task.title,
        description: task.description,
        priority: task.priority,
        startDate,
        dueDate,
        statusId: defaultStatusId,
        assignee: task.assignee,
        tags: task.tags,
        milestoneId: task.milestoneId,
        recurrenceParentId: task.id,
      });
      created++;
    }
  }
  return created;
}

/** Runs generation for every recurrence rule in the database. Safe to call as often as you like — see module doc. */
export async function generateRecurringInstances(): Promise<{ created: number }> {
  const rules = await db.recurrenceRules.toArray();
  let created = 0;
  for (const rule of rules) {
    const task = await db.tasks.get(rule.taskId);
    if (!task) continue; // orphaned rule — deleteTask cascades so this shouldn't happen, but never crash over it
    created += await generateInstancesForTask(task, rule);
  }
  return { created };
}

/** Scoped convenience for the one rule a user just created or edited, so the UI can show the result immediately. */
export async function generateRecurringInstancesForTask(taskId: string): Promise<number> {
  const [task, rule] = await Promise.all([
    db.tasks.get(taskId),
    db.recurrenceRules.where("taskId").equals(taskId).first(),
  ]);
  if (!task || !rule) return 0;
  return generateInstancesForTask(task, rule);
}
