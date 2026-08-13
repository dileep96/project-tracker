import { useState } from "react";
import { X } from "@phosphor-icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

export function TagsCell({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);

  function addTag(raw: string) {
    const value = raw.trim();
    if (!value || tags.includes(value)) return;
    onChange([...tags, value]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full flex-wrap items-center gap-1 rounded-md px-1.5 py-1 text-left hover:bg-muted"
        >
          {tags.length === 0 ? (
            <span className="text-sm text-muted-foreground">—</span>
          ) : (
            tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground"
              >
                {tag}
              </span>
            ))
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="start">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-secondary py-0.5 pr-1 pl-1.5 text-xs font-medium text-secondary-foreground"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => onChange(tags.filter((t) => t !== tag))}
                  aria-label={`Remove tag ${tag}`}
                  className="rounded-full p-0.5 hover:bg-foreground/10"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag(draft);
                setDraft("");
              }
            }}
            placeholder="Add a tag, press Enter"
            className="h-8 text-sm"
            autoFocus
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
