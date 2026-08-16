import type { Task } from "@/lib/db";
import { WEEK_MS } from "@/lib/analytics/date-buckets";

export type KpiFormat = "percent" | "count" | "rate";
export type KpiDeltaSense = "higher-is-better" | "lower-is-better";

export interface KpiResult {
  key: string;
  label: string;
  format: KpiFormat;
  /** null when there isn't enough data to compute an honest number — never a fake placeholder value. */
  value: number | null;
  /** Present only when `value` is null: why, and what would unlock it. */
  notEnoughDataReason?: string;
  /** Change vs the comparable window (percentage points for "percent", absolute for "count"/"rate"). */
  delta?: number | null;
  deltaSense?: KpiDeltaSense;
  /** The exact tasks this number was computed from — drives click-to-drill-down. */
  matchingTasks: Task[];
}

/** A task "existed" as of `asOf` once created, and (for completion state) is only counted done if it was completed by then — lets every KPI be re-evaluated at a past instant for trend deltas. */
function tasksAsOf(tasks: Task[], asOf: number): { task: Task; completed: boolean }[] {
  return tasks
    .filter((t) => t.createdAt <= asOf)
    .map((task) => ({ task, completed: task.completedAt !== null && task.completedAt <= asOf }));
}

function completionRateAt(tasks: Task[], asOf: number): { rate: number; total: number } {
  const snapshot = tasksAsOf(tasks, asOf);
  if (snapshot.length === 0) return { rate: 0, total: 0 };
  const done = snapshot.filter((s) => s.completed).length;
  return { rate: (done / snapshot.length) * 100, total: snapshot.length };
}

function onTimeRateAt(tasks: Task[], asOf: number): { rate: number; sample: number } {
  const snapshot = tasksAsOf(tasks, asOf).filter((s) => s.completed && s.task.dueDate !== null);
  if (snapshot.length === 0) return { rate: 0, sample: 0 };
  const onTime = snapshot.filter((s) => s.task.completedAt! <= s.task.dueDate!).length;
  return { rate: (onTime / snapshot.length) * 100, sample: snapshot.length };
}

function overdueAt(tasks: Task[], asOf: number): Task[] {
  return tasksAsOf(tasks, asOf)
    .filter((s) => !s.completed && s.task.dueDate !== null && s.task.dueDate < asOf)
    .map((s) => s.task);
}

/** Tasks completed within [windowStart, windowEnd) — the raw material for the velocity proxy. */
function completedInWindow(tasks: Task[], windowStart: number, windowEnd: number): Task[] {
  return tasks.filter((t) => t.completedAt !== null && t.completedAt >= windowStart && t.completedAt < windowEnd);
}

const VELOCITY_WINDOW_WEEKS = 4;

export interface DashboardKpis {
  completionRate: KpiResult;
  onTimeDelivery: KpiResult;
  overdueCount: KpiResult;
  velocity: KpiResult;
  budgetBurn: KpiResult;
}

/**
 * Computes every KPI card as of `now`, plus a comparable snapshot 30 days back (7 days back for
 * velocity, since it's already a multi-week average) so each card can show a trend delta.
 * Everything here is derived from `Task.createdAt/completedAt/dueDate` alone — no budget or
 * time-tracking tables exist yet (Phases 4-5), so `budgetBurn` always reports the honest
 * "not enough data yet" state instead of a fabricated number; it needs no future rework once
 * that data lands, only a real implementation swapped in behind the same KpiResult shape.
 */
export function computeDashboardKpis(tasks: Task[], now: number): DashboardKpis {
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  const currentCompletion = completionRateAt(tasks, now);
  const priorCompletion = completionRateAt(tasks, thirtyDaysAgo);
  const completionRate: KpiResult = {
    key: "completion-rate",
    label: "Completion rate",
    format: "percent",
    value: currentCompletion.total > 0 ? currentCompletion.rate : null,
    notEnoughDataReason: currentCompletion.total === 0 ? "No tasks yet — add tasks to a project to see this." : undefined,
    delta: currentCompletion.total > 0 && priorCompletion.total > 0 ? currentCompletion.rate - priorCompletion.rate : null,
    deltaSense: "higher-is-better",
    matchingTasks: tasks,
  };

  const currentOnTime = onTimeRateAt(tasks, now);
  const priorOnTime = onTimeRateAt(tasks, thirtyDaysAgo);
  const onTimeMatching = tasks.filter((t) => t.completedAt !== null && t.dueDate !== null);
  const onTimeDelivery: KpiResult = {
    key: "on-time-delivery",
    label: "On-time delivery",
    format: "percent",
    value: currentOnTime.sample > 0 ? currentOnTime.rate : null,
    notEnoughDataReason:
      currentOnTime.sample === 0 ? "No completed tasks with a due date yet — finish a dated task to see this." : undefined,
    delta: currentOnTime.sample > 0 && priorOnTime.sample > 0 ? currentOnTime.rate - priorOnTime.rate : null,
    deltaSense: "higher-is-better",
    matchingTasks: onTimeMatching,
  };

  const currentOverdue = overdueAt(tasks, now);
  const priorOverdue = overdueAt(tasks, thirtyDaysAgo);
  const overdueCount: KpiResult = {
    key: "overdue-count",
    label: "Overdue tasks",
    format: "count",
    value: currentOverdue.length, // always computable — zero is a real, honest answer, not "no data"
    delta: currentOverdue.length - priorOverdue.length,
    deltaSense: "lower-is-better",
    matchingTasks: currentOverdue,
  };

  const currentWindowStart = now - VELOCITY_WINDOW_WEEKS * WEEK_MS;
  const currentWindowTasks = completedInWindow(tasks, currentWindowStart, now);
  const priorWindowStart = currentWindowStart - VELOCITY_WINDOW_WEEKS * WEEK_MS;
  const priorWindowTasks = completedInWindow(tasks, priorWindowStart, currentWindowStart);
  const everCompleted = tasks.some((t) => t.completedAt !== null);
  const velocity: KpiResult = {
    key: "velocity",
    label: "Team velocity",
    format: "rate",
    value: everCompleted ? currentWindowTasks.length / VELOCITY_WINDOW_WEEKS : null,
    // Below MIN_VELOCITY_SAMPLE in the trailing window is still shown once any history exists —
    // "0-2 tasks/week lately" is real (if quiet) signal, not missing data.
    notEnoughDataReason: !everCompleted
      ? "No completed tasks yet — velocity needs at least a few finished tasks to mean anything."
      : undefined,
    delta: everCompleted ? currentWindowTasks.length / VELOCITY_WINDOW_WEEKS - priorWindowTasks.length / VELOCITY_WINDOW_WEEKS : null,
    deltaSense: "higher-is-better",
    matchingTasks: currentWindowTasks,
  };

  const budgetBurn: KpiResult = {
    key: "budget-burn",
    label: "Budget burn rate",
    format: "percent",
    value: null,
    notEnoughDataReason: "No budget data yet — this lights up automatically once budget tracking lands.",
    matchingTasks: [],
  };

  return { completionRate, onTimeDelivery, overdueCount, velocity, budgetBurn };
}
