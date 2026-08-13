import { useMemo } from "react";
import { ArrowsClockwise, Flag } from "@phosphor-icons/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DependencyLinks, type GanttLink, type LinkEndpoint } from "@/components/gantt/DependencyLinks";
import { normalizeDependencyEdges } from "@/lib/dependency-graph";
import { computeCriticalPath, type CpmTaskInput } from "@/lib/gantt/critical-path";
import { computeTimelineDomain, dateToX, daySpan, weekTicks, type TimelineDomain } from "@/lib/gantt/timeline-scale";
import { cn } from "@/lib/utils";
import type { Milestone, Task, TaskDependency, TaskStatus } from "@/lib/db";

const LEFT_WIDTH = 220;
const PX_PER_DAY = 28;
const ROW_HEIGHT = 44;
const GROUP_HEADER_HEIGHT = 28;
const HEADER_HEIGHT = 32;
const BAR_HEIGHT = 20;

const weekLabelFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const milestoneDateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

interface GanttChartProps {
  tasks: Task[];
  statuses: TaskStatus[];
  dependencies: TaskDependency[];
  milestones: Milestone[];
  onOpenTask: (taskId: string) => void;
}

/**
 * Renders bars from each task's own startDate/dueDate, grouped by status, with dependency links
 * and a real CPM critical path (see src/lib/gantt/critical-path.ts) laid over the top. Tasks
 * missing one or both dates never reach the pixel-math below — they're routed to a marker row or
 * an "Unscheduled" list instead, so a project with incomplete dates can't crash the layout.
 *
 * Generated recurring instances (recurrenceParentId set) are deliberately excluded: a daily
 * task can legitimately produce dozens of dated instances within the lookahead window, which
 * would flood a schedule/critical-path view with rows that carry no real project-scheduling
 * meaning. The template task itself (the one the rule lives on) still renders normally — its
 * occurrences are what Calendar and Board are for.
 */
export function GanttChart({ tasks, statuses, dependencies, milestones, onOpenTask }: GanttChartProps) {
  const { scheduled, partial, unscheduled } = useMemo(() => {
    const scheduled: Task[] = [];
    const partial: Task[] = [];
    const unscheduled: Task[] = [];
    for (const t of tasks) {
      if (t.recurrenceParentId !== null) continue;
      const hasStart = t.startDate !== null;
      const hasDue = t.dueDate !== null;
      if (hasStart && hasDue) scheduled.push(t);
      else if (hasStart || hasDue) partial.push(t);
      else unscheduled.push(t);
    }
    return { scheduled, partial, unscheduled };
  }, [tasks]);

  const placed = useMemo(() => [...scheduled, ...partial], [scheduled, partial]);

  const domain = useMemo(() => {
    const dates = [
      ...scheduled.flatMap((t) => [t.startDate!, t.dueDate!]),
      ...partial.map((t) => (t.startDate ?? t.dueDate)!),
      ...milestones.map((m) => m.targetDate),
    ];
    return computeTimelineDomain(dates);
  }, [scheduled, partial, milestones]);

  const edges = useMemo(() => normalizeDependencyEdges(dependencies), [dependencies]);

  const cpm = useMemo(() => {
    const cpmTasks: CpmTaskInput[] = scheduled.map((t) => ({ id: t.id, durationDays: daySpan(t.startDate!, t.dueDate!) }));
    return computeCriticalPath(cpmTasks, edges);
  }, [scheduled, edges]);

  const layoutGroups = useMemo(() => {
    const byStatus = new Map(statuses.map((s) => [s.id, [] as Task[]]));
    for (const t of placed) byStatus.get(t.statusId)?.push(t);
    for (const list of byStatus.values()) {
      list.sort((a, b) => (a.startDate ?? a.dueDate ?? 0) - (b.startDate ?? b.dueDate ?? 0));
    }
    return statuses.filter((s) => (byStatus.get(s.id)?.length ?? 0) > 0).map((s) => ({ status: s, taskRows: byStatus.get(s.id)! }));
  }, [placed, statuses]);

  const endpoints = useMemo(() => {
    const map: Record<string, LinkEndpoint> = {};
    let y = 0;
    for (const group of layoutGroups) {
      y += GROUP_HEADER_HEIGHT;
      for (const task of group.taskRows) {
        const center = y + ROW_HEIGHT / 2;
        const startDate = task.startDate ?? task.dueDate!;
        const dueDate = task.dueDate ?? task.startDate!;
        map[task.id] = {
          startX: dateToX(startDate, domain, PX_PER_DAY),
          endX: dateToX(dueDate, domain, PX_PER_DAY) + PX_PER_DAY,
          y: center,
        };
        y += ROW_HEIGHT;
      }
    }
    return map;
  }, [layoutGroups, domain]);

  const links: GanttLink[] = useMemo(
    () =>
      edges
        .filter((e) => endpoints[e.predecessorId] && endpoints[e.successorId])
        .map((e) => ({
          predecessorId: e.predecessorId,
          successorId: e.successorId,
          critical: cpm.criticalEdgeKeys.has(`${e.predecessorId}:${e.successorId}`),
        })),
    [edges, endpoints, cpm]
  );

  const visibleMilestones = useMemo(
    () => milestones.filter((m) => m.targetDate >= domain.start && m.targetDate <= domain.end),
    [milestones, domain]
  );

  const nowMs = Date.now();
  const todayX = nowMs >= domain.start && nowMs <= domain.end ? dateToX(nowMs, domain, PX_PER_DAY) : null;
  const chartWidth = domain.days * PX_PER_DAY;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-destructive" aria-hidden="true" /> Critical path
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary/85" aria-hidden="true" /> On track
        </span>
        {visibleMilestones.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <Flag className="size-3" weight="fill" /> Milestone
          </span>
        )}
      </div>

      {placed.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No tasks have a start or due date yet — add dates to see them on the timeline.
        </p>
      ) : (
        <div className="max-h-[70vh] overflow-auto rounded-lg border border-border">
          <div className="relative" style={{ width: LEFT_WIDTH + chartWidth }}>
            <div className="sticky top-0 z-20 flex border-b border-border bg-card">
              <div
                className="sticky left-0 z-30 flex shrink-0 items-center border-r border-border bg-card px-3 text-xs font-medium text-muted-foreground"
                style={{ width: LEFT_WIDTH, height: HEADER_HEIGHT }}
              >
                Task
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

            <div className="relative">
              <DependencyLinks links={links} endpoints={endpoints} />
              {layoutGroups.map((group) => (
                <div key={group.status.id}>
                  <div className="flex border-b border-border/60 bg-muted/40">
                    <div
                      className="sticky left-0 z-10 flex shrink-0 items-center bg-muted/40 px-3 text-xs font-semibold"
                      style={{ width: LEFT_WIDTH, height: GROUP_HEADER_HEIGHT }}
                    >
                      {group.status.name}
                    </div>
                    <div className="shrink-0" style={{ width: chartWidth, height: GROUP_HEADER_HEIGHT }} />
                  </div>
                  {group.taskRows.map((task) => (
                    <GanttTaskRow
                      key={task.id}
                      task={task}
                      domain={domain}
                      critical={cpm.criticalTaskIds.has(task.id)}
                      onOpen={() => onOpenTask(task.id)}
                    />
                  ))}
                </div>
              ))}
            </div>

            {visibleMilestones.map((m) => (
              <div
                key={m.id}
                className="pointer-events-none absolute top-0 bottom-0 z-10"
                style={{ left: LEFT_WIDTH + dateToX(m.targetDate, domain, PX_PER_DAY) }}
              >
                <div className="h-full w-px border-l border-dashed border-foreground/30" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="pointer-events-auto absolute top-0.5 -left-1.5 rounded-sm bg-foreground p-0.5 text-background">
                      <Flag className="size-2.5" weight="fill" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {m.name} — {milestoneDateFormatter.format(m.targetDate)}
                  </TooltipContent>
                </Tooltip>
              </div>
            ))}
          </div>
        </div>
      )}

      {unscheduled.length > 0 && (
        <div className="rounded-lg border border-dashed border-border p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Unscheduled ({unscheduled.length}) — add a start or due date to place these on the timeline
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unscheduled.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onOpenTask(t.id)}
                className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/70"
              >
                {t.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GanttTaskRow({
  task,
  domain,
  critical,
  onOpen,
}: {
  task: Task;
  domain: TimelineDomain;
  critical: boolean;
  onOpen: () => void;
}) {
  const hasStart = task.startDate !== null;
  const hasDue = task.dueDate !== null;
  const completed = task.completedAt !== null;

  return (
    <div className="flex border-b border-border/50 last:border-b-0 hover:bg-muted/30">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r border-border bg-background px-3 text-left text-xs hover:bg-muted/50",
          critical && "border-l-2 border-l-destructive"
        )}
        style={{ width: LEFT_WIDTH, height: ROW_HEIGHT }}
      >
        {task.isRecurring && (
          <ArrowsClockwise className="size-3 shrink-0 text-muted-foreground" aria-label="Recurring — see Calendar for its occurrences" />
        )}
        <span className={cn("truncate", completed && "text-muted-foreground line-through")}>{task.title}</span>
      </button>
      <div className="relative shrink-0" style={{ width: domain.days * PX_PER_DAY, height: ROW_HEIGHT }}>
        {hasStart && hasDue ? (
          <button
            type="button"
            onClick={onOpen}
            className={cn(
              "absolute top-1/2 flex -translate-y-1/2 items-center overflow-hidden rounded-md text-left text-[10px] font-medium text-primary-foreground shadow-xs transition-transform hover:-translate-y-[calc(50%+1px)]",
              critical ? "bg-destructive" : "bg-primary/85"
            )}
            style={{
              left: dateToX(task.startDate!, domain, PX_PER_DAY) + 1,
              width: Math.max(PX_PER_DAY - 2, daySpan(task.startDate!, task.dueDate!) * PX_PER_DAY - 2),
              height: BAR_HEIGHT,
            }}
          >
            <span className="hidden truncate px-1.5 sm:inline">{task.title}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            aria-label={task.title}
            className={cn(
              "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px]",
              critical ? "bg-destructive" : "bg-primary/70"
            )}
            style={{ left: dateToX((task.startDate ?? task.dueDate)!, domain, PX_PER_DAY) + PX_PER_DAY / 2 }}
          />
        )}
      </div>
    </div>
  );
}
