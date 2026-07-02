import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import process from "node:process";
import { createLogger } from "../../logger";
import { getCorsHeaders } from "../../lib/cors";

const log = createLogger("api/health");

function json(data: unknown, status: number, request?: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...getCorsHeaders(request) },
  });
}

const START_TIME = Date.now();

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => new Response(null, { status: 204, headers: getCorsHeaders(request) }),

      GET: async ({ request }) => {
        const result: Record<string, unknown> = {
          status: "ok",
          version: "1.0.0",
          timestamp: new Date().toISOString(),
          uptime: Math.floor((Date.now() - START_TIME) / 1000),
          env: process.env.NODE_ENV ?? "development",
        };

        const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
          ?? request.headers.get("x-supabase-url");
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
          ?? request.headers.get("x-supabase-anon-key");

        if (!url || !anonKey) {
          result.db = { status: "unavailable", detail: "Supabase credentials not configured in env or headers" };
          return json(result, 200, request);
        }

        const sb = createClient(url, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const checks: Record<string, unknown> = {};

        const dbStart = Date.now();
        try {
          const { error: dbErr } = await sb.from("system_events").select("id", { count: "exact", head: true }).limit(1);
          checks.database = {
            status: dbErr ? "error" : "ok",
            latency_ms: Date.now() - dbStart,
            error: dbErr?.message ?? null,
          };
        } catch (e) {
          checks.database = { status: "error", error: e instanceof Error ? e.message : String(e) };
        }

        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        try {
          const { count: alertCount, error: alertErr } = await sb
            .from("system_events")
            .select("id", { count: "exact", head: true })
            .eq("severity", "error")
            .gte("created_at", since24h);
          checks.alerts = { status: alertErr ? "error" : "ok", count24h: alertCount ?? 0, error: alertErr?.message ?? null };
        } catch (e) {
          checks.alerts = { status: "error", error: e instanceof Error ? e.message : String(e) };
        }

        try {
          const { count: pendingCount, error: queueErr } = await sb
            .from("jobs")
            .select("id", { count: "exact", head: true })
            .in("status", ["pending", "processing", "failed_retryable"]);
          const { count: deadLetterCount } = await sb
            .from("jobs")
            .select("id", { count: "exact", head: true })
            .eq("status", "dead_letter");
          checks.queue = {
            status: queueErr ? "error" : "ok",
            pending: pendingCount ?? 0,
            deadLetter: deadLetterCount ?? 0,
            error: queueErr?.message ?? null,
          };
        } catch (e) {
          checks.queue = { status: "error", error: e instanceof Error ? e.message : String(e) };
        }

        try {
          const { data: lastEvents, error: workerErr } = await sb
            .from("system_events")
            .select("severity, category, created_at")
            .eq("category", "worker")
            .order("created_at", { ascending: false })
            .limit(5);
          const { count: circuitCount } = await sb
            .from("system_events")
            .select("id", { count: "exact", head: true })
            .like("category", "circuit_%")
            .gte("created_at", new Date(Date.now() - 300_000).toISOString());
          checks.worker = {
            status: workerErr ? "error" : "ok",
            lastRun: (lastEvents ?? [])[0]?.created_at ?? null,
            recentEvents: (lastEvents ?? []).length,
            error: workerErr?.message ?? null,
          };
          checks.circuitBreaker = {
            status: "ok",
            open: (circuitCount ?? 0) >= 3,
            recentFailures: circuitCount ?? 0,
          };
        } catch (e) {
          checks.worker = { status: "error", error: e instanceof Error ? e.message : String(e) };
        }

        result.checks = checks;

        const allOk = Object.values(checks).every(
          (c: unknown) => (c as { status: string }).status === "ok" || (c as { status: string }).status === "unavailable",
        );
        result.status = allOk ? "ok" : "degraded";

        log.info("Health check", { status: result.status });
        return json(result, 200, request);
      },
    },
  },
});
