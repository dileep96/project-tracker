import { useCallback, useState } from "react";
import { toast } from "sonner";
import { FileArrowDown, FileArrowUp, FileCsv, Stack } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { SaveAsTemplateDialog } from "@/components/templates/SaveAsTemplateDialog";
import { ImportCsvTasksDialog } from "@/components/data/ImportCsvTasksDialog";
import type { Project, Task, TaskStatus } from "@/lib/db";
import { buildExportRows, exportRowsAsCsv } from "@/lib/analytics/report";
import { buildProjectExportBundle, downloadExportBundle } from "@/lib/io/export";
import { useCurrentRole } from "@/hooks/use-role";
import { hasPermission } from "@/lib/permissions";

interface ProjectDataSettingsProps {
  project: Project;
  tasks: Task[];
  statuses: TaskStatus[];
}

/**
 * The Settings tab's "Data" subsection (Phase 7) — save-as-template, JSON export, and CSV
 * export/import, all scoped to this one project. Mirrors the Automations/Custom fields
 * subsections right above it on the same tab (see ProjectDetailPage) rather than inventing a new
 * page — templates and import/export are new *flows*, not new visual language, per the Phase 7
 * brief. Whole-database export/import ("Export all" / "Import project") lives on ProjectsPage
 * instead, since those actions aren't scoped to any one project.
 */
export function ProjectDataSettings({ project, tasks, statuses }: ProjectDataSettingsProps) {
  const role = useCurrentRole();
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [importCsvOpen, setImportCsvOpen] = useState(false);

  const statusName = useCallback(
    (task: Task) => statuses.find((s) => s.id === task.statusId)?.name ?? "",
    [statuses]
  );

  function handleExportJson() {
    buildProjectExportBundle(project.id)
      .then((bundle) => {
        const stamp = new Date().toISOString().slice(0, 10);
        downloadExportBundle(bundle, `${project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${stamp}.json`);
        toast.success("Project exported");
      })
      .catch((error) => {
        console.error("Project JSON export failed", error);
        toast.error("Export failed");
      });
  }

  function handleExportCsv() {
    const rows = buildExportRows(tasks, { [project.id]: project }, statusName);
    const stamp = new Date().toISOString().slice(0, 10);
    exportRowsAsCsv(rows, `${project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-tasks-${stamp}.csv`);
    toast.success(`Exported ${rows.length} task${rows.length === 1 ? "" : "s"}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Save this project's shape for reuse, or move its data in and out as files — see AGENTS.md for exactly
        what's included in each export.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!hasPermission(role, "template:manage")}
          onClick={() => setSaveTemplateOpen(true)}
        >
          <Stack /> Save as template
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportJson}>
          <FileArrowDown /> Export project (JSON)
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportCsv}>
          <FileCsv /> Export tasks (CSV)
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasPermission(role, "data:import")}
          onClick={() => setImportCsvOpen(true)}
        >
          <FileArrowUp /> Import tasks (CSV)
        </Button>
      </div>

      <SaveAsTemplateDialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen} project={project} />
      <ImportCsvTasksDialog
        open={importCsvOpen}
        onOpenChange={setImportCsvOpen}
        projectId={project.id}
        projectName={project.name}
        statuses={statuses}
      />
    </div>
  );
}
