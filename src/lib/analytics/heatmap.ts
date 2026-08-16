import type { Task } from "@/lib/db";
import { WEEK_MS, buildWeekBuckets, type Bucket } from "@/lib/analytics/date-buckets";

export interface HeatmapCell {
  assignee: string;
  bucket: Bucket;
  /** Tasks this assignee was actively carrying during the bucket: created by bucket end, not yet completed or completed after bucket start. */
  tasks: Task[];
}

export interface ResourceHeatmap {
  assignees: string[];
  buckets: Bucket[];
  cells: HeatmapCell[][]; // cells[assigneeIndex][bucketIndex]
  maxCount: number;
}

const UNASSIGNED = "Unassigned";

/**
 * Tasks per assignee across time — a real color-intensity grid, not a relabeled bar chart. The
 * `assignee` field is free text (no Phase-4 user directory yet), so rows are just its distinct
 * values, "" folded into "Unassigned" rather than dropped. A cell counts tasks the assignee was
 * *actively carrying* that week (workload), not merely created or merely completed that week —
 * closer to a utilization signal than a raw activity count.
 */
export function computeResourceHeatmap(tasks: Task[], windowStart: number, windowEnd: number): ResourceHeatmap {
  const buckets = buildWeekBuckets(windowStart, windowEnd);
  const assignees = Array.from(new Set(tasks.map((t) => t.assignee.trim() || UNASSIGNED))).sort((a, b) =>
    a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a.localeCompare(b)
  );

  let maxCount = 0;
  const cells = assignees.map((assignee) =>
    buckets.map((bucket) => {
      const matching = tasks.filter((t) => {
        const rowAssignee = t.assignee.trim() || UNASSIGNED;
        if (rowAssignee !== assignee) return false;
        const activeStart = t.createdAt;
        const activeEnd = t.completedAt ?? Infinity;
        return activeStart < bucket.end && activeEnd >= bucket.start;
      });
      if (matching.length > maxCount) maxCount = matching.length;
      return { assignee, bucket, tasks: matching };
    })
  );

  return { assignees, buckets, cells, maxCount };
}

/** Default heatmap window: the trailing 8 weeks, for a readable grid width without a picker. */
export function defaultHeatmapWindow(now: number): { start: number; end: number } {
  return { start: now - 8 * WEEK_MS, end: now };
}
