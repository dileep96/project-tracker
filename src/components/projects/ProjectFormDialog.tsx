import { useEffect, useId, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROJECT_STATUS_SUGGESTIONS, type Project, type ProjectHealth } from "@/lib/db";
import { createProject, updateProject } from "@/lib/queries/projects";
import { useProjects } from "@/hooks/use-projects";

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing an existing project; omitted when creating. */
  project?: Project;
}

const HEALTH_OPTIONS: { value: ProjectHealth; label: string }[] = [
  { value: "green", label: "Green — On track" },
  { value: "amber", label: "Amber — At risk" },
  { value: "red", label: "Red — Off track" },
];

export function ProjectFormDialog({ open, onOpenChange, project }: ProjectFormDialogProps) {
  const isEditing = !!project;
  const datalistId = useId();
  const projects = useProjects();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState("");
  const [status, setStatus] = useState<string>("Planning");
  const [health, setHealth] = useState<ProjectHealth>("green");
  const [budgetEstimate, setBudgetEstimate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? "");
    setDescription(project?.description ?? "");
    setOwner(project?.owner ?? "");
    setStatus(project?.status ?? "Planning");
    setHealth(project?.health ?? "green");
    setBudgetEstimate(project?.budgetEstimate === null || project?.budgetEstimate === undefined ? "" : String(project.budgetEstimate));
  }, [open, project]);

  const statusSuggestions = Array.from(
    new Set([...PROJECT_STATUS_SUGGESTIONS, ...(projects ?? []).map((p) => p.status)])
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const budgetEstimateValue = budgetEstimate.trim() === "" ? null : Math.max(0, Number(budgetEstimate) || 0);
      if (isEditing) {
        await updateProject(project.id, {
          name: name.trim(),
          description: description.trim(),
          owner: owner.trim(),
          status: status.trim() || "Planning",
          health,
          budgetEstimate: budgetEstimateValue,
        });
        toast.success("Project updated");
      } else {
        await createProject({
          name: name.trim(),
          description: description.trim(),
          owner: owner.trim(),
          status: status.trim() || "Planning",
          health,
          budgetEstimate: budgetEstimateValue,
        });
        toast.success("Project created");
      }
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit project" : "New project"}</DialogTitle>
            <DialogDescription>
              {isEditing ? "Update the project's details." : "Set up a new project to track work under."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Website redesign"
                required
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this project about?"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="project-owner">Owner</Label>
                <Input
                  id="project-owner"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  placeholder="Who owns this?"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="project-status">Status</Label>
                <Input
                  id="project-status"
                  list={datalistId}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  placeholder="Planning"
                />
                <datalist id={datalistId}>
                  {statusSuggestions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="project-health">Health</Label>
                <Select value={health} onValueChange={(v) => setHealth(v as ProjectHealth)}>
                  <SelectTrigger id="project-health" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HEALTH_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="project-budget">Budget estimate ($)</Label>
                <Input
                  id="project-budget"
                  type="number"
                  min={0}
                  step={1}
                  value={budgetEstimate}
                  onChange={(e) => setBudgetEstimate(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {isEditing ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
