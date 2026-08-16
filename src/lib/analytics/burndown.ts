import type { Task } from "@/lib/db";
import { buildAdaptiveBuckets, startOfDay } from "@/lib/analytics/date-buckets";

export interface BurndownPoint {
  date: number;
  label: string;
  /** Total tasks that had been created by this date — the burnup "scope" line. */
  scope: number;
  /** Tasks completed by this date — the burnup "completed" line. undefined past today (unknown future). */
  completed: number | undefined;
  /** scope - completed — the burndown "actual remaining" line. undefined past today. */
  remaining: number | undefined;
  /** Straight-line reference from total scope down to 0 at the range end. Always defined — it's a plan, not an observation. */
  ideal: number;
}

export interface BurndownResult {
  points: BurndownPoint[];
  totalScope: number;
  rangeStart: number;
  rangeEnd: number;
  /** False when the project has no dates to derive a range from — callers should render an empty state instead of a degenerate flat chart. */
  hasSchedulingData: boolean;
}

/**
 * Derives an ideal-vs-actual burndown/burnup curve purely from each task's own
 * createdAt/completedAt/dueDate — there's no historical daily-snapshot table (see AGENTS.md for
 * why: a personal-scale project doesn't need one, and this reconstructs an equivalent curve on
 * demand). The "ideal" line assumes the full final scope was known on day one and worked down
 * evenly to the target end date; "actual" only plots through today since future completions
 * aren't known yet.
 */
export function computeBurndown(tasks: Task[], now: number): BurndownResult {
  if (tasks.length === 0) {
    return { points: [], totalScope: 0, rangeStart: now, rangeEnd: now, hasSchedulingData: false };
  }

  const dueDates = tasks.map((t) => t.dueDate).filter((d): d is number => d !== null);
  const createdDates = tasks.map((t) => t.createdAt);
  const completedDates = tasks.map((t) => t.completedAt).filter((d): d is number => d !== null);

  const hasSchedulingData = dueDates.length > 0 || completedDates.length > 0;
  const rangeStartRaw = startOfDay(Math.min(...createdDates));
  if (!hasSchedulingData) {
    return { points: [], totalScope: tasks.length, rangeStart: rangeStartRaw, rangeEnd: now, hasSchedulingData: false };
  }

  // The ideal line's target end date: latest due date if the project has any, else its latest
  // completion. The rendered axis (rangeEnd below) extends further, to today, when the project
  // has run past that target — an overdue project should keep showing "actual" reality rather
  // than the chart stopping dead at a blown deadline.
  const targetEnd = startOfDay(dueDates.length > 0 ? Math.max(...dueDates) : Math.max(...completedDates));
  const todayStart = startOfDay(now);
  const rangeEnd = Math.max(targetEnd, todayStart);
  const rangeStart = Math.min(rangeStartRaw, rangeEnd - 1); // guard a same-day degenerate range

  const totalScope = tasks.length;
  const buckets = buildAdaptiveBuckets(rangeStart, rangeEnd);
  const idealSpan = Math.max(1, targetEnd - rangeStart);

  const points: BurndownPoint[] = buckets.map((bucket) => {
    const asOf = bucket.start;
    const scope = tasks.filter((t) => t.createdAt <= asOf).length;
    const isFuture = asOf > todayStart;
    const completed = isFuture ? undefined : tasks.filter((t) => t.completedAt !== null && t.completedAt <= asOf).length;
    const remaining = isFuture || completed === undefined ? undefined : scope - completed;
    const idealProgress = Math.min(1, Math.max(0, (asOf - rangeStart) / idealSpan));
    const ideal = totalScope * (1 - idealProgress);
    return { date: asOf, label: bucket.label, scope, completed, remaining, ideal };
  });

  return { points, totalScope, rangeStart, rangeEnd, hasSchedulingData: true };
}
