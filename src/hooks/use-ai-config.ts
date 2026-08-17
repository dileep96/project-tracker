import { useLiveQuery } from "dexie-react-hooks";
import { db, type AiProviderConfig } from "@/lib/db";
import { DEFAULT_AI_CONFIG } from "@/lib/queries/ai-config";

/** Undefined while loading, otherwise the persisted config or the LM-Studio-default row if nothing's been saved yet. */
export function useAiProviderConfig(): AiProviderConfig | undefined {
  return useLiveQuery(async () => {
    const row = await db.aiProviderConfig.get("current");
    return row ?? DEFAULT_AI_CONFIG;
  }, []);
}
