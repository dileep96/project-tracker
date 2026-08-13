import { db, type Project, type ProjectHealth } from "@/lib/db";
import { generateId, now } from "@/lib/ids";
import { seedDefaultStatuses } from "@/lib/queries/task-statuses";
import { deleteTask } from "@/lib/queries/tasks";

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
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.projects.add(row);
  await seedDefaultStatuses(row.id);
  return row;
}

export async function updateProject(id: string, patch: Partial<Omit<Project, "id" | "createdAt">>): Promise<void> {
  await db.projects.update(id, { ...patch, updatedAt: now() });
}

/** Deletes a project and every record that belongs to it, including each task's own dependents. */
export async function deleteProject(id: string): Promise<void> {
  const [taskIds, statusIds, fieldDefIds, milestoneIds] = await Promise.all([
    db.tasks.where("projectId").equals(id).primaryKeys(),
    db.taskStatuses.where("projectId").equals(id).primaryKeys(),
    db.customFieldDefs.where("projectId").equals(id).primaryKeys(),
    db.milestones.where("projectId").equals(id).primaryKeys(),
  ]);

  // Task deletion cascades subtasks/attachments/customFieldValues/dependencies/recurrence per task.
  for (const taskId of taskIds) {
    await deleteTask(taskId as string);
  }

  await db.transaction(
    "rw",
    [db.projects, db.taskStatuses, db.customFieldDefs, db.customFieldValues, db.milestones],
    async () => {
      await db.taskStatuses.bulkDelete(statusIds);
      await db.customFieldValues.where("fieldId").anyOf(fieldDefIds as string[]).delete();
      await db.customFieldDefs.bulkDelete(fieldDefIds);
      await db.milestones.bulkDelete(milestoneIds);
      await db.projects.delete(id);
    }
  );
}
