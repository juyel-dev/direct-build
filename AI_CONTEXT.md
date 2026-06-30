# AI Agent Handover Context

**Project:** Aurora — AI Facebook Autopilot
**Repository:** https://github.com/juyel-dev/direct-build
**Handover Date:** July 2026
**Previous Agents:** 1 (OpenCode)

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

---

## Architecture

```
Route (UI) → Hook (state) → Service (business logic) → Repository (data access) → Supabase
```

### Layer Responsibilities

| Layer | Location | Responsibility |
|-------|----------|---------------|
| **Routes** | `src/routes/` | Render UI, call hooks, handle navigation. NO business logic. |
| **Hooks** | `src/hooks/` | Component state, call services, manage React Query mutations. |
| **Services** | `src/services/` | Business logic, coordinate repositories, AI calls, Facebook API. |
| **Repositories** | `src/repositories/` | Supabase queries, typed responses, pagination, error handling. |
| **Validators** | `src/validators/` | Zod schemas for runtime validation. |
| **Types** | `src/types/` | Shared TypeScript interfaces (Page, Brief, Post, Job, etc.). |
| **Logger** | `src/logger/` | Structured logging (debug/info/warn/error). |
| **Errors** | `src/errors/` | Error hierarchy (AppError, ValidationError, AuthError, etc.). |
| **Lib** | `src/lib/` | Legacy modules (being migrated): config-store, crypto, setup-runner. |

### Data Flow

```
Browser localStorage (encrypted credentials)
    │
    ├── sessionStorage (passphrase, cleared on tab close)
    │
    ├── Supabase Client (anon key)
    │     ├── Direct queries via repositories
    │     └── Realtime subscriptions (useRealtime)
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
| SQL injection fix | `setup-runner.ts` — Parameterized queries ($1, $2) instead of string building |
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

---

## File Manifest (New Files Created)

```
src/
 ├── types/index.ts                          # Shared interfaces
 ├── logger/index.ts                         # Structured logging
 ├── errors/index.ts                         # Error hierarchy
 ├── validators/index.ts                     # Zod schemas
 ├── repositories/
 │   ├── base.ts                             # BaseRepository + pagination
 │   ├── page-repository.ts
 │   ├── brief-repository.ts
 │   ├── post-repository.ts
 │   ├── engagement-repository.ts
 │   ├── system-event-repository.ts
 │   └── usage-repository.ts
 ├── services/
 │   ├── base.ts                             # BaseService with logging
 │   ├── index.ts                            # Service exports
 │   ├── supabase-factory.ts                 # Client factory
 │   ├── auth-service.ts                     # Auth operations
 │   ├── dashboard-service.ts                # Dashboard aggregation
 │   ├── ai/
 │   │   ├── ai.service.ts                   # AI text/image generation
 │   │   └── providers/llm-providers.ts      # Provider base URLs
 │   ├── publishing/publishing.service.ts    # Draft + publish ops
 │   ├── schedule/schedule.service.ts        # Calendar logic
 │   └── analytics/analytics.service.ts      # Analytics computation
 └── hooks/
     ├── useAuth.ts                          # Auth state hook
     ├── useCompose.ts                       # Compose hook (extracted)
     └── useSchedule.ts                      # Schedule hook (extracted)
ARCHITECTURE.md                              # Architecture docs
```

### Files Modified

```
README.md                                    # Full rewrite
package.json                                 # Removed motion
bun.lock                                     # Updated
src/hooks/useAuroraQuery.ts                  # Rewrote to use repository layer
src/lib/management-api.ts                    # Added params support to runSql
src/lib/migrations.ts                        # Added migration 003 (auth)
src/lib/setup-runner.ts                      # Parameterized queries
src/lib/user-supabase.ts                     # Simplified
src/routes/api/proxy.ts                      # Security headers
src/routes/compose.tsx                        # Refactored to thin UI
src/routes/drafts.tsx                        # Minor type fixes
src/routes/schedule.tsx                      # Refactored to thin UI
src/server.ts                                # CSP + security headers
```

---

## Security Posture

| Concern | Status |
|---------|--------|
| Credential storage | AES-GCM encrypted, passphrase in sessionStorage |
| SQL injection | FIXED — parameterized queries everywhere |
| Service role exposure | Encrypted in browser, used only during setup |
| Facebook token leakage | FIXED — now sent via Authorization header (not URL) |
| PAT exposure | Acceptable (BYOB model, user's own token) |
| CSP headers | ADDED — script-src, connect-src, etc. hardened |
| XSS protection | Security headers on all responses |
| Auth isolation | Migration 3 available (optional, backward-compatible) |
| RLS policies | auth-aware policies with fallback to open access |

---

## Remaining Risks (Next Agent Priority)

| Risk | Severity | Recommendation |
|------|----------|---------------|
| Service role in browser | HIGH | Create edge function to handle privileged ops, remove service_role from client |
| No rate limiting | MEDIUM | Add rate limiting to `/api/proxy` route |
| No tests | MEDIUM | Add unit tests for services, integration tests for repositories |
| Large bundle size | MEDIUM | Enable route-based code splitting, tree-shake unused Radix UI |
| Image optimization | LOW | Add WebP/AVIF pipeline for uploaded images |
| No TypeScript strict mode | LOW | Enable `noUnusedLocals`, `noUnusedParameters` in tsconfig |
| Proxy allows HTTPS only | INFO | Current limitation is acceptable |

---

## Recommended Next Tasks (Phase 3)

### Priority Order

1. **Performance Optimization**
   - Route-based lazy loading (TanStack Router already supports `import()`)
   - Tree-shake unused shadcn/ui components (remove unused `src/components/ui/`)
   - Image optimization (auto WebP, responsive srcset)
   - Database query profiling (add EXPLAIN ANALYZE to hot queries)

2. **Testing Infrastructure**
   - Vitest setup for unit tests
   - Test DashboardService, AnalyticsService, PublishingService
   - Mock Supabase client for repositories

3. **Service Role Removal**
   - Create `supabase/functions/manage-setup/index.ts` — handles provisioning server-side
   - Client calls this edge function instead of using service_role directly
   - Service role never enters browser

4. **Rate Limiting**
   - Add `@upstash/rate-limit` or in-memory rate limiter to `/api/proxy`
   - Apply per-IP limits for external API calls

5. **Multi-Platform Prep**
   - Create platform abstraction interfaces
   - Instagram Graph API integration
   - LinkedIn API integration

---

## Commands Reference

```bash
bun install           # Install dependencies
bun run dev           # Start dev server
bun run build         # Production build
bun run tsc --noEmit  # TypeScript check
bun run lint          # ESLint
bun run format        # Prettier
```

---

## Deployment

- **Platform:** Vercel (via Nitro SSR preset)
- **Config:** `vercel.json` + `vite.config.ts`
- **Edge Function:** Deployed to user's Supabase project during setup
- **Cron:** pg_cron runs every minute

To deploy: Push to `main` branch, Vercel auto-deploys via GitHub integration.
