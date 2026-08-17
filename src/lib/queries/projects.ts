import { db, type Project, type ProjectHealth } from "@/lib/db";
import { generateId, now } from "@/lib/ids";
import { seedDefaultStatuses } from "@/lib/queries/task-statuses";
import { deleteTask } from "@/lib/queries/tasks";
import { projectPatchTouchesTrackedFields, recordProjectFieldChanges } from "@/lib/queries/activity";

export async function listProjects(): Promise<Project[]> {
  const rows = await db.projects.toArray();
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  owner?: string;
  status?: string;
  health?: ProjectHealth;
  budgetEstimate?: number | null;
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const timestamp = now();
  const row: Project = {
    id: generateId(),
    name: input.name,
    description: input.description ?? "",
    owner: input.owner ?? "",
    status: input.status ?? "Planning",
    health: input.health ?? "green",
    budgetEstimate: input.budgetEstimate ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.projects.add(row);
  await seedDefaultStatuses(row.id);
  return row;
}

export async function updateProject(id: string, patch: Partial<Omit<Project, "id" | "createdAt">>): Promise<void> {
  const before = projectPatchTouchesTrackedFields(patch) ? await db.projects.get(id) : undefined;
  await db.projects.update(id, { ...patch, updatedAt: now() });
  // Fire-and-forget, same as updateTask's own activity-log write.
  if (before) void recordProjectFieldChanges(before, patch);
}

/** Deletes a project and every record that belongs to it, including each task's own dependents. */
export async function deleteProject(id: string): Promise<void> {
  const [taskIds, statusIds, fieldDefIds, milestoneIds, ruleIds, runLogIds] = await Promise.all([
    db.tasks.where("projectId").equals(id).primaryKeys(),
    db.taskStatuses.where("projectId").equals(id).primaryKeys(),
    db.customFieldDefs.where("projectId").equals(id).primaryKeys(),
    db.milestones.where("projectId").equals(id).primaryKeys(),
    db.automationRules.where("projectId").equals(id).primaryKeys(),
    db.automationRunLog.where("projectId").equals(id).primaryKeys(),
  ]);

  // Task deletion cascades subtasks/attachments/customFieldValues/dependencies/recurrence/comments
  // per task (Phase 6).
  for (const taskId of taskIds) {
    await deleteTask(taskId as string);
  }

  await db.transaction(
    "rw",
    [
      db.projects,
      db.taskStatuses,
      db.customFieldDefs,
      db.customFieldValues,
      db.milestones,
      db.automationRules,
      db.automationRunLog,
      db.comments,
      db.fieldChangeLog,
    ],
    async () => {
      await db.taskStatuses.bulkDelete(statusIds);
      await db.customFieldValues.where("fieldId").anyOf(fieldDefIds as string[]).delete();
      await db.customFieldDefs.bulkDelete(fieldDefIds);
      await db.milestones.bulkDelete(milestoneIds);
      // Phase 5: rules and their run log are cleared with the project — unlike deleteTask (which
      // deliberately leaves automationRunLog alone, see AGENTS.md), there's no per-project view left
      // to ever read these once the project itself is gone, so keeping them would just be permanent,
      // invisible IndexedDB bloat rather than a useful historical record.
      await db.automationRules.bulkDelete(ruleIds);
      await db.automationRunLog.bulkDelete(runLogIds);
      // Phase 6: the project's own comment thread (every task's thread is already gone via the
      // deleteTask loop above) and every fieldChangeLog row scoped to this project — same
      // "no view left to read an orphan" reasoning as automationRunLog just above, applied to the
      // audit log. deleteTask itself deliberately leaves fieldChangeLog alone for the identical
      // reason it leaves automationRunLog alone (see AGENTS.md); this project-wide sweep is what
      // eventually clears those rows once the whole project goes.
      await db.comments.where("entityId").equals(id).delete();
      await db.fieldChangeLog.where("projectId").equals(id).delete();
      await db.projects.delete(id);
    }
  );
}
