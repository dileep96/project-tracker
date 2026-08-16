import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { BookmarkSimple, DownloadSimple, FileCsv, FilePdf, FileXls, X } from "@phosphor-icons/react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TaskTable } from "@/components/tasks/TaskTable";
import { TASK_PRIORITIES, type Project, type ReportFilters, type Task, type TaskPriority, type TaskStatus } from "@/lib/db";
import { EMPTY_REPORT_FILTERS, applyReportFilters, buildExportRows, exportRowsAsCsv, exportRowsAsPdf, exportRowsAsXlsx } from "@/lib/analytics/report";
import { useSavedReportViews } from "@/hooks/use-report-views";
import { createSavedReportView, deleteSavedReportView } from "@/lib/queries/report-views";

const DATE_FIELD_LABELS: Record<ReportFilters["dateField"], string> = {
  dueDate: "Due date",
  startDate: "Start date",
  createdAt: "Created date",
  completedAt: "Completed date",
};

function toInputValue(epochMs: number | null): string {
  if (epochMs === null) return "";
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fromInputValue(value: string): number | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

interface ReportBuilderProps {
  tasks: Task[];
  projects: Project[];
  statusesByProject: Record<string, TaskStatus[]>;
  onOpenTask: (taskId: string) => void;
}

export function ReportBuilder({ tasks, projects, statusesByProject, onOpenTask }: ReportBuilderProps) {
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_REPORT_FILTERS);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [exporting, setExporting] = useState<"csv" | "pdf" | "xlsx" | null>(null);
  const savedViews = useSavedReportViews();

  const projectsById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);
  const statusName = useCallback(
    (task: Task) => statusesByProject[task.projectId]?.find((s) => s.id === task.statusId)?.name ?? "",
    [statusesByProject]
  );
  const statusesForProject = useCallback((projectId: string) => statusesByProject[projectId] ?? [], [statusesByProject]);

  const statusOptions = useMemo(() => {
    const scoped = filters.projectId ? tasks.filter((t) => t.projectId === filters.projectId) : tasks;
    return Array.from(new Set(scoped.map(statusName))).filter(Boolean).sort();
  }, [tasks, filters.projectId, statusName]);

  const filteredTasks = useMemo(() => applyReportFilters(tasks, filters, statusName), [tasks, filters, statusName]);

  const hasActiveFilters =
    filters.projectId || filters.statusName || filters.priority || filters.assignee || filters.dateFrom || filters.dateTo;

  function patch(partial: Partial<ReportFilters>) {
    setFilters((f) => ({ ...f, ...partial }));
  }

  async function handleSaveView() {
    const name = viewName.trim();
    if (!name) return;
    await createSavedReportView(name, filters);
    toast.success(`Saved view "${name}"`);
    setSaveDialogOpen(false);
    setViewName("");
  }

  async function handleExport(kind: "csv" | "pdf" | "xlsx") {
    setExporting(kind);
    try {
      const rows = buildExportRows(filteredTasks, projectsById, statusName);
      const stamp = new Date().toISOString().slice(0, 10);
      if (kind === "csv") exportRowsAsCsv(rows, `task-report-${stamp}.csv`);
      else if (kind === "pdf") await exportRowsAsPdf(rows, `task-report-${stamp}.pdf`, "Task report");
      else await exportRowsAsXlsx(rows, `task-report-${stamp}.xlsx`);
      toast.success(`Exported ${rows.length} task${rows.length === 1 ? "" : "s"} as ${kind.toUpperCase()}`);
    } catch (error) {
      console.error(`${kind} export failed`, error);
      toast.error(`${kind.toUpperCase()} export failed`);
    } finally {
      setExporting(null);
    }
  }

  return (
    <ChartCard title="Report builder" description="Filter tasks across every project, save the view, export the result.">
      <div className="flex flex-col gap-4">
        {/* Saved views */}
        {savedViews !== undefined && savedViews.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Saved views:</span>
            {savedViews.map((view) => (
              <span
                key={view.id}
                className="group inline-flex items-center gap-1 rounded-full border border-border py-0.5 pr-1 pl-2.5 text-xs"
              >
                <button type="button" className="hover:text-primary" onClick={() => setFilters(view.filters)}>
                  {view.name}
                </button>
                <button
                  type="button"
                  aria-label={`Delete saved view ${view.name}`}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={async () => {
                    await deleteSavedReportView(view.id);
                    toast.success("View deleted");
                  }}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Filter bar */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="report-project" className="text-[11px] text-muted-foreground">
              Project
            </Label>
            <Select value={filters.projectId ?? "all"} onValueChange={(v) => patch({ projectId: v === "all" ? null : v, statusName: null })}>
              <SelectTrigger id="report-project" size="sm" className="h-8 w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="report-status" className="text-[11px] text-muted-foreground">
              Status
            </Label>
            <Select value={filters.statusName ?? "all"} onValueChange={(v) => patch({ statusName: v === "all" ? null : v })}>
              <SelectTrigger id="report-status" size="sm" className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="report-priority" className="text-[11px] text-muted-foreground">
              Priority
            </Label>
            <Select
              value={filters.priority ?? "all"}
              onValueChange={(v) => patch({ priority: v === "all" ? null : (v as TaskPriority) })}
            >
              <SelectTrigger id="report-priority" size="sm" className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                {TASK_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p[0].toUpperCase() + p.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="report-assignee" className="text-[11px] text-muted-foreground">
              Assignee
            </Label>
            <Input
              id="report-assignee"
              name="assignee"
              value={filters.assignee ?? ""}
              onChange={(e) => patch({ assignee: e.target.value || null })}
              placeholder="Contains…"
              className="h-8 w-32 text-xs"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="report-date-field" className="text-[11px] text-muted-foreground">
              Date field
            </Label>
            <Select value={filters.dateField} onValueChange={(v) => patch({ dateField: v as ReportFilters["dateField"] })}>
              <SelectTrigger id="report-date-field" size="sm" className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DATE_FIELD_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="report-date-from" className="text-[11px] text-muted-foreground">
              From
            </Label>
            <input
              id="report-date-from"
              name="dateFrom"
              type="date"
              value={toInputValue(filters.dateFrom)}
              onChange={(e) => patch({ dateFrom: fromInputValue(e.target.value) })}
              className="h-8 rounded-md border border-input bg-transparent px-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="report-date-to" className="text-[11px] text-muted-foreground">
              To
            </Label>
            <input
              id="report-date-to"
              name="dateTo"
              type="date"
              value={toInputValue(filters.dateTo)}
              onChange={(e) => patch({ dateTo: fromInputValue(e.target.value) })}
              className="h-8 rounded-md border border-input bg-transparent px-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </div>

          {hasActiveFilters ? (
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setFilters(EMPTY_REPORT_FILTERS)}>
              Reset
            </Button>
          ) : null}

          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setSaveDialogOpen(true)}>
              <BookmarkSimple /> Save view
            </Button>
            <Button variant="outline" size="sm" disabled={exporting !== null} onClick={() => handleExport("csv")}>
              <FileCsv /> CSV
            </Button>
            <Button variant="outline" size="sm" disabled={exporting !== null} onClick={() => handleExport("xlsx")}>
              <FileXls /> Excel
            </Button>
            <Button variant="outline" size="sm" disabled={exporting !== null} onClick={() => handleExport("pdf")}>
              <FilePdf /> PDF
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          <DownloadSimple className="mr-1 inline size-3" />
          {filteredTasks.length} task{filteredTasks.length === 1 ? "" : "s"} match — exports use exactly this set.
        </p>

        <TaskTable
          tasks={filteredTasks}
          statusesForProject={statusesForProject}
          onOpenTask={onOpenTask}
          showProjectColumn
          projectsById={projectsById}
          emptyMessage="No tasks match these filters."
        />
      </div>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save this view</DialogTitle>
            <DialogDescription>Persists to this browser's storage — reload the page and it'll still be here.</DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex flex-col gap-1.5">
            <Label htmlFor="view-name">Name</Label>
            <Input
              id="view-name"
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              placeholder="Overdue high-priority"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleSaveView()}
            />
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveView} disabled={!viewName.trim()}>
              <BookmarkSimple /> Save view
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ChartCard>
  );
}
