/**
 * Global search across projects, tasks, and comments — pure computation, no React, powering the
 * Cmd/Ctrl+K command palette. Plain case-insensitive substring matching (no fuzzy/ranked scoring)
 * is the deliberate choice here, matching the level of sophistication `DependenciesPanel`'s own
 * task search already uses at this app's personal-project scale.
 */
import type { Comment, Project, Task } from "@/lib/db";

export type SearchResultType = "task" | "project" | "comment";

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string;
  projectId: string;
  /** Present for a task result and for a comment posted on a task — what a click should open via `TaskDetailSheet`. */
  taskId?: string;
}

/** Capped per type so the palette stays a quick-jump list, not a second full-text search page. */
const MAX_RESULTS_PER_TYPE = 8;

export interface SearchableData {
  projects: Project[];
  tasks: Task[];
  comments: Comment[];
}

/** `entityTypes: []` searches every type — matches `SavedSearchQuery`'s own "empty = no constraint" convention. */
export function searchEntities(queryText: string, data: SearchableData, entityTypes: SearchResultType[] = []): SearchResult[] {
  const q = queryText.trim().toLowerCase();
  if (!q) return [];
  const wants = (type: SearchResultType) => entityTypes.length === 0 || entityTypes.includes(type);
  const projectsById = Object.fromEntries(data.projects.map((p) => [p.id, p]));

  const results: SearchResult[] = [];

  if (wants("project")) {
    results.push(
      ...data.projects
        .filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
        .slice(0, MAX_RESULTS_PER_TYPE)
        .map((p): SearchResult => ({ type: "project", id: p.id, title: p.name, subtitle: p.status, projectId: p.id }))
    );
  }

  if (wants("task")) {
    results.push(
      ...data.tasks
        .filter((t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
        .slice(0, MAX_RESULTS_PER_TYPE)
        .map(
          (t): SearchResult => ({
            type: "task",
            id: t.id,
            title: t.title,
            subtitle: projectsById[t.projectId]?.name ?? "",
            projectId: t.projectId,
            taskId: t.id,
          })
        )
    );
  }

  if (wants("comment")) {
    results.push(
      ...data.comments
        .filter((c) => c.body.toLowerCase().includes(q))
        .slice(0, MAX_RESULTS_PER_TYPE)
        .map(
          (c): SearchResult => ({
            type: "comment",
            id: c.id,
            title: c.body.length > 120 ? `${c.body.slice(0, 120)}…` : c.body,
            subtitle: `Comment on "${c.entityTitle}"`,
            projectId: c.projectId,
            taskId: c.entityType === "task" ? c.entityId : undefined,
          })
        )
    );
  }

  return results;
}
