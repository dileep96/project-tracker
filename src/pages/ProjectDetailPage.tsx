import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarBlank,
  ChartBarHorizontal,
  Kanban,
  PencilSimple,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { HealthBadge } from "@/components/projects/HealthBadge";
import { ProjectFormDialog } from "@/components/projects/ProjectFormDialog";
import { TaskTable } from "@/components/tasks/TaskTable";
import { NewTaskDialog } from "@/components/tasks/NewTaskDialog";
import { TaskDetailSheet } from "@/components/tasks/TaskDetailSheet";
import { MilestoneManager } from "@/components/milestones/MilestoneManager";
import { StatusManager } from "@/components/tasks/StatusManager";
import { CustomFieldDefsManager } from "@/components/tasks/CustomFieldDefsManager";
import { useProject } from "@/hooks/use-projects";
import { useProjectTasks } from "@/hooks/use-tasks";
import { useTaskStatuses } from "@/hooks/use-task-statuses";
import { deleteProject } from "@/lib/queries/projects";

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const project = useProject(projectId);
  const tasks = useProjectTasks(projectId);
  const statuses = useTaskStatuses(projectId);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  // Stable identity so TaskTable's memoized filter/sort actually invalidates on status edits.
  const statusesForProject = useCallback(() => statuses ?? [], [statuses]);

  if (project === undefined || tasks === undefined) {
    return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">Loading…</div>;
  }

  if (project === null) {
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
      <Button variant="ghost" size="sm" className="w-fit -ml-2" onClick={() => navigate("/projects")}>
        <ArrowLeft /> Projects
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
            <HealthBadge health={project.health} />
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
              {project.status}
            </span>
          </div>
          {project.description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{project.description}</p>}
          {project.owner && <p className="mt-1 text-xs text-muted-foreground">Owner: {project.owner}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon-sm" aria-label="Board" onClick={() => navigate(`/projects/${project.id}/board`)}>
                <Kanban />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Board</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon-sm" aria-label="Gantt" onClick={() => navigate(`/projects/${project.id}/gantt`)}>
                <ChartBarHorizontal />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Gantt</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon-sm" aria-label="Calendar" onClick={() => navigate(`/projects/${project.id}/calendar`)}>
                <CalendarBlank />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Calendar</TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" className="mx-0.5 h-5" />
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <PencilSimple /> Edit
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash /> Delete
          </Button>
        </div>
      </div>

      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="milestones">Milestones</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="flex flex-col gap-3 pt-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setNewTaskOpen(true)}>
              <Plus /> New task
            </Button>
          </div>
          <TaskTable
            tasks={tasks}
            statusesForProject={statusesForProject}
            onOpenTask={setOpenTaskId}
            emptyMessage="No tasks yet. Create the first one."
          />
        </TabsContent>

        <TabsContent value="milestones" className="pt-4">
          <MilestoneManager projectId={project.id} />
        </TabsContent>

        <TabsContent value="settings" className="flex flex-col gap-8 pt-4">
          <section>
            <h2 className="mb-3 text-sm font-semibold">Task statuses</h2>
            <StatusManager projectId={project.id} />
          </section>
          <section>
            <h2 className="mb-3 text-sm font-semibold">Custom fields</h2>
            <CustomFieldDefsManager projectId={project.id} />
          </section>
        </TabsContent>
      </Tabs>

      <ProjectFormDialog open={editOpen} onOpenChange={setEditOpen} project={project} />
      <NewTaskDialog open={newTaskOpen} onOpenChange={setNewTaskOpen} projectId={project.id} onCreated={setOpenTaskId} />
      <TaskDetailSheet taskId={openTaskId} onClose={() => setOpenTaskId(null)} />

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete "${project.name}"?`}
        description="This permanently deletes the project and every task, subtask, attachment, and milestone inside it. This can't be undone."
        onConfirm={async () => {
          await deleteProject(project.id);
          toast.success("Project deleted");
          navigate("/projects");
        }}
      />
    </div>
  );
}
