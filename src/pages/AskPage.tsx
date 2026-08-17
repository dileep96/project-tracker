import { useCallback, useMemo, useState } from "react";
import { PaperPlaneRight, WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TaskTable } from "@/components/tasks/TaskTable";
import { TaskDetailSheet } from "@/components/tasks/TaskDetailSheet";
import { AiNotConfiguredNotice } from "@/components/ai/ProjectSummaryPanel";
import { useAiProviderConfig } from "@/hooks/use-ai-config";
import { isAiProviderConfigured } from "@/lib/queries/ai-config";
import { useAllTasks } from "@/hooks/use-tasks";
import { useProjects } from "@/hooks/use-projects";
import { useAllTaskStatusesByProject } from "@/hooks/use-task-statuses";
import { applyReportFilters } from "@/lib/analytics/report";
import { buildNlQueryContext, buildNlQueryRequest, describeFilters, interpretNlQuery, type NlQueryContext } from "@/lib/ai/nl-query";
import type { ReportFilters, Task } from "@/lib/db";

const EXAMPLE_QUESTIONS = ["What's overdue?", "High priority tasks", "Unassigned tasks", "Completed this month"];

export function AskPage() {
  const config = useAiProviderConfig();
  const tasks = useAllTasks();
  const projects = useProjects();
  const statusesByProject = useAllTaskStatusesByProject();

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answeredQuestion, setAnsweredQuestion] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReportFilters | null>(null);
  const [rawResponse, setRawResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const statusName = useCallback((task: Task) => statusesByProject?.[task.projectId]?.find((s) => s.id === task.statusId)?.name ?? "", [statusesByProject]);
  const statusesForProject = useCallback((projectId: string) => statusesByProject?.[projectId] ?? [], [statusesByProject]);
  const projectsById = useMemo(() => Object.fromEntries((projects ?? []).map((p) => [p.id, p])), [projects]);

  const context: NlQueryContext | null = useMemo(() => {
    if (!tasks || !projects) return null;
    return buildNlQueryContext(projects, tasks, statusName);
  }, [tasks, projects, statusName]);

  const results = useMemo(() => {
    if (!filters || !tasks) return [];
    return applyReportFilters(tasks, filters, statusName);
  }, [filters, tasks, statusName]);

  const loading = tasks === undefined || projects === undefined || statusesByProject === undefined;

  async function ask(q: string) {
    const trimmed = q.trim();
    if (!trimmed || !config || !context) return;
    setAsking(true);
    setError(null);
    const request = buildNlQueryRequest(trimmed, context);
    const result = await interpretNlQuery(config, request, context);
    if (result.ok) {
      setFilters(result.filters);
      setRawResponse(result.raw);
      setAnsweredQuestion(trimmed);
    } else {
      setError(result.error);
      setRawResponse(result.raw ?? null);
    }
    setAsking(false);
  }

  if (config === undefined || loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ask</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask a question in plain language — it's turned into a real filter and run against your actual tasks, never fabricated.
        </p>
      </div>

      {!isAiProviderConfigured(config) ? (
        <AiNotConfiguredNotice message="Asking questions about your tasks needs an AI provider configured first." />
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
            className="flex gap-2"
          >
            <Input
              id="ask-question"
              name="question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What's overdue this week?"
              className="h-10"
              autoFocus
            />
            <Button type="submit" disabled={asking || !question.trim()}>
              <PaperPlaneRight /> {asking ? "Thinking…" : "Ask"}
            </Button>
          </form>

          {!answeredQuestion && !error && (
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    setQuestion(q);
                    ask(q);
                  }}
                  className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-health-red-fg/30 bg-health-red-bg p-3 text-sm text-health-red-fg">
              <WarningCircle className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 break-words">{error}</span>
            </div>
          )}

          {answeredQuestion && filters && (
            <div className="flex flex-col gap-3">
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">
                  "{answeredQuestion}" →{" "}
                  <span className="font-medium text-foreground">{describeFilters(filters)}</span>
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {results.length} task{results.length === 1 ? "" : "s"} match
              </p>
              <TaskTable
                tasks={results}
                statusesForProject={statusesForProject}
                onOpenTask={setOpenTaskId}
                showProjectColumn
                projectsById={projectsById}
                emptyMessage="No tasks match this question."
              />
              {rawResponse && (
                <details className="rounded-lg border border-border/60 text-xs">
                  <summary className="cursor-pointer px-3 py-2 font-medium text-muted-foreground select-none">What the model returned</summary>
                  <div className="max-h-40 overflow-auto border-t border-border/60 p-3">
                    <pre className="font-mono whitespace-pre-wrap text-muted-foreground">{rawResponse}</pre>
                  </div>
                </details>
              )}
            </div>
          )}
        </>
      )}

      <TaskDetailSheet taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
    </div>
  );
}
