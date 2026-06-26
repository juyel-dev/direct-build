/**
 * Thin wrapper around the Supabase Management API.
 * Browser → /api/proxy (same-origin) → api.supabase.com (no CORS issues).
 */

import { proxyFetch } from "./proxy-fetch";
import { supabaseAuthHeaders } from "./supabase-keys";

const BASE = "https://api.supabase.com";

export class ManagementApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    message: string,
  ) {
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
  return text ? JSON.parse(text) : ({} as T);
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
    headers: supabaseAuthHeaders(serviceRoleKey),
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
      ...supabaseAuthHeaders(serviceRoleKey),
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

export interface DeployFunctionInput {
  slug: string;
  name: string;
  entrypointPath: string;
  verifyJwt: boolean;
  files: { name: string; content: string }[];
}

export async function deployEdgeFunction(
  pat: string,
  ref: string,
  fn: DeployFunctionInput,
): Promise<unknown> {
  const boundary = `----aurora-${crypto.randomUUID()}`;
  const metadata = {
    name: fn.name,
    entrypoint_path: fn.entrypointPath,
    verify_jwt: fn.verifyJwt,
  };
  const body = [
    part(boundary, "metadata", JSON.stringify(metadata)),
    ...fn.files.map((file) =>
      part(boundary, "file", file.content, file.name, "application/typescript"),
    ),
    `--${boundary}--\r\n`,
  ].join("");

  return call(pat, `/v1/projects/${ref}/functions/deploy?slug=${encodeURIComponent(fn.slug)}`, {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body,
  });
}

function part(
  boundary: string,
  name: string,
  content: string,
  filename?: string,
  contentType?: string,
) {
  const disposition = filename
    ? `Content-Disposition: form-data; name="${name}"; filename="${filename}"`
    : `Content-Disposition: form-data; name="${name}"`;
  const type = contentType ? `Content-Type: ${contentType}\r\n` : "";
  return `--${boundary}\r\n${disposition}\r\n${type}\r\n${content}\r\n`;
}
