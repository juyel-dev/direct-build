import { useEffect, useMemo, useState } from "react";
import {
  loadSecrets,
  saveSecrets,
  SecretsSchema,
  hasStoredSecrets,
  getSessionPassphrase, loadPassphraseHint,
  loadProviders,
  saveProviders,
  ProvidersSchema,
  loadBrand,
  saveBrand,
  BrandSchema,
  loadInstallStatus,
  InstallStatusSchema,
  projectRefFromUrl,
  type Secrets,
  type Providers,
  type Brand,
} from "@/lib/config-store";
import { GlassCard } from "@/components/glass/GlassCard";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput } from "@/components/glass/GlassInput";
import { invalidateUserSupabase } from "@/lib/user-supabase";
import {
  LockClosedIcon,
  CircleStackIcon,
  GlobeAltIcon,
  CpuChipIcon,
  PhotoIcon,
  MegaphoneIcon,
  LightBulbIcon,
} from "@heroicons/react/24/outline";
import { StatusStrip, SectionRow, type SheetKey } from "./shared";
import { SupabaseSheet } from "./SupabaseSheet";
import { FacebookSheet } from "./FacebookSheet";
import { LLMSheet } from "./LLMSheet";
import { ImageSheet } from "./ImageSheet";
import { BrandSheet } from "./BrandSheet";
import { BrandMemorySheet } from "./BrandMemorySheet";
import { SetupCard } from "./SetupCard";
import { DangerCard } from "./DangerCard";

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
    const { setSessionPassphrase: sp } = await import("@/lib/config-store");
    sp(pass);
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
    const hint = loadPassphraseHint();
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
            {hint && <p className="text-xs text-muted-foreground mt-1">Hint: {hint}</p>}
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
      <SectionRow
        icon={<LightBulbIcon className="h-5 w-5" />}
        title="Brand memory"
        subtitle="AI learns your style, audience, and successful content"
        ok={false}
        optional
        onClick={() => setSheet("brand_memory")}
      />

      <SetupCard
        secrets={secrets}
        providers={providers}
        brand={brand}
        onStatus={() => setInstallStatus(loadInstallStatus())}
      />

      <DangerCard />

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
      <BrandMemorySheet
        open={sheet === "brand_memory"}
        onClose={() => setSheet(null)}
      />
    </div>
  );
}
