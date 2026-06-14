import {
  createBucket,
  listBuckets,
  runSql,
  setProjectSecrets,
} from "./management-api";
import { MIGRATIONS } from "./migrations";
import {
  loadInstallStatus,
  projectRefFromUrl,
  saveInstallStatus,
  type Providers,
  type Secrets,
} from "./config-store";
import { proxyFetch } from "./proxy-fetch";

export type SetupStepStatus = "pending" | "running" | "done" | "error";
export interface SetupStep {
  key: string;
  label: string;
  status: SetupStepStatus;
  detail?: string;
}

export type StepUpdate = (step: SetupStep) => void;

const STORAGE_BUCKET = "generated-images";

export async function runSetup(
  secrets: Secrets,
  providers: Providers,
  onUpdate: StepUpdate,
): Promise<{ ok: boolean; error?: string }> {
  const ref = projectRefFromUrl(secrets.supabaseUrl);
  if (!ref) return { ok: false, error: "Bad project URL." };

  const stepRunner = async (step: Omit<SetupStep, "status">, fn: () => Promise<string>) => {
    onUpdate({ ...step, status: "running" });
    try {
      const detail = await fn();
      onUpdate({ ...step, status: "done", detail });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      onUpdate({ ...step, status: "error", detail });
      throw e;
    }
  };

  try {
    await stepRunner({ key: "verify", label: "Verify project access" }, async () => {
      const r = await proxyFetch(`https://api.supabase.com/v1/projects/${ref}`, {
        headers: { Authorization: `Bearer ${secrets.supabasePAT}` },
      });
      if (!r.ok) throw new Error(`Project not reachable (${r.status})`);
      const j = (await r.json()) as { name?: string; region?: string };
      return `Reached ${j.name ?? ref} (${j.region ?? "?"})`;
    });

    const status = loadInstallStatus();

    for (const m of MIGRATIONS) {
      if (status.schemaVersion >= m.id) continue;
      await stepRunner(
        { key: `mig-${m.id}`, label: `Run migration ${String(m.id).padStart(3, "0")}_${m.name}` },
        async () => {
          await runSql(secrets.supabasePAT, ref, m.sql);
          status.schemaVersion = m.id;
          saveInstallStatus(status);
          return `Applied migration ${m.id}.`;
        },
      );
    }

    await stepRunner({ key: "bucket", label: "Create storage bucket" }, async () => {
      const buckets = await listBuckets(secrets.supabasePAT, ref).catch(() => [] as { name: string }[]);
      if (buckets.some((b) => b.name === STORAGE_BUCKET)) {
        status.storageBucketReady = true;
        saveInstallStatus(status);
        return `Bucket "${STORAGE_BUCKET}" already exists.`;
      }
      await createBucket(secrets.supabasePAT, ref, STORAGE_BUCKET, true);
      status.storageBucketReady = true;
      saveInstallStatus(status);
      return `Created bucket "${STORAGE_BUCKET}".`;
    });

    await stepRunner({ key: "secrets", label: "Push secrets to project" }, async () => {
      const toSet: Record<string, string> = {
        FBAI_LLM_PROVIDER: providers.llm.type,
        FBAI_LLM_MODEL: providers.llm.model,
        FBAI_IMAGE_PROVIDER: providers.image.type,
        FBAI_IMAGE_MODEL: providers.image.model,
      };
      if (providers.llm.baseUrl) toSet.FBAI_LLM_BASE_URL = providers.llm.baseUrl;
      if (providers.image.baseUrl) toSet.FBAI_IMAGE_BASE_URL = providers.image.baseUrl;
      if (secrets.aiApiKey) toSet.FBAI_AI_API_KEY = secrets.aiApiKey;
      if (secrets.imageApiKey) toSet.FBAI_IMAGE_API_KEY = secrets.imageApiKey;
      if (secrets.facebookPageToken) toSet.FBAI_FB_PAGE_TOKEN = secrets.facebookPageToken;
      if (secrets.facebookPageId) toSet.FBAI_FB_PAGE_ID = secrets.facebookPageId;
      await setProjectSecrets(secrets.supabasePAT, ref, toSet);
      status.vaultReady = true;
      saveInstallStatus(status);
      return `Pushed ${Object.keys(toSet).length} project secrets.`;
    });

    await stepRunner({ key: "page-row", label: "Seed Facebook page row" }, async () => {
      if (!secrets.facebookPageId || !secrets.facebookPageToken) {
        return "Skipped — no Facebook page configured yet.";
      }
      const r = await proxyFetch(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(secrets.facebookPageId)}?fields=id,name&access_token=${encodeURIComponent(secrets.facebookPageToken)}`,
      );
      const j = await r.json<{ id?: string; name?: string; error?: { message: string } }>();
      if (j.error) throw new Error(j.error.message);
      const sql = `insert into public.pages (fb_page_id, fb_page_name)
        values ('${(j.id ?? "").replace(/'/g, "''")}', '${(j.name ?? "Unnamed").replace(/'/g, "''")}')
        on conflict (fb_page_id) do update set fb_page_name = excluded.fb_page_name;`;
      await runSql(secrets.supabasePAT, ref, sql);
      return `Seeded page ${j.name} (${j.id}).`;
    });

    status.completedAt = new Date().toISOString();
    saveInstallStatus(status);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
