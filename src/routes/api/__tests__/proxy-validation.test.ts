import { describe, it, expect } from "vitest";
import { z } from "zod";

const ProxyRequestSchema = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]).default("GET"),
  headers: z.record(z.string()).optional().default({}),
  body: z.string().optional(),
}).strict();

describe("Proxy request validation", () => {
  it("accepts valid minimal request", () => {
    const result = ProxyRequestSchema.safeParse({ url: "https://api.openai.com/v1/chat" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.method).toBe("GET");
      expect(result.data.headers).toEqual({});
    }
  });

  it("accepts valid full request", () => {
    const result = ProxyRequestSchema.safeParse({
      url: "https://api.openai.com/v1/chat",
      method: "POST",
      headers: { Authorization: "Bearer test123" },
      body: JSON.stringify({ model: "gpt-4" }),
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing url", () => {
    const result = ProxyRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects invalid url", () => {
    const result = ProxyRequestSchema.safeParse({ url: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid method", () => {
    const result = ProxyRequestSchema.safeParse({ url: "https://example.com", method: "DELETE_ALL" });
    expect(result.success).toBe(false);
  });

  it("rejects extra fields", () => {
    const result = ProxyRequestSchema.safeParse({
      url: "https://example.com",
      malicious_field: "injection",
    });
    expect(result.success).toBe(false);
  });

  it("accepts supabase.co URLs", () => {
    const result = ProxyRequestSchema.safeParse({
      url: "https://abcdef.supabase.co/rest/v1/table",
    });
    expect(result.success).toBe(true);
  });
});

describe("Host allowlist logic", () => {
  const ALLOWED_HOST_EXACT = new Set([
    "graph.facebook.com",
    "api.openai.com",
    "openrouter.ai",
    "api.anthropic.com",
    "integrate.api.nvidia.com",
    "api.groq.com",
    "api.replicate.com",
    "api.stability.ai",
    "image.pollinations.ai",
    "api.supabase.com",
  ]);

  function isHostAllowed(hostname: string): boolean {
    if (ALLOWED_HOST_EXACT.has(hostname)) return true;
    if (hostname.endsWith(".supabase.co")) return true;
    return false;
  }

  it("allows known hosts", () => {
    expect(isHostAllowed("graph.facebook.com")).toBe(true);
    expect(isHostAllowed("api.openai.com")).toBe(true);
    expect(isHostAllowed("openrouter.ai")).toBe(true);
    expect(isHostAllowed("api.supabase.com")).toBe(true);
  });

  it("allows any supabase.co subdomain", () => {
    expect(isHostAllowed("abcdef.supabase.co")).toBe(true);
    expect(isHostAllowed("myproject.supabase.co")).toBe(true);
  });

  it("rejects unknown hosts", () => {
    expect(isHostAllowed("evil.com")).toBe(false);
    expect(isHostAllowed("google.com")).toBe(false);
  });

  it("rejects localhost", () => {
    expect(isHostAllowed("localhost")).toBe(false);
    expect(isHostAllowed("127.0.0.1")).toBe(false);
  });
});
