import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  HomeIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  Bars3Icon,
  XMarkIcon,
  SparklesIcon,
  LockClosedIcon,
  LockOpenIcon,
} from "@heroicons/react/24/outline";
import { GlassButton } from "@/components/glass/GlassButton";
import { cn } from "@/lib/utils";
import { clearSessionPassphrase, getSessionPassphrase, hasStoredSecrets } from "@/lib/config-store";
import { invalidateUserSupabase } from "@/lib/user-supabase";

const NAV = [
  { to: "/", label: "Dashboard", icon: HomeIcon },
  { to: "/schedule", label: "Schedule", icon: CalendarDaysIcon },
  { to: "/analytics", label: "Analytics", icon: ChartBarIcon },
  { to: "/settings", label: "Settings", icon: Cog6ToothIcon },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [unlocked, setUnlocked] = useState<boolean>(false);
  const [hasSecrets, setHasSecrets] = useState<boolean>(false);

  useEffect(() => {
    setUnlocked(!!getSessionPassphrase());
    setHasSecrets(hasStoredSecrets());
  }, [pathname]);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-40">
        <div className="glass border-b border-white/10 backdrop-saturate-150">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="relative h-8 w-8 rounded-xl bg-gradient-to-br from-[oklch(0.82_0.16_195)] to-[oklch(0.70_0.18_320)] grid place-items-center shadow-[0_4px_20px_-4px_color-mix(in_oklab,var(--primary)_60%,transparent)]">
                <SparklesIcon className="h-4.5 w-4.5 text-black/70" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-semibold tracking-tight">Aurora</span>
                <span className="text-[10px] text-muted-foreground -mt-0.5">Facebook AI Autopilot</span>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              {hasSecrets && (
                <button
                  className={cn(
                    "hidden sm:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border",
                    unlocked
                      ? "bg-success/10 border-success/30 text-success"
                      : "bg-warning/10 border-warning/30 text-warning",
                  )}
                  onClick={() => {
                    if (unlocked) {
                      clearSessionPassphrase();
                      invalidateUserSupabase();
                      setUnlocked(false);
                    }
                  }}
                  title={unlocked ? "Click to lock" : "Locked — enter passphrase in Settings"}
                >
                  {unlocked ? <LockOpenIcon className="h-3 w-3" /> : <LockClosedIcon className="h-3 w-3" />}
                  {unlocked ? "Unlocked" : "Locked"}
                </button>
              )}
              <GlassButton
                variant="secondary"
                size="icon"
                onClick={() => setOpen(true)}
                aria-label="Open menu"
              >
                <Bars3Icon className="h-5 w-5" />
              </GlassButton>
            </div>
          </div>
        </div>
      </header>

      {/* Drawer */}
      {open && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute right-0 top-0 h-full w-[300px] glass-strong border-l border-white/15 p-5 animate-in slide-in-from-right">
            <div className="mb-6 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Menu</span>
              <GlassButton variant="ghost" size="icon" onClick={() => setOpen(false)}>
                <XMarkIcon className="h-5 w-5" />
              </GlassButton>
            </div>
            <nav className="flex flex-col gap-1">
              {NAV.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to));
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                      active
                        ? "bg-white/10 text-foreground shadow-[inset_0_1px_0_oklch(1_0_0_/_0.10)]"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                    )}
                  >
                    <Icon className={cn("h-5 w-5", active ? "text-primary" : "")} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="absolute bottom-5 left-5 right-5 text-[11px] text-muted-foreground/70">
              <p>BYOB · BYOK · No accounts.</p>
              <p className="mt-1 opacity-70">Your keys, your Supabase, your data.</p>
            </div>
          </aside>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 md:py-10">{children}</main>
    </div>
  );
}
