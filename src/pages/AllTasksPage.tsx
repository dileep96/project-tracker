import { useCallback, useMemo, useState } from "react";
import { Plus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { TaskTable } from "@/components/tasks/TaskTable";
import { NewTaskDialog } from "@/components/tasks/NewTaskDialog";
import { TaskDetailSheet } from "@/components/tasks/TaskDetailSheet";
import { useAllTasks } from "@/hooks/use-tasks";
import { useProjects } from "@/hooks/use-projects";
import { useAllTaskStatusesByProject } from "@/hooks/use-task-statuses";

export function AllTasksPage() {
  const tasks = useAllTasks();
  const projects = useProjects();
  const statusesByProject = useAllTaskStatusesByProject();

  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const projectsById = useMemo(() => Object.fromEntries((projects ?? []).map((p) => [p.id, p])), [projects]);
  const statusesForProject = useCallback(
    (projectId: string) => statusesByProject?.[projectId] ?? [],
    [statusesByProject]
  );

  const loading = tasks === undefined || projects === undefined || statusesByProject === undefined;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">All tasks</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every task, across every project.</p>
        </div>
        <Button onClick={() => setNewTaskOpen(true)} disabled={(projects ?? []).length === 0}>
          <Plus /> New task
        </Button>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      ) : (projects ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-20 text-center">
          <p className="text-sm text-muted-foreground">Create a project first to start adding tasks.</p>
        </div>
      ) : (
        <TaskTable
          tasks={tasks!}
          statusesForProject={statusesForProject}
          onOpenTask={setOpenTaskId}
          showProjectColumn
          projectsById={projectsById}
        />
      )}

      <NewTaskDialog open={newTaskOpen} onOpenChange={setNewTaskOpen} onCreated={setOpenTaskId} />
      <TaskDetailSheet taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
    </div>
  );
}
