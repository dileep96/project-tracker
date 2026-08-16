import { cn } from "@/lib/utils";
import type { PersonWorkload, WorkloadWeek } from "@/lib/analytics/capacity";
import { utilizationBand } from "@/lib/analytics/capacity";
import type { Bucket } from "@/lib/analytics/date-buckets";

const weekLabelFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

const BAND_CLASSES: Record<string, string> = {
  room: "bg-health-green-bg text-health-green-fg",
  near: "bg-health-amber-bg text-health-amber-fg",
  over: "bg-health-red-bg text-health-red-fg",
  empty: "bg-transparent text-muted-foreground",
};

interface CapacityGridProps {
  buckets: Bucket[];
  people: PersonWorkload[];
  onSelectCell: (person: PersonWorkload, week: WorkloadWeek) => void;
}

/**
 * The workload/capacity centerpiece: person × week, allocated hours vs capacity, color-banded by
 * `utilizationBand` — reusing the same health-status token ramp `HealthBadge` uses (real state,
 * not decoration), so "over capacity" reads with the same visual weight as a red project. Same
 * frozen-header/frozen-column single-scroll-container shape as `ResourceHeatmap` — see AGENTS.md's
 * sharp-edge note on dense grids.
 */
export function CapacityGrid({ buckets, people, onSelectCell }: CapacityGridProps) {
  return (
    <div className="max-h-[520px] overflow-auto rounded-lg border border-border">
      <div className="grid w-max min-w-full" style={{ gridTemplateColumns: `160px repeat(${buckets.length}, minmax(110px, 1fr))` }}>
        <div className="sticky top-0 left-0 z-20 border-r border-b border-border bg-card" />
        {buckets.map((bucket) => (
          <div
            key={bucket.start}
            className="sticky top-0 z-10 border-b border-border bg-card px-2 py-2 text-center font-mono text-[10px] text-muted-foreground"
          >
            Week of {weekLabelFormatter.format(bucket.start)}
          </div>
        ))}

        {people.map((row) => (
          <div key={row.person.id} className="contents">
            <div className="sticky left-0 z-10 flex flex-col justify-center border-r border-border bg-card px-2.5 py-1.5">
              <span className="truncate text-sm font-medium">{row.person.name}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{row.person.weeklyCapacityHours}h/wk</span>
            </div>
            {row.weeks.map((week, colIndex) => {
              const band = utilizationBand(week.capacityHours, week.allocatedHours);
              const pct = week.capacityHours > 0 ? Math.round((week.allocatedHours / week.capacityHours) * 100) : week.allocatedHours > 0 ? 999 : 0;
              return (
                <button
                  key={colIndex}
                  type="button"
                  disabled={week.allocatedHours === 0}
                  onClick={() => onSelectCell(row, week)}
                  title={`${row.person.name} — ${week.allocatedHours.toFixed(1)}h allocated of ${week.capacityHours.toFixed(1)}h capacity (${pct}%)`}
                  className={cn(
                    "m-0.5 flex flex-col items-center justify-center gap-0.5 rounded-md px-1 py-2 transition-transform enabled:hover:scale-[1.03] enabled:hover:ring-2 enabled:hover:ring-ring disabled:cursor-default",
                    BAND_CLASSES[band]
                  )}
                >
                  <span className="font-mono text-xs font-semibold tabular-nums">
                    {week.allocatedHours.toFixed(week.allocatedHours % 1 === 0 ? 0 : 1)}h
                  </span>
                  <span className="font-mono text-[10px] opacity-80">of {week.capacityHours.toFixed(0)}h</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
