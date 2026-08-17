import type { Role } from "@/lib/permissions";

/**
 * The current user's role. This app has no real authentication or multi-user sync (see AGENTS.md) —
 * there's only ever one local user, and they're always the most permissive role. A future
 * multi-user phase would replace this hook's body with a real session/membership lookup (e.g. a
 * `projectMembers` table mapping `(projectId, userId) -> Role`) and nothing else in the codebase
 * would need to change, since every gated action already calls this hook rather than assuming
 * `"owner"` directly.
 */
export function useCurrentRole(): Role {
  return "owner";
}
