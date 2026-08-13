import { useMemo } from "react";
import { Flag } from "@phosphor-icons/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HealthBadge } from "@/components/projects/HealthBadge";
import { computeTimelineDomain, dateToX, weekTicks, type TimelineDomain } from "@/lib/gantt/timeline-scale";
import type { Milestone, Project, Task } from "@/lib/db";

const LEFT_WIDTH = 200;
const PX_PER_DAY = 20;
const ROW_HEIGHT = 56;
const HEADER_HEIGHT = 32;
const BAND_HEIGHT = 10;

const weekLabelFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const milestoneDateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

interface ProjectBandData {
  project: Project;
  rangeStart: number;
  rangeEnd: number;
  milestones: Milestone[];
}

interface PortfolioTimelineProps {
  projects: Project[];
  tasksByProject: Record<string, Task[]>;
  milestonesByProject: Record<string, Milestone[]>;
  onOpenProject: (projectId: string) => void;
}

/**
 * The "zoom out across everything" view: one horizontal band per project on a single shared time
 * axis (reuses the same day<->pixel math as the per-project Gantt — src/lib/gantt/timeline-scale.ts
 * — just at project granularity instead of task granularity). A project's band spans the min/max
 * of its own tasks' dates and milestone dates; projects with neither drop to the "No dates yet"
 * list below instead of collapsing the shared axis to nothing.
 */
export function PortfolioTimeline({ projects, tasksByProject, milestonesByProject, onOpenProject }: PortfolioTimelineProps) {
  const { bands, undated } = useMemo(() => {
    const bands: ProjectBandData[] = [];
    const undated: Project[] = [];
    for (const project of projects) {
      // Generated recurring instances excluded from the range calc for the same reason as the
      // Gantt chart — see GanttChart.tsx's doc comment.
      const tasks = (tasksByProject[project.id] ?? []).filter((t) => t.recurrenceParentId === null);
      const milestones = milestonesByProject[project.id] ?? [];
      const dates = [
        ...tasks.flatMap((t) => [t.startDate, t.dueDate].filter((d): d is number => d !== null)),
        ...milestones.map((m) => m.targetDate),
      ];
      if (dates.length === 0) {
        undated.push(project);
        continue;
      }
      bands.push({ project, rangeStart: Math.min(...dates), rangeEnd: Math.max(...dates), milestones });
    }
    return { bands, undated };
  }, [projects, tasksByProject, milestonesByProject]);

  const domain = useMemo(() => computeTimelineDomain(bands.flatMap((b) => [b.rangeStart, b.rangeEnd])), [bands]);

  const chartWidth = domain.days * PX_PER_DAY;
  const nowMs = Date.now();
  const todayX = nowMs >= domain.start && nowMs <= domain.end ? dateToX(nowMs, domain, PX_PER_DAY) : null;

  return (
    <div className="flex flex-col gap-3">
      {bands.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No project has any dated tasks or milestones yet.
        </p>
      ) : (
        <div className="max-h-[70vh] overflow-auto rounded-lg border border-border">
          <div className="relative" style={{ width: LEFT_WIDTH + chartWidth }}>
            <div className="sticky top-0 z-20 flex border-b border-border bg-card">
              <div
                className="sticky left-0 z-30 flex shrink-0 items-center border-r border-border bg-card px-3 text-xs font-medium text-muted-foreground"
                style={{ width: LEFT_WIDTH, height: HEADER_HEIGHT }}
              >
                Project
              </div>
              <div className="relative shrink-0" style={{ width: chartWidth, height: HEADER_HEIGHT }}>
                {weekTicks(domain).map((t) => (
                  <div
                    key={t}
                    className="absolute top-0 h-full border-l border-border/60 pt-1.5 pl-1.5 font-mono text-[10px] text-muted-foreground"
                    style={{ left: dateToX(t, domain, PX_PER_DAY) }}
                  >
                    {weekLabelFormatter.format(t)}
                  </div>
                ))}
                {todayX !== null && <div className="absolute top-0 z-10 h-full w-px bg-primary/70" style={{ left: todayX }} />}
              </div>
            </div>

            <div>
              {bands.map((band) => (
                <ProjectBandRow key={band.project.id} band={band} domain={domain} onOpen={() => onOpenProject(band.project.id)} />
              ))}
            </div>
          </div>
        </div>
      )}

      {undated.length > 0 && (
        <div className="rounded-lg border border-dashed border-border p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            No dates yet ({undated.length}) — add task dates or milestones to place these on the timeline
          </p>
          <div className="flex flex-wrap gap-1.5">
            {undated.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpenProject(p.id)}
                className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/70"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectBandRow({ band, domain, onOpen }: { band: ProjectBandData; domain: TimelineDomain; onOpen: () => void }) {
  const left = dateToX(band.rangeStart, domain, PX_PER_DAY);
  const width = Math.max(PX_PER_DAY, dateToX(band.rangeEnd, domain, PX_PER_DAY) - left + PX_PER_DAY);

  return (
    <div className="flex border-b border-border/50 last:border-b-0 hover:bg-muted/30">
      <button
        type="button"
        onClick={onOpen}
        className="sticky left-0 z-10 flex shrink-0 flex-col justify-center gap-1 border-r border-border bg-background px-3 text-left hover:bg-muted/50"
        style={{ width: LEFT_WIDTH, height: ROW_HEIGHT }}
      >
        <span className="truncate text-sm font-medium">{band.project.name}</span>
        <HealthBadge health={band.project.health} />
      </button>
      <div className="relative shrink-0" style={{ width: domain.days * PX_PER_DAY, height: ROW_HEIGHT }}>
        <button
          type="button"
          onClick={onOpen}
          aria-label={`${band.project.name} schedule`}
          className="absolute top-1/2 -translate-y-1/2 rounded-full bg-primary/85 shadow-xs transition-transform hover:-translate-y-[calc(50%+1px)]"
          style={{ left, width, height: BAND_HEIGHT }}
        />
        {band.milestones.map((m) => (
          <Tooltip key={m.id}>
            <TooltipTrigger asChild>
              <div
                className="absolute top-1/2 flex size-3.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-foreground text-background"
                style={{ left: dateToX(m.targetDate, domain, PX_PER_DAY) }}
              >
                <Flag className="size-2" weight="fill" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {m.name} — {milestoneDateFormatter.format(m.targetDate)}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
