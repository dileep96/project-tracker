import { db, type AiProviderConfig } from "@/lib/db";
import { now } from "@/lib/ids";

/** LM Studio is the default provider — local, no key, out of the box against the captain's own setup (see AGENTS.md). */
export const DEFAULT_AI_CONFIG: AiProviderConfig = {
  id: "current",
  provider: "lmstudio",
  lmstudio: { baseUrl: "http://localhost:1234/v1", model: "" },
  openai: { apiKey: "", model: "gpt-4o-mini" },
  azure: { endpoint: "", deployment: "", apiVersion: "2024-10-21", apiKey: "" },
  updatedAt: 0,
};

export async function getAiProviderConfig(): Promise<AiProviderConfig> {
  const row = await db.aiProviderConfig.get("current");
  return row ?? DEFAULT_AI_CONFIG;
}

export async function saveAiProviderConfig(patch: Partial<Omit<AiProviderConfig, "id">>): Promise<AiProviderConfig> {
  const current = await getAiProviderConfig();
  const next: AiProviderConfig = { ...current, ...patch, id: "current", updatedAt: now() };
  await db.aiProviderConfig.put(next);
  return next;
}

/** Whether the active provider has everything it needs to make a real request — gates every AI-dependent UI element (see AGENTS.md: never a silent no-op). */
export function isAiProviderConfigured(config: AiProviderConfig | undefined): boolean {
  if (!config) return false;
  switch (config.provider) {
    case "lmstudio":
      return config.lmstudio.baseUrl.trim() !== "" && config.lmstudio.model.trim() !== "";
    case "openai":
      return config.openai.apiKey.trim() !== "" && config.openai.model.trim() !== "";
    case "azure":
      return (
        config.azure.endpoint.trim() !== "" &&
        config.azure.deployment.trim() !== "" &&
        config.azure.apiVersion.trim() !== "" &&
        config.azure.apiKey.trim() !== ""
      );
    default:
      return false;
  }
}
