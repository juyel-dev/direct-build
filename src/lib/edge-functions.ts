import auroraWorkerSource from "../../supabase/functions/aurora-worker/index.ts?raw";
import auroraWorkerCoreSource from "../../supabase/functions/aurora-worker/_core.ts?raw";
import auroraWorkerFacebookAdapterSource from "../../supabase/functions/aurora-worker/_facebook-adapter.ts?raw";
import auroraWorkerLifecycleSource from "../../supabase/functions/aurora-worker/_lifecycle.ts?raw";
import auroraWorkerAiUsageSource from "../../supabase/functions/aurora-worker/_ai-usage.ts?raw";
import auroraWorkerAnalyticsSource from "../../supabase/functions/aurora-worker/_analytics.ts?raw";
import manageSetupSource from "../../supabase/functions/manage-setup/index.ts?raw";
import auroraSharedSource from "../shared/aurora-shared.ts?raw";

export interface EdgeFunctionFile {
  name: string;
  content: string;
}

export interface EdgeFunctionBundle {
  slug: string;
  name: string;
  entrypointPath: string;
  verifyJwt: boolean;
  files: EdgeFunctionFile[];
}

export const AURORA_WORKER_FUNCTION: EdgeFunctionBundle = {
  slug: "aurora-worker",
  name: "Aurora Worker",
  entrypointPath: "index.ts",
  verifyJwt: false,
  files: [
    { name: "index.ts", content: auroraWorkerSource },
    { name: "_core.ts", content: auroraWorkerCoreSource },
    { name: "_facebook-adapter.ts", content: auroraWorkerFacebookAdapterSource },
    { name: "_lifecycle.ts", content: auroraWorkerLifecycleSource },
    { name: "_ai-usage.ts", content: auroraWorkerAiUsageSource },
    { name: "_analytics.ts", content: auroraWorkerAnalyticsSource },
    { name: "_shared.ts", content: auroraSharedSource },
  ],
};

export const MANAGE_SETUP_FUNCTION: EdgeFunctionBundle = {
  slug: "manage-setup",
  name: "Manage Setup",
  entrypointPath: "index.ts",
  verifyJwt: false,
  files: [{ name: "index.ts", content: manageSetupSource }],
};
