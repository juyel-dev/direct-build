import { type ReactNode } from "react";
import { GlassLabel } from "@/components/glass/GlassInput";
import {
  ExclamationTriangleIcon,
  CheckCircleIcon,
  BeakerIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { GlassButton } from "@/components/glass/GlassButton";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { type TestResult } from "@/lib/test-connections";

export type SheetKey = "supabase" | "facebook" | "llm" | "image" | "brand" | null;

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <GlassLabel>{label}</GlassLabel>
        {hint && (
          <span className="text-[10px] text-muted-foreground/70 normal-case truncate">{hint}</span>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function TestRow({ label, run }: { label: string; run: () => Promise<TestResult> }) {
  const [state, setState] = useState<TestResult | "running" | null>(null);
  const isRunning = state === "running";
  const obj = typeof state === "object" && state !== null ? state : null;
  return (
    <div className="flex flex-col gap-1.5">
      <GlassButton
        size="sm"
        variant="subtle"
        loading={isRunning}
        onClick={async () => {
          setState("running");
          setState(await run());
        }}
        className="w-full justify-center sm:w-auto"
      >
        <BeakerIcon className="h-3.5 w-3.5" /> {label}
      </GlassButton>
      {obj && (
        <p
          className={cn(
            "text-[11px] leading-snug break-words",
            obj.ok ? "text-success" : "text-destructive",
          )}
        >
          {obj.ok ? "✓ " : "✗ "}
          {obj.detail}
        </p>
      )}
    </div>
  );
}

export function SaveBar({
  onSave,
  onClose,
  saving,
  error,
  saved,
  label = "Save",
}: {
  onSave: () => void;
  onClose: () => void;
  saving?: boolean;
  error?: string | null;
  saved?: boolean;
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p className="text-xs text-destructive flex items-start gap-1.5">
          <ExclamationTriangleIcon className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <GlassButton variant="ghost" onClick={onClose} className="flex-1 sm:flex-none">
          Close
        </GlassButton>
        <GlassButton variant="primary" loading={saving} onClick={onSave} className="flex-1">
          {saved ? (
            <>
              <CheckCircleIcon className="h-4 w-4" /> Saved
            </>
          ) : (
            label
          )}
        </GlassButton>
      </div>
    </div>
  );
}

export function StatusStrip({
  status,
}: {
  status: { supabase: boolean; facebook: boolean; llm: boolean; image: boolean; setup: boolean };
}) {
  const items = [
    { k: "Supabase", ok: status.supabase },
    { k: "AI", ok: status.llm },
    { k: "Image", ok: status.image },
    { k: "Facebook", ok: status.facebook },
    { k: "Setup", ok: status.setup },
  ];
  return (
    <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((i) => (
        <span
          key={i.k}
          className={cn(
            "shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium",
            i.ok
              ? "bg-success/10 border-success/30 text-success"
              : "bg-white/5 border-white/10 text-muted-foreground",
          )}
        >
          {i.ok ? (
            <CheckCircleIcon className="h-3 w-3" />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
          )}
          {i.k}
        </span>
      ))}
    </div>
  );
}

export function SectionRow({
  icon,
  title,
  subtitle,
  ok,
  optional,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  ok: boolean;
  optional?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group glass rounded-2xl p-4 text-left transition-all",
        "hover:bg-white/[0.08] active:scale-[0.99]",
        "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3",
      )}
    >
      <div
        className={cn(
          "grid h-10 w-10 place-items-center rounded-xl shrink-0",
          ok
            ? "bg-success/10 text-success border border-success/30"
            : "bg-white/5 border border-white/10 text-muted-foreground",
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold truncate">{title}</span>
          {optional && !ok && (
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
              optional
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
      </div>
      <ChevronRightIcon className="h-5 w-5 text-muted-foreground/60 shrink-0 group-hover:translate-x-0.5 transition-transform" />
    </button>
  );
}
