import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { GanttChart } from "@/components/gantt/GanttChart";
import { NewTaskDialog } from "@/components/tasks/NewTaskDialog";
import { TaskDetailSheet } from "@/components/tasks/TaskDetailSheet";
import { useProject } from "@/hooks/use-projects";
import { useProjectTasks } from "@/hooks/use-tasks";
import { useTaskStatuses } from "@/hooks/use-task-statuses";
import { useAllDependencies } from "@/hooks/use-task-detail";
import { useMilestones } from "@/hooks/use-milestones";
import { generateRecurringInstances } from "@/lib/recurrence";

export function GanttPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const project = useProject(projectId);
  const tasks = useProjectTasks(projectId);
  const statuses = useTaskStatuses(projectId);
  const dependencies = useAllDependencies();
  const milestones = useMilestones(projectId);

  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  // Safety net for sessions left open across the lookahead window — see App.tsx's startup pass
  // and src/lib/recurrence.ts for the full trigger picture.
  useEffect(() => {
    generateRecurringInstances().catch((error) => console.error("Recurring task generation failed", error));
  }, []);

  if (project === undefined || tasks === undefined || statuses === undefined) {
    return <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">Loading…</div>;
  }

  if (project === null) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 text-center sm:px-6 lg:px-8">
        <p className="text-sm text-muted-foreground">This project no longer exists.</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate("/projects")}>
          Back to projects
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
      <Button variant="ghost" size="sm" className="w-fit -ml-2" onClick={() => navigate(`/projects/${project.id}`)}>
        <ArrowLeft /> {project.name}
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gantt</h1>
          <p className="mt-1 text-sm text-muted-foreground">Schedule and critical path, from each task's start and due date.</p>
        </div>
        <Button size="sm" onClick={() => setNewTaskOpen(true)}>
          <Plus /> New task
        </Button>
      </div>

      <GanttChart
        tasks={tasks}
        statuses={statuses}
        dependencies={dependencies ?? []}
        milestones={milestones ?? []}
        onOpenTask={setOpenTaskId}
      />

      <NewTaskDialog open={newTaskOpen} onOpenChange={setNewTaskOpen} projectId={project.id} onCreated={setOpenTaskId} />
      <TaskDetailSheet taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
    </div>
  );
}
