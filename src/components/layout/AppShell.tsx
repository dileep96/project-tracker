import { useEffect, useState } from "react";
import { List, MagnifyingGlass } from "@phosphor-icons/react";
import { Outlet, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Logo } from "@/components/layout/Logo";
import { NavList } from "@/components/layout/NavList";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { RunningTimerBar } from "@/components/timer/RunningTimerBar";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { CommandPalette } from "@/components/search/CommandPalette";
import { TaskDetailSheet } from "@/components/tasks/TaskDetailSheet";
import type { NotificationItem } from "@/lib/analytics/notifications";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent);

export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  // A single global task-open slot for search results and notification click-throughs, kept
  // separate from the page-local `openTaskId` state most pages (ProjectDetailPage, RisksPage, ...)
  // already manage for their own in-page task rows. Both can theoretically be open at once (e.g.
  // a task opened from a project's own table, then a different one opened via Cmd+K) — a known,
  // narrow edge case rather than a full global-modal-state refactor; see AGENTS.md.
  const [globalTaskId, setGlobalTaskId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function openNotification(item: NotificationItem) {
    if (item.taskId) setGlobalTaskId(item.taskId);
    else navigate(`/projects/${item.projectId}`);
  }

  return (
    <div className="flex min-h-[100dvh] bg-background">
      {/* Desktop: persistent sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex items-center gap-2 px-4 py-4">
          <Logo />
          <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
            Project Tracker
          </span>
        </div>
        <div className="px-3">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar px-2.5 py-1.5 text-left text-xs text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/60"
          >
            <MagnifyingGlass className="size-3.5 shrink-0" />
            <span className="flex-1">Search…</span>
            <kbd className="rounded border border-sidebar-border px-1 font-mono text-[10px]">{isMac ? "⌘K" : "Ctrl K"}</kbd>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <NavList />
        </div>
        <div className="flex items-center justify-between border-t border-sidebar-border px-4 py-3">
          <span className="text-xs text-muted-foreground">Local &amp; private</span>
          <div className="flex items-center gap-0.5">
            <NotificationBell onOpenNotification={openNotification} />
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Mobile: top bar + drawer */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="text-sm font-semibold tracking-tight">Project Tracker</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Search" onClick={() => setCommandOpen(true)}>
              <MagnifyingGlass />
            </Button>
            <NotificationBell onOpenNotification={openNotification} />
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Open navigation menu"
              onClick={() => setMobileNavOpen(true)}
            >
              <List />
            </Button>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <RunningTimerBar />
          <Outlet />
        </main>
      </div>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="border-b border-border">
            <SheetTitle className="flex items-center gap-2 text-sm">
              <Logo />
              Project Tracker
            </SheetTitle>
          </SheetHeader>
          <div className="px-3 py-2">
            <NavList onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onOpenTask={setGlobalTaskId}
        onOpenProject={(projectId) => navigate(`/projects/${projectId}`)}
      />
      <TaskDetailSheet taskId={globalTaskId} onClose={() => setGlobalTaskId(null)} />
    </div>
  );
}
