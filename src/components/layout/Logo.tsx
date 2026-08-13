import { cn } from "@/lib/utils";

/** Simple geometric monogram — a rounded square with a checkmark. Single-color, theme-aware via currentColor. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn("size-6 shrink-0 text-primary", className)}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="9" className="fill-current" />
      <path
        d="M9 16.5L13.5 21L23 10.5"
        stroke="var(--primary-foreground)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
