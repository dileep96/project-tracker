import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CommentItem } from "@/components/comments/CommentItem";
import { useCommentsForEntity } from "@/hooks/use-comments";
import { usePeople } from "@/hooks/use-people";
import { createComment } from "@/lib/queries/comments";
import type { CommentEntityType } from "@/lib/db";

/** Remembers the last author name typed, purely a convenience so a single-user session doesn't retype it every comment — not an identity/auth mechanism (see AGENTS.md: author is free text, same as `Task.assignee`). */
const LAST_AUTHOR_KEY = "pt:lastCommentAuthor";

export function CommentsPanel({ entityType, entityId }: { entityType: CommentEntityType; entityId: string }) {
  const comments = useCommentsForEntity(entityId);
  const people = usePeople();
  const authorListId = useId();

  const [author, setAuthor] = useState(() => localStorage.getItem(LAST_AUTHOR_KEY) ?? "");
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  async function submit() {
    const trimmedBody = body.trim();
    if (!trimmedBody) return;
    setPosting(true);
    try {
      await createComment({ entityType, entityId, author, body: trimmedBody });
      localStorage.setItem(LAST_AUTHOR_KEY, author.trim());
      setBody("");
      toast.success("Comment posted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't post comment");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="comment-author">Your name</Label>
          <Input
            id="comment-author"
            list={authorListId}
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Anonymous"
          />
          <datalist id={authorListId}>
            {(people ?? []).map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="comment-body">Comment</Label>
          <Textarea
            id="comment-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Add a comment…"
          />
        </div>
        <Button size="sm" className="w-fit self-end" disabled={!body.trim() || posting} onClick={submit}>
          Post comment
        </Button>
      </div>

      {(comments ?? []).length === 0 ? (
        <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
          No comments yet. Start the conversation.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {[...comments!].reverse().map((c) => (
            <CommentItem key={c.id} comment={c} />
          ))}
        </div>
      )}
    </div>
  );
}
