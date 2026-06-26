import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  loadSecrets,
  saveSecrets,
  SecretsSchema,
  hasStoredSecrets,
  getSessionPassphrase,
  setSessionPassphrase,
  loadProviders,
  saveProviders,
  ProvidersSchema,
  loadBrand,
  saveBrand,
  BrandSchema,
  loadInstallStatus,
  InstallStatusSchema,
  wipeAll,
  projectRefFromUrl,
  type Secrets,
  type Providers,
  type Brand,
} from "@/lib/config-store";
import { GlassCard } from "@/components/glass/GlassCard";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput, GlassLabel, GlassTextarea } from "@/components/glass/GlassInput";
import { SecretInput } from "@/components/glass/SecretInput";
import { BottomSheet } from "@/components/glass/BottomSheet";
import {
  testSupabaseRest,
  testSupabaseServiceRole,
  testManagementApi,
  testFacebook,
  testLLM,
  type TestResult,
} from "@/lib/test-connections";
import { runSetup, type SetupStep } from "@/lib/setup-runner";
import { invalidateUserSupabase } from "@/lib/user-supabase";
import { classifySupabaseKey } from "@/lib/supabase-keys";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  ChevronRightIcon,
  CircleStackIcon,
  GlobeAltIcon,
  CpuChipIcon,
  PhotoIcon,
  MegaphoneIcon,
  PlayIcon,
  ArrowPathIcon,
  TrashIcon,
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  BeakerIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";

const EMPTY_SECRETS: Secrets = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  supabaseServiceKey: "",
  supabasePAT: "",
  facebookPageToken: "",
  facebookPageId: "",
  aiApiKey: "",
  imageApiKey: "",
};

type SheetKey = "supabase" | "facebook" | "llm" | "image" | "brand" | null;

export function SettingsHub() {
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [pass, setPass] = useState("");
  const [unlockErr, setUnlockErr] = useState<string | null>(null);

  const [secrets, setSecrets] = useState<Secrets>(EMPTY_SECRETS);
  const [providers, setProviders] = useState<Providers>(() =>
    ProvidersSchema.parse({
      llm: {
        type: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        model: "meta-llama/llama-3.3-70b-instruct:free",
      },
      image: { type: "pollinations", baseUrl: "", model: "flux" },
    }),
  );
  const [brand, setBrand] = useState<Brand>(() => BrandSchema.parse({}));
  const [installStatus, setInstallStatus] = useState(() => InstallStatusSchema.parse({}));

  const [sheet, setSheet] = useState<SheetKey>(null);

  useEffect(() => {
    (async () => {
      setProviders(loadProviders());
      setBrand(loadBrand());
      setInstallStatus(loadInstallStatus());
      if (!hasStoredSecrets()) return;
      const sp = getSessionPassphrase();
      if (!sp) {
        setNeedsUnlock(true);
        return;
      }
      const s = await loadSecrets(sp);
      if (s) setSecrets(s);
      else setNeedsUnlock(true);
    })();
  }, []);

  async function tryUnlock() {
    setUnlockErr(null);
    if (pass.length < 1) return;
    const s = await loadSecrets(pass);
    if (!s) {
      setUnlockErr("Wrong passphrase.");
      return;
    }
    setSessionPassphrase(pass);
    setSecrets(s);
    setNeedsUnlock(false);
    setPass("");
  }

  async function persistSecrets(next: Secrets): Promise<{ ok: boolean; err?: string }> {
    const parsed = SecretsSchema.safeParse(next);
    if (!parsed.success) {
      return {
        ok: false,
        err: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" · "),
      };
    }
    let p = getSessionPassphrase();
    if (!p) {
      const fresh = pass.trim();
      if (fresh.length < 8) return { ok: false, err: "Set an 8+ character passphrase to encrypt." };
      p = fresh;
    }
    try {
      await saveSecrets(parsed.data, p);
      setSecrets(parsed.data);
      invalidateUserSupabase();
      return { ok: true };
    } catch (e) {
      return { ok: false, err: e instanceof Error ? e.message : String(e) };
    }
  }

  // Computed status
  const status = useMemo(
    () => ({
      supabase: !!(
        secrets.supabaseUrl &&
        secrets.supabaseAnonKey &&
        secrets.supabaseServiceKey &&
        secrets.supabasePAT
      ),
      facebook: !!(secrets.facebookPageId && secrets.facebookPageToken),
      llm: !!(
        providers.llm.model &&
        (providers.llm.type === "ollama" || providers.llm.type === "lm_studio" || secrets.aiApiKey)
      ),
      image: !!providers.image.model,
      setup:
        installStatus.schemaVersion > 0 &&
        installStatus.storageBucketReady &&
        installStatus.edgeFunctionsReady,
    }),
    [secrets, providers, installStatus],
  );

  if (needsUnlock) {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-warning/10 border border-warning/30 text-warning">
            <LockClosedIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Unlock your vault</h2>
            <p className="text-xs text-muted-foreground">
              Your credentials are encrypted in this browser.
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="min-w-0 flex-1">
            <GlassInput
              type="password"
              placeholder="Passphrase"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
              autoFocus
            />
          </div>
          <GlassButton variant="primary" onClick={tryUnlock}>
            Unlock
          </GlassButton>
        </div>
        {unlockErr && <p className="mt-3 text-sm text-destructive">{unlockErr}</p>}
      </GlassCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <StatusStrip status={status} />

      <SectionRow
        icon={<CircleStackIcon className="h-5 w-5" />}
        title="Supabase project"
        subtitle={
          secrets.supabaseUrl
            ? `${projectRefFromUrl(secrets.supabaseUrl) ?? secrets.supabaseUrl}`
            : "Add URL, anon key, service key, PAT"
        }
        ok={status.supabase}
        onClick={() => setSheet("supabase")}
      />
      <SectionRow
        icon={<GlobeAltIcon className="h-5 w-5" />}
        title="Facebook page"
        subtitle={
          secrets.facebookPageId ? `Page ${secrets.facebookPageId}` : "Optional — connect later"
        }
        ok={status.facebook}
        optional
        onClick={() => setSheet("facebook")}
      />
      <SectionRow
        icon={<CpuChipIcon className="h-5 w-5" />}
        title="LLM provider"
        subtitle={`${providers.llm.type} · ${providers.llm.model || "no model"}`}
        ok={status.llm}
        onClick={() => setSheet("llm")}
      />
      <SectionRow
        icon={<PhotoIcon className="h-5 w-5" />}
        title="Image provider"
        subtitle={`${providers.image.type} · ${providers.image.model || "no model"}`}
        ok={status.image}
        onClick={() => setSheet("image")}
      />
      <SectionRow
        icon={<MegaphoneIcon className="h-5 w-5" />}
        title="Brand voice"
        subtitle={brand.brandName || "Tone, audience, posting windows"}
        ok={!!brand.brandName}
        optional
        onClick={() => setSheet("brand")}
      />

      <SetupCard
        secrets={secrets}
        providers={providers}
        brand={brand}
        onStatus={() => setInstallStatus(loadInstallStatus())}
      />

      <DangerCard />

      {/* Sheets */}
      <SupabaseSheet
        open={sheet === "supabase"}
        onClose={() => setSheet(null)}
        secrets={secrets}
        persist={persistSecrets}
      />
      <FacebookSheet
        open={sheet === "facebook"}
        onClose={() => setSheet(null)}
        secrets={secrets}
        persist={persistSecrets}
      />
      <LLMSheet
        open={sheet === "llm"}
        onClose={() => setSheet(null)}
        providers={providers}
        apiKey={secrets.aiApiKey ?? ""}
        save={async (nextProv, nextKey) => {
          saveProviders(nextProv);
          setProviders(nextProv);
          if (nextKey !== (secrets.aiApiKey ?? "")) {
            const res = await persistSecrets({ ...secrets, aiApiKey: nextKey });
            if (!res.ok) return res;
          }
          return { ok: true };
        }}
      />
      <ImageSheet
        open={sheet === "image"}
        onClose={() => setSheet(null)}
        providers={providers}
        apiKey={secrets.imageApiKey ?? ""}
        save={async (nextProv, nextKey) => {
          saveProviders(nextProv);
          setProviders(nextProv);
          if (nextKey !== (secrets.imageApiKey ?? "")) {
            const res = await persistSecrets({ ...secrets, imageApiKey: nextKey });
            if (!res.ok) return res;
          }
          return { ok: true };
        }}
      />
      <BrandSheet
        open={sheet === "brand"}
        onClose={() => setSheet(null)}
        brand={brand}
        save={(b) => {
          saveBrand(b);
          setBrand(b);
        }}
      />
    </div>
  );
}

/* ──────────────────────────────── Status strip ──────────────────────────────── */

function StatusStrip({
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

/* ──────────────────────────────── Section row ──────────────────────────────── */

function SectionRow({
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

/* ──────────────────────────────── Sheets ──────────────────────────────── */

function TestRow({ label, run }: { label: string; run: () => Promise<TestResult> }) {
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

function SaveBar({
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

function SupabaseSheet({
  open,
  onClose,
  secrets,
  persist,
}: {
  open: boolean;
  onClose: () => void;
  secrets: Secrets;
  persist: (s: Secrets) => Promise<{ ok: boolean; err?: string }>;
}) {
  const [draft, setDraft] = useState(secrets);
  const [passphrase, setPassphrase] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(secrets);
      setSaved(false);
      setErr(null);
      setNotice(null);
    }
  }, [open, secrets]);

  const needsPass = !getSessionPassphrase();
  const ref = projectRefFromUrl(draft.supabaseUrl);

  const anonKind = classifySupabaseKey(draft.supabaseAnonKey);
  const serviceKind = classifySupabaseKey(draft.supabaseServiceKey);
  const anonWarn =
    anonKind === "service"
      ? "This looks like a service_role key. Move it to the Service role field below."
      : null;
  const serviceWarn =
    serviceKind === "anon"
      ? "This looks like an anon/publishable key. Move it to the Anon field above."
      : null;

  async function save() {
    setSaving(true);
    setErr(null);
    setNotice(null);
    let next = draft;
    // Auto-swap if user obviously put each key in the wrong field
    if (anonKind === "service" && serviceKind === "anon") {
      next = {
        ...draft,
        supabaseAnonKey: draft.supabaseServiceKey,
        supabaseServiceKey: draft.supabaseAnonKey,
      };
      setDraft(next);
      setNotice("Detected swapped keys — fixed automatically.");
    } else if (anonKind === "service" && !draft.supabaseServiceKey) {
      next = { ...draft, supabaseServiceKey: draft.supabaseAnonKey, supabaseAnonKey: "" };
      setDraft(next);
      setNotice(
        "That was a service_role key — moved it to the Service field. Paste the anon key now.",
      );
      setSaving(false);
      return;
    } else if (serviceKind === "anon" && !draft.supabaseAnonKey) {
      next = { ...draft, supabaseAnonKey: draft.supabaseServiceKey, supabaseServiceKey: "" };
      setDraft(next);
      setNotice(
        "That was an anon key — moved it to the Anon field. Paste the service_role key now.",
      );
      setSaving(false);
      return;
    }
    if (needsPass) setSessionPassphraseSafely(passphrase);
    const res = await persist(next);
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } else setErr(res.err ?? "Save failed.");
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Supabase project"
      description="Settings ▸ API in your Supabase dashboard."
      footer={
        <div className="flex flex-col gap-2">
          {notice && <p className="text-xs text-primary">{notice}</p>}
          <SaveBar onSave={save} onClose={onClose} saving={saving} saved={saved} error={err} />
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Project URL" hint={ref ? `ref: ${ref}` : ".supabase.co"}>
          <GlassInput
            placeholder="https://xxxxxxxx.supabase.co"
            value={draft.supabaseUrl}
            onChange={(e) => setDraft({ ...draft, supabaseUrl: e.target.value.trim() })}
            inputMode="url"
            autoComplete="off"
          />
        </Field>
        <Field
          label="Anon (public) key"
          hint={
            anonKind === "anon"
              ? "✓ anon key detected"
              : anonKind === "service"
                ? null
                : "JWT eyJ… or sb_publishable_…"
          }
        >
          <SecretInput
            value={draft.supabaseAnonKey}
            onChange={(v) => setDraft({ ...draft, supabaseAnonKey: v.trim() })}
            placeholder="eyJhbGc... or sb_publishable_..."
          />
          {anonWarn && (
            <p className="mt-1 text-xs text-amber-400 flex items-start gap-1">
              <ExclamationTriangleIcon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {anonWarn}
            </p>
          )}
        </Field>
        <Field
          label="Service role key"
          hint={
            serviceKind === "service"
              ? "✓ service_role key detected"
              : serviceKind === "anon"
                ? null
                : "JWT eyJ… or sb_secret_…"
          }
        >
          <SecretInput
            value={draft.supabaseServiceKey}
            onChange={(v) => setDraft({ ...draft, supabaseServiceKey: v.trim() })}
            placeholder="eyJhbGc... or sb_secret_..."
          />
          {serviceWarn && (
            <p className="mt-1 text-xs text-amber-400 flex items-start gap-1">
              <ExclamationTriangleIcon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {serviceWarn}
            </p>
          )}
        </Field>
        <Field
          label="Personal access token"
          hint={
            <a
              className="text-primary inline-flex items-center gap-0.5"
              href="https://supabase.com/dashboard/account/tokens"
              target="_blank"
              rel="noreferrer"
            >
              create one <ArrowTopRightOnSquareIcon className="h-3 w-3" />
            </a>
          }
        >
          <SecretInput
            value={draft.supabasePAT}
            onChange={(v) => setDraft({ ...draft, supabasePAT: v.trim() })}
            placeholder="sbp_..."
          />
        </Field>

        {needsPass && (
          <Field label="Encryption passphrase" hint="8+ chars, stored only in this tab">
            <GlassInput
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <TestRow label="Test Anon key" run={() => testSupabaseRest(draft)} />
          <TestRow label="Test Service role" run={() => testSupabaseServiceRole(draft)} />
          <TestRow label="Test Management API" run={() => testManagementApi(draft)} />
        </div>
      </div>
    </BottomSheet>
  );
}

function FacebookSheet({
  open,
  onClose,
  secrets,
  persist,
}: {
  open: boolean;
  onClose: () => void;
  secrets: Secrets;
  persist: (s: Secrets) => Promise<{ ok: boolean; err?: string }>;
}) {
  const [draft, setDraft] = useState({
    id: secrets.facebookPageId ?? "",
    token: secrets.facebookPageToken ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft({ id: secrets.facebookPageId ?? "", token: secrets.facebookPageToken ?? "" });
      setSaved(false);
      setErr(null);
    }
  }, [open, secrets]);

  async function save() {
    setSaving(true);
    setErr(null);
    const res = await persist({
      ...secrets,
      facebookPageId: draft.id,
      facebookPageToken: draft.token,
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } else setErr(res.err ?? "Save failed.");
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Facebook page"
      description="Page Access Token from Graph API Explorer."
      footer={<SaveBar onSave={save} onClose={onClose} saving={saving} saved={saved} error={err} />}
    >
      <div className="flex flex-col gap-4">
        <Field label="Page ID">
          <GlassInput
            value={draft.id}
            onChange={(e) => setDraft({ ...draft, id: e.target.value.trim() })}
            placeholder="1234567890"
            inputMode="numeric"
          />
        </Field>
        <Field label="Page access token">
          <SecretInput
            value={draft.token}
            onChange={(v) => setDraft({ ...draft, token: v.trim() })}
            placeholder="EAA..."
          />
        </Field>
        <TestRow
          label="Test Facebook"
          run={() => testFacebook(draft.token, draft.id || undefined)}
        />
      </div>
    </BottomSheet>
  );
}

const LLM_TYPES: [Providers["llm"]["type"], string, string][] = [
  ["openai", "OpenAI", "https://api.openai.com/v1"],
  ["openrouter", "OpenRouter", "https://openrouter.ai/api/v1"],
  ["anthropic", "Anthropic", "https://api.anthropic.com/v1"],
  ["nvidia", "NVIDIA NIM", "https://integrate.api.nvidia.com/v1"],
  ["groq", "Groq", "https://api.groq.com/openai/v1"],
  ["ollama", "Ollama (local)", "http://localhost:11434/v1"],
  ["lm_studio", "LM Studio (local)", "http://localhost:1234/v1"],
  ["custom", "Custom (OpenAI-compatible)", ""],
];

function LLMSheet({
  open,
  onClose,
  providers,
  apiKey,
  save,
}: {
  open: boolean;
  onClose: () => void;
  providers: Providers;
  apiKey: string;
  save: (p: Providers, key: string) => Promise<{ ok: boolean; err?: string }>;
}) {
  const [llm, setLlm] = useState(providers.llm);
  const [key, setKey] = useState(apiKey);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLlm(providers.llm);
      setKey(apiKey);
      setErr(null);
      setSaved(false);
    }
  }, [open, providers.llm, apiKey]);

  function pickType(t: Providers["llm"]["type"]) {
    const def = LLM_TYPES.find((x) => x[0] === t);
    setLlm({ type: t, baseUrl: llm.baseUrl || (def?.[2] ?? ""), model: llm.model });
  }

  async function persist() {
    if (!llm.model.trim()) {
      setErr("Model name is required.");
      return;
    }
    setSaving(true);
    setErr(null);
    const res = await save({ ...providers, llm }, key);
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } else setErr(res.err ?? "Save failed.");
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="LLM provider"
      description="Any OpenAI-compatible endpoint. The model name is sent verbatim."
      footer={
        <SaveBar
          onSave={persist}
          onClose={onClose}
          saving={saving}
          saved={saved}
          error={err}
          label="Save & continue"
        />
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Provider">
          <select
            value={llm.type}
            onChange={(e) => pickType(e.target.value as Providers["llm"]["type"])}
            className="glass-input w-full h-11 rounded-xl px-3 text-sm focus:outline-none focus:glass-input-focus"
          >
            {LLM_TYPES.map(([v, label]) => (
              <option key={v} value={v} className="bg-background text-foreground">
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Model name / id">
          <GlassInput
            value={llm.model}
            onChange={(e) => setLlm({ ...llm, model: e.target.value })}
            placeholder="gpt-4o-mini"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Field label="Base URL" hint="leave empty for provider default">
          <GlassInput
            value={llm.baseUrl ?? ""}
            onChange={(e) => setLlm({ ...llm, baseUrl: e.target.value.trim() })}
            placeholder="https://api.openai.com/v1"
            inputMode="url"
            autoComplete="off"
          />
        </Field>
        <Field label="API key" hint="optional for local Ollama / LM Studio">
          <SecretInput value={key} onChange={(v) => setKey(v.trim())} placeholder="sk-..." />
        </Field>
        <TestRow label="Test endpoint" run={() => testLLM({ ...providers, llm }, key)} />
      </div>
    </BottomSheet>
  );
}

const IMAGE_TYPES: [Providers["image"]["type"], string, string][] = [
  ["pollinations", "Pollinations (free)", "https://image.pollinations.ai"],
  ["replicate", "Replicate", "https://api.replicate.com"],
  ["openai_dalle", "OpenAI DALL·E", "https://api.openai.com/v1"],
  ["stability", "Stability AI", "https://api.stability.ai"],
  ["custom_http", "Custom HTTP", ""],
];

function ImageSheet({
  open,
  onClose,
  providers,
  apiKey,
  save,
}: {
  open: boolean;
  onClose: () => void;
  providers: Providers;
  apiKey: string;
  save: (p: Providers, key: string) => Promise<{ ok: boolean; err?: string }>;
}) {
  const [img, setImg] = useState(providers.image);
  const [key, setKey] = useState(apiKey);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setImg(providers.image);
      setKey(apiKey);
      setSaved(false);
      setErr(null);
    }
  }, [open, providers.image, apiKey]);

  function pickType(t: Providers["image"]["type"]) {
    const def = IMAGE_TYPES.find((x) => x[0] === t);
    setImg({ type: t, baseUrl: img.baseUrl || (def?.[2] ?? ""), model: img.model });
  }

  async function persist() {
    if (!img.model.trim()) {
      setErr("Model name is required.");
      return;
    }
    setSaving(true);
    setErr(null);
    const res = await save({ ...providers, image: img }, key);
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } else setErr(res.err ?? "Save failed.");
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Image provider"
      description="Renders the visual for each scheduled post."
      footer={
        <SaveBar
          onSave={persist}
          onClose={onClose}
          saving={saving}
          saved={saved}
          error={err}
          label="Save & continue"
        />
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Provider">
          <select
            value={img.type}
            onChange={(e) => pickType(e.target.value as Providers["image"]["type"])}
            className="glass-input w-full h-11 rounded-xl px-3 text-sm focus:outline-none focus:glass-input-focus"
          >
            {IMAGE_TYPES.map(([v, label]) => (
              <option key={v} value={v} className="bg-background text-foreground">
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Model name / id">
          <GlassInput
            value={img.model}
            onChange={(e) => setImg({ ...img, model: e.target.value })}
            placeholder="flux"
            autoComplete="off"
          />
        </Field>
        <Field label="Base URL" hint="optional">
          <GlassInput
            value={img.baseUrl ?? ""}
            onChange={(e) => setImg({ ...img, baseUrl: e.target.value.trim() })}
            placeholder=""
            inputMode="url"
            autoComplete="off"
          />
        </Field>
        <Field label="API key" hint="optional for Pollinations">
          <SecretInput value={key} onChange={(v) => setKey(v.trim())} placeholder="..." />
        </Field>
      </div>
    </BottomSheet>
  );
}

function BrandSheet({
  open,
  onClose,
  brand,
  save,
}: {
  open: boolean;
  onClose: () => void;
  brand: Brand;
  save: (b: Brand) => void;
}) {
  const [draft, setDraft] = useState(brand);
  const [topicDraft, setTopicDraft] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(brand);
      setSaved(false);
    }
  }, [open, brand]);

  function addTopic() {
    const t = topicDraft.trim();
    if (!t) return;
    setDraft({ ...draft, topics: [...new Set([...draft.topics, t])] });
    setTopicDraft("");
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Brand voice & schedule"
      footer={
        <SaveBar
          onSave={() => {
            save(draft);
            setSaved(true);
            setTimeout(() => setSaved(false), 1400);
          }}
          onClose={onClose}
          saved={saved}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Brand name">
          <GlassInput
            value={draft.brandName}
            onChange={(e) => setDraft({ ...draft, brandName: e.target.value })}
            placeholder="Aurora Coffee Co."
          />
        </Field>
        <Field label="Voice & tone">
          <GlassTextarea
            value={draft.voice}
            onChange={(e) => setDraft({ ...draft, voice: e.target.value })}
            placeholder="Warm, knowledgeable, never salesy."
          />
        </Field>
        <Field label="Audience">
          <GlassTextarea
            value={draft.audience}
            onChange={(e) => setDraft({ ...draft, audience: e.target.value })}
            placeholder="Specialty-coffee enthusiasts, 25-45."
          />
        </Field>
        <Field label="Topics">
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <GlassInput
                value={topicDraft}
                onChange={(e) => setTopicDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTopic())}
                placeholder="Add a topic"
              />
            </div>
            <GlassButton variant="subtle" onClick={addTopic}>
              <PlusIcon className="h-4 w-4" />
            </GlassButton>
          </div>
          {draft.topics.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {draft.topics.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full bg-white/8 border border-white/15 px-2.5 py-1 text-xs"
                >
                  {t}
                  <button
                    onClick={() =>
                      setDraft({ ...draft, topics: draft.topics.filter((x) => x !== t) })
                    }
                  >
                    <XMarkIcon className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </Field>
        <Field label="Posting mode">
          <select
            value={draft.postingMode}
            onChange={(e) =>
              setDraft({ ...draft, postingMode: e.target.value as Brand["postingMode"] })
            }
            className="glass-input w-full h-11 rounded-xl px-3 text-sm focus:outline-none focus:glass-input-focus"
          >
            <option value="manual" className="bg-background">
              Manual — approve every post
            </option>
            <option value="hybrid" className="bg-background">
              Hybrid
            </option>
            <option value="full_auto" className="bg-background">
              Full auto
            </option>
          </select>
        </Field>
        <Field label="Max posts / day">
          <GlassInput
            type="number"
            min={1}
            max={10}
            value={draft.maxPostsPerDay}
            onChange={(e) =>
              setDraft({
                ...draft,
                maxPostsPerDay: Math.max(1, Math.min(10, Number(e.target.value) || 1)),
              })
            }
          />
        </Field>
      </div>
    </BottomSheet>
  );
}

/* ──────────────────────────────── Setup runner ──────────────────────────────── */

function SetupCard({
  secrets,
  providers,
  brand,
  onStatus,
}: {
  secrets: Secrets;
  providers: Providers;
  brand: Brand;
  onStatus: () => void;
}) {
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function start() {
    setErr(null);
    setDone(false);
    setSteps([]);
    if (!secrets.supabaseUrl || !secrets.supabasePAT) {
      setErr("Add your Supabase URL and PAT first.");
      return;
    }
    setRunning(true);
    const result = await runSetup(secrets, providers, brand, (step) => {
      setSteps((prev) => {
        const idx = prev.findIndex((p) => p.key === step.key);
        if (idx === -1) return [...prev, step];
        const next = prev.slice();
        next[idx] = step;
        return next;
      });
    });
    setRunning(false);
    onStatus();
    if (result.ok) setDone(true);
    else setErr(result.error ?? "Setup failed.");
  }

  return (
    <GlassCard className="p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <PlayIcon className="h-4 w-4 text-primary" /> Run setup
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Provisions schema, RLS, RPCs, storage bucket and project secrets. Idempotent.
          </p>
        </div>
        <GlassButton variant="primary" loading={running} onClick={start} className="shrink-0">
          {steps.length === 0 ? (
            <PlayIcon className="h-4 w-4" />
          ) : (
            <ArrowPathIcon className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">{steps.length === 0 ? "Run setup" : "Re-run"}</span>
        </GlassButton>
      </div>

      {steps.length > 0 && (
        <ol className="space-y-1.5 mt-2">
          {steps.map((s) => (
            <li
              key={s.key}
              className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-2.5 items-start"
            >
              <span className="mt-1">
                {s.status === "running" && (
                  <span className="block h-2 w-2 rounded-full bg-primary animate-pulse" />
                )}
                {s.status === "done" && <CheckCircleIcon className="h-4 w-4 text-success" />}
                {s.status === "error" && (
                  <ExclamationTriangleIcon className="h-4 w-4 text-destructive" />
                )}
                {s.status === "pending" && (
                  <span className="block h-2 w-2 rounded-full bg-muted-foreground/40" />
                )}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium">{s.label}</div>
                {s.detail && (
                  <div
                    className={cn(
                      "mt-0.5 text-[11px] break-words",
                      s.status === "error" ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {s.detail}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {done && (
        <div className="mt-3 text-sm text-success flex items-center gap-2">
          <CheckCircleIcon className="h-4 w-4" /> Setup complete.
        </div>
      )}
      {err && (
        <div className="mt-3 text-sm text-destructive flex items-start gap-2">
          <ExclamationTriangleIcon className="h-4 w-4 mt-0.5 shrink-0" /> {err}
        </div>
      )}
    </GlassCard>
  );
}

function DangerCard() {
  const [confirm, setConfirm] = useState(false);

  function reset() {
    wipeAll();
    invalidateUserSupabase();
    window.location.reload();
  }
  function exportJSON() {
    const dump = {
      exportedAt: new Date().toISOString(),
      providers: localStorage.getItem("fbai.providers.v1"),
      brand: localStorage.getItem("fbai.brand.v1"),
      install: localStorage.getItem("fbai.install.v1"),
      note: "Secrets are encrypted and intentionally not exported.",
    };
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aurora-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <GlassCard className="p-5">
      <h2 className="text-base font-semibold mb-1">Local data</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Everything is stored in this browser. Your Supabase project is not touched by reset.
      </p>
      <div className="flex flex-wrap gap-2">
        <GlassButton size="sm" variant="subtle" onClick={exportJSON}>
          <ArrowDownTrayIcon className="h-3.5 w-3.5" /> Export
        </GlassButton>
        {!confirm ? (
          <GlassButton
            size="sm"
            variant="ghost"
            onClick={() => setConfirm(true)}
            className="text-destructive"
          >
            <TrashIcon className="h-3.5 w-3.5" /> Reset
          </GlassButton>
        ) : (
          <>
            <GlassButton size="sm" variant="destructive" onClick={reset}>
              Yes, wipe
            </GlassButton>
            <GlassButton size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </GlassButton>
          </>
        )}
      </div>
    </GlassCard>
  );
}

/* ──────────────────────────────── Field wrapper ──────────────────────────────── */

function Field({
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

function setSessionPassphraseSafely(p: string) {
  if (p && p.length >= 8) setSessionPassphrase(p);
}
