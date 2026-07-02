import {
  deployEdgeFunction,
  runSql,
  setProjectSecrets,
} from "./management-api";
import { AURORA_WORKER_FUNCTION, MANAGE_SETUP_FUNCTION } from "./edge-functions";
import { listBucketsViaEdgeFn, createBucketViaEdgeFn } from "./manage-setup-client";
import { MIGRATIONS } from "./migrations";
import {
  loadInstallStatus,
  projectRefFromUrl,
  saveInstallStatus,
  type Brand,
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
  brand: Brand,
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

    const automationSecret = crypto.randomUUID();

    await stepRunner({ key: "secrets", label: "Push secrets to project" }, async () => {
      const toSet: Record<string, string> = {
        FBAI_SUPABASE_URL: secrets.supabaseUrl,
        FBAI_SUPABASE_SERVICE_ROLE_KEY: secrets.supabaseServiceKey,
        FBAI_CRON_SECRET: automationSecret,
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
      const r = await proxyFetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(secrets.facebookPageId)}`, {
        headers: { Authorization: `Bearer ${secrets.facebookPageToken}` },
      });
      const j = await r.json<{ id?: string; name?: string; error?: { message: string } }>();
      if (j.error) throw new Error(j.error.message);
      await runSql(
        secrets.supabasePAT,
        ref,
        `insert into public.pages (fb_page_id, fb_page_name)
         values ($1, $2)
         on conflict (fb_page_id) do update set fb_page_name = excluded.fb_page_name;`,
        [j.id ?? "", j.name ?? "Unnamed"],
      );
      return `Seeded page ${j.name} (${j.id}).`;
    });

    await stepRunner({ key: "brand-sync", label: "Sync brand automation settings" }, async () => {
      if (!secrets.facebookPageId) return "Skipped — no Facebook page configured yet.";
      const promptOverrides = JSON.stringify({
        brandName: brand.brandName,
        audience: brand.audience,
        topics: brand.topics,
      });
      await runSql(
        secrets.supabasePAT,
        ref,
        `update public.pages
         set default_brand_voice = $1,
             default_posting_windows = $2::jsonb,
             posting_mode = $3,
             max_posts_per_day = $4,
             prompt_overrides = $5::jsonb
         where fb_page_id = $6;`,
        [
          brand.voice,
          JSON.stringify(brand.postingWindows),
          brand.postingMode,
          Math.max(1, Math.min(10, Number(brand.maxPostsPerDay) || 1)),
          promptOverrides,
          secrets.facebookPageId,
        ],
      );
      return `Synced ${brand.postingMode.replace("_", " ")} mode and ${brand.postingWindows.length} posting windows.`;
    });

    await stepRunner({ key: "edge-setup", label: "Deploy setup helper Edge Function" }, async () => {
      await deployEdgeFunction(secrets.supabasePAT, ref, MANAGE_SETUP_FUNCTION);
      return `Deployed ${MANAGE_SETUP_FUNCTION.slug}.`;
    });

    await stepRunner({ key: "bucket", label: "Create storage bucket" }, async () => {
      const buckets = await listBucketsViaEdgeFn(secrets.supabaseUrl, secrets.supabasePAT);
      if (buckets.some((b) => b.name === STORAGE_BUCKET)) {
        status.storageBucketReady = true;
        saveInstallStatus(status);
        return `Bucket "${STORAGE_BUCKET}" already exists.`;
      }
      await createBucketViaEdgeFn(secrets.supabaseUrl, secrets.supabasePAT, STORAGE_BUCKET, true);
      status.storageBucketReady = true;
      saveInstallStatus(status);
      return `Created bucket "${STORAGE_BUCKET}".`;
    });

    await stepRunner({ key: "edge-worker", label: "Deploy automation Edge Function" }, async () => {
      await deployEdgeFunction(secrets.supabasePAT, ref, AURORA_WORKER_FUNCTION);
      return `Deployed ${AURORA_WORKER_FUNCTION.slug}.`;
    });

    await stepRunner({ key: "cron", label: "Schedule automation cron" }, async () => {
      const functionUrl = `${secrets.supabaseUrl.replace(/\/+$/, "")}/functions/v1/${AURORA_WORKER_FUNCTION.slug}`;
      await runSql(
        secrets.supabasePAT,
        ref,
        buildCronSql(functionUrl, secrets.supabaseAnonKey, automationSecret),
      );
      const verifyResult = await runSql(
        secrets.supabasePAT,
        ref,
        `SELECT jobname, schedule FROM cron.job WHERE jobname = 'aurora-worker-every-minute'`,
      );
      const rows = Array.isArray(verifyResult) ? verifyResult : [];
      if (rows.length === 0) {
        throw new Error(
          "pg_cron/pg_net extensions not available — cron job was not created. " +
          "Verify your Supabase project supports pg_cron and pg_net extensions, " +
          "then re-run setup.",
        );
      }
      status.edgeFunctionsReady = true;
      saveInstallStatus(status);
      return `Scheduled worker every minute via pg_cron. Verified: job 'aurora-worker-every-minute' active.`;
    });

    status.completedAt = new Date().toISOString();
    saveInstallStatus(status);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function buildCronSql(functionUrl: string, anonKey: string, automationSecret: string) {
  const headers = JSON.stringify({
    "Content-Type": "application/json",
    Authorization: `Bearer ${anonKey}`,
    apikey: anonKey,
    "x-automation-secret": automationSecret,
  });
  const body = JSON.stringify({ trigger: "pg_cron" });
  return `select cron.schedule(
  'aurora-worker-every-minute',
  '* * * * *',
  $cron$
    select net.http_post(
      url := '${functionUrl.replace(/'/g, "'\\''")}',
      headers := '${headers.replace(/'/g, "'\\''")}'::jsonb,
      body := '${body.replace(/'/g, "'\\''")}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$
);`;
}
