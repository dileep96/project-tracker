import { useState } from "react";
import { toast } from "sonner";
import { Flag, Plus, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { useMilestones } from "@/hooks/use-milestones";
import { createMilestone, deleteMilestone, updateMilestone } from "@/lib/queries/milestones";
import type { Milestone, MilestoneStatus } from "@/lib/db";

const STATUS_LABELS: Record<MilestoneStatus, string> = {
  upcoming: "Upcoming",
  "at-risk": "At risk",
  completed: "Completed",
  missed: "Missed",
};

const dateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

export function MilestoneManager({ projectId }: { projectId: string }) {
  const milestones = useMilestones(projectId);
  const [name, setName] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Milestone | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !targetDate) return;
    const [y, m, d] = targetDate.split("-").map(Number);
    await createMilestone({ projectId, name: name.trim(), targetDate: new Date(y, m - 1, d).getTime() });
    setName("");
    setTargetDate("");
    toast.success("Milestone added");
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="milestone-name">
            Milestone name
          </label>
          <Input
            id="milestone-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Beta launch"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="milestone-date">
            Target date
          </label>
          <Input
            id="milestone-date"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={!name.trim() || !targetDate}>
          <Plus /> Add
        </Button>
      </form>

      {(milestones ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-center">
          <Flag className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No milestones yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {milestones!.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-md border border-border p-3">
              <Flag className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{dateFormatter.format(m.targetDate)}</p>
              </div>
              <Select value={m.status} onValueChange={(v) => updateMilestone(m.id, { status: v as MilestoneStatus })}>
                <SelectTrigger size="sm" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABELS) as MilestoneStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon-sm" aria-label="Delete milestone" onClick={() => setPendingDelete(m)}>
                <Trash />
              </Button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDeleteDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete "${pendingDelete?.name}"?`}
        description="Tasks linked to this milestone will keep their other data but lose the milestone link."
        onConfirm={async () => {
          if (!pendingDelete) return;
          await deleteMilestone(pendingDelete.id);
          toast.success("Milestone deleted");
        }}
      />
    </div>
  );
}
