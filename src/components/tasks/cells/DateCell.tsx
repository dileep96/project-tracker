import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const dateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

function toInputValue(epochMs: number | null): string {
  if (epochMs === null) return "";
  const d = new Date(epochMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromInputValue(value: string): number | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function DateCell({
  value,
  onCommit,
  overdue,
}: {
  value: number | null;
  onCommit: (value: number | null) => void;
  /** Highlights the date in the destructive tone — used for past-due, incomplete tasks. */
  overdue?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.showPicker?.();
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        defaultValue={toInputValue(value)}
        onBlur={(e) => {
          setEditing(false);
          onCommit(fromInputValue(e.target.value));
        }}
        onKeyDown={(e) => {
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
      className={cn(
        "w-full truncate rounded-md px-1.5 py-1 text-left font-mono text-xs hover:bg-muted",
        value === null ? "text-muted-foreground" : overdue ? "text-destructive" : "text-foreground"
      )}
    >
      {value === null ? "—" : dateFormatter.format(value)}
    </button>
  );
}
