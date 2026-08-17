import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import type { ExportBundle } from "@/lib/io/export";
import { importJsonBundle, validateExportBundle } from "@/lib/io/import";

interface ImportJsonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PickedFile = { name: string; bundle: ExportBundle } | { name: string; errors: string[] } | null;

export function ImportJsonDialog({ open, onOpenChange }: ImportJsonDialogProps) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<PickedFile>(null);
  const [importing, setImporting] = useState(false);

  function reset(nextOpen: boolean) {
    if (!nextOpen) setPicked(null);
    onOpenChange(nextOpen);
  }

  async function handleFile(file: File) {
    const text = await file.text();
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      setPicked({ name: file.name, errors: ["This doesn't look like a valid export file — the JSON couldn't be parsed."] });
      return;
    }
    const result = validateExportBundle(raw);
    if (!result.ok) {
      setPicked({ name: file.name, errors: result.errors });
      return;
    }
    setPicked({ name: file.name, bundle: result.value });
  }

  async function handleImport() {
    if (!picked || !("bundle" in picked)) return;
    setImporting(true);
    try {
      const projects = await importJsonBundle(picked.bundle);
      toast.success(`Imported ${projects.length} project${projects.length === 1 ? "" : "s"}`);
      reset(false);
      if (projects.length === 1) navigate(`/projects/${projects[0].id}`);
    } catch (error) {
      console.error("JSON import failed", error);
      toast.error("Import failed — nothing was changed.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import from JSON</DialogTitle>
          <DialogDescription>
            Brings in a file exported from this app's own "Export project" or "Export all". Every project lands
            as a brand-new project — this never overwrites existing data.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 flex flex-col gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
            <UploadSimple /> Choose a JSON file
          </Button>

          {picked && "errors" in picked && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <p className="flex items-center gap-1.5 font-medium">
                <Warning /> "{picked.name}" can't be imported
              </p>
              <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs">
                {picked.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {picked && "bundle" in picked && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <p className="font-medium">"{picked.name}" looks valid</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {picked.bundle.projects.length} project{picked.bundle.projects.length === 1 ? "" : "s"}, exported{" "}
                {new Date(picked.bundle.exportedAt).toLocaleString()} — will be created as new project
                {picked.bundle.projects.length === 1 ? "" : "s"}:
              </p>
              <ul className="mt-1.5 list-inside list-disc text-xs text-muted-foreground">
                {picked.bundle.projects.map((p, i) => (
                  <li key={i}>
                    {p.project.name} ({p.tasks.length} task{p.tasks.length === 1 ? "" : "s"})
                  </li>
                ))}
              </ul>
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
