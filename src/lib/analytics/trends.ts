import type { Task } from "@/lib/db";
import { DAY_MS, buildAdaptiveBuckets, type Bucket } from "@/lib/analytics/date-buckets";

export interface ThroughputPoint {
  date: number;
  label: string;
  count: number;
  tasks: Task[];
}

export interface CycleTimePoint {
  date: number;
  label: string;
  /** Average days from createdAt to completedAt for tasks completed in this bucket; undefined when none completed. */
  avgDays: number | undefined;
  tasks: Task[];
}

/** Tasks completed per bucket over the trailing window — the throughput trend. */
export function computeThroughput(tasks: Task[], windowStart: number, windowEnd: number): ThroughputPoint[] {
  const buckets = buildAdaptiveBuckets(windowStart, windowEnd);
  return buckets.map((bucket) => bucketPoint(bucket, tasks));
}

function bucketPoint(bucket: Bucket, tasks: Task[]): ThroughputPoint {
  const matching = tasks.filter((t) => t.completedAt !== null && t.completedAt >= bucket.start && t.completedAt < bucket.end);
  return { date: bucket.start, label: bucket.label, count: matching.length, tasks: matching };
}

/** Average creation-to-completion time (days) per bucket, for tasks completed in that bucket. */
export function computeCycleTime(tasks: Task[], windowStart: number, windowEnd: number): CycleTimePoint[] {
  const buckets = buildAdaptiveBuckets(windowStart, windowEnd);
  return buckets.map((bucket) => {
    const matching = tasks.filter((t) => t.completedAt !== null && t.completedAt >= bucket.start && t.completedAt < bucket.end);
    if (matching.length === 0) return { date: bucket.start, label: bucket.label, avgDays: undefined, tasks: [] };
    const totalDays = matching.reduce((sum, t) => sum + (t.completedAt! - t.createdAt) / DAY_MS, 0);
    return { date: bucket.start, label: bucket.label, avgDays: totalDays / matching.length, tasks: matching };
  });
}
