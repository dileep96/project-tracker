import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Card grid span — most charts are full-width on a dashboard, some pair up. */
  span?: "full" | "half";
}

/** Consistent Card framing for every dashboard chart — title/description/action header, content below. Keeps every chart in the same visual register instead of each one improvising its own card. */
export function ChartCard({ title, description, action, children, className, span = "full" }: ChartCardProps) {
  return (
    <Card className={cn(span === "full" ? "col-span-full" : "col-span-full lg:col-span-1", className)}>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription className="mt-0.5">{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** A calm, honest placeholder for sparse-data states — never a broken-looking blank chart. */
export function ChartEmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-10 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
