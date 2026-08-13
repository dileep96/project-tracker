import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/board/KanbanBoard";
import { NewTaskDialog } from "@/components/tasks/NewTaskDialog";
import { TaskDetailSheet } from "@/components/tasks/TaskDetailSheet";
import { useProject } from "@/hooks/use-projects";
import { useProjectTasks } from "@/hooks/use-tasks";
import { useTaskStatuses } from "@/hooks/use-task-statuses";
import { useAllDependencies } from "@/hooks/use-task-detail";

export function BoardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const project = useProject(projectId);
  const tasks = useProjectTasks(projectId);
  const statuses = useTaskStatuses(projectId);
  const dependencies = useAllDependencies();

  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

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
          <h1 className="text-2xl font-semibold tracking-tight">Board</h1>
          <p className="mt-1 text-sm text-muted-foreground">Drag a card to move it between statuses.</p>
        </div>
        <Button size="sm" onClick={() => setNewTaskOpen(true)}>
          <Plus /> New task
        </Button>
      </div>

      <KanbanBoard
        projectId={project.id}
        tasks={tasks}
        statuses={statuses}
        dependencies={dependencies ?? []}
        onOpenTask={setOpenTaskId}
      />

      <NewTaskDialog open={newTaskOpen} onOpenChange={setNewTaskOpen} projectId={project.id} onCreated={setOpenTaskId} />
      <TaskDetailSheet taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
    </div>
  );
}
