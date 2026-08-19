import { db } from "@/lib/db";
import { now } from "@/lib/ids";

export interface MoveTasksResult {
  /** Task ids that were actually moved. */
  moved: string[];
  /** Task ids skipped because they're a recurring template or a generated instance — see below. */
  skippedRecurring: string[];
  /** Task ids skipped because they were already in the target project. */
  skippedSameProject: string[];
}

/**
 * Moves a set of tasks to a different project, all inside one transaction — either every eligible
 * task moves together or, on a genuine failure, none of them do.
 *
 * A task's `statusId`/`milestoneId` and project-scoped custom field values only mean something
 * inside the project that defined them, so a move can't just repoint `projectId` and call it done:
 *
 * - `statusId` is resolved on the target project by exact status *name* match (the same
 *   exact-name-match join this app already uses for `Task.assignee` <-> `Person`, and for global
 *   custom field defs during JSON import — see `lib/io/import.ts`); falls back to the target's own
 *   default status, then to its first status by `order`, so a moved task is never left pointing at
 *   a status that doesn't exist on its new project.
 * - `milestoneId` is always cleared — milestones are per-project, and the old one doesn't exist on
 *   the target project.
 * - Custom field values tied to a *project-scoped* field def are dropped (the field doesn't exist
 *   on the target project — the same scope the JSON exporter already documents for exactly this
 *   reason); values tied to a *global* field def (`projectId: null`, shared by every project) are
 *   kept as-is.
 * - `timeEntries.projectId` and `comments.projectId` are denormalized copies of the task's own
 *   project (kept for query convenience, see db.ts), updated here so Timesheets/Budget and the
 *   project-scoped Activity tab stay correct after the move.
 * - Task dependencies aren't project-scoped in this app already (`taskDependencies` has no
 *   project-scoping constraint by design — see db.ts), so a moved task's dependency edges need no
 *   change at all, including edges into tasks that stayed behind in the old project.
 * - A recurring template (`Task.isRecurring`) or one of its generated instances
 *   (`Task.recurrenceParentId !== null`) is never moved — its `recurrenceRules` row and sibling
 *   instances only make sense inside the project they were generated in, and moving just one side
 *   of that relationship would silently break it. These come back in `skippedRecurring` rather than
 *   throwing, so the rest of a mixed selection still moves.
 */
export async function moveTasksToProject(taskIds: string[], targetProjectId: string): Promise<MoveTasksResult> {
  return db.transaction(
    "rw",
    [db.tasks, db.taskStatuses, db.customFieldDefs, db.customFieldValues, db.timeEntries, db.comments],
    async () => {
      const [tasks, targetStatuses, allFieldDefs] = await Promise.all([
        db.tasks.bulkGet(taskIds),
        db.taskStatuses.where("projectId").equals(targetProjectId).toArray(),
        db.customFieldDefs.toArray(),
      ]);
      const projectScopedFieldIds = new Set(allFieldDefs.filter((f) => f.projectId !== null).map((f) => f.id));
      const statusIdByName = new Map(targetStatuses.map((s) => [s.name, s.id]));
      const fallbackStatusId = targetStatuses.find((s) => s.isDefault)?.id ?? targetStatuses[0]?.id;

      const result: MoveTasksResult = { moved: [], skippedRecurring: [], skippedSameProject: [] };
      const timestamp = now();

      for (const task of tasks) {
        if (!task) continue;
        if (task.isRecurring || task.recurrenceParentId !== null) {
          result.skippedRecurring.push(task.id);
          continue;
        }
        if (task.projectId === targetProjectId) {
          result.skippedSameProject.push(task.id);
          continue;
        }

        const oldStatusName = (await db.taskStatuses.get(task.statusId))?.name;
        const newStatusId = (oldStatusName && statusIdByName.get(oldStatusName)) ?? fallbackStatusId;
        if (!newStatusId) continue; // target project has no statuses at all — shouldn't happen, never write a broken FK

        await db.tasks.update(task.id, {
          projectId: targetProjectId,
          statusId: newStatusId,
          milestoneId: null,
          updatedAt: timestamp,
        });

        const values = await db.customFieldValues.where("taskId").equals(task.id).toArray();
        const idsToDrop = values.filter((v) => projectScopedFieldIds.has(v.fieldId)).map((v) => v.id);
        if (idsToDrop.length > 0) await db.customFieldValues.bulkDelete(idsToDrop);

        await db.timeEntries.where("taskId").equals(task.id).modify({ projectId: targetProjectId });
        await db.comments.where("entityId").equals(task.id).modify({ projectId: targetProjectId });

        result.moved.push(task.id);
      }

      return result;
    }
  );
}
