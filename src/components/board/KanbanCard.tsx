import { useState } from "react";
import { DotsSixVertical, Prohibit } from "@phosphor-icons/react";
import { PriorityBadge } from "@/components/tasks/PriorityBadge";
import { StatusSelect } from "@/components/tasks/StatusSelect";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { updateTask } from "@/lib/queries/tasks";
import { cn } from "@/lib/utils";
import type { Task, TaskStatus } from "@/lib/db";

const dateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

interface KanbanCardProps {
  task: Task;
  statuses: TaskStatus[];
  blocked: boolean;
  blockingTitles: string[];
  onOpen: () => void;
}

/**
 * Draggable via the native HTML5 DnD API (desktop) — but drag has no reliable touch-event
 * equivalent, so every card also carries a plain StatusSelect as a first-class way to move
 * columns. That keeps the board usable at mobile width and with a keyboard, not just with a
 * mouse; see AGENTS.md for why this was chosen over a drag-and-drop library.
 */
export function KanbanCard({ task, statuses, blocked, blockingTitles, onOpen }: KanbanCardProps) {
  const [dragging, setDragging] = useState(false);
  const completed = task.completedAt !== null;
  const overdue = !completed && task.dueDate !== null && task.dueDate < startOfToday();

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group flex cursor-pointer flex-col gap-2 rounded-lg border border-border bg-card p-2.5 text-left shadow-xs transition-all hover:shadow-md active:translate-y-px",
        dragging && "opacity-40"
      )}
    >
      <div className="flex items-start gap-1">
        <DotsSixVertical
          className="mt-0.5 size-3.5 shrink-0 cursor-grab text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden="true"
        />
        <p className={cn("min-w-0 flex-1 text-sm font-medium", completed && "text-muted-foreground line-through")}>
          {task.title}
        </p>
      </div>

      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pl-[1.125rem]">
          {task.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pl-[1.125rem]">
        <div className="flex items-center gap-1.5">
          <PriorityBadge priority={task.priority} />
          {blocked && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                  <Prohibit className="size-3" weight="bold" />
                  Blocked
                </span>
              </TooltipTrigger>
              <TooltipContent>Waiting on {blockingTitles.join(", ")}</TooltipContent>
            </Tooltip>
          )}
        </div>
        {task.dueDate !== null && (
          <span className={cn("shrink-0 font-mono text-[11px]", overdue ? "text-destructive" : "text-muted-foreground")}>
            {dateFormatter.format(task.dueDate)}
          </span>
        )}
      </div>

      <div className="pl-[1.125rem]" onClick={(e) => e.stopPropagation()}>
        <StatusSelect
          statuses={statuses}
          value={task.statusId}
          onChange={(statusId) => updateTask(task.id, { statusId })}
          className="w-full justify-between"
        />
      </div>
    </div>
  );
}
