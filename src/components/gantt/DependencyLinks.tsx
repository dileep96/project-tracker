export interface LinkEndpoint {
  /** Right edge of the predecessor's bar / marker, and left edge of the successor's — in pixels, relative to the same container this SVG is absolutely positioned over. */
  startX: number;
  endX: number;
  y: number;
}

export interface GanttLink {
  predecessorId: string;
  successorId: string;
  critical: boolean;
}

/**
 * Absolute-positioned SVG overlay drawing one S-curve per dependency edge, from the
 * predecessor bar's right edge to the successor bar's left edge. A cubic bezier (rather than an
 * orthogonal elbow) draws cleanly regardless of whether the successor's bar actually starts
 * after the predecessor's ends — real user-entered dates don't always agree with the dependency
 * order, and this never needs special-casing for that.
 */
export function DependencyLinks({ links, endpoints }: { links: GanttLink[]; endpoints: Record<string, LinkEndpoint> }) {
  const renderable = links.filter((l) => endpoints[l.predecessorId] && endpoints[l.successorId]);
  if (renderable.length === 0) return null;

  return (
    <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible" aria-hidden="true">
      <defs>
        <marker id="gantt-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 Z" className="fill-muted-foreground/50" />
        </marker>
        <marker id="gantt-arrow-critical" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 Z" className="fill-destructive" />
        </marker>
      </defs>
      {renderable.map((link, i) => {
        const from = endpoints[link.predecessorId];
        const to = endpoints[link.successorId];
        const bend = Math.max(24, Math.abs(to.startX - from.endX) / 2);
        const d = `M ${from.endX} ${from.y} C ${from.endX + bend} ${from.y}, ${to.startX - bend} ${to.y}, ${to.startX} ${to.y}`;
        return (
          <path
            key={`${link.predecessorId}->${link.successorId}-${i}`}
            d={d}
            fill="none"
            className={link.critical ? "stroke-destructive" : "stroke-muted-foreground/40"}
            strokeWidth={link.critical ? 2 : 1.5}
            markerEnd={`url(#${link.critical ? "gantt-arrow-critical" : "gantt-arrow"})`}
          />
        );
      })}
    </svg>
  );
}
