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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProjects } from "@/hooks/use-projects";
import { useTaskStatuses } from "@/hooks/use-task-statuses";
import { createTask } from "@/lib/queries/tasks";

interface NewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fixed when creating from a project's own task table; otherwise the user picks one. */
  projectId?: string;
  onCreated?: (taskId: string) => void;
}

export function NewTaskDialog({ open, onOpenChange, projectId, onCreated }: NewTaskDialogProps) {
  const allProjects = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState(projectId ?? "");
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const effectiveProjectId = projectId ?? selectedProjectId;
  const statuses = useTaskStatuses(effectiveProjectId || undefined);

  useEffect(() => {
    if (open) {
      setTitle("");
      setSelectedProjectId(projectId ?? allProjects?.[0]?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const defaultStatus = statuses?.find((s) => s.isDefault) ?? statuses?.[0];
    if (!title.trim() || !effectiveProjectId || !defaultStatus) return;
    setSubmitting(true);
    try {
      const task = await createTask({
        projectId: effectiveProjectId,
        title: title.trim(),
        statusId: defaultStatus.id,
      });
      toast.success("Task created");
      onOpenChange(false);
      onCreated?.(task.id);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New task</DialogTitle>
            <DialogDescription>Add the rest of the details afterward from the table.</DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-4">
            {!projectId && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="task-project">Project</Label>
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger id="task-project" className="w-full">
                    <SelectValue placeholder="Choose a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {(allProjects ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-title">Title</Label>
              <Input
                id="task-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Draft the proposal"
                required
                autoFocus
              />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !title.trim() || !effectiveProjectId}>
              Create task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
