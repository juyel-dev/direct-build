# Future Improvements — Backlog

Deferred items from the W1–W6 engineering pass. Nothing here is a known bug — everything currently working continues to work. These are intentionally postponed because they're either genuinely low-urgency, require a product/design decision rather than an engineering one, or need more real-world usage evidence before the right shape is clear. Revisit when there's a concrete need, not on a schedule.

---

## Navigation & UX

- **Adaptive navigation.** `AppShell.tsx` uses the same hamburger-drawer pattern at every breakpoint, including desktop. The natural shape: persistent sidebar on desktop, compact sidebar on tablet, drawer on mobile — the existing `NAV` array already gives one source of truth to render three ways. **Implementation note:** do this via CSS/Tailwind responsive classes (all three variants in the DOM, visibility toggled by breakpoint), not JS-based `window.innerWidth` detection — Aurora is SSR'd via TanStack Start/Nitro, so device-detection in JS risks a server/client mismatch flash on load.
- **"Publish Now" copy precision.** In `compose.tsx`, both "Publish Now" and "Schedule" save with the same `approved` status, differing only in `slot_start`. "Publish Now" actually means "approved with slot_start = now," and the real publish happens on the worker's next cron tick (up to one interval away, per the configurable interval from W5). Minor, but worth softening the copy ("Publishing shortly" vs. an implied-instant "Publishing now!") once nav/UI work is in scope anyway.

## Accessibility

- **Custom component ARIA coverage.** Radix-based primitives (dialogs, dropdowns) get correct ARIA behavior for free; the gap is concentrated in custom components that don't inherit it — `GlassCard`, `GlassInput`, and the calendar views (`WeekGrid`, `MonthView`, `TimelineList`). Worth a focused pass once these are being touched for other reasons anyway, rather than a standalone accessibility sprint.
- **Image alt text follow-through.** W1 fixed the two places using raw `<img>` instead of the already-built `OptimizedImage` (which requires `alt` at the type level). Worth confirming no other raw `<img>` usages have crept back in before the next release.

## Minor reliability/UX polish (not bugs, just rough edges)

- **Dashboard health default.** `index.tsx` defaults `stats?.health ?? "healthy"`. If the health computation ever silently fails, the UI shows green rather than "unknown." Low-risk (would need the underlying query to fail silently first), but "unknown" is the more honest default.
- **Silent drag/reschedule failures.** `useSchedule.ts`'s drag-to-reschedule and quick-create paths no-op with no toast if the Supabase client fails to initialize (e.g., session locked). Would just look like "nothing happened" to a user, rather than an error.

## Deferred architectural items (already scoped, intentionally not built)

- **Facebook rate-limit header awareness.** No special handling of Facebook's own rate-limit error codes or `X-App-Usage`/`X-Page-Usage` headers yet — generic exponential backoff covers today's usage levels fine. Revisit once usage actually grows; per your own earlier call, not worth building ahead of evidence.
- **`fb_post_id` / `fb_permalink_url` renaming.** Facebook-specific column names in `posts`, a table meant to eventually be platform-agnostic. Cheap to rename now (additive migration + alias), much more expensive once a second platform adapter exists and real data has accumulated. Worth doing before Instagram/LinkedIn work starts, not before.
- **Full automated Facebook long-lived token exchange.** W1 shipped the safer, verifiable fix (surfacing token expiry via `debug_token`, better guidance copy). The fuller version — client-side exchange using a user's own Facebook App ID/Secret for a genuinely non-expiring page token — is still a reasonable future upgrade, just needs real Facebook API access to build and test safely (unavailable in the environment this work was done in).
- **Zod-based response validation for LLM calls.** The two `extractJson()` string-surgery implementations (client `ai.service.ts`, worker) still exist independently. Zod is already a project dependency; replacing ad hoc brace-matching with real schema validation is a reasonable robustness upgrade, but nothing is currently broken by the current approach — no urgency.
- **Cost tracking: "unknown" vs. "free" disambiguation.** W4 made unrecognized models log a visible warning instead of silently showing $0, but both still store `0` in `estimated_cost_usd` (the column is `NOT NULL`). Properly distinguishing them would need a schema change plus a dashboard UI update to actually surface "N calls have unrecognized pricing." Reasonable small follow-up, deliberately not bundled into W4 to avoid a migration + UI change for a gap the warning event already makes visible in `system_events`.
- **Supabase OAuth relay** (a stateless, auditable code-exchange service to replace manual credential paste in Settings) and **webhook receiver for near-real-time engagement capture** — both discussed at length during the audit/strategy phase, both remain classified as **Future Optional Infrastructure**. Neither is needed today; both stay fully BYOB-compatible if built later (the webhook receiver especially — it can live entirely inside each user's own Supabase project, no shared infrastructure required).
- **Architecture Decision Records.** A lightweight `/docs/adr/` folder documenting *why* (BYOB, BYOK, browser-first, local encryption, Supabase, provider-agnostic design) rather than just *what* — useful for future contributors and AI coding agents, not urgent.

---

*Maintained as part of the ongoing engineering work on Aurora. Add to this list as new lower-priority ideas come up rather than letting them scatter across commit messages or conversation history.*
