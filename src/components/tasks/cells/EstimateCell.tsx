import { useState } from "react";
import { cn } from "@/lib/utils";

/** Click-to-edit numeric cell for `Task.estimatedHours` — same click/blur/Escape contract as `EditableTextCell` and `DateCell`, just for a number that can be null ("unestimated"). */
export function EstimateCell({ value, onCommit }: { value: number | null; onCommit: (value: number | null) => void }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <input
        type="number"
        min={0}
        step={0.5}
        autoFocus
        defaultValue={value ?? ""}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => {
          setEditing(false);
          const raw = e.target.value.trim();
          onCommit(raw === "" ? null : Math.max(0, Number(raw) || 0));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-full rounded-md border border-ring bg-background px-1.5 py-1 font-mono text-xs outline-none ring-3 ring-ring/50"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn("w-full truncate rounded-md px-1.5 py-1 text-left font-mono text-xs hover:bg-muted", value === null && "text-muted-foreground")}
    >
      {value === null ? "—" : `${value}h`}
    </button>
  );
}
