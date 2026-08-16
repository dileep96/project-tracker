/**
 * Shared day/week bucketing for Phase 3 analytics (burndown, trend charts, resource heatmap).
 * Deliberately separate from `src/lib/gantt/timeline-scale.ts` — that module solves date<->pixel
 * placement for the Gantt/Timeline row layouts; this one solves "which bucket does this
 * timestamp fall into" for aggregation, a different job even though both start from day math.
 */

export const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;

export function startOfDay(epochMs: number): number {
  const d = new Date(epochMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Monday-anchored week start, so buckets line up with a normal work week regardless of locale. */
export function startOfWeek(epochMs: number): number {
  const d = new Date(startOfDay(epochMs));
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
  d.setDate(d.getDate() + diff);
  return d.getTime();
}

export function addDays(epochMs: number, days: number): number {
  return epochMs + days * DAY_MS;
}

/** Inclusive day count between two timestamps, each floored to midnight first. */
export function dayCount(startEpochMs: number, endEpochMs: number): number {
  return Math.round((startOfDay(endEpochMs) - startOfDay(startEpochMs)) / DAY_MS) + 1;
}

export interface Bucket {
  /** Bucket start, epoch ms (midnight for daily, Monday midnight for weekly). */
  start: number;
  /** Exclusive bucket end, epoch ms. */
  end: number;
  label: string;
}

const dayLabelFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const weekLabelFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** Builds contiguous day buckets covering [rangeStart, rangeEnd], both inclusive. */
export function buildDayBuckets(rangeStart: number, rangeEnd: number): Bucket[] {
  const start = startOfDay(rangeStart);
  const end = startOfDay(rangeEnd);
  const buckets: Bucket[] = [];
  for (let t = start; t <= end; t = addDays(t, 1)) {
    buckets.push({ start: t, end: addDays(t, 1), label: dayLabelFormatter.format(t) });
  }
  return buckets;
}

/** Builds contiguous Monday-anchored week buckets covering [rangeStart, rangeEnd]. */
export function buildWeekBuckets(rangeStart: number, rangeEnd: number): Bucket[] {
  const start = startOfWeek(rangeStart);
  const end = startOfWeek(rangeEnd);
  const buckets: Bucket[] = [];
  for (let t = start; t <= end; t += WEEK_MS) {
    buckets.push({ start: t, end: t + WEEK_MS, label: weekLabelFormatter.format(t) });
  }
  return buckets;
}

/** Daily buckets read as noisy past ~60 days of range; switch to weekly beyond that. */
export function buildAdaptiveBuckets(rangeStart: number, rangeEnd: number): Bucket[] {
  const span = dayCount(rangeStart, rangeEnd);
  return span <= 60 ? buildDayBuckets(rangeStart, rangeEnd) : buildWeekBuckets(rangeStart, rangeEnd);
}
