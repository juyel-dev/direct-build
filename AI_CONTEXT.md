# AI Agent Handover Context

**Project:** Aurora — AI Facebook Autopilot
**Repository:** https://github.com/juyel-dev/direct-build
**Handover Date:** July 2026
**Previous Agents:** 2 (OpenCode)

---

## Project Overview

Aurora is an open-source AI Facebook Autopilot that follows the BYOB/BYOK model (Bring Your Own Backend / Bring Your Own Keys). Users own their Supabase project; the app provisions schema, edge functions, and automation during a one-click setup wizard.

**Core Workflow:** Planning → Draft → Approval → Scheduling → Publishing → Analytics

### Product Vision (DO NOT BREAK)
- AI Facebook Autopilot
- Open-source
- BYOB/BYOK (user owns Supabase project)
- One-click setup wizard
- AI content generation
- Glassmorphism UI
- Keep existing workflow untouched

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

---

## Remaining Risks (Next Agent Priority)

| Risk | Severity | Recommendation |
|------|----------|---------------|
| Worker: no lease renewal | LOW | Add heartbeat/lease renewal during long-running job processing |
| Worker: no circuit breaker | LOW | Add simple circuit breaker for Facebook/LLM API failures |
| Worker: no stdout logging | LOW | Add `console.log(JSON.stringify({...}))` for Supabase Logs dashboard |
| No TypeScript strict mode | LOW | Enable `noUnusedLocals`, `noUnusedParameters` |
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

## Recommended Next Tasks (Phase 4)

### Priority Order

1. **Worker Resilience**
   - Add heartbeat/lease renewal during long LLM calls
   - Add per-call retries (2 attempts with 1s/2s backoff) for transient API failures
   - Add simple circuit breaker for Facebook/LLM API errors
   - Add stdout JSON logging for Supabase Logs dashboard

2. **TypeScript Strict Mode**
   - Enable `noUnusedLocals`, `noUnusedParameters`, `strict` in tsconfig
   - Fix any resulting errors

3. **Multi-Platform Prep**
   - Create Platform abstraction interfaces
   - Instagram Graph API integration
   - LinkedIn API integration

4. **Image Pipeline Enhancement**
   - WebP/AVIF server-side conversion on uploaded images
   - Responsive srcset generation

5. **Auth Hardening**
   - Enable Migration 3 (auth_user_isolation) by default for new installs
   - Add Supabase Auth UI integration
   - RLS policy verification

6. **Analytics Expansion**
   - Performance tracking over longer windows
   - Export/CSV download
   - Comparison periods

---

## Commands Reference

```bash
bun install           # Install dependencies
bun run dev           # Start dev server
bun run build         # Production build (Vercel preset)
bun run tsc --noEmit  # TypeScript check (REQUIRED before commit)
bun run test          # Run Vitest (51 tests)
bun run test:watch    # Vitest in watch mode
bun run lint          # ESLint
bun run format        # Prettier
```

---

## Deployment

- **Platform:** Vercel (via Nitro SSR preset)
- **Config:** `vercel.json` + `vite.config.ts`
- **Edge Function:** Supabase (`supabase/functions/aurora-worker`) deployed to user's project during setup
- **Cron:** pg_cron runs every minute
- **To deploy:** Push `main` branch → Vercel auto-deploys via GitHub integration
