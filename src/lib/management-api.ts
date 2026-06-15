/**
 * Thin wrapper around the Supabase Management API.
 * Browser → /api/proxy (same-origin) → api.supabase.com (no CORS issues).
 */

import { proxyFetch } from "./proxy-fetch";

const BASE = "https://api.supabase.com";

export class ManagementApiError extends Error {
  constructor(public status: number, public body: string, message: string) {
    super(message);
  }
}

async function call<T>(
  pat: string,
  path: string,
  init: { method?: string; body?: string; headers?: Record<string, string> } = {},
): Promise<T> {
  const res = await proxyFetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    body: init.body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new ManagementApiError(
      res.status,
      text,
      `Supabase Management API ${res.status}: ${text.slice(0, 200)}`,
    );
  }
  return (text ? JSON.parse(text) : ({} as T));
}

export interface ProjectInfo {
  id: string;
  ref: string;
  name: string;
  region: string;
  status: string;
}

export async function getProject(pat: string, ref: string): Promise<ProjectInfo> {
  return call<ProjectInfo>(pat, `/v1/projects/${ref}`);
}

export async function runSql(pat: string, ref: string, query: string): Promise<unknown> {
  return call(pat, `/v1/projects/${ref}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query }),
  });
}

export interface StorageBucket {
  id: string;
  name: string;
  public: boolean;
}

/**
 * Storage buckets are managed via the project's own Storage REST API
 * (https://<ref>.supabase.co/storage/v1/bucket), authenticated with the
 * service-role key. The Management API does not expose a stable
 * `/v1/projects/{ref}/storage/buckets` endpoint (returns 404).
 */
export async function listBuckets(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<StorageBucket[]> {
  const base = supabaseUrl.replace(/\/+$/, "");
  const r = await proxyFetch(`${base}/storage/v1/bucket`, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Storage list ${r.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as StorageBucket[];
}

export async function createBucket(
  supabaseUrl: string,
  serviceRoleKey: string,
  name: string,
  isPublic = true,
): Promise<unknown> {
  const base = supabaseUrl.replace(/\/+$/, "");
  const r = await proxyFetch(`${base}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ id: name, name, public: isPublic }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Storage create ${r.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

export async function setProjectSecrets(
  pat: string,
  ref: string,
  secrets: Record<string, string>,
): Promise<unknown> {
  const body = Object.entries(secrets).map(([name, value]) => ({ name, value }));
  return call(pat, `/v1/projects/${ref}/secrets`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
