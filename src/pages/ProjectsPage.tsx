import { useState } from "react";
import { toast } from "sonner";
import { FileArrowDown, FileArrowUp, FolderOpen, Plus, Stack } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ProjectFormDialog } from "@/components/projects/ProjectFormDialog";
import { CreateProjectFromTemplateDialog } from "@/components/templates/CreateProjectFromTemplateDialog";
import { ImportJsonDialog } from "@/components/data/ImportJsonDialog";
import { useProjects, useProjectTaskCounts } from "@/hooks/use-projects";
import { useTemplates } from "@/hooks/use-templates";
import { useCurrentRole } from "@/hooks/use-role";
import { hasPermission } from "@/lib/permissions";
import { buildFullExportBundle, downloadExportBundle } from "@/lib/io/export";

export function ProjectsPage() {
  const projects = useProjects();
  const taskCounts = useProjectTaskCounts();
  const templates = useTemplates();
  const role = useCurrentRole();
  const [createOpen, setCreateOpen] = useState(false);
  const [fromTemplateOpen, setFromTemplateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  async function handleExportAll() {
    try {
      const bundle = await buildFullExportBundle();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadExportBundle(bundle, `project-tracker-export-${stamp}.json`);
      toast.success(`Exported ${bundle.projects.length} project${bundle.projects.length === 1 ? "" : "s"}`);
    } catch (error) {
      console.error("Export all failed", error);
      toast.error("Export failed");
    }
  }

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
        <div className="flex flex-wrap items-center gap-2">
          {templates !== undefined && templates.length > 0 && (
            <Button variant="outline" onClick={() => setFromTemplateOpen(true)}>
              <Stack /> From template
            </Button>
          )}
          <Button
            variant="outline"
            disabled={!hasPermission(role, "data:import")}
            onClick={() => setImportOpen(true)}
          >
            <FileArrowUp /> Import
          </Button>
          {projects !== undefined && projects.length > 0 && (
            <Button variant="outline" onClick={handleExportAll}>
              <FileArrowDown /> Export all
            </Button>
          )}
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New project
          </Button>
        </div>
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
      <CreateProjectFromTemplateDialog open={fromTemplateOpen} onOpenChange={setFromTemplateOpen} />
      <ImportJsonDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
