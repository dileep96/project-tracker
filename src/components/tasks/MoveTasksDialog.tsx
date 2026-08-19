import { useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { Project } from "@/lib/db";
import { moveTasksToProject } from "@/lib/queries/move-tasks";

interface MoveTasksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskIds: string[];
  projects: Project[];
  /** Called after a move attempt completes (even if everything was skipped), so the caller can clear its selection. */
  onDone: () => void;
}

export function MoveTasksDialog({ open, onOpenChange, taskIds, projects, onDone }: MoveTasksDialogProps) {
  const [targetProjectId, setTargetProjectId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!targetProjectId) return;
    setSubmitting(true);
    try {
      const targetName = projects.find((p) => p.id === targetProjectId)?.name ?? "the target project";
      const result = await moveTasksToProject(taskIds, targetProjectId);

      if (result.moved.length > 0) {
        toast.success(`Moved ${result.moved.length} task${result.moved.length === 1 ? "" : "s"} to "${targetName}"`);
      }
      if (result.skippedRecurring.length > 0) {
        toast.warning(
          `Skipped ${result.skippedRecurring.length} recurring task${result.skippedRecurring.length === 1 ? "" : "s"} — recurring templates and their generated instances can't move projects.`
        );
      }
      if (result.skippedSameProject.length > 0) {
        toast.info(
          `${result.skippedSameProject.length} task${result.skippedSameProject.length === 1 ? " was" : "s were"} already in "${targetName}".`
        );
      }
      if (result.moved.length === 0 && result.skippedRecurring.length === 0 && result.skippedSameProject.length === 0) {
        toast.info("Nothing to move.");
      }

      onOpenChange(false);
      setTargetProjectId(null);
      onDone();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Move {taskIds.length} task{taskIds.length === 1 ? "" : "s"} to another project
          </DialogTitle>
          <DialogDescription>
            Each task's status is matched by name on the target project, falling back to its default status.
            Milestones and project-only custom fields don't carry over; dependencies, subtasks, comments, and
            logged time do.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="move-target-project">Target project</Label>
          <Select value={targetProjectId ?? undefined} onValueChange={setTargetProjectId}>
            <SelectTrigger id="move-target-project" className="w-full">
              <SelectValue placeholder="Choose a project…" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!targetProjectId || submitting}>
            {submitting ? "Moving…" : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
