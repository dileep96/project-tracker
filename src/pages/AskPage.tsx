import { useCallback, useMemo, useRef, useState } from "react";
import { PaperPlaneRight, Paperclip, WarningCircle, X } from "@phosphor-icons/react";
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
import { buildQueryAnswerRequest, buildQueryResultRows, generateQueryAnswer } from "@/lib/ai/query-answer";
import { processAttachment, type ProcessedAttachment } from "@/lib/ai/attachments";
import { interpretActionRequest, type ActionContext, type ValidatedProposal } from "@/lib/ai/actions";
import { ActionProposalPanel } from "@/components/ai/ActionProposalPanel";
import type { ReportFilters, Task } from "@/lib/db";

const EXAMPLE_QUESTIONS = ["What's overdue?", "High priority tasks", "Unassigned tasks", "Completed this month"];
const ACCEPTED_FILE_TYPES = "application/pdf,image/png,image/jpeg,image/webp,image/gif";

export function AskPage() {
  const config = useAiProviderConfig();
  const tasks = useAllTasks();
  const projects = useProjects();
  const statusesByProject = useAllTaskStatusesByProject();

  const [question, setQuestion] = useState("");
  const [attachments, setAttachments] = useState<ProcessedAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [asking, setAsking] = useState(false);
  const [answeredQuestion, setAnsweredQuestion] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReportFilters | null>(null);
  const [rawResponse, setRawResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [answerText, setAnswerText] = useState<string | null>(null);
  const [answerSentText, setAnswerSentText] = useState<string | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);

  const [proposals, setProposals] = useState<ValidatedProposal[] | null>(null);
  const [actionErrors, setActionErrors] = useState<string[] | null>(null);

  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const statusName = useCallback((task: Task) => statusesByProject?.[task.projectId]?.find((s) => s.id === task.statusId)?.name ?? "", [statusesByProject]);
  const statusesForProject = useCallback((projectId: string) => statusesByProject?.[projectId] ?? [], [statusesByProject]);
  const projectsById = useMemo(() => Object.fromEntries((projects ?? []).map((p) => [p.id, p])), [projects]);
  const projectName = useCallback((task: Task) => projectsById[task.projectId]?.name ?? "", [projectsById]);

  const context: NlQueryContext | null = useMemo(() => {
    if (!tasks || !projects) return null;
    return buildNlQueryContext(projects, tasks, statusName);
  }, [tasks, projects, statusName]);

  const actionContext: ActionContext | null = useMemo(() => {
    if (!projects || !statusesByProject) return null;
    return {
      projects: projects.map((p) => ({ id: p.id, name: p.name })),
      statusesByProject: Object.fromEntries(
        Object.entries(statusesByProject).map(([projectId, statuses]) => [
          projectId,
          statuses.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault })),
        ])
      ),
    };
  }, [projects, statusesByProject]);

  const results = useMemo(() => {
    if (!filters || !tasks) return [];
    return applyReportFilters(tasks, filters, statusName);
  }, [filters, tasks, statusName]);

  const loading = tasks === undefined || projects === undefined || statusesByProject === undefined;

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setAttachError(null);
    for (const file of Array.from(fileList)) {
      try {
        const processed = await processAttachment(file);
        setAttachments((prev) => [...prev, processed]);
      } catch (err) {
        setAttachError(err instanceof Error ? err.message : "Couldn't read that file.");
      }
    }
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  async function ask(q: string) {
    const trimmed = q.trim();
    if ((!trimmed && attachments.length === 0) || !config || !context) return;
    setAsking(true);
    setError(null);
    setAnswerText(null);
    setAnswerError(null);
    setProposals(null);
    setActionErrors(null);

    // Action classification runs first, and only for typed questions (an attachment-only ask has
    // nothing an action tool could reference). A plain question always falls through to the
    // existing read-only flow below unchanged — this only short-circuits when the model actually
    // proposes a create — so this step can never make an existing question behave differently.
    if (trimmed && actionContext) {
      const actionResult = await interpretActionRequest(config, trimmed, actionContext);
      if (actionResult.kind === "action" || actionResult.kind === "rejected") {
        // Clear any results left over from a *previous* plain question — otherwise an old filter
        // table would keep showing underneath this unrelated action's proposal/error.
        setFilters(null);
        setRawResponse(null);
        setAnsweredQuestion(trimmed);
        if (actionResult.kind === "action") setProposals(actionResult.proposals);
        else setActionErrors(actionResult.errors);
        setAsking(false);
        return;
      }
      // "no-action" or "error" — fall through to the ordinary question flow below.
    }

    const request = buildNlQueryRequest(trimmed, context, attachments);
    const result = await interpretNlQuery(config, request, context);
    if (!result.ok) {
      setError(result.error);
      setRawResponse(result.raw ?? null);
      setAsking(false);
      return;
    }

    setFilters(result.filters);
    setRawResponse(result.raw);
    setAnsweredQuestion(trimmed);

    // Second, separate call — see lib/ai/query-answer.ts: only ever shown the tasks that just
    // matched the filter above, never asked to describe results it hasn't been given.
    const matched = tasks ? applyReportFilters(tasks, result.filters, statusName) : [];
    const rows = buildQueryResultRows(matched, projectName, statusName);
    const answerRequest = buildQueryAnswerRequest(trimmed || "(see attached file)", rows, matched.length);
    const answerResult = await generateQueryAnswer(config, answerRequest.messages);
    if (answerResult.ok) {
      setAnswerText(answerResult.answer);
    } else {
      setAnswerError(answerResult.error);
    }
    setAnswerSentText(JSON.stringify(answerRequest.messages, null, 2));

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
          Ask a question in plain language, or ask it to create a task or project — either way, nothing is fabricated and nothing is written
          without your approval. Attach a PDF or an image for context.
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
            className="flex flex-col gap-2"
          >
            <div className="flex gap-2">
              <Input
                id="ask-question"
                name="question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="What's overdue this week?"
                className="h-10"
                autoFocus
              />
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FILE_TYPES}
                multiple
                className="hidden"
                onChange={(e) => {
                  handleFilesSelected(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button type="button" variant="outline" size="icon" aria-label="Attach a PDF or image" onClick={() => fileInputRef.current?.click()}>
                <Paperclip />
              </Button>
              <Button type="submit" disabled={asking || (!question.trim() && attachments.length === 0)}>
                <PaperPlaneRight /> {asking ? "Thinking…" : "Ask"}
              </Button>
            </div>

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {attachments.map((a, i) => (
                  <span
                    key={`${a.name}-${i}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs"
                  >
                    {a.name}
                    <button
                      type="button"
                      aria-label={`Remove ${a.name}`}
                      onClick={() => removeAttachment(i)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {attachError && <p className="text-xs text-health-red-fg">{attachError}</p>}
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

          {actionErrors && (
            <div className="flex items-start gap-2 rounded-lg border border-health-red-fg/30 bg-health-red-bg p-3 text-sm text-health-red-fg">
              <WarningCircle className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 break-words">
                <p>The AI tried to make a change, but it didn't check out:</p>
                <ul className="mt-1 list-disc pl-4">
                  {actionErrors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {proposals && answeredQuestion && <ActionProposalPanel proposals={proposals} question={answeredQuestion} />}

          {answeredQuestion && filters && (
            <div className="flex flex-col gap-3">
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">
                  "{answeredQuestion}" →{" "}
                  <span className="font-medium text-foreground">{describeFilters(filters)}</span>
                </p>
              </div>

              {answerText && <p className="text-sm leading-relaxed">{answerText}</p>}
              {answerError && <p className="text-xs text-muted-foreground">Couldn't write a summary: {answerError}</p>}

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
              {(rawResponse || answerSentText) && (
                <details className="rounded-lg border border-border/60 text-xs">
                  <summary className="cursor-pointer px-3 py-2 font-medium text-muted-foreground select-none">What was sent and returned</summary>
                  <div className="max-h-56 overflow-auto border-t border-border/60 p-3">
                    {rawResponse && (
                      <>
                        <p className="mb-1 font-medium text-muted-foreground">Filter model's raw response</p>
                        <pre className="mb-3 font-mono whitespace-pre-wrap text-muted-foreground">{rawResponse}</pre>
                      </>
                    )}
                    {answerSentText && (
                      <>
                        <p className="mb-1 font-medium text-muted-foreground">Sent for the written answer</p>
                        <pre className="font-mono whitespace-pre-wrap text-muted-foreground">{answerSentText}</pre>
                      </>
                    )}
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
