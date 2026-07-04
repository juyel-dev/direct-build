# Aurora Architecture

## Overview

Aurora is an open-source AI Facebook Autopilot following the BYOB/BYOK model (Bring Your Own Backend / Bring Your Own Keys). Users own their Supabase project; the app provisions schema, edge functions, and automation on setup.

## Folder Structure

```
src/
 ├── components/        # Reusable UI components (glassmorphism design system)
 │   ├── ui/           # shadcn/ui primitives (Calendar, day-picker)
 │   ├── glass/        # Glassmorphism design components (GlassCard, GlassPanel, BottomSheet)
 │   ├── layout/       # AppShell, sidebar, navigation
 │   ├── facebook/     # Facebook post preview (FacebookPreview)
 │   └── charts/       # Analytics charts (LazyCharts, AnalyticsChartsInner)
 │
 ├── features/          # Feature-specific UI panels
 │   ├── settings/     # Settings forms (secrets, providers, brand, setup, DangerTab)
 │   ├── schedule/     # WeekGrid, TimelineList, BriefEditor, MonthView
 │   └── brand-memory/ # BrandMemorySheet
 │
 ├── hooks/             # React hooks (data fetching, auth, compose, schedule)
 │   ├── useAuroraQuery.ts  # Primary data query hub (TanStack Query)
 │   ├── useCompose.ts      # Compose page state & logic
 │   ├── useSchedule.ts     # Schedule page state & logic
 │   ├── useAuth.ts         # Authentication state
 │   └── useRealtime.ts     # Supabase Realtime subscriptions
 │
 ├── services/          # Business logic layer
 │   ├── base.ts             # BaseService with logging
 │   ├── index.ts            # Service exports
 │   ├── supabase-factory.ts # Client factory (cached)
 │   ├── auth-service.ts
 │   ├── dashboard-service.ts
 │   ├── brand-memory.service.ts
 │   ├── strategy.service.ts # AI content strategy (analyzePage, buildAnalysisPrompt)
 │   ├── ai/
 │   │   ├── ai.service.ts   # AI text/image generation
 │   │   └── providers/llm-providers.ts
 │   ├── publishing/         # Draft + publish ops
 │   ├── schedule/           # Calendar logic
 │   ├── analytics/          # Engagement & cost analytics (WoW, growth trend)
 │   ├── draft/              # Draft CRUD (approve/reject/bulk)
 │   ├── facebook/           # [PLANNED] Facebook Graph API adapter (PlatformAdapter)
 │   └── storage/            # [PLANNED] File upload & storage
 │
 ├── repositories/      # Data access layer (Supabase queries)
 │   ├── base.ts              # BaseRepository with pagination & error handling
 │   ├── page-repository.ts
 │   ├── brief-repository.ts
 │   ├── post-repository.ts
 │   ├── engagement-repository.ts
 │   ├── brand-memory-repository.ts
 │   ├── strategy-repository.ts
 │   ├── system-event-repository.ts
 │   └── usage-repository.ts
 │
 ├── validators/        # Zod validation schemas (Zod)
 │
 ├── types/             # Shared TypeScript interfaces (Page, Brief, Post, Job, BrandMemory, etc.)
 │   └── index.ts
 │
 ├── logger/            # Structured logging (debug/info/warn/error)
 │   └── index.ts
 │
 ├── errors/            # Error hierarchy (AppError, ValidationError, etc.)
 │   └── index.ts
 │
 ├── routes/            # TanStack Router routes (thin UI layer)
 │   ├── index.tsx     # Dashboard
 │   ├── compose.tsx   # Post composer
 │   ├── schedule.tsx  # Content calendar (week/list/month views)
 │   ├── drafts.tsx    # Draft approval queue
 │   ├── analytics.tsx # Engagement analytics (WoW, growth, top posts)
 │   ├── settings.tsx  # Configuration hub
 │   └── api/proxy.ts  # CORS-bypass proxy
 │
 └── lib/               # Infrastructure & utilities (NOT legacy)
    ├── config-store.ts   # Encrypted localStorage config
    ├── crypto.ts         # AES-GCM browser crypto
    ├── edge-functions.ts # Edge function bundles
    ├── setup-runner.ts   # Supabase project provisioning
    ├── management-api.ts # Supabase Management API wrapper
    ├── migrations.ts     # Database migrations (15 applied)
    ├── manage-setup-client.ts # Client for manage-setup EF
    ├── utils.ts          # Shared utilities
    ├── user-error.ts     # Error sanitization
    └── test-connections.ts # Credential validation
```

## Data Flow

```
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

## Setup Flow

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

## Authentication Flow

### Current (v1)
- No user authentication
- Single user per project (BYOB model)
- Security through project-level access control
- Credentials encrypted at rest in localStorage

### Future (with migration 003)
- Supabase Auth enabled
- `user_id` column on all tables
- RLS policies check `auth.uid()`
- Backward-compatible: falls back to open access when no user logged in
- Auth service + hooks available

## Worker Flow

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

## Service Boundaries

```
Route (UI) → Hook (state) → Service (business logic) → Repository (data access)
                                                              │
                                                         Supabase Client
```

- **Routes** render UI and call hooks. No business logic.
- **Hooks** manage component state and call services.
- **Services** implement business logic, coordinate multiple repositories.
- **Repositories** encapsulate Supabase queries. Each table has its own repository.
- **Validators** use Zod for runtime type checking and input validation.

## Security

- Credentials encrypted with AES-GCM (PBKDF2, 200k iterations)
- Passphrase stored only in sessionStorage (cleared on tab close)
- `service_role` key used only during setup (via Management API)
- Production uses anon key only
- Supabase Vault stores secrets for Edge Function
- CSP headers set on all responses
- RLS policies isolate user data (when auth enabled)
- Parameterized queries prevent SQL injection
- Facebook tokens never exposed in browser URLs (proxied server-side)

## Extension Points

### Adding a new social platform
1. Implement the `PlatformAdapter` interface (defined in `supabase/functions/aurora-worker/index.ts`) with `validateToken`, `publishPost`, `fetchMetrics`
2. Create `src/services/{platform}/` with types and service
3. Add provider config in `validators/`
4. Update `migrations/` for new tables
5. Create repository for data access
6. Add platform-specific UI components

### Adding a new AI provider
1. Add to `AIProviderType` enum in `validators/`
2. Add provider logic in `services/ai/`
3. Update `defaultBaseUrl` map

## Deployment

Currently configured for Vercel via:
- `vercel.json` — build config
- `vite.config.ts` — Nitro preset for Vercel SSR
- Edge Function deployed to user's Supabase project

## Performance Considerations

- React Query caching (staleTime, refetchInterval)
- Pagination support in all repositories
- Lazy loading for images
- Realtime subscriptions for live updates
- Bundle splitting via TanStack Router (route-based)
