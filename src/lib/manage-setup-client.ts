/**
 * Client-side helper to call the manage-setup Edge Function.
 *
 * The manage-setup edge function runs in the user's Supabase project and has
 * access to SUPABASE_SERVICE_ROLE_KEY via its environment variables. The browser
 * sends only a PAT (Personal Access Token) for authentication — the service_role
 * key never enters the client bundle.
 */

const EDGE_FUNCTION_SLUG = "manage-setup";

export interface ManageSetupResult<T = unknown> {
  ok: boolean;
  result?: T;
  error?: string;
}

export async function callManageSetup<T = unknown>(
  supabaseUrl: string,
  pat: string,
  command: string,
  payload?: Record<string, unknown>,
): Promise<ManageSetupResult<T>> {
  const base = supabaseUrl.replace(/\/+$/, "");
  const url = `${base}/functions/v1/${EDGE_FUNCTION_SLUG}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${pat}`,
    },
    body: JSON.stringify({ command, payload }),
  });

  const data = (await response.json()) as ManageSetupResult<T>;
  return data;
}

export async function listBucketsViaEdgeFn(
  supabaseUrl: string,
  pat: string,
): Promise<{ name: string }[]> {
  const result = await callManageSetup<{ name: string }[]>(supabaseUrl, pat, "list_buckets");
  if (!result.ok) throw new Error(result.error ?? "Failed to list buckets");
  return result.result ?? [];
}

export async function createBucketViaEdgeFn(
  supabaseUrl: string,
  pat: string,
  name: string,
  isPublic = true,
): Promise<void> {
  const result = await callManageSetup(supabaseUrl, pat, "create_bucket", { name, isPublic });
  if (!result.ok) throw new Error(result.error ?? "Failed to create bucket");
}
