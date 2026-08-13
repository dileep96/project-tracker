import { useMemo, useState } from "react";
import { Sliders } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KanbanColumn } from "@/components/board/KanbanColumn";
import { StatusManager } from "@/components/tasks/StatusManager";
import { normalizeDependencyEdges } from "@/lib/dependency-graph";
import type { Task, TaskDependency, TaskPriority, TaskStatus } from "@/lib/db";

const PRIORITY_RANK: Record<TaskPriority, number> = { low: 0, medium: 1, high: 2, urgent: 3 };

/** Highest priority first, then soonest due date, then title — no separate "board order" field exists (or needs to), tasks already carry everything this needs. */
function compareCardOrder(a: Task, b: Task): number {
  const rankDiff = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
  if (rankDiff !== 0) return rankDiff;
  const dueDiff = (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity);
  if (dueDiff !== 0) return dueDiff;
  return a.title.localeCompare(b.title);
}

interface KanbanBoardProps {
  projectId: string;
  tasks: Task[];
  statuses: TaskStatus[];
  dependencies: TaskDependency[];
  onOpenTask: (taskId: string) => void;
}

/** Columns are this project's own `taskStatuses` (Phase 1's column model) — reordering or renaming them in "Manage columns" reflects here live via the same live-query hook the rest of the app uses. */
export function KanbanBoard({ projectId, tasks, statuses, dependencies, onOpenTask }: KanbanBoardProps) {
  const [manageOpen, setManageOpen] = useState(false);

  const tasksById = useMemo(() => Object.fromEntries(tasks.map((t) => [t.id, t])), [tasks]);
  const edges = useMemo(() => normalizeDependencyEdges(dependencies), [dependencies]);
  const tasksByStatus = useMemo(() => {
    const grouped: Record<string, Task[]> = {};
    for (const status of statuses) grouped[status.id] = [];
    for (const task of tasks) (grouped[task.statusId] ??= []).push(task);
    for (const list of Object.values(grouped)) list.sort(compareCardOrder);
    return grouped;
  }, [tasks, statuses]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setManageOpen(true)}>
          <Sliders /> Manage columns
        </Button>
      </div>

      {statuses.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          This project has no statuses yet — add one to start building the board.
        </p>
      ) : (
        <div className="flex items-start gap-3 overflow-x-auto pb-2">
          {statuses.map((status) => (
            <KanbanColumn
              key={status.id}
              status={status}
              tasks={tasksByStatus[status.id] ?? []}
              statuses={statuses}
              tasksById={tasksById}
              edges={edges}
              onOpenTask={onOpenTask}
            />
          ))}
        </div>
      )}

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage columns</DialogTitle>
            <DialogDescription>Add, rename, reorder, or remove this project's workflow columns.</DialogDescription>
          </DialogHeader>
          <StatusManager projectId={projectId} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
