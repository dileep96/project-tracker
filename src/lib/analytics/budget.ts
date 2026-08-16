import type { Person, Project, Task, TimeEntry } from "@/lib/db";

/**
 * Actual cost is always logged-time × the logging person's hourly rate — see AGENTS.md's Phase 4
 * section for why per-person (not per-task/per-project) was chosen. `billable` never filters this:
 * it's an independent flag for client invoicing, not a signal about whether time was "real" cost.
 * A time entry whose person has no matching rate (deleted person, or rate left at 0) contributes 0
 * — never a guessed number.
 */
function rateLookup(people: Person[]): Map<string, number> {
  return new Map(people.map((p) => [p.id, p.hourlyRate]));
}

export function totalHours(entries: TimeEntry[]): number {
  return entries.reduce((sum, e) => sum + e.minutes, 0) / 60;
}

export function actualCost(entries: TimeEntry[], people: Person[]): number {
  const rateById = rateLookup(people);
  return entries.reduce((sum, e) => sum + (e.minutes / 60) * (rateById.get(e.personId) ?? 0), 0);
}

export interface TaskCostEstimate {
  estimatedHours: number | null;
  /** Resolved via the task's assignee matching a Person by name — null when unassigned or the assignee has no matching person record. */
  ratePerHour: number | null;
  estimatedCost: number | null;
}

/** A task's estimated dollar cost is deliberately never a stored field — it's always `estimatedHours × the assignee's rate`, computed fresh so editing a person's rate immediately corrects every task's estimate instead of leaving stale numbers around. */
export function estimateTaskCost(task: Task, people: Person[]): TaskCostEstimate {
  const assignee = task.assignee.trim();
  const person = assignee ? people.find((p) => p.name.trim() === assignee) : undefined;
  const ratePerHour = person ? person.hourlyRate : null;
  const estimatedCost = task.estimatedHours !== null && ratePerHour !== null ? task.estimatedHours * ratePerHour : null;
  return { estimatedHours: task.estimatedHours, ratePerHour, estimatedCost };
}

export interface TaskBudget extends TaskCostEstimate {
  task: Task;
  loggedHours: number;
  actualCost: number;
  entries: TimeEntry[];
}

export function computeTaskBudget(task: Task, timeEntries: TimeEntry[], people: Person[]): TaskBudget {
  const entries = timeEntries.filter((e) => e.taskId === task.id);
  return {
    task,
    entries,
    loggedHours: totalHours(entries),
    actualCost: actualCost(entries, people),
    ...estimateTaskCost(task, people),
  };
}

export interface ProjectBudget {
  project: Project;
  entries: TimeEntry[];
  loggedHours: number;
  billableHours: number;
  actualCost: number;
  /** Bottom-up sum of every task's `estimatedCost` in the project (tasks with no resolvable rate contribute 0, tracked separately below) — a second, independent estimate to sanity-check the top-down `project.budgetEstimate` against. */
  taskEstimateRollup: number;
  /** Tasks in this project with estimated hours but no resolvable rate (no assignee, or assignee has no matching Person) — excluded from `taskEstimateRollup`, surfaced so the rollup's gap is never silently swallowed. */
  unratedTaskCount: number;
}

export function computeProjectBudget(project: Project, tasks: Task[], timeEntries: TimeEntry[], people: Person[]): ProjectBudget {
  const entries = timeEntries.filter((e) => e.projectId === project.id);
  const projectTasks = tasks.filter((t) => t.projectId === project.id);
  let taskEstimateRollup = 0;
  let unratedTaskCount = 0;
  for (const task of projectTasks) {
    if (task.estimatedHours === null) continue;
    const { estimatedCost } = estimateTaskCost(task, people);
    if (estimatedCost === null) unratedTaskCount += 1;
    else taskEstimateRollup += estimatedCost;
  }
  return {
    project,
    entries,
    loggedHours: totalHours(entries),
    billableHours: totalHours(entries.filter((e) => e.billable)),
    actualCost: actualCost(entries, people),
    taskEstimateRollup,
    unratedTaskCount,
  };
}

export type BudgetStatus = "under" | "near" | "over" | "unbudgeted";

/** Same over/under-at-a-glance banding language as `capacity.ts`'s utilization band — one visual vocabulary for "is this number good or bad" across the whole phase. */
export function budgetStatus(estimate: number | null, actual: number): BudgetStatus {
  if (estimate === null || estimate <= 0) return "unbudgeted";
  const ratio = actual / estimate;
  if (ratio > 1) return "over";
  if (ratio >= 0.85) return "near";
  return "under";
}
