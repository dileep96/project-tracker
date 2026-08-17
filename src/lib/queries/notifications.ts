import { db } from "@/lib/db";
import { now } from "@/lib/ids";

/**
 * Marks one computed notification id as read. Writes lazily (a row only exists once something is
 * actually marked read) — see `NotificationReadState`'s doc comment in `db.ts`. `taskId` is passed
 * through so `deleteTask` can clean up deadline-notification read-state the same way it cascades
 * every other task-owned row; pass `null` for automation/risk notifications.
 */
export async function markNotificationRead(id: string, taskId: string | null): Promise<void> {
  await db.notificationReadState.put({ id, taskId, read: true, updatedAt: now() });
}

export async function markNotificationsRead(ids: Array<{ id: string; taskId: string | null }>): Promise<void> {
  if (ids.length === 0) return;
  await db.notificationReadState.bulkPut(ids.map(({ id, taskId }) => ({ id, taskId, read: true, updatedAt: now() })));
}

/** Every read-state row — small enough (booleans only) to just load in full and join client-side against the live-computed notification list. */
export async function listNotificationReadState() {
  return db.notificationReadState.toArray();
}
