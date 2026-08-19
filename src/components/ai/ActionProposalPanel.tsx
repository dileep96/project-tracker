import { useState } from "react";
import { CheckCircle, WarningCircle, XCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
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
        {proposals.map((proposal) => {
          const state = statuses[proposal.id];
          return (
            <div key={proposal.id} className="rounded-lg border border-border bg-card p-3">
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
              <div className="mt-2 flex items-center gap-2">
                {state.status === "pending" && (
                  <>
                    <Button size="sm" onClick={() => approve(proposal)}>
                      <CheckCircle /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => discard(proposal)}>
                      <XCircle /> Discard
                    </Button>
                  </>
                )}
                {state.status === "executing" && <span className="text-xs text-muted-foreground">Applying…</span>}
                {state.status === "done" && <span className="text-xs font-medium text-health-green-fg">Done.</span>}
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
