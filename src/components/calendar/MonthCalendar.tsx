import { useMemo, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PriorityBadge } from "@/components/tasks/PriorityBadge";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/db";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthYearFormatter = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const MAX_VISIBLE_PER_DAY = 3;

function dayKey(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

interface DayEntry {
  date: Date;
  inCurrentMonth: boolean;
  /** Tasks due this day. */
  due: Task[];
  /** Tasks starting this day, shown only when the start day differs from the due day (a same-day task only needs one pill). */
  starting: Task[];
}

export function MonthCalendar({ tasks, onOpenTask }: { tasks: Task[]; onOpenTask: (taskId: string) => void }) {
  const [monthAnchor, setMonthAnchor] = useState(() => startOfDay(new Date()));

  const tasksByDay = useMemo(() => {
    const due = new Map<string, Task[]>();
    const starting = new Map<string, Task[]>();
    for (const t of tasks) {
      if (t.dueDate !== null) {
        const key = dayKey(t.dueDate);
        (due.get(key) ?? due.set(key, []).get(key)!).push(t);
      }
      if (t.startDate !== null && (t.dueDate === null || dayKey(t.startDate) !== dayKey(t.dueDate))) {
        const key = dayKey(t.startDate);
        (starting.get(key) ?? starting.set(key, []).get(key)!).push(t);
      }
    }
    return { due, starting };
  }, [tasks]);

  const weeks = useMemo(() => {
    const firstOfMonth = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(gridStart.getDate() - firstOfMonth.getDay());

    const days: DayEntry[] = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + i);
      const key = dayKey(date.getTime());
      days.push({
        date,
        inCurrentMonth: date.getMonth() === monthAnchor.getMonth(),
        due: tasksByDay.due.get(key) ?? [],
        starting: tasksByDay.starting.get(key) ?? [],
      });
    }
    const result: DayEntry[][] = [];
    for (let i = 0; i < days.length; i += 7) result.push(days.slice(i, i + 7));
    return result;
  }, [monthAnchor, tasksByDay]);

  const today = startOfDay(new Date());

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">{monthYearFormatter.format(monthAnchor)}</h2>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setMonthAnchor(startOfDay(new Date()))}>
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous month"
            onClick={() => setMonthAnchor((d) => startOfDay(new Date(d.getFullYear(), d.getMonth() - 1, 1)))}
          >
            <CaretLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next month"
            onClick={() => setMonthAnchor((d) => startOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 1)))}
          >
            <CaretRight />
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-7 border-b border-border bg-muted/40">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground">
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {weeks.flatMap((week) =>
            week.map((day) => (
              <CalendarDayCell
                key={day.date.toISOString()}
                day={day}
                isToday={day.date.getTime() === today.getTime()}
                onOpenTask={onOpenTask}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function CalendarDayCell({ day, isToday, onOpenTask }: { day: DayEntry; isToday: boolean; onOpenTask: (taskId: string) => void }) {
  const all = [...day.due, ...day.starting];
  const visible = all.slice(0, MAX_VISIBLE_PER_DAY);
  const overflowCount = all.length - visible.length;
  const [popoverOpen, setPopoverOpen] = useState(false);

  function handleDayNumberClick() {
    if (all.length === 1) onOpenTask(all[0].id);
    else if (all.length > 1) setPopoverOpen(true);
  }

  return (
    <div
      className={cn(
        "flex min-h-24 flex-col gap-1 border-r border-b border-border p-1.5 last:border-r-0",
        !day.inCurrentMonth && "bg-muted/20"
      )}
    >
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={all.length === 0}
            onClick={handleDayNumberClick}
            aria-label={all.length > 0 ? `${all.length} task${all.length === 1 ? "" : "s"} on this day` : undefined}
            className={cn(
              "inline-flex size-5 items-center justify-center self-end rounded-full font-mono text-[11px] transition-colors",
              isToday
                ? "bg-primary text-primary-foreground"
                : day.inCurrentMonth
                  ? "text-foreground hover:bg-muted"
                  : "text-muted-foreground/50",
              all.length > 0 && !isToday && "cursor-pointer"
            )}
          >
            {day.date.getDate()}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64" align="end">
          <div className="flex flex-col gap-1">
            {all.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => {
                  setPopoverOpen(false);
                  onOpenTask(task.id);
                }}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <span className="truncate">{task.title}</span>
                <PriorityBadge priority={task.priority} />
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <div className="flex flex-1 flex-col gap-1">
        {visible.map((task) => {
          const isStartOnly = !day.due.includes(task);
          return (
            <button
              key={task.id}
              type="button"
              onClick={() => onOpenTask(task.id)}
              title={task.title}
              className={cn(
                "truncate rounded px-1 py-0.5 text-left text-[10px] font-medium hover:opacity-80",
                isStartOnly ? "border border-border text-muted-foreground" : "bg-secondary text-secondary-foreground"
              )}
            >
              {task.title}
            </button>
          );
        })}
        {overflowCount > 0 && (
          <button
            type="button"
            onClick={() => setPopoverOpen(true)}
            className="px-1 text-left text-[10px] font-medium text-muted-foreground hover:text-foreground"
          >
            +{overflowCount} more
          </button>
        )}
      </div>
    </div>
  );
}
