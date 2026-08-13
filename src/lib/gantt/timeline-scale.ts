/** Shared date <-> pixel math for the Gantt chart (per-project) and portfolio Timeline — both render a horizontal day axis, just at different granularities of "row". */

export const DAY_MS = 86_400_000;

export interface TimelineDomain {
  /** Epoch ms, local midnight. */
  start: number;
  end: number;
  days: number;
}

function startOfDay(epochMs: number): number {
  const d = new Date(epochMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Smallest domain covering every given date, padded on both ends so bars/markers never touch the chart edge. Falls back to "today plus a month" when there are no dates at all, so an empty project still renders a chart instead of a division-by-zero axis. */
export function computeTimelineDomain(dates: number[], paddingDays = 3): TimelineDomain {
  if (dates.length === 0) {
    const today = startOfDay(Date.now());
    const start = today - paddingDays * DAY_MS;
    const end = today + 30 * DAY_MS;
    return { start, end, days: Math.round((end - start) / DAY_MS) };
  }
  const start = startOfDay(Math.min(...dates)) - paddingDays * DAY_MS;
  const end = startOfDay(Math.max(...dates)) + paddingDays * DAY_MS;
  return { start, end, days: Math.max(1, Math.round((end - start) / DAY_MS)) };
}

export function dateToX(epochMs: number, domain: TimelineDomain, pxPerDay: number): number {
  return ((startOfDay(epochMs) - domain.start) / DAY_MS) * pxPerDay;
}

/** Inclusive day count spanned by [startEpochMs, endEpochMs] — a bar's width in day-units. */
export function daySpan(startEpochMs: number, endEpochMs: number): number {
  return Math.max(1, Math.round((startOfDay(endEpochMs) - startOfDay(startEpochMs)) / DAY_MS) + 1);
}

/** One tick per week boundary inside the domain, for the axis header. */
export function weekTicks(domain: TimelineDomain): number[] {
  const ticks: number[] = [];
  for (let t = domain.start; t <= domain.end; t += 7 * DAY_MS) ticks.push(t);
  return ticks;
}

export function isToday(epochMs: number): boolean {
  return startOfDay(epochMs) === startOfDay(Date.now());
}
