import { useState } from "react";
import { KanbanCard } from "@/components/board/KanbanCard";
import { updateTask } from "@/lib/queries/tasks";
import { cn } from "@/lib/utils";
import type { DependencyEdge } from "@/lib/dependency-graph";
import { blockingTaskTitles, isTaskBlocked } from "@/lib/dependency-graph";
import type { Task, TaskStatus } from "@/lib/db";

interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Task[];
  statuses: TaskStatus[];
  tasksById: Record<string, Task>;
  edges: DependencyEdge[];
  onOpenTask: (taskId: string) => void;
}

export function KanbanColumn({ status, tasks, statuses, tasksById, edges, onOpenTask }: KanbanColumnProps) {
  const [isOver, setIsOver] = useState(false);

  return (
    <div
      className={cn(
        "flex w-72 shrink-0 flex-col gap-2 rounded-xl border border-transparent bg-muted/40 p-2 transition-colors",
        isOver && "border-primary/40 bg-accent/50"
      )}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!isOver) setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsOver(false);
        const taskId = e.dataTransfer.getData("text/plain");
        if (taskId && taskId !== status.id) updateTask(taskId, { statusId: status.id });
      }}
    >
      <div className="flex items-center justify-between px-1.5 py-1">
        <span className="truncate text-sm font-semibold">{status.name}</span>
        <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 font-mono text-xs text-secondary-foreground">
          {tasks.length}
        </span>
      </div>

      <div className="flex min-h-16 flex-col gap-2">
        {tasks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/70 py-6 text-center text-xs text-muted-foreground">
            Drop a task here
          </p>
        ) : (
          tasks.map((task) => (
            <KanbanCard
              key={task.id}
              task={task}
              statuses={statuses}
              blocked={isTaskBlocked(task.id, edges, tasksById)}
              blockingTitles={blockingTaskTitles(task.id, edges, tasksById)}
              onOpen={() => onOpenTask(task.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
