/**
 * A chat-style "thinking" indicator — three dots, staggered bounce. Used anywhere the app is
 * waiting on a model response (currently just /ask) instead of a bare disabled button with no
 * other feedback. `motion-reduce:` drops the animation to a static dot for anyone with reduced-
 * motion preferences, per this app's own accessibility bar elsewhere (focus rings, aria labels).
 */
export function TypingIndicator() {
  return (
    <div role="status" aria-label="Thinking" className="flex w-fit items-center gap-1 rounded-lg border border-border bg-card px-3 py-2.5">
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 motion-reduce:animate-none [animation-delay:-0.3s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 motion-reduce:animate-none [animation-delay:-0.15s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 motion-reduce:animate-none" />
    </div>
  );
}
