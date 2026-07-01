import auroraWorkerSource from "../../supabase/functions/aurora-worker/index.ts?raw";
import manageSetupSource from "../../supabase/functions/manage-setup/index.ts?raw";

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
  files: [{ name: "index.ts", content: auroraWorkerSource }],
};

export const MANAGE_SETUP_FUNCTION: EdgeFunctionBundle = {
  slug: "manage-setup",
  name: "Manage Setup",
  entrypointPath: "index.ts",
  verifyJwt: false,
  files: [{ name: "index.ts", content: manageSetupSource }],
};
