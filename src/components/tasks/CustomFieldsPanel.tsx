import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCustomFieldDefs } from "@/hooks/use-custom-fields";
import { useCustomFieldValues } from "@/hooks/use-task-detail";
import { createFieldDef } from "@/lib/queries/custom-fields";
import { setCustomFieldValue } from "@/lib/queries/tasks";
import type { CustomFieldType } from "@/lib/db";

const TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  select: "Select",
  checkbox: "Checkbox",
};

function AddFieldPopover({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
  const [optionsText, setOptionsText] = useState("");

  async function handleAdd() {
    if (!name.trim()) return;
    await createFieldDef({
      projectId,
      name: name.trim(),
      type,
      options: type === "select" ? optionsText.split(",").map((o) => o.trim()).filter(Boolean) : undefined,
    });
    toast.success("Custom field added");
    setName("");
    setOptionsText("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus /> Add custom field
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="field-name">Field name</Label>
            <Input id="field-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Budget" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="field-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as CustomFieldType)}>
              <SelectTrigger id="field-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_LABELS) as CustomFieldType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {type === "select" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="field-options">Options (comma separated)</Label>
              <Input
                id="field-options"
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder="Small, Medium, Large"
              />
            </div>
          )}
          <Button size="sm" onClick={handleAdd} disabled={!name.trim()}>
            Add field
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function CustomFieldsPanel({ taskId, projectId }: { taskId: string; projectId: string }) {
  const defs = useCustomFieldDefs(projectId);
  const values = useCustomFieldValues(taskId);

  return (
    <div className="flex flex-col gap-3">
      {(defs ?? []).length === 0 ? (
        <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
          No custom fields defined for this project yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {defs!.map((field) => {
            const raw = values?.[field.id] ?? "";
            return (
              <div key={field.id} className="flex flex-col gap-1.5">
                <Label>{field.name}</Label>
                {field.type === "text" && (
                  <Input
                    defaultValue={raw}
                    onBlur={(e) => setCustomFieldValue(taskId, field.id, e.target.value)}
                  />
                )}
                {field.type === "number" && (
                  <Input
                    type="number"
                    defaultValue={raw}
                    onBlur={(e) => setCustomFieldValue(taskId, field.id, e.target.value)}
                  />
                )}
                {field.type === "date" && (
                  <Input
                    type="date"
                    defaultValue={raw}
                    onChange={(e) => setCustomFieldValue(taskId, field.id, e.target.value)}
                  />
                )}
                {field.type === "checkbox" && (
                  <Checkbox
                    checked={raw === "true"}
                    onCheckedChange={(checked) => setCustomFieldValue(taskId, field.id, checked === true ? "true" : "false")}
                  />
                )}
                {field.type === "select" && (
                  <Select value={raw || undefined} onValueChange={(v) => setCustomFieldValue(taskId, field.id, v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose one" />
                    </SelectTrigger>
                    <SelectContent>
                      {(field.options ?? []).map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AddFieldPopover projectId={projectId} />
    </div>
  );
}
