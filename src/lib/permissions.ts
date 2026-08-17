/**
 * Role-based access control — scaffolding only (Phase 7). This app has no real authentication or
 * multi-user sync: there's exactly one local user, and `useCurrentRole()` (`src/hooks/use-role.ts`)
 * always resolves them to `"owner"`, the most permissive role, so every `hasPermission()` check in
 * this codebase passes today. The point of building this now is the *shape*: a future auth phase
 * would only need to replace `useCurrentRole()`'s body with a real session/membership lookup — every
 * call site that already gates an action behind `hasPermission()` starts actually enforcing it, with
 * no further changes there. See AGENTS.md for which call sites are wired up so far and why only a
 * few were chosen rather than gating every mutation in the app.
 */

export type Role = "owner" | "editor" | "viewer";

export const ROLES: Role[] = ["owner", "editor", "viewer"];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

/**
 * One flat permission list rather than a resource/action matrix builder — this app has a small,
 * fixed set of mutating actions, not a general policy engine. Add a new permission here (and to
 * every role's set in `ROLE_PERMISSIONS` below) the moment a future call site needs to gate
 * something new; don't build out permissions nothing checks yet.
 */
export type Permission =
  | "project:create"
  | "project:edit"
  | "project:delete"
  | "task:create"
  | "task:edit"
  | "task:delete"
  | "automation:manage"
  | "template:manage"
  | "data:import";

/**
 * Owner: everything. Editor: can create and change day-to-day work — projects, tasks, automations,
 * templates, imports — but can't delete a whole project, the one action in this app with no undo
 * (`ConfirmDeleteDialog` says as much on every project-delete confirmation). Viewer: read-only — no
 * permission grants any mutation, matching what "viewer" means everywhere else this word is used in
 * the app (e.g. a saved report view or search is something anyone can *run*, never something that
 * implies write access).
 */
const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([
    "project:create",
    "project:edit",
    "project:delete",
    "task:create",
    "task:edit",
    "task:delete",
    "automation:manage",
    "template:manage",
    "data:import",
  ]),
  editor: new Set<Permission>([
    "project:create",
    "project:edit",
    "task:create",
    "task:edit",
    "task:delete",
    "automation:manage",
    "template:manage",
    "data:import",
  ]),
  viewer: new Set<Permission>(),
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
