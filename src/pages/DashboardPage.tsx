import { useCallback, useMemo, useRef, useState } from "react";
import { CheckCircle, ClockCountdown, Gauge, Target, Warning } from "@phosphor-icons/react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { BurndownChart } from "@/components/dashboard/BurndownChart";
import { PortfolioRollup } from "@/components/dashboard/PortfolioRollup";
import { ResourceHeatmap } from "@/components/dashboard/ResourceHeatmap";
import { TrendCharts } from "@/components/dashboard/TrendCharts";
import { ReportBuilder } from "@/components/dashboard/ReportBuilder";
import { DrillDownPanel, type DrillDownState } from "@/components/dashboard/DrillDownPanel";
import { TaskDetailSheet } from "@/components/tasks/TaskDetailSheet";
import { useAllTasks } from "@/hooks/use-tasks";
import { useProjects } from "@/hooks/use-projects";
import { useAllTaskStatusesByProject } from "@/hooks/use-task-statuses";
import { computeDashboardKpis } from "@/lib/analytics/kpis";
import type { KpiResult } from "@/lib/analytics/kpis";
import type { Task } from "@/lib/db";

export function DashboardPage() {
  const tasks = useAllTasks();
  const projects = useProjects();
  const statusesByProject = useAllTaskStatusesByProject();

  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [burndownProjectId, setBurndownProjectId] = useState<string | null>(null);
  const [drillDown, setDrillDown] = useState<DrillDownState | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const drillDownRef = useRef<HTMLDivElement>(null);

  const now = Date.now();

  const projectsById = useMemo(() => Object.fromEntries((projects ?? []).map((p) => [p.id, p])), [projects]);
  const tasksByProject = useMemo(() => {
    const grouped: Record<string, Task[]> = {};
    for (const t of tasks ?? []) (grouped[t.projectId] ??= []).push(t);
    return grouped;
  }, [tasks]);
  const statusesForProject = useCallback((projectId: string) => statusesByProject?.[projectId] ?? [], [statusesByProject]);

  const scopedTasks = useMemo(
    () => (projectFilter ? (tasks ?? []).filter((t) => t.projectId === projectFilter) : (tasks ?? [])),
    [tasks, projectFilter]
  );

  const kpis = useMemo(() => computeDashboardKpis(scopedTasks, now), [scopedTasks, now]);

  const loading = tasks === undefined || projects === undefined || statusesByProject === undefined;

  function handleDrillDown(state: DrillDownState) {
    setDrillDown(state);
    requestAnimationFrame(() => drillDownRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function handleKpiDrillDown(result: KpiResult) {
    handleDrillDown({ label: result.label, tasks: result.matchingTasks });
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-2 px-4 py-24 text-center sm:px-6 lg:px-8">
        <Gauge className="size-8 text-muted-foreground" />
        <h1 className="text-xl font-semibold tracking-tight">No data yet</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Create a project and add a few tasks — every card and chart here lights up automatically once there's
          something to measure.
        </p>
      </div>
    );
  }

  // Derived, not effect-driven: `projects` is guaranteed non-empty past the guard above, so the
  // Select below always has a real string value from its very first render — an effect that set
  // this in state after mount would render it `undefined` first, flipping Select from
  // uncontrolled to controlled and triggering React's warning for it.
  const effectiveBurndownProjectId = burndownProjectId ?? projects[0].id;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Portfolio health, throughput, and workload — computed live from your tasks.</p>
        </div>
        <Select value={projectFilter ?? "all"} onValueChange={(v) => setProjectFilter(v === "all" ? null : v)}>
          <SelectTrigger size="sm" className="h-8 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard result={kpis.completionRate} icon={CheckCircle} onDrillDown={handleKpiDrillDown} />
        <KpiCard result={kpis.onTimeDelivery} icon={Target} onDrillDown={handleKpiDrillDown} />
        <KpiCard result={kpis.overdueCount} icon={Warning} onDrillDown={handleKpiDrillDown} />
        <KpiCard result={kpis.velocity} icon={Gauge} onDrillDown={handleKpiDrillDown} />
        <KpiCard result={kpis.budgetBurn} icon={ClockCountdown} onDrillDown={handleKpiDrillDown} />
      </div>

      {drillDown && (
        <div ref={drillDownRef}>
          <DrillDownPanel
            drillDown={drillDown}
            onClear={() => setDrillDown(null)}
            statusesForProject={statusesForProject}
            onOpenTask={setOpenTaskId}
            projectsById={projectsById}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PortfolioRollup projects={projects} tasksByProject={tasksByProject} now={now} onDrillDown={handleDrillDown} />

        <BurndownChart
          projects={projects}
          selectedProjectId={effectiveBurndownProjectId}
          onSelectProject={setBurndownProjectId}
          tasksByProject={tasksByProject}
          now={now}
        />

        <TrendCharts tasks={scopedTasks} now={now} onDrillDown={handleDrillDown} />

        <ResourceHeatmap tasks={scopedTasks} now={now} onDrillDown={handleDrillDown} />

        <ReportBuilder tasks={tasks} projects={projects} statusesByProject={statusesByProject} onOpenTask={setOpenTaskId} />
      </div>

      <TaskDetailSheet taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
    </div>
  );
}
