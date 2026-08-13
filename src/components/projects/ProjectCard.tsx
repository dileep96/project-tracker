import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DotsThreeVertical, PencilSimple, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { HealthBadge } from "@/components/projects/HealthBadge";
import { ProjectFormDialog } from "@/components/projects/ProjectFormDialog";
import { deleteProject } from "@/lib/queries/projects";
import type { Project } from "@/lib/db";
import { toast } from "sonner";

export function ProjectCard({ project, taskCount }: { project: Project; taskCount: number }) {
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <Card
        className="cursor-pointer transition-shadow hover:shadow-md"
        onClick={() => navigate(`/projects/${project.id}`)}
      >
        <CardHeader>
          <CardTitle className="truncate pr-2">{project.name}</CardTitle>
          <CardAction>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Project actions"
                >
                  <DotsThreeVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <PencilSimple /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardAction>
        </CardHeader>
        <CardContent>
          {project.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <HealthBadge health={project.health} />
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
              {project.status}
            </span>
          </div>
          <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
            <span>{project.owner ? `Owner: ${project.owner}` : "No owner set"}</span>
            <span className="font-mono">
              {taskCount} task{taskCount === 1 ? "" : "s"}
            </span>
          </div>
        </CardContent>
      </Card>

      <ProjectFormDialog open={editOpen} onOpenChange={setEditOpen} project={project} />

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete "${project.name}"?`}
        description="This permanently deletes the project and every task, subtask, attachment, and milestone inside it. This can't be undone."
        onConfirm={async () => {
          await deleteProject(project.id);
          toast.success("Project deleted");
        }}
      />
    </>
  );
}
