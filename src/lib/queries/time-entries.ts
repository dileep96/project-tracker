import { db, type ActiveTimer, type TimeEntry } from "@/lib/db";
import { generateId, now } from "@/lib/ids";
import { startOfDay } from "@/lib/analytics/date-buckets";

// ---------------------------------------------------------------------------
// Manual time entries
// ---------------------------------------------------------------------------

export interface CreateTimeEntryInput {
  taskId: string;
  projectId: string;
  personId: string;
  /** Epoch ms; normalized to start-of-day so a timesheet's per-day grouping is exact. */
  date: number;
  minutes: number;
  billable?: boolean;
  note?: string;
}

export async function createManualTimeEntry(input: CreateTimeEntryInput): Promise<TimeEntry> {
  const timestamp = now();
  const row: TimeEntry = {
    id: generateId(),
    taskId: input.taskId,
    projectId: input.projectId,
    personId: input.personId,
    date: startOfDay(input.date),
    minutes: Math.max(1, Math.round(input.minutes)),
    billable: input.billable ?? true,
    note: input.note ?? "",
    source: "manual",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.timeEntries.add(row);
  return row;
}

export async function updateTimeEntry(
  id: string,
  patch: Partial<Pick<TimeEntry, "date" | "minutes" | "billable" | "note" | "personId">>
): Promise<void> {
  const next = { ...patch } as Partial<TimeEntry>;
  if (next.date !== undefined) next.date = startOfDay(next.date);
  if (next.minutes !== undefined) next.minutes = Math.max(1, Math.round(next.minutes));
  await db.timeEntries.update(id, { ...next, updatedAt: now() });
}

export async function deleteTimeEntry(id: string): Promise<void> {
  await db.timeEntries.delete(id);
}

export async function listTimeEntriesForTask(taskId: string): Promise<TimeEntry[]> {
  const rows = await db.timeEntries.where("taskId").equals(taskId).toArray();
  return rows.sort((a, b) => b.date - a.date);
}

// ---------------------------------------------------------------------------
// Timer — a single global running timer (id "current"), matching the app's no-auth model. Its
// `startedAt` is the persisted source of truth, so `useActiveTimer` (dexie-react-hooks) recomputes
// elapsed time correctly after any reload — see the `ActiveTimer` doc comment in lib/db.ts.
// ---------------------------------------------------------------------------

/** Converts a running timer into a completed manual… well, timer-sourced entry. Shared by an explicit stop and by starting a new timer while one is already running. */
async function commitTimerEntry(timer: ActiveTimer): Promise<TimeEntry> {
  const stoppedAt = now();
  const minutes = Math.max(1, Math.round((stoppedAt - timer.startedAt) / 60_000));
  const row: TimeEntry = {
    id: generateId(),
    taskId: timer.taskId,
    projectId: timer.projectId,
    personId: timer.personId,
    date: startOfDay(timer.startedAt),
    minutes,
    billable: timer.billable,
    note: timer.note,
    source: "timer",
    createdAt: stoppedAt,
    updatedAt: stoppedAt,
  };
  await db.timeEntries.add(row);
  return row;
}

export interface StartTimerInput {
  taskId: string;
  projectId: string;
  personId: string;
  billable?: boolean;
  note?: string;
}

/**
 * Starts a new running timer. If one is already running (for any task/person — there's only ever
 * one, app-wide), it's stopped and saved as a completed entry first, Toggl-style "switching tasks
 * stops the previous one" — never a silent discard and never two timers ticking at once.
 */
export async function startTimer(input: StartTimerInput): Promise<ActiveTimer> {
  return db.transaction("rw", db.activeTimers, db.timeEntries, async () => {
    const existing = await db.activeTimers.get("current");
    if (existing) await commitTimerEntry(existing);
    const row: ActiveTimer = {
      id: "current",
      taskId: input.taskId,
      projectId: input.projectId,
      personId: input.personId,
      billable: input.billable ?? true,
      note: input.note ?? "",
      startedAt: now(),
    };
    await db.activeTimers.put(row);
    return row;
  });
}

/** Stops the running timer (if any) and saves it as a completed time entry. */
export async function stopTimer(): Promise<TimeEntry | null> {
  return db.transaction("rw", db.activeTimers, db.timeEntries, async () => {
    const existing = await db.activeTimers.get("current");
    if (!existing) return null;
    const entry = await commitTimerEntry(existing);
    await db.activeTimers.delete("current");
    return entry;
  });
}

/** Stops the running timer without saving an entry — for "started by mistake". */
export async function discardTimer(): Promise<void> {
  await db.activeTimers.delete("current");
}
