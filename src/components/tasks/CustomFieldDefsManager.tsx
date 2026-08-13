import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCustomFieldDefs } from "@/hooks/use-custom-fields";
import { createFieldDef, deleteFieldDef } from "@/lib/queries/custom-fields";
import type { CustomFieldType } from "@/lib/db";

const TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  select: "Select",
  checkbox: "Checkbox",
};

export function CustomFieldDefsManager({ projectId }: { projectId: string }) {
  const defs = useCustomFieldDefs(projectId);
  const [name, setName] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
  const [optionsText, setOptionsText] = useState("");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await createFieldDef({
      projectId,
      name: name.trim(),
      type,
      options: type === "select" ? optionsText.split(",").map((o) => o.trim()).filter(Boolean) : undefined,
    });
    setName("");
    setOptionsText("");
    toast.success("Custom field added");
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Custom fields defined here appear on every task in this project.
      </p>

      {(defs ?? []).length > 0 && (
        <div className="flex flex-col gap-1.5">
          {defs!.map((f) => (
            <div key={f.id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
              <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {TYPE_LABELS[f.type]}
                {f.projectId === null ? " · global" : ""}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Delete field"
                onClick={async () => {
                  await deleteFieldDef(f.id);
                  toast.success("Field deleted");
                }}
              >
                <Trash />
              </Button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="new-field-name">
            Field name
          </label>
          <Input id="new-field-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Budget" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="new-field-type">
            Type
          </label>
          <Select value={type} onValueChange={(v) => setType(v as CustomFieldType)}>
            <SelectTrigger id="new-field-type" className="w-32">
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
          <div className="flex flex-1 flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="new-field-options">
              Options (comma separated)
            </label>
            <Input
              id="new-field-options"
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder="Small, Medium, Large"
            />
          </div>
        )}
        <Button type="submit" disabled={!name.trim()}>
          <Plus /> Add field
        </Button>
      </form>
    </div>
  );
}
