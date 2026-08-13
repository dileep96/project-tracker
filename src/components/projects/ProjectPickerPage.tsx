import { useNavigate } from "react-router-dom";
import type { Icon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { HealthBadge } from "@/components/projects/HealthBadge";
import { useProjects } from "@/hooks/use-projects";

/**
 * Board and Gantt are inherently per-project routes (`/projects/:id/board|gantt`), but their nav
 * entries live in the global sidebar with no project context. This is the landing page those nav
 * entries point at — pick a project, then jump into its board/gantt — so the sidebar never needs
 * a `:projectId` it doesn't have.
 */
export function ProjectPickerPage({
  title,
  description,
  icon: PageIcon,
  buildPath,
}: {
  title: string;
  description: string;
  icon: Icon;
  buildPath: (projectId: string) => string;
}) {
  const navigate = useNavigate();
  const projects = useProjects();
  const loading = projects === undefined;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-20 text-center">
          <PageIcon className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">No projects yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Create a project first, then come back here.</p>
          </div>
          <Button className="mt-2" onClick={() => navigate("/projects")}>
            Go to projects
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => navigate(buildPath(project.id))}
              className="flex flex-col items-start gap-2.5 rounded-xl border border-border bg-card p-4 text-left shadow-xs transition-all hover:shadow-md active:translate-y-px"
            >
              <span className="line-clamp-1 font-medium">{project.name}</span>
              <HealthBadge health={project.health} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
