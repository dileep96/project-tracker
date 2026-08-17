import { useRef, useState } from "react";
import { toast } from "sonner";
import { UploadSimple, Warning } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TaskStatus } from "@/lib/db";
import type { CreateTaskInput } from "@/lib/queries/tasks";
import { importCsvTasks, validateAndParseCsvTasks } from "@/lib/io/import";

interface ImportCsvTasksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  statuses: TaskStatus[];
}

type PickedFile = { name: string; tasks: CreateTaskInput[] } | { name: string; errors: string[] } | null;

export function ImportCsvTasksDialog({ open, onOpenChange, projectId, projectName, statuses }: ImportCsvTasksDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<PickedFile>(null);
  const [importing, setImporting] = useState(false);

  function reset(nextOpen: boolean) {
    if (!nextOpen) setPicked(null);
    onOpenChange(nextOpen);
  }

  async function handleFile(file: File) {
    const text = await file.text();
    const result = validateAndParseCsvTasks(text, { projectId, statuses });
    if (!result.ok) {
      setPicked({ name: file.name, errors: result.errors });
      return;
    }
    setPicked({ name: file.name, tasks: result.value });
  }

  async function handleImport() {
    if (!picked || !("tasks" in picked)) return;
    setImporting(true);
    try {
      const count = await importCsvTasks(picked.tasks);
      toast.success(`Imported ${count} task${count === 1 ? "" : "s"} into ${projectName}`);
      reset(false);
    } catch (error) {
      console.error("CSV task import failed", error);
      toast.error("Import failed.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import tasks from CSV</DialogTitle>
          <DialogDescription>
            Adds tasks to <strong>{projectName}</strong>. Requires a "Title" column; "Status", "Priority",
            "Assignee", "Start date", "Due date", and "Tags" columns are optional (matching what "Export tasks
            (CSV)" produces). Every row is checked before anything is imported — one bad row fails the whole
            file.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 flex flex-col gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="text/csv,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
            <UploadSimple /> Choose a CSV file
          </Button>

          {picked && "errors" in picked && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <p className="flex items-center gap-1.5 font-medium">
                <Warning /> "{picked.name}" can't be imported
              </p>
              <ul className="mt-1.5 max-h-40 list-inside list-disc space-y-0.5 overflow-y-auto text-xs">
                {picked.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {picked && "tasks" in picked && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <p className="font-medium">"{picked.name}" looks valid</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {picked.tasks.length} task{picked.tasks.length === 1 ? "" : "s"} ready to import.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={() => reset(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!picked || "errors" in picked || importing} onClick={handleImport}>
            {importing ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
