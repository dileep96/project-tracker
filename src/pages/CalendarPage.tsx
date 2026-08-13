import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { TaskDetailSheet } from "@/components/tasks/TaskDetailSheet";
import { useAllTasks, useProjectTasks } from "@/hooks/use-tasks";
import { useProject, useProjects } from "@/hooks/use-projects";
import { generateRecurringInstances } from "@/lib/recurrence";

/** Backs both the global `/calendar` nav entry and the per-project `/projects/:id/calendar` route — same month grid, scoped differently. */
export function CalendarPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const isProjectScoped = projectId !== undefined;
  const navigate = useNavigate();

  const project = useProject(projectId);
  const projects = useProjects();
  const allTasks = useAllTasks();
  const scopedTasks = useProjectTasks(projectId);

  const [projectFilter, setProjectFilter] = useState("all");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  // Safety net for sessions left open across the lookahead window — see App.tsx's startup pass
  // and src/lib/recurrence.ts for the full trigger picture.
  useEffect(() => {
    generateRecurringInstances().catch((error) => console.error("Recurring task generation failed", error));
  }, []);

  const tasks = useMemo(() => {
    if (isProjectScoped) return scopedTasks ?? [];
    const base = allTasks ?? [];
    return projectFilter === "all" ? base : base.filter((t) => t.projectId === projectFilter);
  }, [isProjectScoped, scopedTasks, allTasks, projectFilter]);

  const loading = isProjectScoped ? scopedTasks === undefined : allTasks === undefined || projects === undefined;

  if (isProjectScoped && project === null) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 text-center sm:px-6 lg:px-8">
        <p className="text-sm text-muted-foreground">This project no longer exists.</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate("/projects")}>
          Back to projects
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      {isProjectScoped && project && (
        <Button variant="ghost" size="sm" className="w-fit -ml-2" onClick={() => navigate(`/projects/${project.id}`)}>
          <ArrowLeft /> {project.name}
        </Button>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isProjectScoped ? "Tasks in this project, by date." : "Every task, across every project, by date."}
          </p>
        </div>
        {!isProjectScoped && (projects?.length ?? 0) > 0 && (
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger size="sm" className="h-8 w-48 text-xs">
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {(projects ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading ? (
        <div className="h-96 animate-pulse rounded-xl bg-muted" />
      ) : (
        <MonthCalendar tasks={tasks} onOpenTask={setOpenTaskId} />
      )}

      <TaskDetailSheet taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
    </div>
  );
}
