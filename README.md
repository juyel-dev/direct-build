# Aurora — AI Facebook Autopilot

Open-source AI Facebook automation. Bring your own Supabase, bring your own keys.

## Quick Start

1. Deploy to [Vercel](https://vercel.com) / Netlify
2. Open the app → Settings → Run Setup
3. Enter your Supabase + Facebook + AI credentials
4. Click "Run Setup" — Aurora provisions everything automatically
5. Start posting!

## Features

### Three Modes
- **Manual** — You create posts, Aurora publishes at scheduled time
- **Hybrid** — AI generates drafts, you approve, Aurora publishes
- **Auto** — Fully autonomous: AI plans, generates, publishes, tracks

### AI Content Planning
- Generates 7-day content plans based on your brand voice
- Creates captions, hashtags, and image prompts
- Adapts strategy based on engagement data

### Image Generation
- Pollinations (free, default)
- OpenAI DALL-E
- Stability AI
- Custom providers

### Facebook Integration
- Auto-publish to Facebook Pages
- Engagement tracking (likes, comments, shares, reach)
- Strategy optimization based on performance

### Dashboard
- Content calendar with week/list view
- Draft approval queue (Hybrid mode)
- Post composer with AI assist
- Real-time worker status
- Engagement analytics charts

## Tech Stack

- **Frontend:** React 19 + TanStack Start + shadcn/ui
- **Styling:** Tailwind CSS v4 (Liquid Glassmorphism)
- **Backend:** Supabase (PostgreSQL + Edge Functions + pg_cron)
- **AI:** OpenAI / Gemini / Groq / OpenRouter (configurable)
- **Images:** DALL-E / Stability AI / Pollinations (configurable)
- **Social:** Facebook Graph API

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full details.

```
src/
 ├── components/     UI components (glassmorphism design system)
 ├── hooks/          React hooks (state + data fetching)
 ├── services/       Business logic (AI, publishing, analytics, auth)
 ├── repositories/   Data access layer (Supabase queries)
 ├── validators/     Zod schemas
 ├── types/          TypeScript interfaces
 ├── logger/         Structured logging
 ├── errors/         Error hierarchy
 ├── routes/         TanStack Router (thin UI layer)
 └── lib/            Legacy modules (being migrated)
```

## Development

```bash
# Install dependencies
bun install

# Start dev server
bun run dev

# Build for production
bun run build

# TypeScript check
bun run tsc --noEmit

# Lint
bun run lint

# Format
bun run format
```

### Project Structure Rules

- **Routes** must not contain business logic. Extract to hooks/services.
- **Services** implement business logic, call repositories.
- **Repositories** encapsulate all Supabase queries.
- **Hooks** manage component state and connect UI to services.
- **Validators** use Zod for all input validation.

## Migrations Guide

Migrations are forward-only, numbered SQL files in `src/lib/migrations.ts`.

### Adding a Migration

1. Add an object to the `MIGRATIONS` array with incrementing `id`
2. Use `create extension if not exists`, `create table if not exists`, `add column if not exists`
3. Include `insert into public._migrations (id, name) values (N, 'name')` at the end
4. Run Setup to apply

### Current Migrations

| ID | Name | Description |
|----|------|-------------|
| 1 | `init` | Base schema: tables, indexes, RLS, RPCs |
| 2 | `automation_runtime` | pg_cron, pg_net, job columns |
| 3 | `auth_user_isolation` | Auth-ready: user_id columns, auth-aware RLS |

## Configuration

### Required (Setup)
- Supabase Project URL
- Supabase Anon Key
- Supabase Service Role Key (setup only)
- Supabase Personal Access Token (PAT)

### Optional
- Facebook Page Access Token + Page ID
- LLM Provider (API key, base URL, model)
- Image Provider
- Brand voice, posting windows, topics

## Security

- Credentials encrypted with AES-GCM in localStorage
- Passphrase stored in sessionStorage only
- Service role key used only during provisioning
- CSP + security headers on all responses
- Parameterized queries (no SQL injection)
- RLS policies isolate user data (when auth enabled)

## Roadmap

### Phase 1 ✅ — Foundation & Security
- [x] Error handling system (AppError hierarchy)
- [x] Structured logging (logger/)
- [x] Validation layer (Zod schemas)
- [x] Repository pattern (data access layer)
- [x] Service layer (business logic)
- [x] SQL injection fixes (parameterized queries)
- [x] Auth migration (RLS + user isolation)
- [x] Auth service + hooks
- [x] Dependency cleanup (duplicate lock, unused packages)

### Phase 2 ✅ — Architecture Stabilization
- [x] Route refactoring (compose, schedule → hooks)
- [x] Service layer completion (AI, publishing, analytics, schedule)
- [x] Security hardening (CSP headers, input validation)
- [x] Pagination support in repositories
- [x] Developer documentation (ARCHITECTURE.md)

### Phase 3 — Performance Optimization
- [ ] Bundle splitting (route-based lazy loading)
- [ ] Image optimization pipeline
- [ ] Database query optimization
- [ ] Caching strategy (Redis/CDN)
- [ ] Reduce initial bundle size

### Phase 4 — Premium Features
- [ ] Multi-platform support (Instagram, LinkedIn, Twitter/X)
- [ ] Advanced analytics dashboard
- [ ] A/B content testing
- [ ] Team collaboration
- [ ] Custom automation rules

### Phase 5 — Scaling
- [ ] Multi-user enterprise support
- [ ] White-label deployment
- [ ] Usage-based billing integration
- [ ] Compliance & audit logging
- [ ] Global CDN deployment

## License

MIT

## Contributing

1. Read ARCHITECTURE.md first
2. Follow the service/repository pattern
3. Add Zod validation for all inputs
4. Ensure TypeScript compiles with zero errors
5. Update ARCHITECTURE.md for structural changes
