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
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
  };
  await db.tasks.add(row);
  return row;
}

export async function updateTask(id: string, patch: Partial<Omit<Task, "id" | "createdAt">>): Promise<void> {
  await db.tasks.update(id, { ...patch, updatedAt: now() });
}

/** Marks a task done/not-done, keeping completedAt in sync for future analytics (cycle time, burndown). */
export async function setTaskCompleted(id: string, completed: boolean): Promise<void> {
  await db.tasks.update(id, { completedAt: completed ? now() : null, updatedAt: now() });
}

export async function deleteTask(id: string): Promise<void> {
  await db.transaction(
    "rw",
    [db.tasks, db.subtasks, db.attachments, db.customFieldValues, db.taskDependencies, db.recurrenceRules],
    async () => {
      await db.subtasks.where("taskId").equals(id).delete();
      await db.attachments.where("taskId").equals(id).delete();
      await db.customFieldValues.where("taskId").equals(id).delete();
      await db.taskDependencies.where("taskId").equals(id).delete();
      await db.taskDependencies.where("dependsOnTaskId").equals(id).delete();
      await db.recurrenceRules.where("taskId").equals(id).delete();
      await db.tasks.delete(id);
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

export async function addDependency(taskId: string, dependsOnTaskId: string, type: DependencyType): Promise<TaskDependency> {
  const row: TaskDependency = { id: generateId(), taskId, dependsOnTaskId, type, createdAt: now() };
  await db.taskDependencies.add(row);
  return row;
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
