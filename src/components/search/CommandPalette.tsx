import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BookmarkSimple, ChatCircleText, FolderOpen, ListChecks, Trash } from "@phosphor-icons/react";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useProjects } from "@/hooks/use-projects";
import { useAllTasks } from "@/hooks/use-tasks";
import { useAllComments } from "@/hooks/use-comments";
import { useSavedSearches } from "@/hooks/use-saved-searches";
import { searchEntities, type SearchResult, type SearchResultType } from "@/lib/search";
import { createSavedSearch, deleteSavedSearch } from "@/lib/queries/saved-searches";
import type { SavedSearch } from "@/lib/db";

const TYPE_OPTIONS: Array<{ value: SearchResultType; label: string }> = [
  { value: "project", label: "Projects" },
  { value: "task", label: "Tasks" },
  { value: "comment", label: "Comments" },
];

const TYPE_ICON: Record<SearchResultType, typeof FolderOpen> = {
  project: FolderOpen,
  task: ListChecks,
  comment: ChatCircleText,
};

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenTask: (taskId: string) => void;
  onOpenProject: (projectId: string) => void;
}

/**
 * Global Cmd/Ctrl+K search across projects, tasks, and comments (`lib/search.ts`), plus named
 * saved filters (`savedSearches`, same persisted-filter-not-snapshot pattern as the Phase 3 report
 * builder's `savedReportViews`). The keydown listener itself lives in `AppShell` — this component
 * only renders the dialog once open.
 */
export function CommandPalette({ open, onOpenChange, onOpenTask, onOpenProject }: CommandPaletteProps) {
  const projects = useProjects();
  const tasks = useAllTasks();
  const comments = useAllComments();
  const savedSearches = useSavedSearches();

  const [query, setQuery] = useState("");
  const [activeTypes, setActiveTypes] = useState<SearchResultType[]>([]);
  const [savingName, setSavingName] = useState<string | null>(null);

  const results = useMemo(() => {
    if (!projects || !tasks || !comments) return [];
    return searchEntities(query, { projects, tasks, comments }, activeTypes);
  }, [query, activeTypes, projects, tasks, comments]);

  function reset() {
    setQuery("");
    setActiveTypes([]);
    setSavingName(null);
  }

  function close() {
    onOpenChange(false);
    reset();
  }

  function openResult(result: SearchResult) {
    close();
    if (result.taskId) onOpenTask(result.taskId);
    else onOpenProject(result.projectId);
  }

  function applySavedSearch(saved: SavedSearch) {
    setQuery(saved.query.text);
    setActiveTypes(saved.query.entityTypes);
    setSavingName(null);
  }

  async function confirmSaveSearch() {
    const name = (savingName ?? "").trim();
    if (!name) return;
    await createSavedSearch(name, { text: query, entityTypes: activeTypes });
    toast.success(`Saved search "${name}"`);
    setSavingName(null);
  }

  function toggleType(type: SearchResultType) {
    setActiveTypes((current) => (current.includes(type) ? current.filter((t) => t !== type) : [...current, type]));
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
      title="Search"
      description="Search projects, tasks, and comments"
      className="sm:max-w-lg"
    >
      <Command shouldFilter={false}>
        <CommandInput value={query} onValueChange={setQuery} placeholder="Search projects, tasks, comments…" autoFocus />
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
          {TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => toggleType(option.value)}
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium transition-colors",
                activeTypes.includes(option.value) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              {option.label}
            </button>
          ))}
          {query.trim() && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-6 text-xs"
              onClick={() => setSavingName((v) => (v === null ? "" : null))}
            >
              <BookmarkSimple /> Save search
            </Button>
          )}
        </div>

        {savingName !== null && (
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
            <Input
              value={savingName}
              onChange={(e) => setSavingName(e.target.value)}
              placeholder="Name this search…"
              autoFocus
              className="h-7 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") void confirmSaveSearch();
              }}
            />
            <Button size="sm" className="h-7 text-xs" disabled={!savingName.trim()} onClick={confirmSaveSearch}>
              Save
            </Button>
          </div>
        )}

        <CommandList>
          <CommandEmpty>{query.trim() ? "No results." : "Type to search, or pick a saved search below."}</CommandEmpty>

          {!query.trim() && (savedSearches ?? []).length > 0 && (
            <CommandGroup heading="Saved searches">
              {savedSearches!.map((saved) => (
                <CommandItem key={saved.id} value={saved.id} onSelect={() => applySavedSearch(saved)}>
                  <BookmarkSimple className="text-muted-foreground" />
                  <span className="flex-1 truncate">{saved.name}</span>
                  <button
                    type="button"
                    aria-label={`Delete saved search "${saved.name}"`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteSavedSearch(saved.id);
                    }}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Trash className="size-3.5" />
                  </button>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {TYPE_OPTIONS.map((option) => {
            const group = results.filter((r) => r.type === option.value);
            if (group.length === 0) return null;
            const Icon = TYPE_ICON[option.value];
            return (
              <CommandGroup key={option.value} heading={option.label}>
                {group.map((result) => (
                  <CommandItem key={result.id} value={result.id} onSelect={() => openResult(result)}>
                    <Icon className="text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{result.title}</p>
                      {result.subtitle && <p className="truncate text-xs text-muted-foreground">{result.subtitle}</p>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
