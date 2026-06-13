import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { SecretsTab } from "@/features/settings/SecretsTab";
import { ProvidersTab } from "@/features/settings/ProvidersTab";
import { BrandTab } from "@/features/settings/BrandTab";
import { SetupTab } from "@/features/settings/SetupTab";
import { DangerTab } from "@/features/settings/DangerTab";
import { cn } from "@/lib/utils";
import {
  KeyIcon,
  CpuChipIcon,
  MegaphoneIcon,
  RocketLaunchIcon,
  ShieldExclamationIcon,
} from "@heroicons/react/24/outline";

type Tab = "secrets" | "providers" | "brand" | "setup" | "danger";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Aurora" }, { name: "description", content: "Configure your Supabase project, AI providers, brand voice, and run setup." }] }),
  component: SettingsPage,
});

const TABS: { key: Tab; label: string; icon: typeof KeyIcon }[] = [
  { key: "secrets", label: "Secrets", icon: KeyIcon },
  { key: "providers", label: "Providers", icon: CpuChipIcon },
  { key: "brand", label: "Brand & Windows", icon: MegaphoneIcon },
  { key: "setup", label: "Run Setup", icon: RocketLaunchIcon },
  { key: "danger", label: "Danger Zone", icon: ShieldExclamationIcon },
];

function SettingsPage() {
  const initial = (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab")) as Tab | null;
  const [tab, setTab] = useState<Tab>(initial && TABS.some((t) => t.key === initial) ? initial : "secrets");

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Configure</p>
        <h1 className="mt-1 text-3xl md:text-4xl font-display font-medium gradient-text">Settings</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside>
          <nav className="glass rounded-2xl p-2 flex lg:flex-col gap-1 overflow-x-auto">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "shrink-0 flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-all text-left",
                    active
                      ? "bg-white/10 text-foreground shadow-[inset_0_1px_0_oklch(1_0_0_/_0.10)]"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0">
          {tab === "secrets" && <SecretsTab />}
          {tab === "providers" && <ProvidersTab />}
          {tab === "brand" && <BrandTab />}
          {tab === "setup" && <SetupTab />}
          {tab === "danger" && <DangerTab />}
        </div>
      </div>
    </AppShell>
  );
}
