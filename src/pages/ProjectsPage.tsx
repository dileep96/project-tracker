import { useState } from "react";
import { FolderOpen, Plus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ProjectFormDialog } from "@/components/projects/ProjectFormDialog";
import { useProjects, useProjectTaskCounts } from "@/hooks/use-projects";

export function ProjectsPage() {
  const projects = useProjects();
  const taskCounts = useProjectTaskCounts();
  const [createOpen, setCreateOpen] = useState(false);

  const loading = projects === undefined;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything you're tracking, in one place.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus /> New project
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-20 text-center">
          <FolderOpen className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">No projects yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first project to start tracking tasks.
            </p>
          </div>
          <Button className="mt-2" onClick={() => setCreateOpen(true)}>
            <Plus /> New project
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} taskCount={taskCounts?.[project.id] ?? 0} />
          ))}
        </div>
      )}

      <ProjectFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
