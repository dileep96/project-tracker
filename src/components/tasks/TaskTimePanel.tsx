import { useState } from "react";
import { toast } from "sonner";
import { Clock, Plus, Timer, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { TimerStartControl } from "@/components/timer/TimerStartControl";
import type { Task, TimeEntry } from "@/lib/db";
import { useTimeEntriesForTask } from "@/hooks/use-time-entries";
import { usePeople } from "@/hooks/use-people";
import { createManualTimeEntry, deleteTimeEntry } from "@/lib/queries/time-entries";
import { updateTask } from "@/lib/queries/tasks";
import { computeTaskBudget } from "@/lib/analytics/budget";
import { formatCurrency, formatDuration, formatHours } from "@/lib/format";

const dateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

function todayInputValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateInputToEpoch(value: string): number | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** The Time tab in TaskDetailSheet: estimate, timer, rollup, and per-entry log for exactly this task. */
export function TaskTimePanel({ task }: { task: Task }) {
  const entries = useTimeEntriesForTask(task.id);
  const people = usePeople();
  const activePeople = (people ?? []).filter((p) => p.active);

  const [estimateDraft, setEstimateDraft] = useState(task.estimatedHours === null ? "" : String(task.estimatedHours));
  const [manualPersonId, setManualPersonId] = useState("");
  const [manualDate, setManualDate] = useState(todayInputValue());
  const [manualHours, setManualHours] = useState("");
  const [manualBillable, setManualBillable] = useState(true);
  const [manualNote, setManualNote] = useState("");
  const [pendingDelete, setPendingDelete] = useState<TimeEntry | null>(null);

  const budget = computeTaskBudget(task, entries ?? [], people ?? []);

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const date = dateInputToEpoch(manualDate);
    const hours = Number(manualHours);
    if (!manualPersonId || date === null || !hours || hours <= 0) return;
    await createManualTimeEntry({
      taskId: task.id,
      projectId: task.projectId,
      personId: manualPersonId,
      date,
      minutes: hours * 60,
      billable: manualBillable,
      note: manualNote.trim(),
    });
    setManualHours("");
    setManualNote("");
    toast.success("Time logged");
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-estimate">Estimated hours</Label>
          <Input
            id="task-estimate"
            type="number"
            min={0}
            step={0.5}
            value={estimateDraft}
            onChange={(e) => setEstimateDraft(e.target.value)}
            onBlur={() => {
              const value = estimateDraft === "" ? null : Math.max(0, Number(estimateDraft) || 0);
              if (value !== task.estimatedHours) updateTask(task.id, { estimatedHours: value });
            }}
            placeholder="Unestimated"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Estimated cost</Label>
          <p className="flex h-9 items-center font-mono text-sm text-muted-foreground">
            {budget.estimatedCost !== null
              ? formatCurrency(budget.estimatedCost)
              : budget.estimatedHours !== null
                ? "No matching person rate"
                : "—"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-sm">
          <Clock className="size-4 text-muted-foreground" />
          <span className="font-mono font-medium tabular-nums">{formatHours(budget.loggedHours * 60)}</span>
          <span className="text-muted-foreground">logged · {formatCurrency(budget.actualCost)} actual</span>
        </div>
        <TimerStartControl taskId={task.id} projectId={task.projectId} />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Log time manually</Label>
        <form onSubmit={handleManualSubmit} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Person</span>
            <Select value={manualPersonId} onValueChange={setManualPersonId}>
              <SelectTrigger size="sm" className="h-8 w-32 text-xs">
                <SelectValue placeholder="Who" />
              </SelectTrigger>
              <SelectContent>
                {activePeople.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Date</span>
            <Input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className="h-8 w-36 text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Hours</span>
            <Input
              type="number"
              min={0.25}
              step={0.25}
              value={manualHours}
              onChange={(e) => setManualHours(e.target.value)}
              placeholder="1.5"
              className="h-8 w-20 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Note</span>
            <Input value={manualNote} onChange={(e) => setManualNote(e.target.value)} placeholder="Optional" className="h-8 w-36 text-xs" />
          </div>
          <label className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox checked={manualBillable} onCheckedChange={(c) => setManualBillable(c === true)} /> Billable
          </label>
          <Button type="submit" size="sm" disabled={!manualPersonId || !manualHours}>
            <Plus /> Log
          </Button>
        </form>
        {activePeople.length === 0 && <p className="text-xs text-muted-foreground">Add a person (Workload → People) to log time.</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        {(entries ?? []).length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">No time logged yet.</p>
        ) : (
          entries!.map((entry) => {
            const person = (people ?? []).find((p) => p.id === entry.personId);
            return (
              <div key={entry.id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                {entry.source === "timer" ? (
                  <Timer className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <Clock className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{dateFormatter.format(entry.date)}</span>
                <span className="w-20 shrink-0 truncate text-xs font-medium">{person?.name ?? "Deleted person"}</span>
                <span className="w-16 shrink-0 font-mono text-xs tabular-nums">{formatDuration(entry.minutes)}</span>
                <Badge variant={entry.billable ? "secondary" : "outline"} className="shrink-0 text-[10px]">
                  {entry.billable ? "Billable" : "Non-billable"}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{entry.note}</span>
                <Button variant="ghost" size="icon-xs" aria-label="Delete time entry" onClick={() => setPendingDelete(entry)}>
                  <Trash />
                </Button>
              </div>
            );
          })
        )}
      </div>

      <ConfirmDeleteDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this time entry?"
        description="This can't be undone. It will no longer count toward this task's or project's actual cost."
        onConfirm={async () => {
          if (!pendingDelete) return;
          await deleteTimeEntry(pendingDelete.id);
          toast.success("Time entry deleted");
        }}
      />
    </div>
  );
}
