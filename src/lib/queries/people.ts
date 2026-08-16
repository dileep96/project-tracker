import { db, type Person, type PersonTimeOff } from "@/lib/db";
import { generateId, now } from "@/lib/ids";

export async function listPeople(): Promise<Person[]> {
  const rows = await db.people.toArray();
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export interface CreatePersonInput {
  name: string;
  weeklyCapacityHours?: number;
  hourlyRate?: number;
  active?: boolean;
}

export async function createPerson(input: CreatePersonInput): Promise<Person> {
  const timestamp = now();
  const row: Person = {
    id: generateId(),
    name: input.name,
    weeklyCapacityHours: input.weeklyCapacityHours ?? 40,
    hourlyRate: input.hourlyRate ?? 0,
    active: input.active ?? true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.people.add(row);
  return row;
}

export async function updatePerson(id: string, patch: Partial<Omit<Person, "id" | "createdAt">>): Promise<void> {
  await db.people.update(id, { ...patch, updatedAt: now() });
}

/**
 * Deletes a person and their owned time-off ranges, and clears (never assigns to someone else) any
 * timer currently running under them. Historical time entries keep pointing at this personId
 * rather than being deleted — a logged hour stays a real fact about the past even after the person
 * record is removed, the same reasoning `deleteMilestone` uses for tasks that referenced it. The
 * timesheet/budget UI resolves a missing personId to a "Deleted person" label rather than crashing.
 */
export async function deletePerson(id: string): Promise<void> {
  await db.transaction("rw", db.people, db.personTimeOff, db.activeTimers, async () => {
    await db.personTimeOff.where("personId").equals(id).delete();
    const runningTimer = await db.activeTimers.get("current");
    if (runningTimer?.personId === id) await db.activeTimers.delete("current");
    await db.people.delete(id);
  });
}

// ---------------------------------------------------------------------------
// Time off / PTO ranges
// ---------------------------------------------------------------------------

export async function listTimeOffForPerson(personId: string): Promise<PersonTimeOff[]> {
  const rows = await db.personTimeOff.where("personId").equals(personId).toArray();
  return rows.sort((a, b) => a.startDate - b.startDate);
}

export async function listAllTimeOff(): Promise<PersonTimeOff[]> {
  return db.personTimeOff.toArray();
}

export interface CreateTimeOffInput {
  personId: string;
  startDate: number;
  endDate: number;
  label?: string;
}

export async function addTimeOff(input: CreateTimeOffInput): Promise<PersonTimeOff> {
  const row: PersonTimeOff = {
    id: generateId(),
    personId: input.personId,
    startDate: Math.min(input.startDate, input.endDate),
    endDate: Math.max(input.startDate, input.endDate),
    label: input.label ?? "Time off",
    createdAt: now(),
  };
  await db.personTimeOff.add(row);
  return row;
}

export async function deleteTimeOff(id: string): Promise<void> {
  await db.personTimeOff.delete(id);
}
