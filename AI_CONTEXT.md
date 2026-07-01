# AI Agent Handover Context

**Project:** Aurora — AI Facebook Autopilot
**Repository:** https://github.com/juyel-dev/direct-build
**Handover Date:** July 2026
**Previous Agents:** 3 (OpenCode)
**Phase 3.5:** Accepted — worker heartbeat/circuit breaker, TypeScript strict mode, migration 5

---

## Project Overview

Aurora is an open-source AI Facebook Autopilot that follows the BYOB/BYOK model (Bring Your Own Backend / Bring Your Own Keys). Users own their Supabase project; the app provisions schema, edge functions, and automation during a one-click setup wizard.

**Core Workflow:** Planning → Draft → Approval → Scheduling → Publishing → Analytics

### Product Vision (DO NOT BREAK)
- AI Facebook Autopilot — **Facebook-first. No other platforms until Phase 5+**
- Open-source
- BYOB/BYOK (user owns Supabase project)
- One-click setup wizard
- AI content generation with brand memory
- Glassmorphism UI
- Keep existing workflow untouched
- Growth Intelligence: analytics, reports, actionable insights

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TanStack Start |
| Routing | TanStack Router (file-based, route splitting) |
| Styling | Tailwind CSS v4 (Liquid Glassmorphism) |
| UI Components | shadcn/ui + Radix primitives |
| State/Data | TanStack Query (React Query v5) |
| Forms | react-hook-form + @hookform/resolvers + Zod |
| Backend | Supabase (PostgreSQL + Edge Functions + pg_cron) |
| Auth | Supabase Auth (optional, migration 003) |
| Encryption | AES-GCM (PBKDF2, 200k iterations) |
| Charts | Recharts |
| AI Providers | OpenAI / OpenRouter / Anthropic / Groq / NVIDIA / Ollama / LM Studio |
| Image Providers | Pollinations / DALL-E / Stability AI |
| Social API | Facebook Graph API v21.0 |
| Package Manager | Bun |
| Deployment | Vercel (Nitro SSR preset) |
| Testing | Vitest (unit tests for errors, validators, logger, repositories) |

---

## Architecture

```
Route (UI) → Hook (state) → Service (business logic) → Repository (data access) → Supabase
```

### Layer Responsibilities

| Layer | Location | Responsibility |
|-------|----------|---------------|
| **Routes** | `src/routes/` | Render UI, call hooks, handle navigation. NO business logic. |
| **Hooks** | `src/hooks/` | Component state, call services, manage React Query. |
| **Services** | `src/services/` | Business logic, coordinate repositories, AI calls, Facebook API. |
| **Repositories** | `src/repositories/` | ALL Supabase queries, typed responses, pagination, error handling. |
| **Validators** | `src/validators/` | Zod schemas for runtime validation. |
| **Types** | `src/types/` | Shared TypeScript interfaces (Page, Brief, Post, Job, etc.). |
| **Logger** | `src/logger/` | Structured logging (debug/info/warn/error) with `createLogger(name)`. |
| **Errors** | `src/errors/` | Error hierarchy (AppError, ValidationError, AuthError, etc.). |
| **Lib** | `src/lib/` | Legacy modules (config-store, crypto, setup-runner). Being migrated. |

### Data Flow

```
Browser localStorage (encrypted credentials)
    │
    ├── sessionStorage (passphrase, cleared on tab close)
    │
    ├── Supabase Client (anon key via supabase-factory)
    │     ├── Direct queries via repositories
    │     └── Realtime subscriptions (useRealtime → createUserClient)
    │
    └── /api/proxy (server-side TanStack route)
          └── Forwards to external APIs (Facebook, OpenAI, Supabase Management)
```

---

## Completed Phases

### Phase 1 ✅ — Foundation & Security

| Change | Details |
|--------|---------|
| Error handling | `src/errors/` — AppError hierarchy with typed error classes |
| Structured logging | `src/logger/` — Debug/info/warn/error with context |
| Validation layer | `src/validators/` — Zod schemas for all inputs |
| Repository layer | `src/repositories/` — 6 repositories, pagination support |
| Service layer | `src/services/` — Dashboard, Auth, AI, Publishing, Schedule, Analytics |
| Type system | `src/types/` — All database entity interfaces |
| SQL injection fix | `setup-runner.ts` — Parameterized queries ($1, $2) |
| Facebook token URL | Changed from URL query param to Authorization header |
| Auth migration | Migration 3 — user_id columns, auth-aware RLS, backward-compatible |
| Auth service | `auth-service.ts` + `useAuth.ts` hook |
| Dependency cleanup | Removed `package-lock.json`, removed unused `motion` package |
| Supabase factory | `supabase-factory.ts` — Cached client creation |

### Phase 2 ✅ — Architecture Stabilization

| Change | Details |
|--------|---------|
| compose.tsx refactor | 514 → 270 lines, logic → `useCompose` hook |
| schedule.tsx refactor | 412 → 260 lines, logic → `useSchedule` hook |
| AiService | `services/ai/ai.service.ts` — Text generation + image URL generation |
| PublishingService | `services/publishing/publishing.service.ts` — Draft CRUD + image upload |
| ScheduleService | `services/schedule/schedule.service.ts` — Calendar slot logic |
| AnalyticsService | `services/analytics/analytics.service.ts` — Engagement series + costs |
| CSP headers | Added to `server.ts` SSR handler |
| Security headers | Added to `server.ts` and `/api/proxy` route |
| Pagination | `base.ts` — `withPagination()` helper, applied to engagement + post repos |
| Documentation | `ARCHITECTURE.md` — Full architectural reference |
| README update | Development guide, migration guide, roadmap |
| TypeScript | Zero errors (`bun run tsc --noEmit`) |

### Phase 3 ✅ — Production Hardening & Performance Upgrade

| Priority | Change | Details |
|----------|--------|---------|
| HIGH | Service role removal from browser | Created `supabase/functions/manage-setup/index.ts` — edge function with `SUPABASE_SERVICE_ROLE_KEY` from env handles bucket creation/list/verify ops. Browser sends only PAT (already in browser). `setup-runner.ts` reordered: push secrets → deploy edge function → create bucket via edge function. `manage-setup-client.ts` helper created. |
| HIGH | Secure API proxy | `proxy.ts` rewritten with: in-memory per-IP sliding-window rate limiting (120/min), Zod request validation (ProxyRequestSchema.strict()), SSRF protection (private IP/localhost blocklist), response size cap (10MB), structured logging via `createLogger("api/proxy")`, enforce HTTPS for non-supabase.co targets, expanded allowlist documentation. |
| HIGH | Layer consistency | Created `DraftService` (`src/services/draft/draft.service.ts`) — wraps `BriefRepository` for all draft ops (approve, reject, bulk). Updated `ScheduleService` with `findScheduleData()` and `findActivePageId()` methods (client param optional for pure logic). Rewrote `useAuroraQuery.ts` to delegate all data access through `DashboardService`, `AnalyticsService`, `DraftService`, `ScheduleService`. No direct repository calls from hooks. |
| MEDIUM | Bundle optimization | `React.lazy` + `Suspense` for analytics charts (`LazyCharts` → lazy-imports `AnalyticsChartsInner` with recharts). ~300KB recharts deferred from initial bundle. QueryClient configured with `staleTime: 30s`, `gcTime: 5min`, `retry: 1`, `refetchOnWindowFocus: false`. |
| MEDIUM | Image optimization | Created `OptimizedImage` component with lazy loading, async decoding, fade-in, and shimmer placeholder. |
| MEDIUM | Database performance | Migration 4: 7 new indexes for content_briefs (status, slot_start), posts (status, idempotency_key), engagement_snapshots (captured_at), jobs (idempotency_key), ai_usage (called_at). |
| MEDIUM | Frontend rendering | `React.memo` on `DraftCard` component to prevent re-renders when search/bulk-selection changes. |
| MEDIUM | Testing expansion | 51 tests (from 33): added `ScheduleService` tests (7 tests for generateWeekDays/nextSuggestedSlot), `ProxyRequestSchema` validation tests (11 tests for schema + host allowlist logic). |

### Phase 2.5 ✅ — Stabilization Before Scaling

| Area | Change | Details |
|------|--------|---------|
| Worker stability | `fetchWithTimeout()` helper | Added `AbortController` timeouts to all external `fetch()` calls (LLM: 30s, Image: 20s, Facebook: 15s) |
| Worker stability | Atomic brief-level lock | Replaced race-condition-prone `existingPublishedPost()` check with atomic `UPDATE ... WHERE status IN ('approved','scheduled')` to prevent duplicate publishes |
| Worker security | Token in URL fixed | Moved Facebook access token from URL query parameter to `Authorization` header in `fetchFacebookMetrics()` |
| Architecture | `useRealtime.ts` fixed | Replaced direct `createClient("@supabase/supabase-js")` with `createUserClient()` from supabase-factory |
| Architecture | `useAuroraQuery.ts` fixed | Delegated analytics computation to `AnalyticsService`, removed duplicated business logic (~55 lines inline), fixed direct `.from()` call |
| Architecture | `schedule.tsx` fixed | Removed inline dynamic `import()` with direct service instantiation from route; moved `quickTimeAdjust` logic to `useSchedule` hook |
| Architecture | `PublishingService` fixed | Replaced all direct `this._client.from("content_briefs").{update,delete,insert}` calls with `BriefRepository` methods |
| Architecture | `AnalyticsService` fixed | Replaced direct `.from("content_briefs")` call with `BriefRepository.findBriefTopics()` |
| Architecture | `BriefRepository` expanded | Added `findBriefTopics()`, `findById()`, `upsert()`, `insert()`, `patch()`, `delete()` methods |
| Architecture | `RateLimitError` added | New error class with `retryAfterMs` property |
| Architecture | `createLogger()` added | Named logger factory wrapping the singleton logger |
| Testing | Vitest infrastructure | `vitest.config.ts`, 4 test files, 33 tests covering errors, validators, logger, repository pagination |
| Validation | Missing schemas added | `PostSchema`, `EngagementSnapshotSchema`, `WorkerStatusSchema`, defaults for `ProvidersSchema` |

### Phase 3.5 ✅ — Production Hardening

| Area | Change | Details |
|------|--------|---------|
| Worker reliability | Heartbeat/lease renewal | `setInterval` updates `lease_expires_at` every 30s during long tasks (`planContent`, `publishDuePosts`, etc.) |
| Worker reliability | Circuit breaker | `isProviderAvailable()` queries `system_events` for `CIRCUIT_THRESHOLD` (3) failures in `CIRCUIT_COOLDOWN_MS` (5 min) per provider; `recordProviderFailure()` inserts on error |
| Worker reliability | Structured logging | JSON stdout: `{t, l, w, rid, msg, ...}` with per-invocation `requestId` for Supabase Logs correlation |
| Worker reliability | Job completion metadata | `completed_at`, `lease_expires_at` cleanup, exponential backoff retry (`2^attempts` min, capped at 60) |
| Database | Migration 5 | Index on `system_events(category, created_at desc)` for circuit breaker queries; safe NOT NULL on `user_id` columns (no-op if existing nulls); schema version bump |
| TypeScript strict mode | `noUnusedLocals`, `noUnusedParameters` | Enabled — 22 violations fixed across 17 files (removed dead imports, unused params, unused `_client` fields) |
| Auth finalization | Migration 5 defaults | `user_id NOT NULL` enforced when no existing nulls; Migration 3's user-isolation is now the default path |
| Cleanup | Dead imports removed | `logger` from setup-runner/ai.service; `AppError` from user-supabase; `subDays` from useAuroraQuery; `loadInstallStatus` from SetupCard/useCompose; `GlassPanel`/`GlassInput` from drafts; `ViewMode` from schedule; `isSameDay` from schedule.service; `toast` from compose |

### Phase 4 ✅ — Facebook Growth Intelligence

#### Brand Memory System ✅

| Area | Change | Details |
|------|--------|---------|
| Brand Memory System | Migration 6 | `brand_memory` table: page_id, brand_descriptors, audience_profile, writing_style_notes, effective_hashtags, top_content_snippets, tone_guidelines, avoided_topics; unique per page_id |
| Brand Memory System | `BrandMemoryRepository` | `findByPageId`, `upsert`, `update` — standard repository pattern |
| Brand Memory System | `BrandMemoryService` | `load`, `save`, `buildLlmContext` (builds prompt context string), `autoExtract` (analyzes 90 days of published posts for tone, hashtags, top content) |
| Brand Memory System | Worker injection | `loadBrandMemory()` queries brand_memory per page; brand identity, style, tone, snippets injected into LLM brief generation prompt; `extract_brand_memory` recurring daily job |
| Brand Memory System | Settings UI | `BrandMemorySheet` — view/edit descriptors, style, tone, hashtags, avoided topics; auto-extract button; shows top 3 content snippets with engagement scores |
| Architecture | `PostRepository.findPublishedWithBriefs` | New method joining posts → content_briefs + engagement_snapshots for brand memory extraction |

#### AI Content Strategy Foundation (Phase 4.1) ✅

| Area | Change | Details |
|------|--------|---------|
| Strategy Recommendations | Migration 7 | `strategy_recommendations` table: page_id, recommendation_type (free-text), recommendation_text, reasoning, priority (1-10), related_content (jsonb), generated_at, status (active/dismissed/applied); `CHECK (priority >= 0 AND priority <= 10)` constraint |
| Strategy Repository | `StrategyRepository` | `findByPage`, `insert`, `insertBatch`, `dismiss`, `dismissAll`, `loadInsights` — standard repository pattern |
| Strategy Service | `StrategyService` | `analyzePage(pageId, llmConfig)` — fetches brand memory + strategy insights + 90 days of post history, builds structured LLM prompt, parses JSON recommendations, persists via `insertBatch`, dismisses ALL old recs before insert |
| Strategy Service | `buildAnalysisPrompt` (exported function) | Pure function — constructs single LLM call combining brand context, strategy insights (best hour, avg score, best topics), and scored post data. Tested directly via import. |
| Strategy Service | `callLlm` | Uses `proxyFetch`; JSON parse failure returns `[]` instead of throwing; non-OK response throws with status + body excerpt |
| Worker integration | `generate_strategy` job kind | Handler registered in worker switch statement (stub — actual API key lives on client); no cron activated |
| UI | Dashboard strategy panel | Loads existing recs on mount; "Analyze page" button clears dismissed types before analysis; shows recs grouped by type with priority; dismiss button per type |
| Tests | Strategy service test (Phase 4.1.5) | **14 tests** — brand memory injection, empty memory, average score, top-post ranking, zero-score exclusion from underperforming, empty history, missing engagement snapshots, valid JSON output, `normalizeRecommendations` (6), error sanitization (5), token expiry detection (5), strategy transaction safety (2) |

#### Phase 4.1 Verification — Intelligence Quality Pass ✅

| Issue | Type | Fix |
|-------|------|-----|
| `dismiss(pageId, "content_strategy")` was a no-op | **BUG** | Replaced with `dismissAll(pageId)` — dismisses ALL active recs for the page before inserting new ones |
| Individual `for...of` inserts (N queries) | **PERFORMANCE** | Replaced with single `insertBatch(batch)` call |
| `JSON.parse(content)` throws on bad AI output | **SAFETY** | Wrapped in try-catch; returns `[]` on parse failure |
| `buildAnalysisPrompt` private — tests duplicated function body | **MAINTENANCE** | Exported as pure function; tests import it directly; 3 new test scenarios added |
| Missing `priority` range constraint | **DATA QUALITY** | Added `CHECK (priority >= 0 AND priority <= 10)` to migration 7 |
| UI `dismissedTypes` not reset on re-analysis | **UX** | `setDismissedTypes(new Set())` added at top of `handleAnalyze` |
| Missing pagination | **LOW** | Not added — page typically has <200 recs; `findByPage` sorted by priority desc + generated_at desc |
| Worker `generate_strategy` stub | **ARCHITECTURE** | Intentional — AI API key lives on client; worker runs on server without user keys |
| **No upstream timeout** in `/api/proxy` | **SAFETY** | Added `AbortController` with 30s timeout on upstream fetch |
| **No structured logging** in `callLlm` | **OBSERVABILITY** | Added `this.log("info", ...)` before call, on failure, and on success with recommendation count |
| **No response validation** — any shape accepted | **SAFETY** | Added `normalizeRecommendations()` — filters out items missing `recommendation_type` or `recommendation_text`; fills defaults for optional fields |
| **No fallback** on AI failure — user sees raw error | **RESILIENCE** | `analyzePage` catches `callLlm` errors, logs them, returns cached recommendations if available; re-throws only if cache is empty |

#### Phase 4.1 — Known Limitations & Architecture

| Concern | Detail |
|---------|--------|
| Single LLM call = single point of failure | If the AI call fails (network, rate limit, model down), user sees an error with no recommendations (unless cached recs exist from a previous analysis) |
| No cron for auto-generation | `generate_strategy` worker stub exists but requires user API key on client — cron cannot activate without server-side key storage |
| AI output quality varies by model | Free-tier models may return generic recommendations. `normalizeRecommendations()` filters structurally invalid items but cannot validate semantic quality |
| No recommendation dedup within a session | `dismissAll` clears old recs before insert so there are no duplicates across sessions. Within a single `analyzePage` call, the AI may return duplicate types — no dedup applied |
| No recommendation storage pagination | Page typically has <200 recs; DB query sorted by priority desc + generated_at desc with no limit |
| No rate-limit awareness in client code | If `analyzePage` is called rapidly, the `/api/proxy` rate limiter (120/min) will reject requests. Error surfaced to user as "Too many requests" |

---



## File Manifest (All Source Files)

```
src/
 ├── types/index.ts                          # Shared interfaces
 ├── logger/index.ts                         # Structured logging + createLogger()
 ├── errors/index.ts                         # Error hierarchy + RateLimitError
 ├── validators/index.ts                     # Zod schemas (11 exported)
  ├── repositories/
  │   ├── base.ts                             # BaseRepository + withPagination()
  │   ├── brand-memory-repository.ts          # findByPageId, upsert, update
  │   ├── strategy-repository.ts             # findByPage, insert, insertBatch, dismiss, loadInsights
  │   ├── brief-repository.ts                 # 12 methods
  │   ├── page-repository.ts
  │   ├── post-repository.ts
  │   ├── engagement-repository.ts
  │   ├── system-event-repository.ts
  │   └── usage-repository.ts
 ├── services/
 │   ├── base.ts                             # BaseService with logging
 │   ├── index.ts                            # Service exports
 │   ├── supabase-factory.ts                 # Client factory (createUserClient)
  │   ├── auth-service.ts                     # Auth operations
  │   ├── brand-memory.service.ts             # Brand memory CRUD + auto-extract
  │   ├── strategy.service.ts                # AI content strategy: analyzePage, buildAnalysisPrompt, normalizeRecommendations, callLlm
  │   ├── dashboard-service.ts                # Dashboard aggregation
 │   ├── ai/
 │   │   ├── ai.service.ts                   # AI text/image generation
 │   │   └── providers/llm-providers.ts      # Provider base URLs
 │   ├── publishing/publishing.service.ts    # Draft + publish ops (uses BriefRepository)
 │   ├── schedule/schedule.service.ts        # Calendar logic + schedule data queries
 │   ├── analytics/analytics.service.ts      # Analytics (uses BriefRepository)
 │   └── draft/draft.service.ts              # Draft CRUD (approve/reject/bulk)
 ├── hooks/
 │   ├── useAuth.ts                          # Auth state hook
 │   ├── useRealtime.ts                      # Realtime subscriptions (via createUserClient)
 │   ├── useCompose.ts                       # Compose hook (extracted)
 │   ├── useSchedule.ts                      # Schedule hook + quickTimeAdjust
 │   └── useAuroraQuery.ts                   # Data queries (delegates to services ONLY)
 ├── components/
 │   ├── OptimizedImage.tsx                  # Lazy, fade-in, shimmer placeholder
 │   └── charts/
 │       ├── LazyCharts.tsx                  # React.lazy wrapper for analytics charts
 │       └── AnalyticsChartsInner.tsx        # Actual recharts components (lazy loaded)
 ├── features/                                # Feature components
 ├── routes/                                  # TanStack Router (thin UI only)
 └── lib/                                     # Legacy + helper modules
     ├── config-store.ts                     # Encrypted credential store
     ├── crypto.ts                           # AES-GCM browser crypto
     ├── edge-functions.ts                   # Edge function bundles (worker + manage-setup)
     └── manage-setup-client.ts              # Client for manage-setup edge function
supabase/functions/
 ├── aurora-worker/index.ts                  # Background planner/publisher/analytics
 └── manage-setup/index.ts                   # Secure setup ops (bucket mgmt, verif)
ARCHITECTURE.md                              # Architecture docs
AI_CONTEXT.md                                # This file
vitest.config.ts                             # Vitest configuration
```

---

## Security Posture

| Concern | Status |
|---------|--------|
| Credential storage | AES-GCM encrypted, passphrase in sessionStorage |
| SQL injection | FIXED — parameterized queries everywhere |
| Service role exposure | **FIXED** — Browser no longer uses service_role for ops; `manage-setup` edge function handles bucket ops with `SUPABASE_SERVICE_ROLE_KEY` from env. Service role still encrypted in localStorage for backward compat but never used at runtime. |
| Facebook token leakage | FIXED — Authorization header (client + worker), no URL params |
| PAT exposure | Acceptable (BYOB model, user's own token) |
| API proxy security | **ADDED** — Rate limiting (120/min per IP), Zod validation, SSRF protection, response size cap (10MB), logging, HTTPS enforcement |
| CSP headers | ADDED — script-src, connect-src, etc. hardened |
| XSS protection | Security headers on all responses |
| Auth isolation | Migration 3 available (optional, backward-compatible) |
| RLS policies | auth-aware policies with fallback to open access |
| Worker timeout | ADDED — AbortController timeouts on all external fetch() calls |
| Worker duplicate publish | FIXED — atomic brief-level lock before publishing |
| Worker secrets | GOOD — all from env vars via requiredEnv() helper |
| Worker heartbeat | ADDED — lease renewal every 30s during long tasks |
| Worker circuit breaker | ADDED — per-provider cooldown after 3 failures in 5 min |
| Worker logging | ADDED — structured JSON stdout with correlation IDs |
| TypeScript strict mode | ENABLED — `strict: true`, `noUnusedLocals`, `noUnusedParameters` |
| Auth isolation default | SET — Migration 5 enables user isolation by default (safe NOT NULL) |

---

## Production Blocker Fixes Completed

| Blocker | Fix | Test Coverage |
|---------|-----|---------------|
| Facebook token expiry silently stops publishing | Worker detects `result.error.code === 190`, logs `facebook_token_expired` event, creates `system_event`, marks job `failed_terminal` immediately (no retries) | 5 tests for detection logic + terminal marking |
| "Publish Now" bypassed form validation | Both buttons now `type="submit"` with `useRef` tracking publish mode; `handleSubmit` runs validation before `saveBrief` | Manual validation path verified |
| Internal DB errors leak to users | `sanitizeError()` utility logs original error internally, returns user-safe message per context (approve/reject/save/delete/schedule/compose) | 5 tests for all error types + fallback |
| Destructive actions without confirmation | `ConfirmDialog` (existing component) wraps single and bulk reject; user must confirm before action executes | UI verified with confirm/cancel flow |
| `dismissAll` before `insertBatch` loses data on failure | Reversed order: `insertBatch` runs first, `dismissAll` runs only after successful insert | 2 tests verify execution order + failure isolation |

## Remaining Risks (Next Agent Priority)

| Risk | Severity | Recommendation |
|------|----------|---------------|
| Service role in browser | HIGH | Create edge function for privileged ops; remove service_role from client bundle — **Phase 3: DONE** via `manage-setup` |
| No rate limiting on proxy | MEDIUM | Add `@upstash/rate-limit` or in-memory limiter to `/api/proxy` — **Phase 3: DONE** (in-memory per-IP sliding window, 120/min) |
| useAuroraQuery still uses direct repos | MEDIUM | Draft operations and schedule queries still bypass service layer — extract to DraftService — **Phase 3: DONE** |
| Large bundle size | MEDIUM | Route-based lazy loading; tree-shake unused Radix UI; review GlassCard and analytics bundles — **Phase 3: DONE** (React.lazy for analytics) |
| Strategy: AI output quality varies by model | LOW | Free-tier models may return generic or off-topic recommendations; consider model tier validation |
| Strategy: No cron for auto-generation | LOW | `generate_strategy` worker stub exists but requires user API key on client — cron cannot activate without server-side key storage |
| Strategy: Single LLM call = single point of failure | LOW | If the call fails (network, rate limit, model down), the user sees an error with no fallback recommendations |
| Image optimization | LOW | Add WebP/AVIF pipeline for uploaded images |
| API key rotation | LOW | No built-in mechanism to rotate or revoke stored API keys |
| Worker cold starts | LOW | Deno Edge Function cold start can delay job processing by 1–2s |
| No health endpoint | LOW | No `/health` or `/ready` endpoint for monitoring uptime |
| lint timeout | INFO | ESLint configuration may have performance issues on Windows |

---

## Development Rules

- **Do NOT bypass the service layer** — Hooks call services, services call repositories
- **Do NOT put business logic in routes** — Routes render UI and call hooks only
- **Repositories are the ONLY layer that queries Supabase** — No direct `.from()` calls outside repositories
- **Maintain BYOB/BYOK philosophy** — Users own their data; never hardcode credentials
- **Update ARCHITECTURE.md for structural changes** — Keep docs in sync
- **Commit clean changes** — One conceptual change per commit
- **Run `bun run tsc --noEmit` before committing** — Zero errors required
- **Run `bun run test` before committing** — All tests must pass
- **Add Zod validation for all input boundaries** — Routes, services, and setup

---

## Product Direction

**Aurora is a Facebook-first platform.** Build Facebook dominance before any multi-platform expansion. Do NOT implement Instagram, LinkedIn, TikTok, or Twitter/X integrations.

Phase 4 focus: **Facebook Growth Intelligence**. Keep architecture flexible for future platforms (prefer abstractions over hard-coded Facebook logic) but do not add any other platform code.

---

## Recommended Next Tasks (Phase 4)

### Priority Order

1. **AI Content Strategy** ✅
   - Strategy recommendations: `strategy_recommendations` table, `StrategyRepository`, `StrategyService.analyzePage()`, `buildAnalysisPrompt`, `callLlm` via proxyFetch — **DONE**
   - Worker integration: `generate_strategy` job kind registered (stub, no cron) — **DONE**
   - Dashboard UI: strategy recommendations panel with "Analyze" button — **DONE**
   - Tests: 4 tests covering data transformation and prompt building — **DONE**

2. **Facebook Automation Improvements**
   - Smarter scheduling: honor timezone-aware windows; avoid scheduling during low-engagement hours detected by strategy insights
   - Approval workflow: add review/reject step before publishing; notify user via in-app toast when posts await approval
   - Failed job recovery: add "Retry" button in Settings → Worker Status for failed jobs; surface `last_error` clearly
   - Publishing reliability: add pre-publish validation (page token still valid, image URL reachable, caption length within limits)

3. **Analytics Upgrade**
   - Content performance insights: per-post score (likes + comments×2 + shares×3), trend lines, best/worst performers
   - Growth trends: follower growth proxy (reach + impressions over 7/30/90 day windows), weekly change indicators
   - Engagement analysis: breakdown by day-of-week, hour, post type; heatmap visualization
   - Actionable recommendations: "Post on Tuesdays at 10AM for 40% higher engagement" — surfaced directly on dashboard

4. **Brand Memory System** ✅
   - Build a `brand_memory` table storing: page identity descriptors, audience profile, top-performing content snippets, writing style samples — **DONE**
   - Worker reads brand memory when generating briefs (inject into LLM context) — **DONE**
   - UI page in Settings → Brand Profile to review/edit what the AI remembers — **DONE** (`BrandMemorySheet`)
   - Auto-extract from successful posts: tone, length, common phrases, effective hashtags — **DONE** (daily recurring job + manual button)

5. **User Proof / SaaS Readiness**
   - Reports: weekly/monthly PDF/CSV export of content performance, growth metrics, publishing activity
   - Growth dashboards: visual summary of key metrics (posts published, engagement rate, follower growth proxy, best content)
   - Export: one-click CSV download for any analytics view
   - Case-study friendly analytics: time-range comparisons (this month vs last month), highlight wins (best post, biggest growth day)

---

## Commands Reference

```bash
bun install           # Install dependencies
bun run dev           # Start dev server
bun run build         # Production build (Vercel preset)
bun run tsc --noEmit  # TypeScript check (REQUIRED before commit)
bun run test          # Run Vitest (77 tests)
bun run test:watch    # Vitest in watch mode
bun run lint          # ESLint
bun run format        # Prettier
```

---

## Deployment Architecture

### CI/CD Pipeline

```
GitHub Repository (main branch)
    │
    ├── Push / Merge to main
    │       ↓
    │   Vercel GitHub Integration (auto-detected)
    │       ↓
    │   Vercel Build (Vite + Nitro SSR, preset: vercel)
    │       ↓
    │   .vercel/output/ (static assets + SSR function)
    │       ↓
    │   Vercel Deployment (Production)
    │       ↓
    │   https://<project>.vercel.app/
    │
    └── Push to feature branch
            ↓
        Vercel Preview Deployment (unique URL)
            ↓
        Used for testing before merging to main
```

### Key Files

| File | Purpose |
|------|---------|
| `vercel.json` | Build command, framework, install command, GitHub integration settings |
| `vite.config.ts` | Nitro Vercel preset (`preset: "vercel"`), SSR entry (`server.ts`) |
| `package.json` | `vercel-build` script (maps to `bun run build`), dependency declarations |
| `.vercel/output/` | Build output (Nitro generates this — NEVER commit, in `.gitignore`) |

### Deployment Safety

| Feature | How It Works |
|---------|-------------|
| **Production branch** | `main` — only merges to main trigger production deploy |
| **Preview deployments** | Every push to non-main branch creates a preview with unique URL |
| **Auto-cancelation** | `autoJobCancelation: true` — stale builds canceled when new pushes arrive |
| **Failed builds** | Visible in Vercel Dashboard → Deployments → red status |
| **Rollback** | Vercel Dashboard → Deployments → click "..." → "Rollback to this deployment" |
| **Silent mode** | `silent: true` — GitHub comments disabled for deployment status |

### Required Environment Variables

Set these in Vercel Dashboard → Project Settings → Environment Variables (Production + Preview).

#### Supabase
| Variable | Source | Required |
|----------|--------|----------|
| `FBAI_SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL | Yes |
| `FBAI_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → anon/public key | Yes |
| `FBAI_SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → service_role key | Yes |
| `SUPABASE_URL` | Same as `FBAI_SUPABASE_URL` (legacy) | Yes |
| `SUPABASE_ANON_KEY` | Same as `FBAI_SUPABASE_ANON_KEY` (legacy) | Yes |
| `SUPABASE_AUTH_CALLBACK_URL` | `https://<project>.vercel.app/auth/callback` | Yes |

#### Facebook
| Variable | Source | Required |
|----------|--------|----------|
| `FBAI_FB_PAGE_TOKEN` | Facebook Graph API (long-lived page token) | Yes |

#### AI Providers
| Variable | Source | Required |
|----------|--------|----------|
| `FBAI_ENCRYPTION_KEY` | Generated via `crypto.getRandomValues(new Uint8Array(32))` → base64 | Yes |

#### Auth & Security
| Variable | Source | Required |
|----------|--------|----------|
| `FBAI_USER_PASSPHRASE` | User-chosen passphrase for credential encryption | Yes |
| `FBAI_JWT_SECRET` | Generated random string (64+ chars) | Yes |

#### Runtime Only (Never in Build)
These env vars are referenced by name only in SSR code (`server.ts`, `/api/proxy`). The values are stored in Supabase Vault and read at runtime via `Deno.env.get()`. They NEVER appear in the client bundle.

### Environment Variable Rules

1. **Never commit secrets** — `.env*` files in `.gitignore`, only reference names in `AI_CONTEXT.md`
2. **Never put tokens in frontend bundle** — All API keys accessed server-side via `/api/proxy` or Supabase Vault
3. **Document required variables** — All env vars listed above with source instructions
4. **Preview env overrides** — Set same env vars in Preview environment with test/sandbox values
5. **Rotation** — Update env vars in Vercel Dashboard → redeploy to apply

### How Future Agents Should Deploy Changes

1. **Make changes** — Follow Routes → Hooks → Services → Repositories flow
2. **Verify locally**:
   ```bash
   bun run tsc --noEmit   # Zero TypeScript errors
   bun run test           # All 77 tests pass
   bun run build          # Build succeeds (SSR + static)
   ```
3. **Commit and push** — Use conventional commit messages
   ```bash
   git add -A
   git commit -m "description of change"
   git push origin main
   ```
4. **Vercel auto-deploys** — Monitor at Vercel Dashboard → Deployments
5. **Verify production** — Open the deployed URL, confirm the feature works
6. **Manual deployment** — Only if GitHub integration is unavailable:
   ```bash
   npx vercel deploy --prebuilt --token <token>
   ```
7. **Rollback** — If production issue, rollback via Vercel Dashboard (not git revert)

### Status

- **Vercel GitHub Integration:** Not yet connected — user must connect via Vercel Dashboard
- **Production URL:** Not yet deployed — after integration, first push deploys
- **Preview Deployments:** Enabled via `vercel.json` GitHub settings
- **Build Command:** `bun run build` (Vite + Nitro/Vercel preset)
- **Tests Passing:** 77/77 (Vitest)
- **TypeScript Errors:** 0 (`tsc --noEmit`)
