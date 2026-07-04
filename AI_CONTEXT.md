# Aurora Project Constitution

> **Single Source of Truth** — Merged from `AI_CONTEXT.md`, `ARCHITECTURE.md`, and Aurora Master Plan v2.
> Every AI agent MUST read this file first. Do NOT modify this file without updating all three source perspectives.
> If you need to update this file, ensure no information is removed — only add or correct.

**Last Updated:** July 2026
**Repository:** https://github.com/juyel-dev/direct-build
**Prior AI Agents:** 3 (OpenCode)
**Current Phase:** 4.1 (AI Content Strategy Foundation) — Complete
**Next Phase:** 4.2 (Facebook Automation Improvements)

---

## Preamble

This Constitution governs all development of Aurora — an open-source AI Facebook Autopilot. It codifies the project's architecture, principles, completed work, and future roadmap. Every contributor, human or AI, MUST operate within these bounds.

---

## Article I — Executive Overview

Aurora is an open-source AI Facebook Autopilot that follows the BYOB/BYOK model (Bring Your Own Backend / Bring Your Own Keys). Users own their Supabase project; the app provisions schema, edge functions, and automation during a one-click setup wizard.

**Core Workflow:** Planning → Draft → Approval → Scheduling → Publishing → Analytics

**Current State:**
- 77/77 Vitest tests passing
- 0 TypeScript errors (`tsc --noEmit`)
- Vercel-ready (Nitro SSR, Vite build)
- Not yet deployed to production (waiting on Vercel import + user Supabase setup)
- 8 database migrations applied
- 2 Supabase Edge Functions deployed (aurora-worker, manage-setup)
- AI Content Strategy (Phase 4.1) complete with StrategyService, StrategyRepository, Dashboard UI, 14 tests

---

## Article II — Project Vision & Philosophy

### Product Vision (DO NOT BREAK)
- AI Facebook Autopilot — **Facebook-first. No other platforms until Phase 5+**
- Open-source
- BYOB/BYOK (user owns Supabase project)
- One-click setup wizard
- AI content generation with brand memory
- Glassmorphism UI
- Keep existing workflow untouched
- Growth Intelligence: analytics, reports, actionable insights

### Core Principles (from Master Plan Section 1)

1. **Quality over speed** — Never ship broken code. Tests, types, and lint must pass before any commit.
2. **Don't break the workflow** — The existing Planning → Draft → Approval → Scheduling → Publishing → Analytics pipeline is sacred. Any change must preserve or enhance it.
3. **Build trust through reliability** — Users hand over their Facebook page access and AI API keys. Every failure must be graceful, logged, and recoverable.
4. **Security is not optional** — AES-GCM encryption, parameterized queries, service-role removal from browser, SSRF protection, rate limiting, CSP headers, and auth-aware RLS are baseline requirements.
5. **Architecture first** — Always go through Routes → Hooks → Services → Repositories. No shortcuts. No direct `.from()` calls outside repositories.
6. **Document as you build** — Update this Constitution for every structural change.
7. **Plan for multi-platform, execute Facebook-only** — Design abstractions for future platforms (Instagram, LinkedIn, TikTok, Twitter/X) but implement zero code for them until Phase 5+.

### Product Philosophy (from Master Plan Section 2)

- Aurora is a **Facebook-first platform**. Build Facebook dominance before any multi-platform expansion. Do NOT implement Instagram, LinkedIn, TikTok, or Twitter/X integrations.
- Phase 4 focus: **Facebook Growth Intelligence**. Keep architecture flexible for future platforms (prefer abstractions over hard-coded Facebook logic) but do not add any other platform code.
- The BYOB/BYOK model means **users own their data**. Never hardcode credentials. Never store user secrets on our servers (unless we migrate to SaaS — see Article XXXV).
- **One-click setup** is the north star for UX. The setup wizard should take a user from zero to publishing in under 5 minutes.
- **Glassmorphism UI** is the design system. Every new component should follow the existing Liquid Glassmorphism aesthetic (frosted glass, backdrop blur, subtle gradients).
- **AI with brand memory** — The AI should learn the user's brand voice, tone, and style over time. Brand memory is not a one-time configuration; it evolves with every post.
- **Growth Intelligence** means actionable insights, not just vanity metrics. Every chart, recommendation, and report should answer "what should I do next?"

---

## Article III — Technology Stack

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

### Key Dependencies (from package.json)
- `@heroicons/react`, `@hookform/resolvers`, `@radix-ui/*` (18+ primitives), `@supabase/supabase-js`, `@tailwindcss/vite`
- `@tanstack/react-query`, `@tanstack/react-router`, `@tanstack/react-start`, `@tanstack/router-plugin`
- `class-variance-authority`, `clsx`, `cmdk`, `date-fns`, `embla-carousel-react`
- `lucide-react`, `next-themes`, `react-day-picker`, `react-hook-form`, `recharts`, `sonner`, `tailwind-merge`, `tailwindcss-animate`, `vaul`, `zod`

---

## Article IV — Architecture

### Layer Architecture

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
| **Lib** | `src/lib/` | Infrastructure & utility modules (config-store, crypto, migrations, setup-runner). NOT a legacy dir — keeps app-level infra separate from business-logic services. |

### Service Boundaries

- **Routes** render UI and call hooks. No business logic.
- **Hooks** manage component state and call services.
- **Services** implement business logic, coordinate multiple repositories.
- **Repositories** encapsulate Supabase queries. Each table has its own repository.
- **Validators** use Zod for runtime type checking and input validation.

### Setup Flow

1. User creates Supabase project
2. User opens Aurora Settings → enters credentials
3. Credentials encrypted with passphrase, stored in localStorage
4. "Run Setup" triggers `setup-runner.ts`:
   - Verifies project access via Management API
   - Runs SQL migrations (schema, RLS, RPCs)
   - Creates storage bucket
   - Pushes secrets to Supabase Vault
   - Seeds Facebook page row
   - Deploys Edge Function
   - Schedules cron job via `pg_cron`
5. Automation runs every minute via Edge Function

### Worker Flow

```
pg_cron (every minute)
    │
    └── POST → aurora-worker Edge Function
                │
                ├── 1. Load active pages
                ├── 2. Seed recurring jobs (plan_content, publish_due_posts, capture_engagement, compute_strategy)
                ├── 3. Claim pending jobs (race-free via claim_jobs RPC)
                └── 4. Process each job:
                    ├── plan_content → AI generates briefs
                    ├── publish_due_posts → Facebook Graph API
                    ├── capture_engagement → Fetch metrics
                    └── compute_strategy → Update insights
```

### Authentication Flow

**Current (v1):**
- No user authentication
- Single user per project (BYOB model)
- Security through project-level access control
- Credentials encrypted at rest in localStorage

**Future (with migration 003):**
- Supabase Auth enabled
- `user_id` column on all tables
- RLS policies check `auth.uid()`
- Backward-compatible: falls back to open access when no user logged in
- Auth service + hooks available

---

## Article V — Data Flow

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

User Browser
    │
    ├── Encrypted localStorage (AES-GCM)
    │     └── Credentials (Supabase URL, keys, Facebook token)
    │
    ├── sessionStorage
    │     └── Passphrase (cleared on tab close)
    │
    ├── React Query (TanStack Query)
    │     └── Caches Supabase responses, auto-refresh
    │
    ├── Supabase Client (anon key)
    │     ├── Direct queries (read/write)
    │     └── Realtime subscriptions
    │
    └── /api/proxy (server-side)
          └── Forwards API calls to:
              ├── api.supabase.com (Management API)
              ├── graph.facebook.com (Graph API)
              ├── openrouter.ai / api.openai.com / etc.
              └── *.supabase.co (user's project)
```

---

## Article VI — Folder Structure

```
src/
 ├── components/        # Reusable UI components (glassmorphism design system)
 │   ├── ui/           # shadcn/ui primitives
 │   ├── glass/        # Glassmorphism design components
 │   ├── layout/       # AppShell, sidebar, navigation
 │   └── facebook/     # Facebook post preview
 │   └── charts/
 │       ├── LazyCharts.tsx              # React.lazy wrapper for analytics charts
 │       └── AnalyticsChartsInner.tsx    # Actual recharts components (lazy loaded)
 │
 ├── features/          # Feature-specific UI panels
 │   ├── settings/     # Settings forms (secrets, providers, brand, setup)
 │   └── schedule/     # WeekGrid, TimelineList, BriefEditor
 │
 ├── hooks/             # React hooks (data fetching, auth, compose, schedule)
 │   ├── useAuroraQuery.ts  # Data queries (delegates to services ONLY)
 │   ├── useCompose.ts      # Compose page state & logic
 │   ├── useSchedule.ts     # Schedule page state & logic + quickTimeAdjust
 │   ├── useAuth.ts         # Authentication state
 │   └── useRealtime.ts     # Supabase Realtime subscriptions (via createUserClient)
 │
 ├── services/          # Business logic layer
 │   ├── base.ts                             # BaseService with logging
 │   ├── index.ts                            # Service exports
 │   ├── supabase-factory.ts                 # Client factory (createUserClient)
 │   ├── auth-service.ts                     # Auth operations
 │   ├── dashboard-service.ts                # Dashboard aggregation
 │   ├── brand-memory.service.ts             # Brand memory CRUD + auto-extract
 │   ├── strategy.service.ts                 # AI content strategy: analyzePage, buildAnalysisPrompt, normalizeRecommendations, callLlm
 │   ├── ai/
 │   │   ├── ai.service.ts                   # AI text/image generation
 │   │   └── providers/llm-providers.ts      # Provider base URLs
 │   ├── publishing/publishing.service.ts    # Draft + publish ops (uses BriefRepository)
 │   ├── schedule/schedule.service.ts        # Calendar logic + schedule data queries
 │   ├── analytics/analytics.service.ts      # Analytics (uses BriefRepository)
 │   ├── draft/draft.service.ts              # Draft CRUD (approve/reject/bulk)
 │   ├── facebook/     # Facebook Graph API integration
 │   ├── storage/      # File upload & storage
 │   │
 ├── repositories/      # Data access layer (Supabase queries)
 │   ├── base.ts                             # BaseRepository + withPagination()
 │   ├── brand-memory-repository.ts          # findByPageId, upsert, update
 │   ├── strategy-repository.ts             # findByPage, insert, insertBatch, dismiss, loadInsights
 │   ├── brief-repository.ts                 # 12 methods
 │   ├── page-repository.ts
 │   ├── post-repository.ts
 │   ├── engagement-repository.ts
 │   ├── system-event-repository.ts
 │   └── usage-repository.ts
 │
 ├── validators/        # Zod validation schemas (11 exported)
 │
 ├── types/             # Shared TypeScript interfaces
 │   └── index.ts       # Page, Brief, Post, EngagementSnapshot, Job, AiUsage, SystemEvent, StrategyInsight, StrategyRecommendation, BrandMemory
 │
 ├── logger/            # Structured logging (debug/info/warn/error) + createLogger()
 │   └── index.ts
 │
 ├── errors/            # Error hierarchy (AppError, ValidationError, AuthError, RateLimitError, etc.)
 │   └── index.ts
 │
 ├── routes/            # TanStack Router routes (thin UI layer)
 │   ├── index.tsx     # Dashboard
 │   ├── compose.tsx   # Post composer
 │   ├── schedule.tsx  # Content calendar
 │   ├── drafts.tsx    # Draft approval queue
 │   ├── analytics.tsx # Engagement analytics
 │   ├── settings.tsx  # Configuration hub
 │   └── api/proxy.ts  # CORS-bypass proxy with rate limiting, SSRF protection, Zod validation
 │
 ├── features/                                # Feature components (settings, schedule, brand memory)
 │
 ├── components/
 │   ├── OptimizedImage.tsx                  # Lazy, fade-in, shimmer placeholder
 │   └── charts/
 │
  └── lib/               # Infrastructure & utilities (NOT legacy — keeps infra separate from services)
      ├── config-store.ts   # Encrypted localStorage config
      ├── crypto.ts         # AES-GCM browser crypto
      ├── edge-functions.ts # Edge function bundles (worker + manage-setup)
      ├── setup-runner.ts   # Supabase project provisioning (SQL injection fixed, parameterized queries)
      ├── management-api.ts # Supabase Management API wrapper
      ├── migrations.ts     # Database migrations
      └── manage-setup-client.ts # Client for manage-setup edge function

supabase/functions/
 ├── aurora-worker/index.ts              # Background planner/publisher/analytics
 └── manage-setup/index.ts               # Secure setup ops (bucket mgmt, verification)
```

---

## Article VII — Completed Milestones

### Phase 1 ✅ — Foundation & Security (Q2 2026)

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

### Phase 2 ✅ — Architecture Stabilization (Q2 2026)

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

### Phase 3 ✅ — Production Hardening & Performance Upgrade (Q2 2026)

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

### Phase 2.5 ✅ — Stabilization Before Scaling (Q2 2026)

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

### Phase 3.5 ✅ — Production Hardening (Q2 2026)

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

### Phase 4 ✅ — Facebook Growth Intelligence (Q2–Q3 2026)

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
| Worker integration | `generate_strategy` job kind | **IMPLEMENTED (Phase 4)** — Full worker-side implementation: loads brand memory + insights + post history, builds prompt, calls LLM directly, normalizes & persists via `replace_strategy_recommendations` RPC. Seeded on 6-hour cron loop. Fallback model support via `FBAI_FALLBACK_LLM_MODEL`. |
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
| Worker `generate_strategy` stub | **FIXED (Phase 4)** | Replaced with full implementation — worker calls LLM directly using `FBAI_AI_API_KEY` env var. Frontend still has independent `StrategyService.analyzePage()` for manual trigger. |
| **No upstream timeout** in `/api/proxy` | **SAFETY** | Added `AbortController` with 30s timeout on upstream fetch |
| **No structured logging** in `callLlm` | **OBSERVABILITY** | Added `this.log("info", ...)` before call, on failure, and on success with recommendation count |
| **No response validation** — any shape accepted | **SAFETY** | Added `normalizeRecommendations()` — filters out items missing `recommendation_type` or `recommendation_text`; fills defaults for optional fields |
| **No fallback** on AI failure — user sees raw error | **RESILIENCE** | `analyzePage` catches `callLlm` errors, logs them, returns cached recommendations if available; re-throws only if cache is empty |

#### Phase 4.1 — Known Limitations & Architecture

| Concern | Detail |
|---------|--------|
| Single LLM call = single point of failure | **MITIGATED (Phase 4)** — Worker has retry-with-fallback-model (`FBAI_FALLBACK_LLM_MODEL`). If primary model fails, tries fallback before failing. Frontend falls back to cached recommendations. |
| Auto cron for strategy generation | **IMPLEMENTED (Phase 4)** — `generate_strategy` seeded on 6-hour loop via `seedRecurringJobs()`. Worker calls LLM directly with `FBAI_AI_API_KEY` env var. |
| AI output quality varies by model | Free-tier models may return generic recommendations. `normalizeRecommendations()` filters structurally invalid items but cannot validate semantic quality |
| No recommendation dedup within a session | `dismissAll` clears old recs before insert so there are no duplicates across sessions. Within a single `analyzePage` call, the AI may return duplicate types — no dedup applied |
| No recommendation storage pagination | Page typically has <200 recs; DB query sorted by priority desc + generated_at desc with no limit |
| No rate-limit awareness in client code | If `analyzePage` is called rapidly, the `/api/proxy` rate limiter (120/min) will reject requests. Error surfaced to user as "Too many requests" |

---

## Article VIII — Security Posture

| Concern | Status |
|---------|--------|
| Credential storage | AES-GCM encrypted, passphrase in sessionStorage |
| SQL injection | FIXED — parameterized queries everywhere |
| Service role exposure | **FIXED** — Browser no longer uses service_role for ops; `manage-setup` edge function handles bucket ops with `SUPABASE_SERVICE_ROLE_KEY` from env. Service role key stored in encrypted localStorage only for setup-runner to pass to edge function. Dead browser-direct code path removed per Phase 3. |
| Facebook token leakage | FIXED — Authorization header (client + worker), no URL params |
| PAT exposure | Acceptable (BYOB model, user's own token) |
| API proxy security | **ADDED** — Rate limiting (120/min per IP), Zod validation, SSRF protection, response size cap (10MB), logging, HTTPS enforcement |
| CSP headers | ADDED — script-src, connect-src, etc. hardened |
| XSS protection | Security headers on all responses. **Residual risk**: passphrase lives in sessionStorage — any XSS can read it at runtime. Accepted per threat model (see crypto.ts). Full fix (server-side credential relay) deferred to SaaS/multi-tenant phase. |
| Auth isolation | Migration 3 available (optional, backward-compatible) |
| RLS policies | **REVIEWED (Phase 3)** — All tables use `user_or_open` pattern. When `auth.uid()` is null (unauthenticated), `else true` falls back to open access. Acceptable for single-user BYOB: sensitive ops route through edge functions; admin typically authenticates. **Multi-tenant TODO**: remove `else true` fallback. |
| Worker timeout | ADDED — AbortController timeouts on all external fetch() calls |
| Worker duplicate publish | FIXED — atomic brief-level lock before publishing |
| Worker secrets | GOOD — all from env vars via requiredEnv() helper |
| Worker heartbeat | ADDED — lease renewal every 30s during long tasks |
| Worker circuit breaker | ADDED — per-provider cooldown after 3 failures in 5 min |
| Worker logging | ADDED — structured JSON stdout with correlation IDs |
| TypeScript strict mode | ENABLED — `strict: true`, `noUnusedLocals`, `noUnusedParameters` |
| Auth isolation default | SET — Migration 5 enables user isolation by default (safe NOT NULL) |

### Additional Security Measures (from ARCHITECTURE.md)

- Credentials encrypted with AES-GCM (PBKDF2, 200k iterations)
- Passphrase stored only in sessionStorage (cleared on tab close)
- `service_role` key used only during setup (via Management API)
- Production uses anon key only
- Supabase Vault stores secrets for Edge Function
- CSP headers set on all responses
- RLS policies isolate user data (when auth enabled)
- Parameterized queries prevent SQL injection
- Facebook tokens never exposed in browser URLs (proxied server-side)

---

## Article IX — Production Blocker Fixes

| Blocker | Fix | Test Coverage |
|---------|-----|---------------|
| Facebook token expiry silently stops publishing | Worker detects `result.error.code === 190`, logs `facebook_token_expired` event, creates `system_event`, marks job `failed_terminal` immediately (no retries) | 5 tests for detection logic + terminal marking |
| "Publish Now" bypassed form validation | Both buttons now `type="submit"` with `useRef` tracking publish mode; `handleSubmit` runs validation before `saveBrief` | Manual validation path verified |
| Internal DB errors leak to users | `sanitizeError()` utility logs original error internally, returns user-safe message per context (approve/reject/save/delete/schedule/compose) | 5 tests for all error types + fallback |
| Destructive actions without confirmation | `ConfirmDialog` (existing component) wraps single and bulk reject; user must confirm before action executes | UI verified with confirm/cancel flow |
| `dismissAll` before `insertBatch` loses data on failure | Reversed order: `insertBatch` runs first, `dismissAll` runs only after successful insert | 2 tests verify execution order + failure isolation |

---

## Article X — Remaining Risks

| Risk | Severity | Recommendation |
|------|----------|---------------|
| Service role in browser | HIGH | Create edge function for privileged ops; remove service_role from client bundle — **Phase 3: DONE** via `manage-setup` |
| No rate limiting on proxy | MEDIUM | Add `@upstash/rate-limit` or in-memory limiter to `/api/proxy` — **Phase 3: DONE** (in-memory per-IP sliding window, 120/min) |
| useAuroraQuery still uses direct repos | MEDIUM | Draft operations and schedule queries still bypass service layer — extract to DraftService — **Phase 3: DONE** |
| Large bundle size | MEDIUM | Route-based lazy loading; tree-shake unused Radix UI; review GlassCard and analytics bundles — **Phase 3: DONE** (React.lazy for analytics) |
| Strategy: AI output quality varies by model | LOW | Free-tier models may return generic or off-topic recommendations; consider model tier validation |
| Strategy: Auto cron | **FIXED (Phase 4)** | `generate_strategy` seeded on 6-hour loop; worker calls LLM directly via `FBAI_AI_API_KEY` |
| Strategy: Single LLM call = single point of failure | **FIXED (Phase 4)** | Worker retries with fallback model (`FBAI_FALLBACK_LLM_MODEL`) before failing; frontend falls back to cached recs |
| Image optimization | LOW | Add WebP/AVIF pipeline for uploaded images |
| API key rotation | LOW | No built-in mechanism to rotate or revoke stored API keys |
| Worker cold starts | LOW | Deno Edge Function cold start can delay job processing by 1–2s |
| No health endpoint | LOW | No `/health` or `/ready` endpoint for monitoring uptime |
| lint timeout | INFO | ESLint configuration may have performance issues on Windows |
| Proxy rate limiter resets on cold start | INFO | In-memory sliding window resets every Vercel cold start. 120 req/min per IP has headroom for current scale. Migrate to Vercel KV for persistence if needed. |

---

## Article XI — Development Rules (Ground Rules for Execution)

These are the absolute, non-negotiable rules for every AI agent working on Aurora:

1. **Do NOT bypass the service layer** — Hooks call services, services call repositories
2. **Do NOT put business logic in routes** — Routes render UI and call hooks only
3. **Repositories are the ONLY layer that queries Supabase** — No direct `.from()` calls outside repositories
4. **Maintain BYOB/BYOK philosophy** — Users own their data; never hardcode credentials
5. **Update this Constitution for structural changes** — Keep docs in sync
6. **Commit clean changes** — One conceptual change per commit
7. **Run `bun run tsc --noEmit` before committing** — Zero errors required
8. **Run `bun run test` before committing** — All tests must pass
9. **Add Zod validation for all input boundaries** — Routes, services, and setup
10. **Never commit secrets** — `.env*` files are in `.gitignore`, only reference names in documentation
11. **Never put tokens in frontend bundle** — All API keys accessed via browser localStorage (encrypted) or Supabase Edge Function secrets
12. **Document where each variable lives** — See the three-tier credential model
13. **Rotation** — Update credentials in Settings UI → re-save; for Edge Functions, re-run Setup Wizard
14. **Test before deploy** — All tests must pass before any push to main
15. **Update docs for every structural change** — This Constitution, ARCHITECTURE.md, and any relevant README

---

## Article XII — Coding Standards

### General
- TypeScript strict mode enabled (`strict: true`, `noUnusedLocals`, `noUnusedParameters`)
- Zero `any` types — prefer `unknown` + type guards
- Prefer `const` over `let`
- Use `async/await` over raw promises
- No `// eslint-disable-next-line` without justification comment
- **DO NOT ADD comments in code** unless explicitly asked — code should be self-documenting

### Imports
- Group: 1) built-in/node, 2) external packages, 3) internal modules, 4) relative imports
- Use path aliases from `tsconfig.json` (e.g., `@/services/...`)

### Naming (see Article XIII for full conventions)

### File Structure
- One primary export per file (default export for routes, named exports for services/repositories/hooks)
- Service files: `src/services/{domain}/{domain}.service.ts`
- Repository files: `src/repositories/{entity}-repository.ts`
- Hook files: `src/hooks/use{Feature}.ts`

### Error Handling
- Use the AppError hierarchy: `throw new ValidationError(...)`, `throw new AuthError(...)`, etc.
- Never expose raw errors to users — use `sanitizeError()` utility
- Always log errors with `createLogger(name).error(...)` before sanitizing

### Logging
- Use `createLogger(name)` factory for every module
- Log levels: `debug` (development), `info` (normal ops), `warn` (recoverable), `error` (failure)
- Include context object as second parameter: `log.info("msg", { key: val })`
- Worker logging: JSON stdout format `{t, l, w, rid, msg, ...}` with per-invocation `requestId`

### Routing
- TanStack Router file-based routing in `src/routes/`
- Server routes under `src/routes/api/` (e.g., `proxy.ts`)
- Each route file is thin — call hooks, render UI, no business logic

---

## Article XIII — Naming Conventions

| Entity | Convention | Example |
|--------|-----------|---------|
| **Types** | PascalCase noun | `Brief`, `Page`, `EngagementSnapshot` |
| **Enums/Unions** | PascalCase | `BriefStatus`, `PostingMode`, `JobStatus` |
| **Interfaces** | PascalCase (no `I` prefix) | `StrategyInsight`, `BrandMemory` |
| **Repository classes** | PascalCase `{Entity}Repository` | `BriefRepository`, `PageRepository` |
| **Repository methods** | camelCase verb | `findByPageId()`, `insertBatch()`, `dismissAll()` |
| **Service classes** | PascalCase `{Domain}Service` | `StrategyService`, `DraftService` |
| **Service methods** | camelCase verb | `analyzePage()`, `buildLlmContext()` |
| **Hooks** | camelCase `use{Feature}` | `useAuth`, `useCompose`, `useRealtime` |
| **Routes** | kebab-case file names | `compose.tsx`, `drafts.tsx`, `analytics.tsx` |
| **Components** | PascalCase | `OptimizedImage`, `DraftCard`, `BrandMemorySheet` |
| **Constants** | UPPER_SNAKE_CASE | `CIRCUIT_THRESHOLD`, `CIRCUIT_COOLDOWN_MS` |
| **Environment variables** | UPPER_SNAKE_CASE prefixed `FBAI_` | `FBAI_SUPABASE_URL`, `FBAI_AI_API_KEY` |
| **Database tables** | snake_case | `content_briefs`, `engagement_snapshots`, `brand_memory` |
| **Migrations** | numeric prefix | `001_initial_schema.sql`, `003_add_auth.sql` |
| **Edge Functions** | kebab-case | `aurora-worker`, `manage-setup` |
| **Zod schemas** | PascalCase `{Entity}Schema` | `ProvidersSchema`, `PostSchema` |
| **Error classes** | PascalCase ending in `Error` | `ValidationError`, `AuthError`, `RateLimitError` |

---

## Article XIV — API Design Rules

### Internal Service APIs
- Services accept plain parameters, not request objects
- Services return typed data, not Supabase responses
- Services throw typed errors (AppError hierarchy), never raw errors
- Services use `BaseService` for logging

### Repository APIs
- Each table has exactly one repository
- Repositories accept typed parameters and return typed responses
- All queries use `withPagination()` where applicable
- Never expose Supabase client from repositories — consumers get typed data only

### External API Proxy (`/api/proxy`)
- Accepts `POST` requests with `ProxyRequestSchema.strict()` validation
- Validates: `url` (in allowlist), `method`, `headers`, `body`
- Security: SSRF protection (private IP blocklist), rate limiting (120/min per IP sliding window), response size cap (10MB), HTTPS enforcement for non-supabase.co targets
- Logs every request via `createLogger("api/proxy")`

### Worker APIs
- Edge Function invoked by `pg_cron` via HTTP POST
- All secrets from environment variables (pushed via Setup Wizard)
- Structured JSON stdout logging with `requestId` correlation
- Circuit breaker: 3 failures in 5 min = cooldown per provider
- Heartbeat: lease renewal every 30s during long tasks

---

## Article XV — Database Strategy

### Migrations Applied
| Migration | Purpose |
|-----------|---------|
| Migration 1 | Initial schema (content_briefs, posts, engagement_snapshots, pages, jobs, ai_usage, system_events) |
| Migration 2 | RLS policies, RPCs (claim_jobs, complete_job, fail_job) |
| Migration 3 | Auth — user_id columns, auth-aware RLS, backward-compatible |
| Migration 4 | Performance indexes (7 new indexes) |
| Migration 5 | Schema version bump, system_events index, safe NOT NULL on user_id |
| Migration 6 | Brand memory table |
| Migration 7 | Strategy recommendations table + CHECK constraint |

### Tables Created
| Table | Purpose |
|-------|---------|
| `content_briefs` | Post drafts with status lifecycle (draft→approved→scheduled→published) |
| `posts` | Published post records with Facebook post IDs |
| `engagement_snapshots` | Time-series engagement metrics (likes, comments, shares, reach, impressions) |
| `pages` | Facebook page configuration and posting mode |
| `jobs` | Background job queue with retry and lease system |
| `ai_usage` | AI provider token usage and cost tracking |
| `system_events` | Structured event log for monitoring and circuit breaker |
| `brand_memory` | Per-page brand identity descriptors, writing style, tone, hashtags, content snippets |
| `strategy_recommendations` | AI-generated content strategy recommendations with priority and status |

### Key Constraints
- `strategy_recommendations.priority` — `CHECK (priority >= 0 AND priority <= 10)`
- `brand_memory.page_id` — unique per page_id
- `jobs.idempotency_key` — unique index prevents duplicate job creation
- `posts.idempotency_key` — unique index prevents duplicate publishing

### Query Rules
- Parameterized queries everywhere (no string interpolation in SQL)
- Indexed columns: status, slot_start, idempotency_key, captured_at, called_at, category+created_at
- Migrations are idempotent — `IF NOT EXISTS` / safe re-runs
- Schema version tracked in `schema_version` table

---

## Article XVI — State Management

### Server State (Supabase)
- TanStack Query (React Query v5) for all server data
- QueryClient defaults: `staleTime: 30s`, `gcTime: 5min`, `retry: 1`, `refetchOnWindowFocus: false`
- Realtime subscriptions via `useRealtime` hook → `createUserClient()`

### Client State
- React state (`useState`/`useReducer`) for UI-local state
- `sessionStorage` for passphrase (cleared on tab close)
- `localStorage` for encrypted credentials (AES-GCM via `config-store.ts`)

### React Query Keys
- Follow `[{domain}, {entity}, ...params]` convention
- Example: `['pages', pageId]`, `['analytics', pageId, { days }]`, `['brand-memory', pageId]`

---

## Article XVII — Authentication & Authorization

### Current (BYOB Model)
- No user accounts
- Single user per Supabase project
- Security via: project-level access (Supabase URL + anon key), encrypted localStorage, passphrase gate
- RLS: open access (fallback mode) when auth not enabled

### Optional Auth (Migration 3)
- Supabase Auth enabled via Settings toggle
- `user_id` column on all tables
- RLS policies check `auth.uid()`
- Backward-compatible: falls back to open access when no user logged in
- Auth service: `auth-service.ts` + `useAuth.ts` hook

---

## Article XVIII — Error Handling

### Error Hierarchy (`src/errors/index.ts`)
```
AppError (base)
 ├── ValidationError     — Zod validation failures
 ├── AuthError           — Authentication/authorization failures
 ├── DatabaseError       — Supabase query failures
 ├── ExternalApiError    — Facebook/OpenAI/other API failures
 ├── RateLimitError      — Proxy rate limiting (has retryAfterMs)
 ├── ConfigError         — Missing or invalid configuration
 └── UnknownError        — Unexpected errors
```

### Rules
- Services throw typed errors from the AppError hierarchy
- Repositories catch Supabase errors and throw `DatabaseError`
- Routes/hooks catch errors and display user-safe messages via `sanitizeError()`
- Never expose raw error messages, stack traces, or internal details to users
- All errors logged via `createLogger(name).error(...)` before sanitization
- `sanitizeError()` returns context-aware messages per operation (approve/reject/save/delete/schedule/compose)

---

## Article XIX — Logging

### Logger Factory
```typescript
import { createLogger } from '@/logger';
const log = createLogger('my-module');
log.info('Operation completed', { userId: 123 });
```

### Log Levels
| Level | Usage |
|-------|-------|
| `debug` | Development details, verbose tracing |
| `info` | Normal operations, state transitions |
| `warn` | Recoverable issues, deprecations |
| `error` | Failures requiring attention |

### Worker Logging
- JSON stdout format: `{t: timestamp, l: level, w: worker_name, rid: requestId, msg: message, ...context}`
- Per-invocation `requestId` generated at start of each cron tick
- Correlatable in Supabase Logs dashboard

### Proxy Logging
- Every request logged: `{method, url, status, size, duration, ip (truncated)}`
- Rate limit hits logged as warnings

---

## Article XX — Monitoring & Observability

### Current
- System events table for token expiry, worker failures, circuit breaker state
- Worker stdout logs correlated via requestId
- Dashboard shows worker status (last run, today's runs)
- No external monitoring service integrated

### Needed (Phase 2 of Master Plan)
- `/health` endpoint for uptime monitoring
- Worker health check with Prometheus-style metrics
- Sentry or similar error tracking
- Usage dashboard in-app (Edge Function invocations, DB size, AI costs)
- Alerts for: token expiry, worker down, circuit breaker tripped

---

## Article XXI — Performance Guidelines

### Current Optimizations
- React.lazy + Suspense for analytics charts (~300KB recharts deferred)
- React.memo on DraftCard
- QueryClient staleTime: 30s, gcTime: 5min, retry: 1
- Migration 4 indexes for common query patterns
- Pagination support in repositories (`withPagination()`)
- Lazy loading for images (`OptimizedImage`)
- Bundle splitting via TanStack Router (route-based)

### Rules
- Lazy-load heavy dependencies (charts, editors)
- Memoize expensive renders (lists, cards)
- Defer non-critical data (analytics, history) with `staleTime`
- Index any column used in `WHERE`, `ORDER BY`, or `JOIN`
- Never fetch entity lists without pagination
- Prefer Supabase Realtime for live updates over polling

### Performance Considerations (from ARCHITECTURE.md)
- React Query caching (staleTime, refetchInterval)
- Pagination support in all repositories
- Lazy loading for images
- Realtime subscriptions for live updates
- Bundle splitting via TanStack Router (route-based)

---

## Article XXII — UX Principles

- **Glassmorphism design system** — Every component follows Liquid Glassmorphism aesthetic (frosted glass with `/glass` components, backdrop blur, subtle gradients)
- **One-click setup** — Setup Wizard takes user from zero to publishing in under 5 minutes
- **Passphrase gate** — Dashboard shows "Unlock to continue" on fresh session; wrong passphrase shows error
- **Empty states** — Every data view has a meaningful empty state with CTA
- **Confirmation dialogs** — Destructive actions (reject, bulk operations) use `ConfirmDialog`
- **Toasts** — All operations show success/failure toasts via `sonner`
- **Responsive** — Mobile-friendly layout via Tailwind responsive utilities
- **Dark mode** — Supported via `next-themes`
- **Progressive disclosure** — Complex features (brand memory, strategy) shown in expandable sheets/panels
- **Status badges** — Visual indicators for brief statuses (draft/approved/scheduled/published/failed)

---

## Article XXIII — Component Standards

### Component Types
| Type | Location | Purpose |
|------|----------|---------|
| **Primitives** | `src/components/ui/` | shadcn/ui wrappers (Button, Input, Dialog, etc.) |
| **Glass components** | `src/components/glass/` | Glassmorphism design components (GlassPanel, GlassCard, GlassInput) |
| **Layout** | `src/components/layout/` | AppShell, sidebar, navigation |
| **Feature** | `src/features/` | Feature-specific panels (SettingsHub, WeekGrid, BrandMemorySheet) |
| **Charts** | `src/components/charts/` | Analytics charts (LazyCharts, AnalyticsChartsInner) |
| **Optimized** | `src/components/` | Generic optimized components (OptimizedImage) |

### Rules
- Components are pure UI — no business logic, no direct Supabase calls
- Components receive data via props from hooks
- Use shadcn/ui primitives for standard UI elements
- Create glass variants for Aurora-specific styling
- `React.forwardRef` for reusable form components
- Default exports for route components, named exports for everything else

---

## Article XXIV — Testing Strategy

### Test Infrastructure
- **Runner:** Vitest (configured in `vitest.config.ts`)
- **Count:** 77 tests (expanded from 33)
- **Pattern:** `*.test.ts` alongside source files

### Test Coverage Areas
| Area | Tests | Details |
|------|-------|---------|
| Errors | 6 | AppError hierarchy, typed error classes |
| Validators | 11+ | ProxyRequestSchema, PostSchema, EngagementSnapshotSchema, WorkerStatusSchema, defaults |
| Logger | 4 | Structured logging, createLogger factory |
| Repositories | 2 | BaseRepository pagination (`withPagination()`) |
| Strategy service | 14 | brand memory injection, empty history, average score, top-post ranking, zero-score exclusion, valid JSON output, normalizeRecommendations (6), error sanitization (5), token expiry detection (5), transaction safety (2) |
| ScheduleService | 7 | generateWeekDays, nextSuggestedSlot |
| Proxy schema | 11 | Validation, host allowlist logic |

### Rules
- Tests must pass before every commit (`bun run test`)
- Tests are unit tests — no integration or E2E tests currently
- Test pure functions directly (export them, don't force tests through private methods)
- Mock external dependencies (Supabase, AI providers, Facebook API)
- Add tests for: validation schemas, error edge cases, service logic, repository queries
- New features require new tests — no exceptions

---

## Article XXV — CI/CD & Deployment Strategy

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

### Deployment Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Bun not available in Vercel build image | Low | Bun is pre-installed on Vercel since Oct 2024; fallback: change to `npm run build` in `vercel.json` |
| Missing Supabase credentials on first load | Certain (expected) | App shows Setup card instead of dashboard — user enters credentials in Settings |
| Edge Function cold start delays | Medium | Worker has 30s timeout + heartbeat; cold start adds ~1-2s |
| Facebook token expiry | Low | Worker detects code 190, creates system event, stops retries |
| AI provider rate limits | Medium | `/api/proxy` rate-limited at 120/min; worker has circuit breaker (3 failures in 5 min = cooldown) |
| Preview deployments expose unconfigured app | Low | Preview deploys same app — user must configure Supabase separately per preview |

### Pre-Deployment Checklist (Before First Vercel Import)

| # | Item | Status | Instructions |
|---|------|--------|-------------|
| 1 | **GitHub remote correct** | ✅ | `origin = https://github.com/juyel-dev/direct-build.git` |
| 2 | **main branch pushed** | ✅ | Latest commit: `d57b040` — "Setup GitHub Vercel continuous deployment" |
| 3 | **Build passes locally** | ✅ | `bun run build` succeeds (Vite + Nitro/Vercel preset) |
| 4 | **TypeScript zero errors** | ✅ | `tsc --noEmit` exits clean |
| 5 | **All tests pass** | ✅ | 77/77 Vitest tests passing |
| 6 | **No pending changes** | ✅ | `git status` clean |
| 7 | **Framework detection** | ✅ | `vercel.json` sets `"framework": "vite"` — Vercel auto-detects Vite |
| 8 | **Build command** | ✅ | `vercel-build` script in `package.json` → `bun run build` |
| 9 | **SSR/Nitro output format** | ✅ | `vite.config.ts` forces `nitro.preset: "vercel"` — outputs `.vercel/output/` (native Vercel format) |
| 10 | **Supabase project ready** | ⬜ | User must have Supabase project created (needed after deploy for Setup Wizard) |
| 11 | **Facebook app + page token** | ⬜ | User must have Facebook Developer app + long-lived page token |
| 12 | **AI provider API key** | ⬜ | User must have at least one AI provider key (OpenAI, OpenRouter, etc.) |
| 13 | **`.vercel/output/` ignored** | ✅ | `.vercel/` is in `.gitignore` |
| 14 | **No secrets in frontend bundle** | ✅ | All secrets accessed via localStorage or Edge Function secrets |
| 15 | **Vercel account ready** | ⬜ | User must have Vercel account + GitHub OAuth connected |

### Post-Deploy Steps (after first Vercel deploy succeeds)

1. Open `https://<project>.vercel.app/`
2. Go to **Settings → Credentials** → enter Supabase URL + anon key
3. Go to **Settings → Setup** → run Setup Wizard (pushes Edge Functions + secrets + cron)
4. Go to **Settings → Facebook** → add page token and page ID
5. Go to **Settings → AI Providers** → configure LLM and image provider
6. Create a test post → verify it reaches Facebook page
7. Verify analytics and strategy panels load data

---

## Article XXVI — Environment Variables & Credential Model

Aurora uses a **three-tier credential model**:

```
┌─────────────────────────────────────────────────────────────────┐
│  TIER 1: Vercel Build/Runtime (set in Vercel Dashboard)         │
│  ─────────────────────────────────────────────────────────────── │
│  Variables needed by Vite/Nitro at build time or SSR runtime.   │
│  These are the ONLY vars required in Vercel Project Settings.   │
│  CURRENT: None required.                                        │
├─────────────────────────────────────────────────────────────────┤
│  TIER 2: Supabase Edge Function Secrets (set via Setup Wizard)  │
│  ─────────────────────────────────────────────────────────────── │
│  Pushed to Supabase's internal secret store by the in-app       │
│  Setup Wizard (setup-runner.ts). Deno.env.get() at runtime.     │
│  NOT needed in Vercel Dashboard.                                │
├─────────────────────────────────────────────────────────────────┤
│  TIER 3: Browser localStorage (encrypted, set via Settings UI)  │
│  ─────────────────────────────────────────────────────────────── │
│  User enters these credentials in the Settings page. Stored     │
│  encrypted with AES-GCM (passphrase in sessionStorage).         │
│  NEVER sent to Vercel or Supabase env stores.                   │
└─────────────────────────────────────────────────────────────────┘
```

### Tier 1 — Vercel Env Vars

The frontend SSR app needs no Vercel env vars. Supabase credentials are user-provided via the browser UI.

### Tier 2 — Supabase Edge Function Secrets (pushed by Setup Wizard)

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `FBAI_SUPABASE_URL` | Yes | — | Supabase project URL for worker DB access |
| `FBAI_SUPABASE_SERVICE_ROLE_KEY` | Yes | — | Service role key for worker DB access |
| `FBAI_CRON_SECRET` | No | — | Shared secret for pg_cron → worker auth |
| `FBAI_FB_PAGE_TOKEN` | Yes | — | Facebook long-lived page access token |
| `FBAI_AI_API_KEY` | No | — | LLM provider API key |
| `FBAI_LLM_PROVIDER` | No | `"openrouter"` | Default LLM provider |
| `FBAI_LLM_MODEL` | No | `"meta-llama/llama-3.3-70b-instruct:free"` | Default LLM model |
| `FBAI_LLM_BASE_URL` | No | provider default | Custom LLM base URL |
| `FBAI_IMAGE_PROVIDER` | No | `"pollinations"` | Default image provider |
| `FBAI_IMAGE_MODEL` | No | `"flux"` | Default image model |
| `FBAI_IMAGE_API_KEY` | No | — | Image provider API key (DALL-E) |

Additional vars for `manage-setup` Edge Function:
| Variable | Required | Notes |
|----------|----------|-------|
| `SUPABASE_URL` | Yes | Set manually in Supabase Dashboard → Edge Functions → manage-setup → Secrets |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Same as above |

### Tier 3 — Browser localStorage Credentials (set via Settings UI)

| Key (in SecretsSchema) | Encrypted in localStorage | Purpose |
|------------------------|--------------------------|---------|
| `supabaseUrl` | Yes | Supabase project URL for client SDK |
| `supabaseAnonKey` | Yes | Supabase anon/public key for client SDK |
| `supabaseServiceKey` | Yes | Service role (legacy, no longer used at runtime) |
| `supabasePAT` | Yes | Personal Access Token for Management API |
| `facebookPageToken` | Yes | Facebook page access token |
| `facebookPageId` | Yes | Facebook page ID |
| `aiApiKey` | Yes | LLM provider API key |
| `imageApiKey` | Yes | Image provider API key |
| `encryptionKey` | Yes | AES-GCM key (base64, 32 bytes) |
| `passphrase` | No (sessionStorage) | Cleared on tab close |

### Environment Variable Rules

1. **Never commit secrets** — `.env*` files in `.gitignore`, only reference names in this Constitution
2. **Never put tokens in frontend bundle** — All API keys accessed via browser localStorage (encrypted) or Supabase Edge Function secrets
3. **Document where each variable lives** — See three-tier map above
4. **Rotation** — Update credentials in Settings UI → re-save; for Edge Functions, re-run Setup Wizard

---

## Article XXVII — Git Workflow & Branch Strategy

### Branch Model
- `main` — Production branch. Only merges to main trigger Vercel production deploy.
- Feature branches — Created from `main`, merged back via PR (no direct pushes to main)
- Branch naming: `feat/{description}`, `fix/{description}`, `chore/{description}`

### Commit Conventions
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `perf:`
- One conceptual change per commit
- Example: `feat: add StrategyService.analyzePage with brand memory injection`

### Pre-Merge Requirements
- [ ] `bun run tsc --noEmit` — zero errors
- [ ] `bun run test` — all tests pass
- [ ] `bun run build` — build succeeds
- [ ] This Constitution updated for structural changes
- [ ] `ARCHITECTURE.md` updated for structural changes
- [ ] Commits are clean (no WIP, no debug code, no commented-out code)

### Vercel Integration
- Push to non-main → Vercel Preview Deployment
- Merge to main → Vercel Production Deployment
- Auto-cancelation enabled for stale preview builds
- Silent mode on GitHub deployment comments

---

## Article XXVIII — Code Review Checklist

For every pull request, review:

### Correctness
- Does the change follow Routes → Hooks → Services → Repositories flow?
- Are there any direct `.from()` calls outside repositories?
- Is business logic in services, not routes or components?
- Are Supabase queries parameterized?

### Security
- No secrets or tokens in frontend bundle
- No hardcoded credentials
- Input validation at all boundaries (Zod schemas)
- SSRF protection for any new proxy routes
- Rate limiting for any new public endpoints

### Testing
- Are new tests added for new functionality?
- Do existing tests still pass?
- Are edge cases covered (empty states, error states, rate limits)?

### Performance
- Are heavy components lazy-loaded?
- Are queries paginated where needed?
- Are indexes needed for new query patterns?
- Are React.memo / useMemo applied to expensive renders?

### Documentation
- Is this Constitution updated for structural changes?
- Is `ARCHITECTURE.md` updated for structural changes?
- Are new environment variables documented?
- Are new migrations documented?

### Code Quality
- Zero TypeScript errors in strict mode
- No `any` types
- No dead imports, unused variables, or commented-out code
- Consistent naming (see Article XIII)
- One primary export per file

---

## Article XXIX — Release Checklist

### Before Any Release
1. [ ] All pre-merge requirements met
2. [ ] No known production blockers in "Remaining Risks"
3. [ ] First Production Testing Checklist completed (for initial release)
4. [ ] Edge Functions deployed and verified
5. [ ] Migrations applied and verified
6. [ ] Credentials flow verified (encrypt, decrypt, unlock)

### Release Steps
1. Merge feature branch to `main`
2. Vercel auto-deploys production build
3. Verify production URL loads correctly
4. Run smoke tests:
   - App loads without errors
   - Credentials unlock works
   - Setup Wizard runs
   - Draft → Approve → Publish flow works
   - Analytics and strategy panels render
5. Monitor Vercel Dashboard for build/deploy errors

### Rollback
- Do NOT use `git revert` for deployment rollbacks
- Use Vercel Dashboard → Deployments → "..." → "Rollback to this deployment"
- Fix the issue in a new commit, then push to main

---

## Article XXX — Design Constraints for Future Optionality (Master Plan Section 3)

These constraints ensure Aurora can expand to multi-platform, SaaS, or enterprise without rewrites.

### Multi-Platform Architecture
- **Service abstractions** — Facebook-specific logic is isolated in dedicated services (e.g., `services/facebook/`). Future platforms (Instagram, LinkedIn, TikTok, Twitter/X) get their own service directories.
- **Repository pattern** — All data access goes through repositories. Platform-specific tables can coexist without affecting core schema.
- **Provider pattern** — AI providers are already abstracted via `llm-providers.ts` and `ProvidersSchema`. Adding a new social platform follows the same pattern: types → validators → repository → service → UI.

### SaaS Migration Readiness
- **Three-tier credential model** — Already documented. Tier 2 (Edge Function secrets) and Tier 3 (browser storage) map cleanly to a server-side credential store.
- **Vercel KV path** — The Migration Path to SaaS (Article XXXV) is pre-defined. Adding Vercel KV for credential storage requires no architectural changes — just a new `credential-repository.ts` that reads from KV instead of localStorage.
- **Auth migrations** — Migration 3 (Supabase Auth) exists and is backward-compatible. Full SaaS auth just needs enabling + Stripe integration.

### AI Provider Extensibility
- **Adding a new provider:** Add to `AIProviderType` enum in `validators/`, add provider logic in `services/ai/`, update `defaultBaseUrl` map.
- **Adding a new image provider:** Same pattern, separate config in `ProvidersSchema`.

### Facebook API Versioning
- Currently targeting Facebook Graph API v21.0
- API version is configurable in service config, not hardcoded

### Worker Extensibility
- **Adding a new job kind:** Register the handler in the worker switch statement, add cron schedule via `pg_cron`, add repository for any new tables.
- Job kinds currently registered: `plan_content`, `publish_due_posts`, `capture_engagement`, `compute_strategy`, `generate_strategy` **(Phase 4: full implementation)**, `extract_brand_memory`

---

## Article XXXI — Master Task List (Master Plan Section 4)

### Phase 1 ✅ — Foundation & Security
- Error handling hierarchy
- Structured logging
- Validation layer (Zod)
- Repository layer
- Service layer
- Type system
- SQL injection fix
- Facebook token security
- Auth migration (optional)
- Auth service + hook
- Supabase client factory

### Phase 2 ✅ — Architecture Stabilization
- compose.tsx → useCompose hook refactor
- schedule.tsx → useSchedule hook refactor
- AiService, PublishingService, ScheduleService, AnalyticsService
- CSP + security headers
- Pagination support
- ARCHITECTURE.md documentation
- TypeScript zero errors

### Phase 3 ✅ — Production Hardening
- Service role removal from browser (manage-setup edge function)
- Secure API proxy (rate limiting, SSRF protection, Zod validation, 10MB cap, HTTPS enforcement)
- Layer consistency (DraftService, no direct repo calls from hooks)
- Bundle optimization (React.lazy for charts, QueryClient tuning)
- Image optimization (OptimizedImage component)
- Database performance (Migration 4 indexes)
- Frontend rendering (React.memo on DraftCard)
- Testing expansion (51 tests)

### Phase 2.5 ✅ — Stabilization Before Scaling
- fetchWithTimeout() for all external calls
- Atomic brief-level lock for duplicate publish prevention
- Token in URL → Authorization header (worker)
- useRealtime.ts → createUserClient()
- useAuroraQuery.ts → AnalyticsService delegation
- schedule.tsx architecture fixes
- PublishingService → BriefRepository delegation
- AnalyticsService → BriefRepository delegation
- BriefRepository expansion (6 new methods)
- RateLimitError class
- createLogger() factory
- Vitest infrastructure (4 test files, 33 tests)
- Missing Zod schemas (Post, EngagementSnapshot, WorkerStatus)

### Phase 3.5 ✅ — Production Hardening (Round 2)
- Worker heartbeat / lease renewal (30s interval)
- Worker circuit breaker (3 failures in 5 min per provider)
- Worker structured JSON logging with requestId
- Job completion metadata + exponential backoff retry
- Migration 5: system_events index, safe NOT NULL on user_id
- TypeScript strict mode (noUnusedLocals, noUnusedParameters)
- Auth finalization (Migration 5 defaults)
- Dead import cleanup

### Phase 4 ✅ — Facebook Growth Intelligence

#### Brand Memory System ✅
- Migration 6: brand_memory table
- BrandMemoryRepository (findByPageId, upsert, update)
- BrandMemoryService (load, save, buildLlmContext, autoExtract)
- Worker injection (loadBrandMemory into LLM prompt)
- Settings UI (BrandMemorySheet)
- PostRepository.findPublishedWithBriefs

#### AI Content Strategy Foundation (Phase 4.1) ✅
- Migration 7: strategy_recommendations table
- StrategyRepository (findByPage, insert, insertBatch, dismiss, dismissAll, loadInsights)
- StrategyService (analyzePage, buildAnalysisPrompt, callLlm, normalizeRecommendations)
- Worker integration: generate_strategy job kind **(Phase 4: full implementation with fallback model)**
- Dashboard UI: strategy recommendations panel
- 14 tests for strategy service
- Intelligence Quality Pass: 12 fixes (BUG, PERFORMANCE, SAFETY, MAINTENANCE, DATA QUALITY, UX, OBSERVABILITY, RESILIENCE)

### Phase 4.2 → Facebook Automation Improvements (NEXT)
- Smarter scheduling: timezone-aware windows, avoid low-engagement hours
- Approval workflow: review/reject step before publishing, in-app notification
- Failed job recovery: "Retry" button in Settings → Worker Status
- Publishing reliability: pre-publish validation (token valid, image reachable, caption length)

### Phase 4.3 → Analytics Upgrade
- Content performance insights: per-post score, trend lines, best/worst performers
- Growth trends: follower growth proxy (reach + impressions), weekly change indicators
- Engagement analysis: day-of-week/hour/post-type breakdown, heatmap
- Actionable recommendations: "Post on Tuesdays at 10AM for 40% higher engagement"

### Phase 4.4 → User Proof / SaaS Readiness
- Reports: weekly/monthly PDF/CSV export
- Growth dashboards: visual summary of key metrics
- Export: one-click CSV download for analytics
- Case-study friendly analytics: time-range comparisons, highlight wins

### Phase 5+ → Multi-Platform & SaaS (Future)
- Multi-platform support (Instagram, LinkedIn, TikTok, Twitter/X)
- SaaS credential relay (Phase A)
- Persistent credential storage / Vercel KV (Phase B)
- Full SaaS auth & billing / Stripe (Phase C)
- Move aurora-worker to Vercel as serverless/cron function
- Remove BYOB settings entirely

---

## Article XXXII — Current Project State Snapshot

**Date:** July 2026
**Phase:** 4.1 (AI Content Strategy Foundation) — Complete
**Previous Agents:** 3 (OpenCode)

### Build Status
| Metric | Value |
|--------|-------|
| Tests | 77/77 passing |
| TypeScript errors | 0 (`tsc --noEmit`) |
| Build | `bun run build` succeeds |
| Lint | `bun run lint` passes |
| Git status | Clean |
| Last commit | `d57b040` — "Setup GitHub Vercel continuous deployment" |
| Production deployed | No (Vercel import not yet connected) |

### Architecture Health
| Layer | Status |
|-------|--------|
| Routes | ✅ Thin UI — all logic extracted to hooks |
| Hooks | ✅ Call services, no direct repo access |
| Services | ✅ Business logic layer complete |
| Repositories | ✅ All Supabase queries encapsulated |
| Validators | ✅ Zod schemas for all input boundaries |
| Logger | ✅ Structured logging + createLogger factory |
| Errors | ✅ AppError hierarchy with sanitization |
| Types | ✅ Complete interfaces for all entities |

### Deployment Readiness
| Item | Status |
|------|--------|
| Vercel GitHub Integration | Not yet connected — user must import repo via Vercel Dashboard |
| Production URL | Not yet deployed — after import, first push deploys |
| Preview Deployments | Enabled via vercel.json (auto-cancelation + silent mode) |
| Build Command | `bun run build` (Vite + Nitro/Vercel preset) |
| Vercel Env Vars Required | Zero — all credentials flow through browser localStorage + Supabase Edge Function secrets |
| Framework Detection | Auto-detected as Vite (`"framework": "vite"` in vercel.json) |
| Tests Passing | 77/77 (Vitest) |
| TypeScript Errors | 0 (tsc --noEmit) |
| Deployment Readiness | ✅ **Ready for Vercel import** — no blocking issues |

---

## Article XXXIII — Known BYOB Limitations

These are architectural consequences of the Bring-Your-Own-Backend model. They are NOT bugs — they are design trade-offs that a future SaaS migration would address.

| Limitation | Impact | Why It Exists |
|-----------|--------|---------------|
| **Credentials stored in browser** | If user clears localStorage, all credentials are lost. Must re-enter. | BYOB — no server-side user accounts; we cannot store keys on our server |
| **No multi-device sync** | Credentials are per-browser. Cannot use Aurora from two devices without re-entering on each. | No backend to sync credentials — they're encrypted in browser storage |
| **No user accounts or auth** | Anyone with the browser URL can access the app (no login screen). Passphrase is the only gate. | BYOB — each user owns their Supabase project; no shared auth system |
| **Setup runs from the browser** | Setup requires the user's Supabase PAT in the browser. If the PAT is exposed, the Supabase project is at risk. | Management API calls require PAT — no server-side relay exists yet |
| **Worker Edge Function costs** | `pg_cron` runs every minute — the worker consumes Supabase Edge Function credits even when idle | The worker polls every minute for due jobs; no event-driven trigger exists |
| **No server-side AI key storage** | AI API keys are stored in encrypted browser localStorage, sent to `/api/proxy` per-request. Not available to the `aurora-worker` Edge Function. | Worker runs on Supabase, not Vercel — it cannot read browser localStorage |
| **Worker cannot auto-generate strategy** | Strategy generation requires AI keys which live on the client. Worker can only serve cached recommendations. | AI keys are user-owned; the worker runs in Supabase without access to them |
| **No push notifications** | Token expiry, failed jobs, and other critical events are logged to DB but never notified to user. | No push infrastructure (no service worker, no email, no webhook) |
| **No usage monitoring** | User must check Supabase Dashboard for Edge Function invocations, DB size, API usage. No in-app billing or limits. | BYOB — costs are on the user's Supabase project |
| **Cron depends on pg_cron + pg_net** | If these Supabase extensions are unavailable (older projects, restricted plans), the worker never fires. Silent failure. | `pg_cron` and `pg_net` are not available on all Supabase plans |
| **No automated backups** | If user loses encrypted localStorage keys (passphrase forgotten), all credentials are unrecoverable. | AES-GCM with PBKDF2 — designed to be unrecoverable without the passphrase |

---

## Article XXXIV — Migration Path to SaaS

If Aurora evolves from BYOB to a SaaS model, these are the architectural changes needed:

### Phase A — Server-Side Credential Relay (minimal infra)

Replace browser-to-Supabase direct PAT usage with a thin relay:

1. **Add a Vercel server route** (e.g., `/api/manage-setup`) that proxies Management API calls. The relay authenticates with a server-side PAT (Vercel env var), so the browser never sees the PAT.
2. **Remove `supabasePAT` from browser SecretsSchema** — PAT now lives only on the server.
3. **Update `setup-runner.ts`** to call `/api/manage-setup` instead of directly calling `api.supabase.com`.

**Benefits:** PAT never touches browser. Setup can run even if user clears localStorage.

### Phase B — Persistent Credential Storage

Add encrypted credential storage on Vercel's KV/store so users don't re-enter on every device:

1. **Add Vercel KV** (or Supabase Vault) for server-side encrypted credential storage.
2. **Add a simple auth flow** (magic link or passphrase-based) to associate credentials with a device.
3. **Proxy `/api/proxy`** reads credentials from KV instead of relying on the browser sending them.

**Benefits:** Multi-device sync. Credentials survive browser localStorage clear.

### Phase C — Full SaaS Auth & Billing

Complete authentication and user management:

1. **Add user accounts** (Supabase Auth or Auth0).
2. **Provision child Supabase projects** per user (or use a shared backend with RLS).
3. **Add billing** (Stripe) — free tier vs paid plans based on posts/month, AI calls, analytics retention.
4. **Remove BYOB Settings entirely** — credentials are managed server-side.
5. **Move `aurora-worker` to Vercel** as a serverless/cron function so it can read credentials from the server-side KV store without needing Supabase Edge Function secrets.

**Benefits:** Full SaaS experience. No credential management for users. Usage limits, billing, and monitoring built-in.

---

## Article XXXV — AI Handoff Protocol

### For Every AI Agent Starting Work

1. **READ THIS FILE FIRST** — The Project Constitution is the single source of truth.
2. **Read `ARCHITECTURE.md`** — It contains architecture-specific details.
3. **Read `src/types/index.ts`** — To understand data shapes.
4. **Check `git log --oneline -10`** — Understand recent changes.
5. **Check `git status`** — Identify any in-progress work.

### Operating Rules
- DO NOT modify this Constitution without ensuring no information is removed.
- If you add a new structural element (service, repository, migration, route), update the relevant section(s).
- If you discover a discrepancy between this document and the code, fix the code (or fix the doc, but the code wins).
- Mark your work in the Handover Log at the end of this file.
- Update the "Last Updated" date and agent count.

### Communication
- All decisions, trade-offs, and architectural changes must be logged here.
- If you find a blocker not listed in "Remaining Risks," add it.
- If you add a new section, update the Table of Contents.

### Handover Log

| Date | Agent | Work Done |
|------|-------|-----------|
| July 2026 | Agent 1 | Phase 1: Foundation & Security |
| July 2026 | Agent 2 | Phase 2: Architecture Stabilization |
| July 2026 | Agent 3 | Phase 3+4+4.1: Production Hardening, Brand Memory, Strategy |
| July 2026 | Agent 4 | Created Project Constitution (merged AI_CONTEXT.md + ARCHITECTURE.md + Master Plan) |

---

## Article XXXVI — First Production Testing Checklist

### Phase 1 — App Load & Credentials (browser)

| # | Test | Expected | Pass |
|---|------|----------|------|
| 1.1 | Open production URL on fresh browser (empty localStorage) | See "Welcome to Aurora" hero, "Start setup" CTA | ⬜ |
| 1.2 | Click "Start setup" → navigate to Settings | See SettingsHub with empty status badges | ⬜ |
| 1.3 | Enter Supabase URL + Anon Key + Service Key + PAT, set passphrase (8+ chars), save | Badges update; credentials persist after refresh | ⬜ |
| 1.4 | Close tab, re-open → Dashboard shows "Unlock to continue" | Passphrase not remembered across sessions | ⬜ |
| 1.5 | Open Settings, enter passphrase, unlock | Dashboard shows real data or "Run Setup" prompt | ⬜ |
| 1.6 | Enter wrong passphrase | See "Wrong passphrase" error | ⬜ |

### Phase 2 — Supabase Setup (provisioning)

| # | Test | Expected | Pass |
|---|------|----------|------|
| 2.1 | In Settings → Setup, click "Run setup" | Sequential progress: verify → migrate → secrets → edge-setup → bucket → edge-worker → cron | ⬜ |
| 2.2 | Refresh mid-setup, re-run | Already-applied migrations skipped, continues from failure point | ⬜ |
| 2.3 | Verify Supabase tables created | `content_briefs`, `posts`, `engagement_snapshots`, `jobs`, `system_events`, `brand_memory`, `strategy_recommendations`, `pages` exist | ⬜ |
| 2.4 | Verify Edge Functions deployed | `aurora-worker` + `manage-setup` shown in Supabase Dashboard → Edge Functions | ⬜ |
| 2.5 | Verify cron scheduled | `SELECT * FROM cron.job` shows `aurora-worker-every-minute` | ⬜ |

### Phase 3 — Facebook Connection

| # | Test | Expected | Pass |
|---|------|----------|------|
| 3.1 | Get long-lived Facebook page token (60 day) | Token from Facebook Graph API Explorer or App Dashboard | ⬜ |
| 3.2 | Enter page token + page ID in Settings → Facebook | Facebook badge turns green | ⬜ |
| 3.3 | Dashboard shows "Next 5 posts" section | Empty state with "Compose your first post" | ⬜ |

### Phase 4 — AI Content Generation

| # | Test | Expected | Pass |
|---|------|----------|------|
| 4.1 | Configure AI provider in Settings → LLM (API key + model) | LLM badge turns green | ⬜ |
| 4.2 | Navigate to Compose, enter topic, click "Generate caption" | AI generates caption text | ⬜ |
| 4.3 | Click "Generate image" (if image provider configured) | Image appears in preview | ⬜ |
| 4.4 | Click "Save as draft" | Draft appears in Drafts page | ⬜ |

### Phase 5 — Approval & Publishing

| # | Test | Expected | Pass |
|---|------|----------|------|
| 5.1 | Navigate to Drafts page | See saved draft with "draft" status pill | ⬜ |
| 5.2 | Click "Approve" on a draft | Toast "Draft approved!", status changes to "approved" | ⬜ |
| 5.3 | Click "Reject" on a draft | ConfirmDialog appears; on confirm, toast "Draft rejected." | ⬜ |
| 5.4 | Approve a draft + set future schedule | Brief appears "approved" → worker picks up at scheduled time | ⬜ |
| 5.5 | Approve a draft with immediate schedule (Publish Now) | Brief published within 1 minute (cron interval) | ⬜ |
| 5.6 | Verify post appears on Facebook page | Check Facebook Page → Posts | ⬜ |

### Phase 6 — Worker Verification

| # | Test | Expected | Pass |
|---|------|----------|------|
| 6.1 | Dashboard shows "Worker Status" card | Shows "Last run: X minutes ago", "Today: N runs" | ⬜ |
| 6.2 | Wait 2-3 minutes after setup | `workerTodayRuns` increments by ~2-3 | ⬜ |
| 6.3 | Worker runs `publish_due_posts` job | Approved briefs within schedule window get published | ⬜ |
| 6.4 | Worker runs `capture_engagement` job | Engagement snapshots appear in DB after ~60 min | ⬜ |
| 6.5 | Worker runs `plan_content` job | New draft briefs auto-generated (if `full_auto` mode) | ⬜ |

### Phase 7 — Strategy & Analytics

| # | Test | Expected | Pass |
|---|------|----------|------|
| 7.1 | Dashboard shows analytics (after posts exist) | Engagement charts, best hour, total likes/comments/shares | ⬜ |
| 7.2 | Click "Analyze" in Strategy panel | AI-generated recommendations appear | ⬜ |
| 7.3 | Dismiss a strategy recommendation | Recommendation disappears, stays dismissed on reload | ⬜ |

### Phase 8 — Error Recovery

| # | Test | Expected | Pass |
|---|------|----------|------|
| 8.1 | Revoke Facebook page token | Worker detects code 190, creates `facebook_token_expired` event | ⬜ |
| 8.2 | Set incorrect AI API key | Strategy generation fails gracefully; cached recs returned if available | ⬜ |
| 8.3 | Disconnect Supabase (change anon key) | App shows "Welcome" hero on next reload | ⬜ |
| 8.4 | Reload with no passphrase in session | "Unlock to continue" shown | ⬜ |

---

## Article XXXVII — Commands Reference

```bash
bun install           # Install dependencies
bun run dev           # Start dev server
bun run build         # Production build (Vercel preset)
bun run build:dev     # Dev build
bun run tsc --noEmit  # TypeScript check (REQUIRED before commit)
bun run test          # Run Vitest (77 tests)
bun run test:watch    # Vitest in watch mode
bun run lint          # ESLint
bun run format        # Prettier
npx vercel deploy --prebuilt --token <token>   # Manual deploy
```

---

## Article XXXVIII — Extension Points

### Adding a New Social Platform
1. Create `src/services/{platform}/` with types and service
2. Add provider config in `validators/`
3. Update `migrations/` for new tables
4. Create repository for data access
5. Add platform-specific UI components

### Adding a New AI Provider
1. Add to `AIProviderType` enum in `validators/`
2. Add provider logic in `services/ai/`
3. Update `defaultBaseUrl` map

### Adding a New Worker Job Kind
1. Add handler to worker switch statement
2. Add cron schedule via `pg_cron` in setup-runner
3. Add repository for any new tables
4. Add Zod schema for job payload validation

---

## Schedule A — Type Definitions (`src/types/index.ts`)

```typescript
export type Json = Record<string, unknown>;

export type Page = {
  id: string;
  fb_page_id: string | null;
  fb_page_name: string;
  default_brand_voice: string | null;
  default_image_style: string | null;
  default_posting_windows: { hour: number; minute: number }[] | null;
  posting_mode: PostingMode;
  max_posts_per_day: number;
  ai_overrides: Json;
  prompt_overrides: Json;
  status: PageStatus;
  created_at: string;
};

export type PostingMode = "manual" | "hybrid" | "full_auto";
export type PageStatus = "active" | "inactive";

export type Brief = {
  id: string;
  page_id: string;
  slot_start: string;
  topic: string | null;
  caption: string | null;
  hashtags: string[] | null;
  image_prompt: string | null;
  image_url: string | null;
  hook: string | null;
  cta: string | null;
  predicted_engagement_score: number | null;
  approved_at: string | null;
  status: BriefStatus;
  created_at: string;
  updated_at: string;
};

export type BriefStatus = "draft" | "approved" | "scheduled" | "published" | "skipped" | "failed";

export type Post = {
  id: string;
  page_id: string;
  content_brief_id: string | null;
  fb_post_id: string | null;
  fb_permalink_url: string | null;
  idempotency_key: string;
  status: PostStatus;
  published_at: string | null;
  last_error: string | null;
  created_at: string;
};

export type PostStatus = "pending" | "published" | "failed";

export type EngagementSnapshot = {
  id: string;
  post_id: string;
  captured_at: string;
  likes: number;
  comments: number;
  shares: number;
  reactions: Json;
  reach: number;
  impressions: number;
};

export type Job = {
  id: string;
  page_id: string | null;
  kind: string;
  payload: Json;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  priority: number;
  scheduled_at: string;
  lease_expires_at: string | null;
  locked_by: string | null;
  next_retry_at: string | null;
  last_error: string | null;
  idempotency_key: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type JobStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed_retryable"
  | "failed_terminal"
  | "dead_letter";

export type AiUsage = {
  id: string;
  page_id: string | null;
  job_id: string | null;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  called_at: string;
};

export type SystemEvent = {
  id: string;
  severity: "debug" | "info" | "warn" | "error";
  category: string;
  message: string;
  metadata: Json;
  created_at: string;
};

export type StrategyInsight = {
  page_id: string;
  window_days: number;
  best_posting_hour: number | null;
  best_topics: string[];
  avg_engagement_rate: number | null;
  computed_at: string;
};

export type StrategyRecommendation = {
  id: string;
  page_id: string;
  recommendation_type: string;
  recommendation_text: string;
  reasoning: string;
  priority: number;
  related_content: Json;
  generated_at: string;
  status: "active" | "dismissed" | "applied";
};

export type BrandMemory = {
  id: string;
  page_id: string;
  brand_descriptors: string[];
  audience_profile: Json;
  writing_style_notes: string;
  effective_hashtags: string[];
  top_content_snippets: Json[];
  tone_guidelines: string;
  avoided_topics: string[];
  auto_extracted_at: string | null;
  manually_edited_at: string | null;
  created_at: string;
  updated_at: string;
};
```

---

## Schedule B — Glossary

| Term | Definition |
|------|-----------|
| **BYOB** | Bring Your Own Backend — user owns and provides their own Supabase project |
| **BYOK** | Bring Your Own Keys — user provides their own API keys (AI, Facebook) |
| **Glassmorphism** | UI design style using frosted glass effects (backdrop blur, transparency, subtle gradients) |
| **Edge Function** | Supabase-hosted Deno serverless function (aurora-worker, manage-setup) |
| **pg_cron** | PostgreSQL extension for scheduling recurring SQL/HTTP calls |
| **pg_net** | PostgreSQL extension for making HTTP requests from SQL |
| **Migration** | Sequential SQL change to database schema (numbered 1-7) |
| **RLS** | Row-Level Security — PostgreSQL feature for per-row access control |
| **PAT** | Supabase Personal Access Token — used for Management API calls |
| **Service Role Key** | Supabase privileged key with full database access (server-side only) |
| **Anon Key** | Supabase public key for client-side access (restricted by RLS) |
| **Circuit Breaker** | Pattern that stops calls to a failing service after N failures in time window |
| **Heartbeat** | Periodic lease renewal signal showing a worker is still processing |
| **SSRF** | Server-Side Request Forgery — attack vector prevented by IP blocklist |
| **CSP** | Content Security Policy — HTTP header for XSS prevention |
| **Nitro** | Vite-based SSR framework used by TanStack Start |
| **shadcn/ui** | Collection of copy-paste React UI components using Radix + Tailwind |
| **Vercel KV** | Vercel's key-value storage (Future: for credential persistence) |

---

## Schedule C — FAQ

**Q: Why Facebook-first?**
A: Facebook remains the largest social platform by active users and the most important for business page management. Multi-platform support is planned for Phase 5+.

**Q: Can I use Aurora with Instagram?**
A: No. Not until Phase 5+. The architecture supports it (service abstractions, repository pattern), but no code exists yet.

**Q: How do I migrate from BYOB to SaaS?**
A: Follow Article XXXIV — Migration Path to SaaS. Phase A (credential relay) is the lightest lift. Phase C (full auth + billing) is the heaviest.

**Q: Why does the Setup Wizard run from the browser?**
A: BYOB model — the user's Supabase PAT is needed to provision their project. A server-side relay (Phase A of SaaS migration) would eliminate this.

**Q: What happens if my Facebook token expires?**
A: The worker detects error code 190, logs a `facebook_token_expired` system event, and marks the job as `failed_terminal` (no retries). You'll need to refresh the token in Settings → Facebook.

**Q: Can I use Aurora without an AI API key?**
A: Yes — you can manually write captions and upload images. AI generation is optional. Strategy generation requires AI keys.

**Q: How often does the worker run?**
A: Every 60 seconds via `pg_cron`. Each tick: seeds recurring jobs, claims pending jobs, processes up to N jobs.

**Q: Are my credentials safe?**
A: Yes — AES-GCM encrypted with PBKDF2 (200k iterations) in localStorage. Passphrase is in sessionStorage only (cleared on tab close). No credentials are sent to our servers. See Article VIII.

**Q: Why no user accounts?**
A: BYOB model — each user has their own Supabase project. Adding auth (Migration 3) is optional and backward-compatible.

**Q: How do I contribute?**
A: Follow Article XXVII (Git Workflow), Article XI (Development Rules), and ensure all tests pass. Submit a PR.

**Q: What's the difference between `aurora-worker` and `manage-setup`?**
A: `aurora-worker` is the background automation engine (runs every minute via pg_cron). `manage-setup` is a one-time-use edge function for secure bucket operations (no service role in browser).

**Q: Can I run Aurora locally without Supabase?**
A: No — Aurora requires a Supabase project for all data storage. The app has no offline mode.

**Q: How do I reset everything?**
A: Clear browser localStorage (credentials), drop the Supabase tables (or create a new project), and re-run Setup Wizard.

**Q: What TypeScript version is used?**
A: TypeScript strict mode with `noUnusedLocals` and `noUnusedParameters` enabled. Zero `any` types expected.

---

## Synced Algorithms (Worker ↔ Frontend)

The following pure functions exist in **both** the Deno worker (`supabase/functions/aurora-worker/index.ts`)
and the frontend service layer (`src/services/strategy.service.ts`). They must stay in sync.

| Algorithm | Worker | Frontend | Purpose |
|-----------|--------|----------|---------|
| `computeQualityFeedback` | `:1407` | `:75` | Groups posts by topic, computes predicted vs actual engagement delta |
| `buildStrategyPrompt` / `buildAnalysisPrompt` | `:1437` | `:105` | Constructs the LLM prompt with brand context, memory, quality feedback |
| `computeDeterministicRecs` | `:1558` | `:269` | Code-computed recommendations (best days, CTAs, media ratio, hashtags) |

**Sync check:** Both copies are tagged with `// Mirrors <counterpart-path>` comments at the
function definition. When modifying one, update the other. The test suite
(`{strategy,worker}.test.ts`) validates behavior parity where possible.

---

## Ratification

This Constitution replaces `AI_CONTEXT.md` (the original AI handover context) as the single source of truth. It merges three documents:

1. **AI_CONTEXT.md** (760 lines) — Operational context, completed work, architecture, security, deployment, risks
2. **ARCHITECTURE.md** (201 lines) — Folder structure, data flow, setup flow, auth flow, worker flow, boundaries
3. **Aurora Master Plan v2** — Core principles, product philosophy, design constraints, task list, ground rules

All content from all three sources is preserved in full. No information has been removed or summarized.

**Every AI agent MUST read this file first before any work.**
