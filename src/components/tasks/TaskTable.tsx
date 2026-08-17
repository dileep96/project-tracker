import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowsDownUp,
  ArrowSquareOut,
  MagnifyingGlass,
  Trash,
} from "@phosphor-icons/react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { StatusSelect } from "@/components/tasks/StatusSelect";
import { PrioritySelect } from "@/components/tasks/PrioritySelect";
import { EditableTextCell } from "@/components/tasks/cells/EditableTextCell";
import { DateCell } from "@/components/tasks/cells/DateCell";
import { TagsCell } from "@/components/tasks/cells/TagsCell";
import { EstimateCell } from "@/components/tasks/cells/EstimateCell";
import { TASK_PRIORITIES, type Project, type Task, type TaskPriority, type TaskStatus } from "@/lib/db";
import { cn } from "@/lib/utils";
import { deleteTask, setTaskCompleted, updateTask } from "@/lib/queries/tasks";
import { useCurrentRole } from "@/hooks/use-role";
import { hasPermission } from "@/lib/permissions";

type SortKey = "title" | "status" | "priority" | "startDate" | "dueDate" | "project" | "createdAt";
type SortDirection = "asc" | "desc";

const PRIORITY_RANK: Record<TaskPriority, number> = { low: 0, medium: 1, high: 2, urgent: 3 };
const PAGE_SIZE = 25;
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

interface TaskTableProps {
  tasks: Task[];
  statusesForProject: (projectId: string) => TaskStatus[];
  onOpenTask: (taskId: string) => void;
  showProjectColumn?: boolean;
  projectsById?: Record<string, Project>;
  emptyMessage?: string;
}

export function TaskTable({
  tasks,
  statusesForProject,
  onOpenTask,
  showProjectColumn = false,
  projectsById,
  emptyMessage = "No tasks match your filters.",
}: TaskTableProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);
  const role = useCurrentRole();

  const statusName = useCallback(
    (task: Task) => statusesForProject(task.projectId).find((s) => s.id === task.statusId)?.name ?? "",
    [statusesForProject]
  );

  const statusOptions = useMemo(
    () => Array.from(new Set(tasks.map(statusName))).filter(Boolean).sort(),
    [tasks, statusName]
  );
  const tagOptions = useMemo(
    () => Array.from(new Set(tasks.flatMap((t) => t.tags))).sort(),
    [tasks]
  );

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(0);
    };
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (q && !t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && statusName(t) !== statusFilter) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (tagFilter !== "all" && !t.tags.includes(tagFilter)) return false;
      if (assigneeFilter.trim() && !t.assignee.toLowerCase().includes(assigneeFilter.trim().toLowerCase()))
        return false;
      if (showProjectColumn && projectFilter !== "all" && t.projectId !== projectFilter) return false;
      return true;
    });
  }, [
    tasks,
    search,
    statusFilter,
    priorityFilter,
    tagFilter,
    assigneeFilter,
    projectFilter,
    showProjectColumn,
    statusName,
  ]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    const dir = sortDirection === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortKey) {
        case "title":
          return a.title.localeCompare(b.title) * dir;
        case "status":
          return statusName(a).localeCompare(statusName(b)) * dir;
        case "priority":
          return (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) * dir;
        case "startDate":
          return ((a.startDate ?? Infinity) - (b.startDate ?? Infinity)) * dir;
        case "dueDate":
          return ((a.dueDate ?? Infinity) - (b.dueDate ?? Infinity)) * dir;
        case "project":
          return (projectsById?.[a.projectId]?.name ?? "").localeCompare(projectsById?.[b.projectId]?.name ?? "") * dir;
        case "createdAt":
        default:
          return (a.createdAt - b.createdAt) * dir;
      }
    });
    return rows;
  }, [filtered, sortKey, sortDirection, projectsById, statusName]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  function SortHeader({ label, sortKeyName, className }: { label: string; sortKeyName: SortKey; className?: string }) {
    const active = sortKey === sortKeyName;
    return (
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => toggleSort(sortKeyName)}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {label}
          {active ? (
            sortDirection === "asc" ? (
              <ArrowUp className="size-3" />
            ) : (
              <ArrowDown className="size-3" />
            )
          ) : (
            <ArrowsDownUp className="size-3 opacity-40" />
          )}
        </button>
      </TableHead>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
            placeholder="Search tasks…"
            className="h-8 w-48 pl-8 text-sm"
          />
        </div>

        <Select value={statusFilter} onValueChange={resetPage(setStatusFilter)}>
          <SelectTrigger size="sm" className="h-8 text-xs">
            <SelectValue placeholder="Status" />
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

        <Select value={priorityFilter} onValueChange={resetPage(setPriorityFilter) as (v: string) => void}>
          <SelectTrigger size="sm" className="h-8 text-xs">
            <SelectValue placeholder="Priority" />
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

        {tagOptions.length > 0 && (
          <Select value={tagFilter} onValueChange={resetPage(setTagFilter)}>
            <SelectTrigger size="sm" className="h-8 text-xs">
              <SelectValue placeholder="Tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tags</SelectItem>
              {tagOptions.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {showProjectColumn && projectsById && (
          <Select value={projectFilter} onValueChange={resetPage(setProjectFilter)}>
            <SelectTrigger size="sm" className="h-8 text-xs">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {Object.values(projectsById).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Input
          value={assigneeFilter}
          onChange={(e) => resetPage(setAssigneeFilter)(e.target.value)}
          placeholder="Assignee contains…"
          className="h-8 w-40 text-sm"
        />

        <span className="ml-auto text-xs text-muted-foreground">
          {sorted.length} task{sorted.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-9" />
              <SortHeader label="Title" sortKeyName="title" className="min-w-48" />
              <SortHeader label="Status" sortKeyName="status" className="w-32" />
              <SortHeader label="Priority" sortKeyName="priority" className="w-28" />
              <TableHead className="w-40">Tags</TableHead>
              <TableHead className="w-32">Assignee</TableHead>
              <SortHeader label="Start" sortKeyName="startDate" className="w-28" />
              <SortHeader label="Due" sortKeyName="dueDate" className="w-28" />
              <TableHead className="w-20">Est. h</TableHead>
              {showProjectColumn && <SortHeader label="Project" sortKeyName="project" className="w-32" />}
              <TableHead className="w-16 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={showProjectColumn ? 11 : 10} className="py-10 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((task) => {
                const completed = task.completedAt !== null;
                const overdue = !completed && task.dueDate !== null && task.dueDate < startOfToday();
                const statuses = statusesForProject(task.projectId);
                return (
                  <TableRow key={task.id} className="group">
                    <TableCell>
                      <Checkbox
                        checked={completed}
                        onCheckedChange={(checked) => setTaskCompleted(task.id, checked === true)}
                        aria-label={completed ? "Mark not done" : "Mark done"}
                      />
                    </TableCell>
                    <TableCell>
                      <EditableTextCell
                        value={task.title}
                        onCommit={(v) => updateTask(task.id, { title: v })}
                        displayClassName={cn(completed && "text-muted-foreground line-through")}
                      />
                    </TableCell>
                    <TableCell>
                      <StatusSelect
                        statuses={statuses}
                        value={task.statusId}
                        onChange={(statusId) => updateTask(task.id, { statusId })}
                      />
                    </TableCell>
                    <TableCell>
                      <PrioritySelect value={task.priority} onChange={(priority) => updateTask(task.id, { priority })} />
                    </TableCell>
                    <TableCell>
                      <TagsCell tags={task.tags} onChange={(tags) => updateTask(task.id, { tags })} />
                    </TableCell>
                    <TableCell>
                      <EditableTextCell
                        value={task.assignee}
                        onCommit={(v) => updateTask(task.id, { assignee: v })}
                        placeholder="Unassigned"
                      />
                    </TableCell>
                    <TableCell>
                      <DateCell value={task.startDate} onCommit={(v) => updateTask(task.id, { startDate: v })} />
                    </TableCell>
                    <TableCell>
                      <DateCell
                        value={task.dueDate}
                        onCommit={(v) => updateTask(task.id, { dueDate: v })}
                        overdue={overdue}
                      />
                    </TableCell>
                    <TableCell>
                      <EstimateCell value={task.estimatedHours} onCommit={(v) => updateTask(task.id, { estimatedHours: v })} />
                    </TableCell>
                    {showProjectColumn && (
                      <TableCell className="truncate text-xs text-muted-foreground">
                        {projectsById?.[task.projectId]?.name ?? "—"}
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Open task"
                          onClick={() => onOpenTask(task.id)}
                        >
                          <ArrowSquareOut />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Delete task"
                          disabled={!hasPermission(role, "task:delete")}
                          onClick={() => setPendingDelete(task)}
                        >
                          <Trash />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-xs text-muted-foreground">
            Page {currentPage + 1} of {pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <ConfirmDeleteDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete "${pendingDelete?.title}"?`}
        description="This permanently deletes the task, its subtasks, attachments, and any dependency links. This can't be undone."
        onConfirm={async () => {
          if (!pendingDelete) return;
          await deleteTask(pendingDelete.id);
          toast.success("Task deleted");
        }}
      />
    </div>
  );
}
