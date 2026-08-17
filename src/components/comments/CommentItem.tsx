import { useState } from "react";
import { PencilSimple, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { deleteComment, updateComment } from "@/lib/queries/comments";
import type { Comment } from "@/lib/db";

const timeFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function CommentItem({ comment }: { comment: Comment }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function saveEdit() {
    const value = draft.trim();
    if (!value) return;
    await updateComment(comment.id, value);
    setEditing(false);
  }

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border p-2.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{comment.author}</span>
        <span className="font-mono text-[11px] text-muted-foreground">{timeFormatter.format(comment.createdAt)}</span>
        {comment.editedAt !== null && <span className="text-[11px] text-muted-foreground">(edited)</span>}
        <div className="ml-auto flex items-center gap-0.5">
          <Button variant="ghost" size="icon-xs" aria-label="Edit comment" onClick={() => setEditing((v) => !v)}>
            <PencilSimple />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label="Delete comment" onClick={() => setDeleteOpen(true)}>
            <Trash />
          </Button>
        </div>
      </div>
      {editing ? (
        <div className="flex flex-col gap-1.5">
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} autoFocus />
          <div className="flex justify-end gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(comment.body);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={saveEdit}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm">{comment.body}</p>
      )}
      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this comment?"
        description="This permanently deletes the comment. This can't be undone."
        onConfirm={() => deleteComment(comment.id)}
      />
    </div>
  );
}
