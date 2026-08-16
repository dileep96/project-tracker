import { useLiveQuery } from "dexie-react-hooks";
import { db, type Person, type PersonTimeOff } from "@/lib/db";

export function usePeople(): Person[] | undefined {
  return useLiveQuery(async () => {
    const rows = await db.people.toArray();
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, []);
}

export function usePerson(id: string | undefined): Person | undefined {
  return useLiveQuery(() => (id ? db.people.get(id) : undefined), [id]);
}

/** Every PTO/time-off range across every person — the capacity computation needs the whole set, not one person at a time. */
export function useAllTimeOff(): PersonTimeOff[] | undefined {
  return useLiveQuery(() => db.personTimeOff.toArray(), []);
}

export function useTimeOffForPerson(personId: string | undefined): PersonTimeOff[] | undefined {
  return useLiveQuery(async () => {
    if (!personId) return [];
    const rows = await db.personTimeOff.where("personId").equals(personId).toArray();
    return rows.sort((a, b) => a.startDate - b.startDate);
  }, [personId]);
}
