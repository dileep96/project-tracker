import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface EditableTextCellProps {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  className?: string;
  displayClassName?: string;
}

/** Click the text to edit in place; Enter or blur commits, Escape cancels. */
export function EditableTextCell({
  value,
  onCommit,
  placeholder = "—",
  className,
  displayClassName,
}: EditableTextCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing, value]);

  function commit() {
    setEditing(false);
    if (draft !== value) onCommit(draft);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className={cn(
          "w-full rounded-md border border-ring bg-background px-1.5 py-1 text-sm outline-none ring-3 ring-ring/50",
          className
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        "w-full truncate rounded-md px-1.5 py-1 text-left text-sm hover:bg-muted",
        !value && "text-muted-foreground",
        displayClassName
      )}
    >
      {value || placeholder}
    </button>
  );
}
