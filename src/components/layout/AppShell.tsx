import { useState } from "react";
import { List } from "@phosphor-icons/react";
import { Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Logo } from "@/components/layout/Logo";
import { NavList } from "@/components/layout/NavList";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { RunningTimerBar } from "@/components/timer/RunningTimerBar";

export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <NavList />
        </div>
        <div className="flex items-center justify-between border-t border-sidebar-border px-4 py-3">
          <span className="text-xs text-muted-foreground">Local &amp; private</span>
          <ThemeToggle />
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
    </div>
  );
}
