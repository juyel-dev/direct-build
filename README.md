# Aurora — AI Facebook Autopilot

Open-source AI Facebook automation. Bring your own Supabase, bring your own keys.

## Quick Start

1. Deploy to [Lovable](https://lovable.dev) / Vercel / Netlify
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
- **AI:** OpenAI / Gemini / Groq (configurable)
- **Images:** DALL-E / Stability AI / Pollinations (configurable)
- **Social:** Facebook Graph API

## Architecture

```
User credentials → Setup Wizard → Supabase provisioning
                                        ↓
                              pg_cron (every minute)
                                        ↓
                              aurora-worker Edge Function
                                        ↓
                    ┌───────────────────┼───────────────────┐
                    ↓                   ↓                   ↓
              plan_content      publish_due_posts    capture_engagement
              (AI drafts)      (FB Graph API)       (metrics fetch)
```

## Configuration

### Supabase
- Project URL
- Anon Key
- Service Role Key
- Personal Access Token (PAT)

### Facebook
- Page Access Token (long-lived)
- Page ID

### AI Text Model
- Provider (OpenAI / Gemini / Groq / Custom)
- Base URL
- Model name
- API Key

### Image Generation
- Provider (DALL-E / Stability / Pollinations / Custom)
- Model name
- API Key (if applicable)

## Development

```bash
# Install dependencies
bun install

# Start dev server
bun run dev

# Build for production
bun run build

# Lint
bun run lint
```

## License

MIT
