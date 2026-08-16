import { useMemo } from "react";
import { ChartCard, ChartEmptyState } from "@/components/dashboard/ChartCard";
import type { Task } from "@/lib/db";
import { computeResourceHeatmap, defaultHeatmapWindow } from "@/lib/analytics/heatmap";
import { CHART_SEQUENTIAL, sequentialStep } from "@/lib/chart-theme";
import type { DrillDownState } from "@/components/dashboard/DrillDownPanel";

const weekLabelFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

export function ResourceHeatmap({ tasks, now, onDrillDown }: { tasks: Task[]; now: number; onDrillDown: (state: DrillDownState) => void }) {
  const window_ = useMemo(() => defaultHeatmapWindow(now), [now]);
  const heatmap = useMemo(() => computeResourceHeatmap(tasks, window_.start, window_.end), [tasks, window_]);

  return (
    <ChartCard
      title="Resource utilization"
      description="Active tasks per assignee, by week (last 8 weeks) — color intensity encodes workload."
    >
      {heatmap.assignees.length === 0 ? (
        <ChartEmptyState title="No assignees yet" hint="Assign tasks to people to see workload distribution here." />
      ) : (
        <div className="flex flex-col gap-2">
          {/* Frozen header row + frozen first column together, inside one scroll container for
              both axes — see AGENTS.md's sharp-edge note on dense grids (Gantt/Timeline pattern). */}
          <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
            <div
              className="grid w-max min-w-full"
              style={{ gridTemplateColumns: `132px repeat(${heatmap.buckets.length}, minmax(52px, 1fr))` }}
            >
              <div className="sticky top-0 left-0 z-20 border-r border-b border-border bg-card" />
              {heatmap.buckets.map((bucket) => (
                <div
                  key={bucket.start}
                  className="sticky top-0 z-10 border-b border-border bg-card px-1 py-2 text-center font-mono text-[10px] text-muted-foreground"
                >
                  {weekLabelFormatter.format(bucket.start)}
                </div>
              ))}

              {heatmap.assignees.map((assignee, rowIndex) => (
                <div key={assignee} className="contents">
                  <div className="sticky left-0 z-10 flex items-center border-r border-border bg-card px-2.5 py-1 text-xs font-medium">
                    <span className="truncate">{assignee}</span>
                  </div>
                  {heatmap.cells[rowIndex].map((cell, colIndex) => {
                    const count = cell.tasks.length;
                    const step = sequentialStep(count, heatmap.maxCount);
                    return (
                      <button
                        key={colIndex}
                        type="button"
                        disabled={count === 0}
                        title={`${assignee} — ${count} active task${count === 1 ? "" : "s"}, week of ${weekLabelFormatter.format(cell.bucket.start)}`}
                        aria-label={`${assignee}: ${count} active tasks for the week of ${weekLabelFormatter.format(cell.bucket.start)}`}
                        onClick={() =>
                          onDrillDown({
                            label: `${assignee} — week of ${weekLabelFormatter.format(cell.bucket.start)}`,
                            tasks: cell.tasks,
                          })
                        }
                        className="m-0.5 h-8 rounded-sm transition-transform enabled:hover:z-10 enabled:hover:scale-110 enabled:hover:ring-2 enabled:hover:ring-ring disabled:cursor-default"
                        style={{ backgroundColor: count === 0 ? "var(--muted)" : CHART_SEQUENTIAL[step] }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>Fewer</span>
            <div className="flex gap-0.5">
              {CHART_SEQUENTIAL.map((color) => (
                <span key={color} className="size-3 rounded-[2px]" style={{ backgroundColor: color }} />
              ))}
            </div>
            <span>More</span>
            <span className="ml-auto">Click a cell to see its tasks</span>
          </div>
        </div>
      )}
    </ChartCard>
  );
}
