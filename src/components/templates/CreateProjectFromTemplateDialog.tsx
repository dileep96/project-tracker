import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, FileArrowDown, Trash } from "@phosphor-icons/react";
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
import { useTemplates } from "@/hooks/use-templates";
import { useCurrentRole } from "@/hooks/use-role";
import { hasPermission } from "@/lib/permissions";
import { createProjectFromTemplate, deleteTemplate } from "@/lib/queries/templates";

interface CreateProjectFromTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function toInputValue(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fromInputValue(value: string): number {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function CreateProjectFromTemplateDialog({ open, onOpenChange }: CreateProjectFromTemplateDialogProps) {
  const navigate = useNavigate();
  const templates = useTemplates();
  const role = useCurrentRole();
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [startDate, setStartDate] = useState(toInputValue(Date.now()));
  const [submitting, setSubmitting] = useState(false);

  const selected = templates?.find((t) => t.id === templateId) ?? null;

  useEffect(() => {
    if (!open) {
      setTemplateId(null);
      return;
    }
    setStartDate(toInputValue(Date.now()));
  }, [open]);

  useEffect(() => {
    if (selected) {
      setName(selected.name.replace(/ template$/i, "").trim() || selected.name);
      setOwner("");
    }
  }, [selected]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !name.trim() || !startDate) return;
    setSubmitting(true);
    try {
      const project = await createProjectFromTemplate({
        templateId: selected.id,
        name: name.trim(),
        owner: owner.trim(),
        startDate: fromInputValue(startDate),
      });
      toast.success(`Created "${project.name}" from template`);
      onOpenChange(false);
      navigate(`/projects/${project.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {!selected ? (
          <>
            <DialogHeader>
              <DialogTitle>New project from template</DialogTitle>
              <DialogDescription>Pick a saved template — task dates will shift to match the start date you set next.</DialogDescription>
            </DialogHeader>
            <div className="mt-2 flex flex-col gap-1.5">
              {(templates ?? []).map((t) => (
                <div
                  key={t.id}
                  className="group flex items-center gap-2 rounded-md border border-border px-3 py-2 hover:border-ring"
                >
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setTemplateId(t.id)}>
                    <p className="truncate text-sm font-medium">{t.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.tasks.length} task{t.tasks.length === 1 ? "" : "s"} · {t.statuses.length} status
                      {t.statuses.length === 1 ? "" : "es"}
                      {t.description ? ` — ${t.description}` : ""}
                    </p>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Delete template ${t.name}`}
                    disabled={!hasPermission(role, "template:manage")}
                    onClick={async () => {
                      await deleteTemplate(t.id);
                      toast.success("Template deleted");
                    }}
                  >
                    <Trash />
                  </Button>
                </div>
              ))}
              {templates?.length === 0 && (
                <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                  No templates saved yet. Save one from a project's Settings tab.
                </p>
              )}
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-2 w-fit"
                onClick={() => setTemplateId(null)}
              >
                <ArrowLeft /> Choose a different template
              </Button>
              <DialogTitle className="flex items-center gap-2">
                <FileArrowDown /> New project from "{selected.name}"
              </DialogTitle>
              <DialogDescription>
                Every task's start/due date is computed from the start date below, offset exactly like it was
                when the template was saved — not copied from the original project's own dates.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="from-template-name">Project name</Label>
                <Input id="from-template-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="from-template-owner">Owner</Label>
                  <Input id="from-template-owner" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Who owns this?" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="from-template-start">Project start date</Label>
                  <input
                    id="from-template-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                    className="h-9 rounded-md border border-input bg-transparent px-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !name.trim() || !startDate}>
                Create project
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
