import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CaretLeft, CaretRight, Clock, Plus, Timer, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { ManualTimeEntryDialog } from "@/components/timesheets/ManualTimeEntryDialog";
import { TaskDetailSheet } from "@/components/tasks/TaskDetailSheet";
import { useAllTimeEntries } from "@/hooks/use-time-entries";
import { usePeople } from "@/hooks/use-people";
import { useAllTasks } from "@/hooks/use-tasks";
import { useProjects } from "@/hooks/use-projects";
import { startOfWeek, WEEK_MS } from "@/lib/analytics/date-buckets";
import { actualCost, totalHours } from "@/lib/analytics/budget";
import { formatCurrency, formatHours } from "@/lib/format";
import { deleteTimeEntry } from "@/lib/queries/time-entries";
import type { TimeEntry } from "@/lib/db";

const dayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const weekLabelFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

export function TimesheetsPage() {
  const entries = useAllTimeEntries();
  const people = usePeople();
  const tasks = useAllTasks();
  const projects = useProjects();

  const [personId, setPersonId] = useState<string>("all");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(Date.now()));
  const [logOpen, setLogOpen] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TimeEntry | null>(null);

  const loading = entries === undefined || people === undefined || tasks === undefined || projects === undefined;

  const tasksById = useMemo(() => new Map((tasks ?? []).map((t) => [t.id, t])), [tasks]);
  const projectsById = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects]);
  const peopleById = useMemo(() => new Map((people ?? []).map((p) => [p.id, p])), [people]);

  const weekEnd = weekStart + WEEK_MS;
  const weekEntries = useMemo(
    () =>
      (entries ?? [])
        .filter((e) => e.date >= weekStart && e.date < weekEnd)
        .filter((e) => personId === "all" || e.personId === personId)
        .sort((a, b) => b.date - a.date || b.createdAt - a.createdAt),
    [entries, weekStart, weekEnd, personId]
  );

  const entriesByDay = useMemo(() => {
    const grouped = new Map<number, TimeEntry[]>();
    for (const e of weekEntries) {
      const list = grouped.get(e.date) ?? [];
      list.push(e);
      grouped.set(e.date, list);
    }
    return Array.from(grouped.entries()).sort((a, b) => b[0] - a[0]);
  }, [weekEntries]);

  const summary = {
    hours: totalHours(weekEntries),
    billableHours: totalHours(weekEntries.filter((e) => e.billable)),
    cost: actualCost(weekEntries, people ?? []),
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Timesheets</h1>
          <p className="mt-1 text-sm text-muted-foreground">Logged time by person and week — timer entries and manual entries together.</p>
        </div>
        <Button size="sm" onClick={() => setLogOpen(true)}>
          <Plus /> Log time
        </Button>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={personId} onValueChange={setPersonId}>
              <SelectTrigger size="sm" className="h-8 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                {(people ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="ml-auto flex items-center gap-1">
              <Button variant="outline" size="icon-sm" aria-label="Previous week" onClick={() => setWeekStart((w) => w - WEEK_MS)}>
                <CaretLeft />
              </Button>
              <span className="w-40 text-center font-mono text-xs text-muted-foreground">
                {weekLabelFormatter.format(weekStart)} – {weekLabelFormatter.format(weekEnd - 1)}
              </span>
              <Button variant="outline" size="icon-sm" aria-label="Next week" onClick={() => setWeekStart((w) => w + WEEK_MS)}>
                <CaretRight />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(Date.now()))}>
                This week
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Total logged</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{formatHours(summary.hours * 60)}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Billable</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{formatHours(summary.billableHours * 60)}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Cost</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{formatCurrency(summary.cost)}</p>
            </div>
          </div>

          {entriesByDay.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
              <Clock className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No time logged this week.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {entriesByDay.map(([day, dayEntries]) => (
                <div key={day} className="flex flex-col gap-1.5">
                  <p className="text-xs font-medium text-muted-foreground">{dayFormatter.format(day)}</p>
                  <div className="flex flex-col gap-1.5">
                    {dayEntries.map((entry) => {
                      const task = tasksById.get(entry.taskId);
                      const project = task ? projectsById.get(task.projectId) : undefined;
                      const person = peopleById.get(entry.personId);
                      return (
                        <div key={entry.id} className="flex items-center gap-3 rounded-md border border-border p-2.5">
                          {entry.source === "timer" ? (
                            <Timer className="size-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <Clock className="size-4 shrink-0 text-muted-foreground" />
                          )}
                          {personId === "all" && <span className="w-24 shrink-0 truncate text-xs font-medium">{person?.name ?? "Deleted person"}</span>}
                          <button
                            type="button"
                            onClick={() => task && setOpenTaskId(task.id)}
                            className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                          >
                            {task?.title ?? "Deleted task"}
                            {project && <span className="text-muted-foreground"> · {project.name}</span>}
                          </button>
                          {entry.note && <span className="hidden max-w-40 truncate text-xs text-muted-foreground sm:inline">{entry.note}</span>}
                          <Badge variant={entry.billable ? "secondary" : "outline"} className="shrink-0 text-[10px]">
                            {entry.billable ? "Billable" : "Non-billable"}
                          </Badge>
                          <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums">{formatHours(entry.minutes)}</span>
                          <Button variant="ghost" size="icon-xs" aria-label="Delete time entry" onClick={() => setPendingDelete(entry)}>
                            <Trash />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <ManualTimeEntryDialog open={logOpen} onOpenChange={setLogOpen} defaultPersonId={personId === "all" ? undefined : personId} />
      <TaskDetailSheet taskId={openTaskId} onClose={() => setOpenTaskId(null)} />

      <ConfirmDeleteDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this time entry?"
        description="This can't be undone. It will no longer count toward cost or the timesheet total."
        onConfirm={async () => {
          if (!pendingDelete) return;
          await deleteTimeEntry(pendingDelete.id);
          toast.success("Time entry deleted");
        }}
      />
    </div>
  );
}
