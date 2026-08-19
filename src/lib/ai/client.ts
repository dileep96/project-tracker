import type { AiProviderConfig } from "@/lib/db";

/**
 * One pluggable client for three OpenAI-compatible-ish providers (captain-specified — see
 * AGENTS.md for the full rationale). LM Studio and OpenAI share the same Chat Completions request
 * shape (`Authorization: Bearer` or no auth at all, `model` in the body); Azure OpenAI is genuinely
 * different — the model is chosen by which `deployment` the URL path points at, auth is an
 * `api-key` header (not `Authorization: Bearer`), and the API version is a required query param —
 * so it gets its own branch here rather than being forced through the other two's shape.
 *
 * NEVER pass `config` (or anything derived from its api key fields) to `console.*` anywhere in
 * this module or its callers — errors are returned as plain strings for the UI to show, never the
 * request/response objects that could carry a key.
 */

/**
 * A message's `content` is either plain text (every call site before Phase A, and still the
 * common case) or a multi-part array mixing text with images — the standard shape all three
 * providers already accept in their Chat Completions API, so no per-provider branching is needed
 * beyond this type: `prepareRequest` below just serializes whatever `content` is, unchanged.
 */
export type ChatContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
}

/** OpenAI-compatible function-calling tool definition — the standard shape all three providers accept. */
export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/** One model-proposed call, exactly as the provider returned it — `arguments` is a raw JSON string, not yet parsed or trusted (see actions.ts's validation layer, which is what turns this into something safe to act on). */
export interface ToolCall {
  id: string;
  function: { name: string; arguments: string };
}

export type ChatCompletionResult =
  | { ok: true; content: string; model: string; toolCalls?: ToolCall[] }
  | { ok: false; error: string };

interface PreparedRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function prepareRequest(config: AiProviderConfig, messages: ChatMessage[], temperature: number, tools?: ToolDef[]): PreparedRequest {
  // Omitted entirely (not even an empty array) when no caller passed tools — most call sites never
  // need this, and an unnecessary `tools: []` field is one more thing a smaller local model's
  // OpenAI-compat layer could mishandle. "auto" tool_choice is every provider's own default once
  // `tools` is present, so it's never sent explicitly.
  const toolFields = tools && tools.length > 0 ? { tools } : {};
  switch (config.provider) {
    case "lmstudio":
      return {
        url: `${trimSlash(config.lmstudio.baseUrl)}/chat/completions`,
        headers: { "Content-Type": "application/json" },
        body: { model: config.lmstudio.model, messages, temperature, ...toolFields },
      };
    case "openai":
      return {
        url: "https://api.openai.com/v1/chat/completions",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.openai.apiKey}` },
        body: { model: config.openai.model, messages, temperature, ...toolFields },
      };
    case "azure":
      return {
        url: `${trimSlash(config.azure.endpoint)}/openai/deployments/${encodeURIComponent(config.azure.deployment)}/chat/completions?api-version=${encodeURIComponent(config.azure.apiVersion)}`,
        headers: { "Content-Type": "application/json", "api-key": config.azure.apiKey },
        // No "model" field — the deployment in the URL path IS the model selection for Azure OpenAI.
        body: { messages, temperature, ...toolFields },
      };
  }
}

function describeFetchError(error: unknown, provider: AiProviderConfig["provider"]): string {
  if (error instanceof TypeError) {
    const hint = provider === "lmstudio" ? " If LM Studio is running, check its Developer tab has CORS enabled for browser requests." : "";
    return `Couldn't reach the server — check the URL and that it's running.${hint}`;
  }
  return error instanceof Error ? error.message : "Unknown error.";
}

export async function chatCompletion(
  config: AiProviderConfig,
  messages: ChatMessage[],
  opts?: { temperature?: number; tools?: ToolDef[] }
): Promise<ChatCompletionResult> {
  const { url, headers, body } = prepareRequest(config, messages, opts?.temperature ?? 0.3, opts?.tools);
  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 300)}` : ""}` };
    }
    const data = await res.json();
    const message = data?.choices?.[0]?.message;
    const content = message?.content;
    const rawToolCalls = message?.tool_calls;
    const toolCalls: ToolCall[] | undefined = Array.isArray(rawToolCalls)
      ? rawToolCalls
          .filter((c: unknown): c is { id?: unknown; function?: { name?: unknown; arguments?: unknown } } => !!c && typeof c === "object")
          .map((c) => ({
            id: typeof c.id === "string" ? c.id : "",
            function: { name: typeof c.function?.name === "string" ? c.function.name : "", arguments: typeof c.function?.arguments === "string" ? c.function.arguments : "{}" },
          }))
      : undefined;
    // A tool-call response often carries no text content at all (content: null) — that's a normal,
    // valid response shape when the model chose to act instead of reply, not a failure.
    if (typeof content !== "string" && !toolCalls?.length) return { ok: false, error: "The response had no message content." };
    return { ok: true, content: typeof content === "string" ? content : "", model: typeof data?.model === "string" ? data.model : "", toolCalls };
  } catch (error) {
    return { ok: false, error: describeFetchError(error, config.provider) };
  }
}

export type ListModelsResult = { ok: true; models: string[] } | { ok: false; error: string };

/** LM-Studio-specific: `/v1/models` lists whatever is actually loaded, so the settings UI can offer a picker instead of a free-typed guess (see AGENTS.md — this is the captain's explicit requirement). */
export async function listLmStudioModels(baseUrl: string): Promise<ListModelsResult> {
  try {
    const res = await fetch(`${trimSlash(baseUrl)}/models`);
    if (!res.ok) return { ok: false, error: `${res.status} ${res.statusText}` };
    const data = await res.json();
    const models = Array.isArray(data?.data)
      ? data.data.map((m: unknown) => (m as { id?: unknown })?.id).filter((id: unknown): id is string => typeof id === "string")
      : [];
    return { ok: true, models };
  } catch (error) {
    return { ok: false, error: describeFetchError(error, "lmstudio") };
  }
}

export type TestConnectionResult = { ok: true; detail: string } | { ok: false; error: string };

/** Makes one real request against whatever's currently configured — never a mocked/simulated success, per the brief. */
export async function testAiProviderConnection(config: AiProviderConfig): Promise<TestConnectionResult> {
  const result = await chatCompletion(config, [{ role: "user", content: "Reply with exactly one word: OK" }], { temperature: 0 });
  if (!result.ok) return { ok: false, error: result.error };
  const preview = result.content.trim().replace(/\s+/g, " ").slice(0, 80);
  return { ok: true, detail: `Connected${result.model ? ` — model: ${result.model}` : ""}. Response: "${preview}"` };
}
