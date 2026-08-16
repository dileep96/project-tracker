import type { Person, PersonTimeOff, Task } from "@/lib/db";
import { DAY_MS, WEEK_MS, addDays, buildWeekBuckets, startOfDay, startOfWeek, type Bucket } from "@/lib/analytics/date-buckets";

/** A person's own name, trimmed — the join key back to `Task.assignee` (see `lib/db.ts`'s `Person` doc comment for why there's no `personId` FK on `Task`). */
function personByAssignee(people: Person[]): Map<string, Person> {
  return new Map(people.map((p) => [p.name.trim(), p]));
}

/** Business-day count (Mon–Fri) between two start-of-day timestamps, inclusive of both ends. */
function isWeekday(epochMs: number): boolean {
  const day = new Date(epochMs).getDay();
  return day !== 0 && day !== 6;
}

export interface WorkloadWeek {
  bucket: Bucket;
  /** Hours this person can absorb this week: weeklyCapacityHours, reduced for any weekday inside a PTO range. */
  capacityHours: number;
  /** Hours of open (incomplete) task effort allocated to this week — see the module doc for how a multi-week task's hours are split. */
  allocatedHours: number;
  /** The open tasks contributing to `allocatedHours`, for drill-down. A task spanning multiple weeks appears in each week it overlaps. */
  tasks: Task[];
}

export interface PersonWorkload {
  person: Person;
  weeks: WorkloadWeek[];
  /** Open tasks with estimated hours but no start/due date at all — can't be placed on the week grid, so they're surfaced separately instead of silently dropped (mirrors Gantt's own "Unscheduled" list). */
  unscheduledHours: number;
  unscheduledTasks: Task[];
}

export interface UnmatchedAssignee {
  assignee: string;
  tasks: Task[];
}

export interface WorkloadResult {
  buckets: Bucket[];
  people: PersonWorkload[];
  /** Assignee strings on open tasks that don't exactly match any Person.name — real workload the grid can't place until a person record exists for them. */
  unmatchedAssignees: UnmatchedAssignee[];
}

/**
 * Current week plus the next 3 — "current and near-term" per the Phase 4 brief, four columns fits
 * comfortably without a picker. `start` is floored to this Monday *first* (not `now` itself) so
 * `buildWeekBuckets` always returns exactly 4 buckets regardless of what weekday `now` falls on —
 * flooring only `now` and adding 4 weeks would sometimes produce 5 buckets whenever `now` isn't
 * already a Monday, since the window's end would floor into a 5th week.
 */
export function defaultWorkloadWindow(now: number): { start: number; end: number } {
  const start = startOfWeek(now);
  return { start, end: start + 4 * WEEK_MS - DAY_MS };
}

/**
 * Spreads a task's estimated hours proportionally across the day it's scheduled on. A task with
 * both dates gets its hours divided evenly across every calendar day in [startDate, dueDate] (not
 * just business days — the estimate is the ground truth, this only decides which week bucket it
 * lands in); a task with only one date puts all its hours on that single day. Deliberately NOT
 * "dump everything in the due-date week" — that would make every multi-week task look like a
 * pile-up right before it's due instead of steady load the whole time it's open.
 */
function taskDayHours(task: Task): Map<number, number> {
  const result = new Map<number, number>();
  if (task.estimatedHours === null || task.estimatedHours <= 0) return result;
  const start = task.startDate ?? task.dueDate;
  const end = task.dueDate ?? task.startDate;
  if (start === null || end === null) return result;
  const rangeStart = startOfDay(Math.min(start, end));
  const rangeEnd = startOfDay(Math.max(start, end));
  const totalDays = Math.round((rangeEnd - rangeStart) / DAY_MS) + 1;
  const hoursPerDay = task.estimatedHours / totalDays;
  for (let day = rangeStart; day <= rangeEnd; day = addDays(day, 1)) {
    result.set(day, hoursPerDay);
  }
  return result;
}

/**
 * Builds the "who's overloaded, who has room" grid: weekly capacity vs allocated effort hours per
 * person, over a forward-looking window. Only open (incomplete) tasks with an assignee that
 * exactly matches a Person.name count toward allocation — completed tasks no longer consume future
 * capacity, and assignee strings with no matching person are reported separately (never silently
 * dropped) via `unmatchedAssignees`.
 */
export function computeWorkload(
  people: Person[],
  tasks: Task[],
  timeOff: PersonTimeOff[],
  windowStart: number,
  windowEnd: number
): WorkloadResult {
  const buckets = buildWeekBuckets(windowStart, windowEnd);
  const byName = personByAssignee(people);
  const openTasks = tasks.filter((t) => t.completedAt === null);

  const timeOffByPerson = new Map<string, PersonTimeOff[]>();
  for (const off of timeOff) {
    const list = timeOffByPerson.get(off.personId) ?? [];
    list.push(off);
    timeOffByPerson.set(off.personId, list);
  }

  const unmatched = new Map<string, Task[]>();
  const peopleWorkload: PersonWorkload[] = people
    .filter((p) => p.active)
    .map((person) => {
      const ownTasks = openTasks.filter((t) => t.assignee.trim() === person.name.trim());
      const perDayCapacity = person.weeklyCapacityHours / 5;
      const offRanges = timeOffByPerson.get(person.id) ?? [];

      const weeks: WorkloadWeek[] = buckets.map((bucket) => {
        let capacityHours = person.weeklyCapacityHours;
        for (let day = bucket.start; day < bucket.end; day = addDays(day, 1)) {
          if (!isWeekday(day)) continue;
          const onPto = offRanges.some((off) => day >= off.startDate && day <= off.endDate);
          if (onPto) capacityHours = Math.max(0, capacityHours - perDayCapacity);
        }

        let allocatedHours = 0;
        const weekTasks: Task[] = [];
        for (const task of ownTasks) {
          const dayHours = taskDayHours(task);
          let taskHoursThisWeek = 0;
          for (const [day, hours] of dayHours) {
            if (day >= bucket.start && day < bucket.end) taskHoursThisWeek += hours;
          }
          if (taskHoursThisWeek > 0) {
            allocatedHours += taskHoursThisWeek;
            weekTasks.push(task);
          }
        }

        return { bucket, capacityHours, allocatedHours, tasks: weekTasks };
      });

      const unscheduledTasks = ownTasks.filter((t) => t.startDate === null && t.dueDate === null && (t.estimatedHours ?? 0) > 0);
      const unscheduledHours = unscheduledTasks.reduce((sum, t) => sum + (t.estimatedHours ?? 0), 0);

      return { person, weeks, unscheduledHours, unscheduledTasks };
    });

  for (const task of openTasks) {
    const assignee = task.assignee.trim();
    if (!assignee || byName.has(assignee)) continue;
    const list = unmatched.get(assignee) ?? [];
    list.push(task);
    unmatched.set(assignee, list);
  }

  return {
    buckets,
    people: peopleWorkload,
    unmatchedAssignees: Array.from(unmatched.entries())
      .map(([assignee, taskList]) => ({ assignee, tasks: taskList }))
      .sort((a, b) => a.assignee.localeCompare(b.assignee)),
  };
}

export type UtilizationBand = "room" | "near" | "over" | "empty";

/** Color-band thresholds for a week's utilization — reused by the capacity grid's cell coloring. */
export function utilizationBand(capacityHours: number, allocatedHours: number): UtilizationBand {
  if (capacityHours <= 0) return allocatedHours > 0 ? "over" : "empty";
  if (allocatedHours <= 0) return "empty";
  const ratio = allocatedHours / capacityHours;
  if (ratio > 1.1) return "over";
  if (ratio >= 0.85) return "near";
  return "room";
}
