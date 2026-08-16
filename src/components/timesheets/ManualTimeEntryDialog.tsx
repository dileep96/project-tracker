import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProjects } from "@/hooks/use-projects";
import { useAllTasks } from "@/hooks/use-tasks";
import { usePeople } from "@/hooks/use-people";
import { createManualTimeEntry } from "@/lib/queries/time-entries";

function todayInputValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateInputToEpoch(value: string): number | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

interface ManualTimeEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preselects the person filter the timesheet page was already showing. */
  defaultPersonId?: string;
}

/** Project → task cascading pickers, since a timesheet entry isn't opened from a specific task's own detail sheet (that case is `TaskTimePanel`'s inline form instead). */
export function ManualTimeEntryDialog({ open, onOpenChange, defaultPersonId }: ManualTimeEntryDialogProps) {
  const projects = useProjects();
  const allTasks = useAllTasks();
  const people = usePeople();
  const activePeople = (people ?? []).filter((p) => p.active);

  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [personId, setPersonId] = useState("");
  const [date, setDate] = useState(todayInputValue());
  const [hours, setHours] = useState("");
  const [billable, setBillable] = useState(true);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const tasksForProject = (allTasks ?? []).filter((t) => t.projectId === projectId && t.completedAt === null);

  useEffect(() => {
    if (!open) return;
    setProjectId(projects?.[0]?.id ?? "");
    setTaskId("");
    setPersonId(defaultPersonId ?? activePeople[0]?.id ?? "");
    setDate(todayInputValue());
    setHours("");
    setBillable(true);
    setNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const dateEpoch = dateInputToEpoch(date);
    const hoursNum = Number(hours);
    if (!taskId || !personId || dateEpoch === null || !hoursNum || hoursNum <= 0) return;
    setSubmitting(true);
    try {
      await createManualTimeEntry({
        taskId,
        projectId,
        personId,
        date: dateEpoch,
        minutes: hoursNum * 60,
        billable,
        note: note.trim(),
      });
      toast.success("Time logged");
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Log time</DialogTitle>
            <DialogDescription>Add a manual time entry against a task.</DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="entry-project">Project</Label>
                <Select
                  value={projectId}
                  onValueChange={(v) => {
                    setProjectId(v);
                    setTaskId("");
                  }}
                >
                  <SelectTrigger id="entry-project" className="w-full">
                    <SelectValue placeholder="Choose a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {(projects ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="entry-task">Task</Label>
                <Select value={taskId} onValueChange={setTaskId}>
                  <SelectTrigger id="entry-task" className="w-full">
                    <SelectValue placeholder={tasksForProject.length ? "Choose a task" : "No open tasks"} />
                  </SelectTrigger>
                  <SelectContent>
                    {tasksForProject.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="entry-person">Person</Label>
                <Select value={personId} onValueChange={setPersonId}>
                  <SelectTrigger id="entry-person" className="w-full">
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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="entry-date">Date</Label>
                <Input id="entry-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="entry-hours">Hours</Label>
                <Input
                  id="entry-hours"
                  type="number"
                  min={0.25}
                  step={0.25}
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  placeholder="1.5"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="entry-note">Note</Label>
              <Input id="entry-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
            </div>

            <label className="flex w-fit items-center gap-2 text-sm">
              <Checkbox checked={billable} onCheckedChange={(c) => setBillable(c === true)} /> Billable
            </label>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !taskId || !personId || !hours}>
              Log time
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
