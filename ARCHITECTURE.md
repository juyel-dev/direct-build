# Aurora Architecture

## Overview

Aurora is an open-source AI Facebook Autopilot following the BYOB/BYOK model (Bring Your Own Backend / Bring Your Own Keys). Users own their Supabase project; the app provisions schema, edge functions, and automation on setup.

## Folder Structure

```
src/
 ├── components/        # Reusable UI components (glassmorphism design system)
 │   ├── ui/           # shadcn/ui primitives
 │   ├── glass/        # Glassmorphism design components
 │   ├── layout/       # AppShell, sidebar, navigation
 │   └── facebook/     # Facebook post preview
 │
 ├── features/          # Feature-specific UI panels
 │   ├── settings/     # Settings forms (secrets, providers, brand, setup)
 │   └── schedule/     # WeekGrid, TimelineList, BriefEditor
 │
 ├── hooks/             # React hooks (data fetching, auth, compose, schedule)
 │   ├── useAuroraQuery.ts  # Legacy hook (being migrated)
 │   ├── useCompose.ts      # Compose page state & logic
 │   ├── useSchedule.ts     # Schedule page state & logic
 │   ├── useAuth.ts         # Authentication state
 │   └── useRealtime.ts     # Supabase Realtime subscriptions
 │
 ├── services/          # Business logic layer
 │   ├── ai/           # AI text/image generation
 │   │   ├── ai.service.ts
 │   │   └── providers/
 │   ├── publishing/   # Draft & publish operations
 │   ├── schedule/     # Calendar & scheduling logic
 │   ├── analytics/    # Engagement & cost analytics
 │   ├── facebook/     # Facebook Graph API integration
 │   ├── storage/      # File upload & storage
 │   ├── auth-service.ts
 │   ├── dashboard-service.ts
 │   └── supabase-factory.ts
 │
 ├── repositories/      # Data access layer (Supabase queries)
 │   ├── base.ts       # BaseRepository with pagination & error handling
 │   ├── page-repository.ts
 │   ├── brief-repository.ts
 │   ├── post-repository.ts
 │   ├── engagement-repository.ts
 │   ├── system-event-repository.ts
 │   └── usage-repository.ts
 │
 ├── validators/        # Zod validation schemas
 │
 ├── types/             # Shared TypeScript interfaces
 │
 ├── logger/            # Structured logging (debug/info/warn/error)
 │
 ├── errors/            # Error hierarchy (AppError, ValidationError, etc.)
 │
 ├── routes/            # TanStack Router routes (thin UI layer)
 │   ├── index.tsx     # Dashboard
 │   ├── compose.tsx   # Post composer
 │   ├── schedule.tsx  # Content calendar
 │   ├── drafts.tsx    # Draft approval queue
 │   ├── analytics.tsx # Engagement analytics
 │   ├── settings.tsx  # Configuration hub
 │   └── api/proxy.ts  # CORS-bypass proxy
 │
  └── lib/               # Infrastructure & utilities (NOT legacy — app-level infra separate from services)
     ├── config-store.ts   # Encrypted localStorage config
     ├── setup-runner.ts   # Supabase project provisioning
     ├── management-api.ts # Supabase Management API wrapper
     ├── migrations.ts     # Database migrations
     └── crypto.ts         # AES-GCM encryption
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
1. Create `src/services/{platform}/` with types and service
2. Add provider config in `validators/`
3. Update `migrations/` for new tables
4. Create repository for data access
5. Add platform-specific UI components

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
