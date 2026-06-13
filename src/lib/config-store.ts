import { z } from "zod";
import { decryptJSON, encryptJSON } from "./crypto";

/**
 * Persistent app configuration. Sensitive credentials are encrypted with
 * the user's passphrase before being written to localStorage.
 */

export const AIProviderType = z.enum([
  "openai",
  "anthropic",
  "openrouter",
  "nvidia",
  "ollama",
  "lm_studio",
  "groq",
  "custom",
]);
export type AIProviderType = z.infer<typeof AIProviderType>;

export const ImageProviderType = z.enum([
  "replicate",
  "openai_dalle",
  "stability",
  "pollinations",
  "custom_http",
]);
export type ImageProviderType = z.infer<typeof ImageProviderType>;

export const SecretsSchema = z.object({
  supabaseUrl: z.string().url().refine((v) => v.includes(".supabase.co"), {
    message: "Must be a supabase.co project URL",
  }),
  supabaseAnonKey: z.string().min(20),
  supabaseServiceKey: z.string().min(20),
  supabasePAT: z.string().min(20),
  facebookPageToken: z.string().min(10).optional().or(z.literal("")),
  facebookPageId: z.string().min(1).optional().or(z.literal("")),
  aiApiKey: z.string().optional().or(z.literal("")),
  imageApiKey: z.string().optional().or(z.literal("")),
});
export type Secrets = z.infer<typeof SecretsSchema>;

export const ProvidersSchema = z.object({
  llm: z.object({
    type: AIProviderType,
    baseUrl: z.string().url().optional().or(z.literal("")),
    model: z.string().min(1),
  }),
  image: z.object({
    type: ImageProviderType,
    baseUrl: z.string().url().optional().or(z.literal("")),
    model: z.string().min(1),
  }),
});
export type Providers = z.infer<typeof ProvidersSchema>;

export const BrandSchema = z.object({
  brandName: z.string().default(""),
  voice: z.string().default(""),
  audience: z.string().default(""),
  topics: z.array(z.string()).default([]),
  postingWindows: z.array(z.object({ hour: z.number().min(0).max(23), minute: z.number().min(0).max(59) })).default([
    { hour: 9, minute: 0 },
    { hour: 13, minute: 0 },
    { hour: 18, minute: 0 },
  ]),
  postingMode: z.enum(["manual", "hybrid", "full_auto"]).default("manual"),
  maxPostsPerDay: z.number().min(1).max(10).default(2),
});
export type Brand = z.infer<typeof BrandSchema>;

export const InstallStatusSchema = z.object({
  schemaVersion: z.number().default(0),
  storageBucketReady: z.boolean().default(false),
  vaultReady: z.boolean().default(false),
  edgeFunctionsReady: z.boolean().default(false),
  completedAt: z.string().optional(),
});
export type InstallStatus = z.infer<typeof InstallStatusSchema>;

const KEY_SECRETS_CIPHER = "fbai.secrets.v1";
const KEY_PROVIDERS = "fbai.providers.v1";
const KEY_BRAND = "fbai.brand.v1";
const KEY_INSTALL = "fbai.install.v1";
const KEY_PASSPHRASE_SET = "fbai.passphrase.isSet";
const SESSION_PASSPHRASE = "fbai.sess.passphrase";

export function isPassphraseSet(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(KEY_PASSPHRASE_SET) === "1";
}

export function hasStoredSecrets(): boolean {
  if (typeof localStorage === "undefined") return false;
  return !!localStorage.getItem(KEY_SECRETS_CIPHER);
}

export function setSessionPassphrase(p: string) {
  sessionStorage.setItem(SESSION_PASSPHRASE, p);
}
export function getSessionPassphrase(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(SESSION_PASSPHRASE);
}
export function clearSessionPassphrase() {
  sessionStorage.removeItem(SESSION_PASSPHRASE);
}

export async function saveSecrets(secrets: Secrets, passphrase: string): Promise<void> {
  SecretsSchema.parse(secrets);
  const cipher = await encryptJSON(secrets, passphrase);
  localStorage.setItem(KEY_SECRETS_CIPHER, cipher);
  localStorage.setItem(KEY_PASSPHRASE_SET, "1");
  setSessionPassphrase(passphrase);
}

export async function loadSecrets(passphrase?: string): Promise<Secrets | null> {
  const cipher = localStorage.getItem(KEY_SECRETS_CIPHER);
  if (!cipher) return null;
  const pass = passphrase ?? getSessionPassphrase();
  if (!pass) return null;
  try {
    const out = await decryptJSON<Secrets>(cipher, pass);
    return SecretsSchema.parse(out);
  } catch {
    return null;
  }
}

export function loadProviders(): Providers {
  const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY_PROVIDERS) : null;
  if (!raw) {
    return {
      llm: { type: "openrouter", baseUrl: "https://openrouter.ai/api/v1", model: "meta-llama/llama-3.3-70b-instruct:free" },
      image: { type: "pollinations", baseUrl: "", model: "flux" },
    };
  }
  try { return ProvidersSchema.parse(JSON.parse(raw)); } catch {
    return {
      llm: { type: "openrouter", baseUrl: "https://openrouter.ai/api/v1", model: "meta-llama/llama-3.3-70b-instruct:free" },
      image: { type: "pollinations", baseUrl: "", model: "flux" },
    };
  }
}
export function saveProviders(p: Providers) {
  localStorage.setItem(KEY_PROVIDERS, JSON.stringify(ProvidersSchema.parse(p)));
}

export function loadBrand(): Brand {
  const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY_BRAND) : null;
  if (!raw) return BrandSchema.parse({});
  try { return BrandSchema.parse(JSON.parse(raw)); } catch { return BrandSchema.parse({}); }
}
export function saveBrand(b: Brand) {
  localStorage.setItem(KEY_BRAND, JSON.stringify(BrandSchema.parse(b)));
}

export function loadInstallStatus(): InstallStatus {
  const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY_INSTALL) : null;
  if (!raw) return InstallStatusSchema.parse({});
  try { return InstallStatusSchema.parse(JSON.parse(raw)); } catch { return InstallStatusSchema.parse({}); }
}
export function saveInstallStatus(s: InstallStatus) {
  localStorage.setItem(KEY_INSTALL, JSON.stringify(InstallStatusSchema.parse(s)));
}

export function wipeAll() {
  localStorage.removeItem(KEY_SECRETS_CIPHER);
  localStorage.removeItem(KEY_PROVIDERS);
  localStorage.removeItem(KEY_BRAND);
  localStorage.removeItem(KEY_INSTALL);
  localStorage.removeItem(KEY_PASSPHRASE_SET);
  clearSessionPassphrase();
}

export function projectRefFromUrl(url: string): string | null {
  const m = url.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m?.[1] ?? null;
}
