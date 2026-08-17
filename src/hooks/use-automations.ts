import { useLiveQuery } from "dexie-react-hooks";
import { db, type AutomationRule, type AutomationRunLogEntry } from "@/lib/db";

export function useAutomationRules(projectId: string | undefined): AutomationRule[] | undefined {
  return useLiveQuery(async () => {
    if (!projectId) return [];
    const rows = await db.automationRules.where("projectId").equals(projectId).toArray();
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [projectId]);
}

/** Most-recent-first, capped at `limit` — the project settings' Automations section shows a recent tail, not the full history. */
export function useAutomationRunLog(projectId: string | undefined, limit = 50): AutomationRunLogEntry[] | undefined {
  return useLiveQuery(async () => {
    if (!projectId) return [];
    const rows = await db.automationRunLog.where("projectId").equals(projectId).toArray();
    return rows.sort((a, b) => b.firedAt - a.firedAt).slice(0, limit);
  }, [projectId, limit]);
}

/** Every firing across every project — the Phase 6 notification center is global, unlike the project-scoped `useAutomationRunLog` above. */
export function useAllAutomationRunLog(): AutomationRunLogEntry[] | undefined {
  return useLiveQuery(() => db.automationRunLog.toArray(), []);
}
