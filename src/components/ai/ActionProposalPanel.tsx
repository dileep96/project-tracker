import { useState } from "react";
import { CheckCircle, CircleNotch, WarningCircle, XCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ValidatedProposal } from "@/lib/ai/actions";

type ProposalStatus = "pending" | "executing" | "done" | "error" | "discarded";

/**
 * Step 4 of "propose, validate, confirm, execute" — the human gate. Every proposal here already
 * passed actions.ts's validation against real data; nothing executes until this component's own
 * Approve button is clicked. Each proposal tracks its own status independently so approving one
 * from a multi-proposal request doesn't block or reset the others.
 */
export function ActionProposalPanel({ proposals, question }: { proposals: ValidatedProposal[]; question: string }) {
  const [statuses, setStatuses] = useState<Record<string, { status: ProposalStatus; error?: string }>>(() =>
    Object.fromEntries(proposals.map((p) => [p.id, { status: "pending" as ProposalStatus }]))
  );
  const [confirmTexts, setConfirmTexts] = useState<Record<string, string>>({});

  async function approve(proposal: ValidatedProposal) {
    setStatuses((prev) => ({ ...prev, [proposal.id]: { status: "executing" } }));
    try {
      await proposal.execute();
      setStatuses((prev) => ({ ...prev, [proposal.id]: { status: "done" } }));
    } catch (err) {
      setStatuses((prev) => ({ ...prev, [proposal.id]: { status: "error", error: err instanceof Error ? err.message : "Something went wrong." } }));
    }
  }

  function discard(proposal: ValidatedProposal) {
    setStatuses((prev) => ({ ...prev, [proposal.id]: { status: "discarded" } }));
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        "{question}" → the AI proposed {proposals.length} change{proposals.length === 1 ? "" : "s"}. Nothing happens until you approve each one.
      </p>
      <div className="flex flex-col gap-2">
        {proposals.map((proposal, index) => {
          const state = statuses[proposal.id];
          return (
            <div
              key={proposal.id}
              className="animate-in rounded-lg border border-border bg-card p-3 fade-in-0 slide-in-from-bottom-1 duration-300 fill-mode-backwards"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <p className="text-sm">{proposal.summary}</p>
              {proposal.diff && proposal.diff.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                  {proposal.diff.map((d) => (
                    <li key={d.field}>
                      <span className="font-medium text-foreground">{d.field}:</span> {d.before} → {d.after}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex flex-col gap-1.5">
                {state.status === "pending" && proposal.requiresTypedConfirm && (
                  <>
                    <p className="flex items-center gap-1.5 text-xs text-health-red-fg">
                      <WarningCircle className="size-3.5 shrink-0" /> This can't be undone. Type "{proposal.requiresTypedConfirm}" to confirm.
                    </p>
                    <div className="flex items-center gap-2">
                      <Input
                        value={confirmTexts[proposal.id] ?? ""}
                        onChange={(e) => setConfirmTexts((prev) => ({ ...prev, [proposal.id]: e.target.value }))}
                        placeholder={proposal.requiresTypedConfirm}
                        className="h-8 max-w-xs text-xs"
                        aria-label={`Type "${proposal.requiresTypedConfirm}" to confirm deletion`}
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={confirmTexts[proposal.id] !== proposal.requiresTypedConfirm}
                        onClick={() => approve(proposal)}
                      >
                        <CheckCircle /> Delete
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => discard(proposal)}>
                        <XCircle /> Discard
                      </Button>
                    </div>
                  </>
                )}
                {state.status === "pending" && !proposal.requiresTypedConfirm && (
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => approve(proposal)}>
                      <CheckCircle /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => discard(proposal)}>
                      <XCircle /> Discard
                    </Button>
                  </div>
                )}
                {state.status === "executing" && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CircleNotch className="size-3.5 shrink-0 animate-spin" /> Applying…
                  </span>
                )}
                {state.status === "done" && (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-health-green-fg animate-in fade-in-0">
                    <CheckCircle className="size-3.5 shrink-0" /> Done.
                  </span>
                )}
                {state.status === "discarded" && <span className="text-xs text-muted-foreground">Discarded — nothing changed.</span>}
                {state.status === "error" && (
                  <span className="flex items-center gap-1.5 text-xs text-health-red-fg">
                    <WarningCircle className="size-3.5 shrink-0" /> {state.error}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
