import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PortfolioTimeline } from "@/components/timeline/PortfolioTimeline";
import { useProjects } from "@/hooks/use-projects";
import { useAllTasks } from "@/hooks/use-tasks";
import { useAllMilestones } from "@/hooks/use-milestones";
import type { Milestone, Task } from "@/lib/db";

export function TimelinePage() {
  const navigate = useNavigate();
  const projects = useProjects();
  const tasks = useAllTasks();
  const milestones = useAllMilestones();

  const tasksByProject = useMemo(() => {
    const grouped: Record<string, Task[]> = {};
    for (const t of tasks ?? []) (grouped[t.projectId] ??= []).push(t);
    return grouped;
  }, [tasks]);

  const milestonesByProject = useMemo(() => {
    const grouped: Record<string, Milestone[]> = {};
    for (const m of milestones ?? []) (grouped[m.projectId] ??= []).push(m);
    return grouped;
  }, [milestones]);

  const loading = projects === undefined || tasks === undefined || milestones === undefined;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Timeline</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every project, positioned by its own task dates and milestones.</p>
      </div>

      {loading ? (
        <div className="h-96 animate-pulse rounded-xl bg-muted" />
      ) : (projects ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-20 text-center">
          <p className="text-sm text-muted-foreground">Create a project first to see it on the timeline.</p>
        </div>
      ) : (
        <PortfolioTimeline
          projects={projects!}
          tasksByProject={tasksByProject}
          milestonesByProject={milestonesByProject}
          onOpenProject={(id) => navigate(`/projects/${id}`)}
        />
      )}
    </div>
  );
}
