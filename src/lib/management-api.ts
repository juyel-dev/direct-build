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

export async function listBuckets(pat: string, ref: string): Promise<StorageBucket[]> {
  return call<StorageBucket[]>(pat, `/v1/projects/${ref}/storage/buckets`);
}

export async function createBucket(
  pat: string,
  ref: string,
  name: string,
  isPublic = true,
): Promise<unknown> {
  return call(pat, `/v1/projects/${ref}/storage/buckets`, {
    method: "POST",
    body: JSON.stringify({ id: name, name, public: isPublic }),
  });
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
