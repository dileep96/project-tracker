import { useState } from "react";
import { toast } from "sonner";
import { CalendarX, Plus, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Person } from "@/lib/db";
import { useTimeOffForPerson } from "@/hooks/use-people";
import { addTimeOff, deleteTimeOff } from "@/lib/queries/people";

const dateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

function dateInputToEpoch(value: string): number | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** PTO / time-off ranges for one person — reduces their capacity for those days on the Workload grid (see `lib/analytics/capacity.ts`). */
export function PersonTimeOffDialog({ open, onOpenChange, person }: { open: boolean; onOpenChange: (open: boolean) => void; person: Person | null }) {
  const timeOff = useTimeOffForPerson(person?.id);
  const [label, setLabel] = useState("Vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!person) return;
    const start = dateInputToEpoch(startDate);
    const end = dateInputToEpoch(endDate || startDate);
    if (start === null || end === null) return;
    await addTimeOff({ personId: person.id, startDate: start, endDate: end, label: label.trim() || "Time off" });
    setStartDate("");
    setEndDate("");
    toast.success("Time off added");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{person ? `Time off — ${person.name}` : "Time off"}</DialogTitle>
          <DialogDescription>Days off reduce their capacity for that week on the Workload grid.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleAdd} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pto-label">Label</Label>
            <Input id="pto-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Vacation" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pto-start">From</Label>
              <Input id="pto-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pto-end">To</Label>
              <Input id="pto-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <Button type="submit" size="sm" className="w-fit" disabled={!startDate}>
            <Plus /> Add
          </Button>
        </form>

        <div className="flex flex-col gap-1.5">
          {(timeOff ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-8 text-center">
              <CalendarX className="size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No time off scheduled.</p>
            </div>
          ) : (
            timeOff!.map((off) => (
              <div key={off.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{off.label}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {dateFormatter.format(off.startDate)}
                    {off.endDate !== off.startDate && ` – ${dateFormatter.format(off.endDate)}`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove time off"
                  onClick={async () => {
                    await deleteTimeOff(off.id);
                    toast.success("Time off removed");
                  }}
                >
                  <Trash />
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
