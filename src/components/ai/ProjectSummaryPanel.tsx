import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowSquareOut, Robot, Sparkle, WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useAiProviderConfig } from "@/hooks/use-ai-config";
import { isAiProviderConfigured } from "@/lib/queries/ai-config";
import { buildProjectSummaryRequest, generateProjectSummary, type ProjectSummaryRequest } from "@/lib/ai/summary";
import type { Project, Task, TaskStatus } from "@/lib/db";

/** Shared by ProjectSummaryPanel and AskPage — the calm, non-silent "you need to set this up" state the brief requires everywhere an AI feature could otherwise no-op. */
export function AiNotConfiguredNotice({ message }: { message: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
      <Robot className="size-6 text-muted-foreground" />
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={() => navigate("/settings/ai")}>
        Set up an AI provider <ArrowSquareOut />
      </Button>
    </div>
  );
}

export function ProjectSummaryPanel({ project, tasks, statuses }: { project: Project; tasks: Task[]; statuses: TaskStatus[] }) {
  const config = useAiProviderConfig();
  const [request, setRequest] = useState<ProjectSummaryRequest | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (config === undefined) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;

  if (!isAiProviderConfigured(config)) {
    return <AiNotConfiguredNotice message="Generating a project summary needs an AI provider configured first." />;
  }

  async function handleGenerate() {
    const built = buildProjectSummaryRequest(project, tasks, statuses);
    setRequest(built);
    setSummary(null);
    setError(null);
    setLoading(true);
    const result = await generateProjectSummary(config!, built.messages);
    if (result.ok) setSummary(result.summary);
    else setError(result.error);
    setLoading(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Sends this project's tasks, status breakdown, overdue items, and recent activity to your configured provider.</p>
        <Button size="sm" onClick={handleGenerate} disabled={loading} className="shrink-0">
          <Sparkle /> {loading ? "Generating…" : summary ? "Regenerate" : "Generate summary"}
        </Button>
      </div>

      {loading && <div className="h-32 animate-pulse rounded-xl bg-muted" />}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-health-red-fg/30 bg-health-red-bg p-3 text-sm text-health-red-fg">
          <WarningCircle className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      )}

      {summary && !loading && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm whitespace-pre-wrap">{summary}</p>
        </div>
      )}

      {!summary && !loading && !error && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
          <Sparkle className="size-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No summary generated yet.</p>
        </div>
      )}

      {request && (
        <details className="rounded-lg border border-border/60 text-xs">
          <summary className="cursor-pointer px-3 py-2 font-medium text-muted-foreground select-none">What was sent</summary>
          <div className="max-h-64 overflow-auto border-t border-border/60 p-3">
            <pre className="font-mono whitespace-pre-wrap text-muted-foreground">
              {request.messages.map((m) => `[${m.role}]\n${m.content}`).join("\n\n")}
            </pre>
          </div>
        </details>
      )}
    </div>
  );
}
