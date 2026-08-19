import { db, DEFAULT_TASK_STATUSES, type TaskStatus } from "@/lib/db";
import { generateId, now } from "@/lib/ids";

export async function listStatusesForProject(projectId: string): Promise<TaskStatus[]> {
  const statuses = await db.taskStatuses.where("projectId").equals(projectId).toArray();
  return statuses.sort((a, b) => a.order - b.order);
}

/** Seeds the default To Do / In Progress / Done workflow for a brand-new project. Returns the default status's id. */
export async function seedDefaultStatuses(projectId: string): Promise<string> {
  const rows: TaskStatus[] = DEFAULT_TASK_STATUSES.map((name, index) => ({
    id: generateId(),
    projectId,
    name,
    order: index,
    isDefault: index === 0,
    isDone: name === "Done",
    createdAt: now(),
  }));
  await db.taskStatuses.bulkAdd(rows);
  return rows[0].id;
}

export async function createStatus(projectId: string, name: string): Promise<TaskStatus> {
  const existing = await listStatusesForProject(projectId);
  const row: TaskStatus = {
    id: generateId(),
    projectId,
    name,
    order: existing.length,
    isDefault: existing.length === 0,
    isDone: false,
    createdAt: now(),
  };
  await db.taskStatuses.add(row);
  return row;
}

export async function renameStatus(id: string, name: string): Promise<void> {
  await db.taskStatuses.update(id, { name });
}

export async function moveStatus(projectId: string, id: string, direction: "up" | "down"): Promise<void> {
  const statuses = await listStatusesForProject(projectId);
  const index = statuses.findIndex((s) => s.id === id);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= statuses.length) return;
  const a = statuses[index];
  const b = statuses[swapWith];
  await db.transaction("rw", db.taskStatuses, async () => {
    await db.taskStatuses.update(a.id, { order: b.order });
    await db.taskStatuses.update(b.id, { order: a.order });
  });
}

export async function setDefaultStatus(projectId: string, id: string): Promise<void> {
  const statuses = await listStatusesForProject(projectId);
  await db.transaction("rw", db.taskStatuses, async () => {
    for (const s of statuses) {
      if (s.isDefault !== (s.id === id)) {
        await db.taskStatuses.update(s.id, { isDefault: s.id === id });
      }
    }
  });
}

/**
 * Toggles whether `id` is this project's "done" status — at most one at a time, but unlike
 * `setDefaultStatus`, a project can also have *none* (clicking the current done status clears it
 * rather than forcing a replacement). Clearing it, or never setting one, keeps the completedAt
 * checkbox and this project's board fully decoupled — see `updateTask`'s doc comment.
 */
export async function setDoneStatus(projectId: string, id: string): Promise<void> {
  const statuses = await listStatusesForProject(projectId);
  const target = statuses.find((s) => s.id === id);
  const makeItDone = !target?.isDone;
  await db.transaction("rw", db.taskStatuses, async () => {
    for (const s of statuses) {
      const shouldBeDone = makeItDone && s.id === id;
      if (s.isDone !== shouldBeDone) {
        await db.taskStatuses.update(s.id, { isDone: shouldBeDone });
      }
    }
  });
}

/** Returns null on success, or a human-readable reason the status can't be deleted. */
export async function deleteStatus(projectId: string, id: string): Promise<string | null> {
  const inUse = await db.tasks.where("statusId").equals(id).count();
  if (inUse > 0) {
    return `${inUse} task${inUse === 1 ? "" : "s"} still use this status. Move them first.`;
  }
  const statuses = await listStatusesForProject(projectId);
  if (statuses.length <= 1) {
    return "A project needs at least one status.";
  }
  await db.taskStatuses.delete(id);
  if (statuses.find((s) => s.id === id)?.isDefault) {
    const remaining = statuses.filter((s) => s.id !== id);
    if (remaining[0]) await db.taskStatuses.update(remaining[0].id, { isDefault: true });
  }
  return null;
}
