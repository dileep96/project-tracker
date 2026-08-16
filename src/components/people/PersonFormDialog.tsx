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
import { Switch } from "@/components/ui/switch";
import type { Person } from "@/lib/db";
import { createPerson, updatePerson } from "@/lib/queries/people";

interface PersonFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing an existing person; omitted when creating. */
  person?: Person;
}

export function PersonFormDialog({ open, onOpenChange, person }: PersonFormDialogProps) {
  const isEditing = !!person;

  const [name, setName] = useState("");
  const [weeklyCapacityHours, setWeeklyCapacityHours] = useState("40");
  const [hourlyRate, setHourlyRate] = useState("0");
  const [active, setActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(person?.name ?? "");
    setWeeklyCapacityHours(String(person?.weeklyCapacityHours ?? 40));
    setHourlyRate(String(person?.hourlyRate ?? 0));
    setActive(person?.active ?? true);
  }, [open, person]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const input = {
        name: name.trim(),
        weeklyCapacityHours: Math.max(0, Number(weeklyCapacityHours) || 0),
        hourlyRate: Math.max(0, Number(hourlyRate) || 0),
        active,
      };
      if (isEditing) {
        await updatePerson(person.id, input);
        toast.success("Person updated");
      } else {
        await createPerson(input);
        toast.success("Person added");
      }
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
            <DialogTitle>{isEditing ? "Edit person" : "Add person"}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Update their capacity and rate."
                : "Their name should match how they're typed into a task's Assignee field, so workload and cost can join up."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="person-name">Name</Label>
              <Input
                id="person-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Rivera"
                required
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="person-capacity">Weekly capacity (hours)</Label>
                <Input
                  id="person-capacity"
                  type="number"
                  min={0}
                  step={0.5}
                  value={weeklyCapacityHours}
                  onChange={(e) => setWeeklyCapacityHours(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="person-rate">Hourly rate ($)</Label>
                <Input
                  id="person-rate"
                  type="number"
                  min={0}
                  step={0.01}
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                />
              </div>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">
              A lower weekly capacity is how part-time is represented — there's no separate flag.
            </p>

            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <div>
                <Label htmlFor="person-active">Active</Label>
                <p className="text-xs text-muted-foreground">Inactive people are hidden from pickers but keep their history.</p>
              </div>
              <Switch id="person-active" checked={active} onCheckedChange={setActive} />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {isEditing ? "Save changes" : "Add person"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
