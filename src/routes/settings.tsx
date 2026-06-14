import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { SettingsHub } from "@/features/settings/SettingsHub";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Aurora" },
      { name: "description", content: "Configure your Supabase project, AI providers, brand voice, and run setup." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <AppShell>
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Configure</p>
        <h1 className="mt-1 text-3xl font-display font-medium gradient-text">Settings</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Bring your own Supabase, AI provider, and Facebook page. Everything is encrypted locally.
        </p>
      </div>
      <SettingsHub />
    </AppShell>
  );
}
