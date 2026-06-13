import { useEffect, useState } from "react";
import {
  loadSecrets,
  saveSecrets,
  SecretsSchema,
  hasStoredSecrets,
  getSessionPassphrase,
  setSessionPassphrase,
  type Secrets,
  projectRefFromUrl,
} from "@/lib/config-store";
import { GlassPanel } from "@/components/glass/GlassCard";
import { GlassInput, GlassLabel } from "@/components/glass/GlassInput";
import { GlassButton } from "@/components/glass/GlassButton";
import { SecretInput } from "@/components/glass/SecretInput";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  KeyIcon,
  LinkIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import { testFacebook, testManagementApi, testSupabaseRest, type TestResult } from "@/lib/test-connections";
import { invalidateUserSupabase } from "@/lib/user-supabase";

const EMPTY: Secrets = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  supabaseServiceKey: "",
  supabasePAT: "",
  facebookPageToken: "",
  facebookPageId: "",
  aiApiKey: "",
  imageApiKey: "",
};

type Tests = Record<string, TestResult | "running" | undefined>;

export function SecretsTab({ onSaved }: { onSaved?: (s: Secrets) => void }) {
  const [secrets, setSecrets] = useState<Secrets>(EMPTY);
  const [pass, setPass] = useState("");
  const [unlockNeeded, setUnlockNeeded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [tests, setTests] = useState<Tests>({});

  useEffect(() => {
    (async () => {
      if (!hasStoredSecrets()) return;
      const sess = getSessionPassphrase();
      if (!sess) {
        setUnlockNeeded(true);
        return;
      }
      const s = await loadSecrets(sess);
      if (s) setSecrets(s);
      else setUnlockNeeded(true);
    })();
  }, []);

  async function tryUnlock() {
    if (!pass) return;
    const s = await loadSecrets(pass);
    if (!s) {
      setError("Wrong passphrase or corrupt store.");
      return;
    }
    setSessionPassphrase(pass);
    setSecrets(s);
    setUnlockNeeded(false);
    setError(null);
  }

  function update<K extends keyof Secrets>(k: K, v: Secrets[K]) {
    setSecrets((s) => ({ ...s, [k]: v }));
  }

  async function handleSave() {
    setError(null);
    const parsed = SecretsSchema.safeParse(secrets);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" · "));
      return;
    }
    let p = getSessionPassphrase();
    if (!p) {
      const fresh = pass.trim();
      if (fresh.length < 8) {
        setError("Choose a passphrase of 8+ characters to encrypt your secrets.");
        return;
      }
      p = fresh;
    }
    setSaving(true);
    try {
      await saveSecrets(parsed.data, p);
      setSavedAt(Date.now());
      invalidateUserSupabase();
      onSaved?.(parsed.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function runTest(key: string, fn: () => Promise<TestResult>) {
    setTests((t) => ({ ...t, [key]: "running" }));
    const r = await fn();
    setTests((t) => ({ ...t, [key]: r }));
  }

  if (unlockNeeded) {
    return (
      <GlassPanel
        title="Unlock your credentials"
        description="Your secrets are encrypted in this browser. Enter the passphrase you set on first save."
      >
        <div className="flex gap-2">
          <GlassInput
            type="password"
            placeholder="Passphrase"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
          />
          <GlassButton variant="primary" onClick={tryUnlock}>Unlock</GlassButton>
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </GlassPanel>
    );
  }

  const ref = projectRefFromUrl(secrets.supabaseUrl);

  return (
    <div className="flex flex-col gap-5">
      <GlassPanel
        title="Bring your own Supabase"
        description="Open supabase.com → create a project → Settings ▸ API. Copy the values below."
        action={
          <a
            href="https://supabase.com/dashboard/new/_"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            New Supabase project <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
          </a>
        }
      >
        <div className="grid gap-4">
          <div>
            <GlassLabel htmlFor="url" hint={ref ? `ref: ${ref}` : "must end in .supabase.co"}>Project URL</GlassLabel>
            <GlassInput
              id="url"
              placeholder="https://xxxxxxxxxxxxxxxx.supabase.co"
              value={secrets.supabaseUrl}
              onChange={(e) => update("supabaseUrl", e.target.value.trim())}
            />
          </div>
          <div>
            <GlassLabel hint="Public — Settings ▸ API ▸ anon">Anon Key</GlassLabel>
            <SecretInput value={secrets.supabaseAnonKey} onChange={(v) => update("supabaseAnonKey", v.trim())} placeholder="eyJhbGc..." />
          </div>
          <div>
            <GlassLabel hint="Private — Settings ▸ API ▸ service_role">Service Role Key</GlassLabel>
            <SecretInput value={secrets.supabaseServiceKey} onChange={(v) => update("supabaseServiceKey", v.trim())} placeholder="eyJhbGc..." />
          </div>
          <div>
            <GlassLabel hint="https://supabase.com/dashboard/account/tokens">Personal Access Token (PAT)</GlassLabel>
            <SecretInput value={secrets.supabasePAT} onChange={(v) => update("supabasePAT", v.trim())} placeholder="sbp_..." />
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <TestButton
              label="Test REST"
              state={tests.rest}
              onClick={() => runTest("rest", () => testSupabaseRest(secrets))}
              icon={<LinkIcon className="h-3.5 w-3.5" />}
            />
            <TestButton
              label="Test Management API"
              state={tests.mgmt}
              onClick={() => runTest("mgmt", () => testManagementApi(secrets))}
              icon={<KeyIcon className="h-3.5 w-3.5" />}
            />
          </div>
        </div>
      </GlassPanel>

      <GlassPanel
        title="Facebook page"
        description="Optional now — you can add this after Run Setup. Create a Page Access Token in Graph API Explorer."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <GlassLabel>Page ID</GlassLabel>
            <GlassInput
              value={secrets.facebookPageId ?? ""}
              onChange={(e) => update("facebookPageId", e.target.value.trim())}
              placeholder="1234567890"
            />
          </div>
          <div>
            <GlassLabel>Page Access Token</GlassLabel>
            <SecretInput
              value={secrets.facebookPageToken ?? ""}
              onChange={(v) => update("facebookPageToken", v.trim())}
              placeholder="EAA..."
            />
          </div>
        </div>
        <div className="mt-3">
          <TestButton
            label="Test Facebook"
            state={tests.fb}
            onClick={() =>
              runTest("fb", () =>
                testFacebook(secrets.facebookPageToken ?? "", secrets.facebookPageId || undefined),
              )
            }
          />
        </div>
      </GlassPanel>

      <GlassPanel
        title="AI provider keys"
        description="The LLM and image-provider keys are sent to your Supabase Vault on Run Setup. Leave blank for self-hosted providers like Ollama or Pollinations."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <GlassLabel>LLM API key</GlassLabel>
            <SecretInput value={secrets.aiApiKey ?? ""} onChange={(v) => update("aiApiKey", v.trim())} placeholder="sk-... or sk-or-..." />
          </div>
          <div>
            <GlassLabel>Image API key</GlassLabel>
            <SecretInput value={secrets.imageApiKey ?? ""} onChange={(v) => update("imageApiKey", v.trim())} placeholder="(optional)" />
          </div>
        </div>
      </GlassPanel>

      {!getSessionPassphrase() && (
        <GlassPanel
          title="Choose an encryption passphrase"
          description="Used to AES-GCM-encrypt your secrets in this browser. Stored only in this tab's session — never sent anywhere."
        >
          <GlassInput
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="8+ characters"
          />
        </GlassPanel>
      )}

      <div className="flex items-center gap-3">
        <GlassButton variant="primary" size="lg" loading={saving} onClick={handleSave}>
          Save credentials
        </GlassButton>
        {savedAt && (
          <span className="inline-flex items-center gap-1.5 text-xs text-success">
            <CheckCircleIcon className="h-4 w-4" /> Saved & encrypted
          </span>
        )}
        {error && (
          <span className="inline-flex items-center gap-1.5 text-xs text-destructive">
            <ExclamationTriangleIcon className="h-4 w-4" /> {error}
          </span>
        )}
      </div>
    </div>
  );
}

function TestButton({
  label,
  state,
  onClick,
  icon,
}: {
  label: string;
  state: TestResult | "running" | undefined;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  const loading = state === "running";
  const ok = typeof state === "object" && state.ok;
  const bad = typeof state === "object" && !state.ok;
  return (
    <div className="flex items-center gap-2">
      <GlassButton size="sm" variant="subtle" loading={loading} onClick={onClick}>
        {icon} {label}
      </GlassButton>
      {ok && typeof state === "object" && (
        <span className="inline-flex items-center gap-1 text-[11px] text-success">
          <CheckCircleIcon className="h-3.5 w-3.5" /> {state.detail}
        </span>
      )}
      {bad && typeof state === "object" && (
        <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
          <ExclamationTriangleIcon className="h-3.5 w-3.5" /> {state.detail}
        </span>
      )}
    </div>
  );
}
