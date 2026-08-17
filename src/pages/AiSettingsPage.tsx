import { useState } from "react";
import { toast } from "sonner";
import { ArrowClockwise, CheckCircle, Eye, EyeSlash, Robot, WarningCircle, XCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAiProviderConfig } from "@/hooks/use-ai-config";
import { saveAiProviderConfig } from "@/lib/queries/ai-config";
import { listLmStudioModels, testAiProviderConnection } from "@/lib/ai/client";
import { cn } from "@/lib/utils";
import type { AiProviderConfig, AiProviderKind } from "@/lib/db";

const PROVIDER_LABELS: Record<AiProviderKind, string> = { lmstudio: "LM Studio", openai: "OpenAI", azure: "Azure OpenAI" };

function SecretInput({ value, onBlurCommit, placeholder, id }: { value: string; onBlurCommit: (v: string) => void; placeholder?: string; id: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        defaultValue={value}
        key={value}
        onBlur={(e) => onBlurCommit(e.target.value)}
        placeholder={placeholder}
        className="pr-9 font-mono"
        autoComplete="off"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide key" : "Show key"}
        className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {visible ? <EyeSlash className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function LmStudioForm({ config }: { config: AiProviderConfig }) {
  const [models, setModels] = useState<string[] | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  async function refreshModels() {
    setFetching(true);
    setFetchError(null);
    const result = await listLmStudioModels(config.lmstudio.baseUrl);
    if (result.ok) setModels(result.models);
    else setFetchError(result.error);
    setFetching(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lmstudio-url">Base URL</Label>
        <Input
          id="lmstudio-url"
          key={config.lmstudio.baseUrl}
          defaultValue={config.lmstudio.baseUrl}
          onBlur={(e) => saveAiProviderConfig({ lmstudio: { ...config.lmstudio, baseUrl: e.target.value.trim() } })}
          placeholder="http://localhost:1234/v1"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">Runs locally, no API key needed. Defaults to LM Studio's own default port.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="lmstudio-model">Model</Label>
          <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={refreshModels} disabled={fetching}>
            <ArrowClockwise className={cn(fetching && "animate-spin")} /> {fetching ? "Fetching…" : "Fetch available models"}
          </Button>
        </div>
        {models && models.length > 0 ? (
          <Select
            value={config.lmstudio.model || undefined}
            onValueChange={(v) => saveAiProviderConfig({ lmstudio: { ...config.lmstudio, model: v } })}
          >
            <SelectTrigger id="lmstudio-model" className="w-full">
              <SelectValue placeholder="Choose a model" />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id="lmstudio-model"
            key={config.lmstudio.model}
            defaultValue={config.lmstudio.model}
            onBlur={(e) => saveAiProviderConfig({ lmstudio: { ...config.lmstudio, model: e.target.value.trim() } })}
            placeholder="Fetch models above, or type a model name"
            className="font-mono"
          />
        )}
        {fetchError && (
          <p className="flex items-start gap-1 text-xs text-destructive">
            <WarningCircle className="mt-0.5 size-3.5 shrink-0" /> Couldn't list models: {fetchError}
          </p>
        )}
        {models && models.length === 0 && !fetchError && (
          <p className="text-xs text-muted-foreground">LM Studio has no model loaded right now — load one, then fetch again.</p>
        )}
      </div>
    </div>
  );
}

function OpenAiForm({ config }: { config: AiProviderConfig }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Requests go to <code className="rounded bg-muted px-1 py-0.5 font-mono">https://api.openai.com/v1</code>, authenticated with{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono">Authorization: Bearer</code>.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="openai-key">API key</Label>
        <SecretInput
          id="openai-key"
          value={config.openai.apiKey}
          onBlurCommit={(v) => saveAiProviderConfig({ openai: { ...config.openai, apiKey: v.trim() } })}
          placeholder="sk-…"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="openai-model">Model</Label>
        <Input
          id="openai-model"
          key={config.openai.model}
          defaultValue={config.openai.model}
          onBlur={(e) => saveAiProviderConfig({ openai: { ...config.openai, model: e.target.value.trim() } })}
          placeholder="gpt-4o-mini"
          className="font-mono"
        />
      </div>
    </div>
  );
}

function AzureForm({ config }: { config: AiProviderConfig }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        A genuinely different shape from the other two: the deployment picks the model (no{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono">model</code> field in the request), and auth is an{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono">api-key</code> header, not a bearer token.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="azure-endpoint">Resource endpoint</Label>
        <Input
          id="azure-endpoint"
          key={config.azure.endpoint}
          defaultValue={config.azure.endpoint}
          onBlur={(e) => saveAiProviderConfig({ azure: { ...config.azure, endpoint: e.target.value.trim() } })}
          placeholder="https://my-resource.openai.azure.com"
          className="font-mono"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="azure-deployment">Deployment name</Label>
          <Input
            id="azure-deployment"
            key={config.azure.deployment}
            defaultValue={config.azure.deployment}
            onBlur={(e) => saveAiProviderConfig({ azure: { ...config.azure, deployment: e.target.value.trim() } })}
            placeholder="gpt-4o-deployment"
            className="font-mono"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="azure-api-version">API version</Label>
          <Input
            id="azure-api-version"
            key={config.azure.apiVersion}
            defaultValue={config.azure.apiVersion}
            onBlur={(e) => saveAiProviderConfig({ azure: { ...config.azure, apiVersion: e.target.value.trim() } })}
            placeholder="2024-10-21"
            className="font-mono"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="azure-key">API key</Label>
        <SecretInput
          id="azure-key"
          value={config.azure.apiKey}
          onBlurCommit={(v) => saveAiProviderConfig({ azure: { ...config.azure, apiKey: v.trim() } })}
          placeholder="Azure resource key"
        />
      </div>
    </div>
  );
}

export function AiSettingsPage() {
  const config = useAiProviderConfig();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null);
  // Snapshot of the exact config that produced `testResult`, so a config edit can mark that result
  // "stale" by comparing values — NOT a `useEffect` keyed on the `config` object reference. Dexie's
  // `useLiveQuery` emits a brand-new object on every read regardless of whether any field actually
  // changed (e.g. a field's own onBlur-triggered save landing while a test request is in flight), so
  // reference-based invalidation could — and in testing, did — silently wipe a just-arrived result
  // out from under the user. Comparing serialized values instead only invalidates on a REAL edit.
  const [testedConfigJson, setTestedConfigJson] = useState<string | null>(null);

  const configJson = config ? JSON.stringify(config) : null;
  const stale = testResult !== null && testedConfigJson !== null && configJson !== testedConfigJson;

  async function handleTest() {
    if (!config) return;
    setTesting(true);
    const result = await testAiProviderConnection(config);
    setTestResult(result.ok ? { ok: true, detail: result.detail } : { ok: false, detail: result.error });
    setTestedConfigJson(JSON.stringify(config));
    setTesting(false);
  }

  if (!config) {
    return <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">Loading…</div>;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2.5">
        <Robot className="size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI provider</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Powers project summaries and natural-language task queries. Every request goes through one shared client — see AGENTS.md.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        {(Object.keys(PROVIDER_LABELS) as AiProviderKind[]).map((p) => (
          <Button
            key={p}
            type="button"
            variant={config.provider === p ? "default" : "outline"}
            className="flex-1"
            onClick={() => {
              toast.dismiss();
              saveAiProviderConfig({ provider: p });
            }}
          >
            {PROVIDER_LABELS[p]}
          </Button>
        ))}
      </div>

      <div className="rounded-lg border border-border p-4">
        {config.provider === "lmstudio" && <LmStudioForm config={config} />}
        {config.provider === "openai" && <OpenAiForm config={config} />}
        {config.provider === "azure" && <AzureForm config={config} />}
      </div>

      <div className="flex flex-col gap-3">
        <Button type="button" variant="outline" className="w-fit" onClick={handleTest} disabled={testing}>
          {testing ? "Testing…" : "Test connection"}
        </Button>
        {testResult && (
          <div
            className={cn(
              "flex items-start gap-2 rounded-lg border p-3 text-sm",
              testResult.ok ? "border-health-green-fg/30 bg-health-green-bg text-health-green-fg" : "border-health-red-fg/30 bg-health-red-bg text-health-red-fg",
              stale && "opacity-60"
            )}
          >
            {testResult.ok ? <CheckCircle className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
            <span className="min-w-0 break-words">
              {testResult.detail}
              {stale && " (settings changed since this test — test again to confirm)"}
            </span>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Makes one real request against the settings above — a summary or a query fails clearly if this fails, never silently.
        </p>
      </div>
    </div>
  );
}
