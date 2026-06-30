/**
 * SQL migrations for the user's Supabase project.
 * Forward-only, numbered, idempotent. Run via Management API.
 */

export type Migration = { id: number; name: string; sql: string };

export const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: "init",
    sql: `
-- Extensions
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- _migrations
create table if not exists public._migrations (
  id int primary key,
  name text not null,
  applied_at timestamptz not null default now()
);
grant select on public._migrations to anon, authenticated;
grant all on public._migrations to service_role;

-- pages
create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  fb_page_id text unique,
  fb_page_name text not null,
  default_brand_voice text default '',
  default_image_style text default '',
  default_posting_windows jsonb not null default '[{"hour":9,"minute":0},{"hour":13,"minute":0},{"hour":18,"minute":0}]'::jsonb,
  posting_mode text not null default 'manual' check (posting_mode in ('manual','hybrid','full_auto')),
  max_posts_per_day int not null default 2,
  ai_overrides jsonb not null default '{}'::jsonb,
  prompt_overrides jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

-- content_briefs
create table if not exists public.content_briefs (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  slot_start timestamptz not null,
  topic text default '',
  caption text default '',
  hashtags text[] not null default '{}',
  image_prompt text default '',
  image_url text,
  cta text default '',
  hook text default '',
  predicted_engagement_score numeric,
  approved_at timestamptz,
  status text not null default 'draft' check (status in ('draft','approved','scheduled','published','skipped','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (page_id, slot_start)
);

-- posts
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  content_brief_id uuid references public.content_briefs(id) on delete set null,
  fb_post_id text,
  fb_permalink_url text,
  idempotency_key text unique not null,
  status text not null default 'pending' check (status in ('pending','published','failed')),
  published_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

-- engagement_snapshots
create table if not exists public.engagement_snapshots (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  captured_at timestamptz not null default now(),
  likes int not null default 0,
  comments int not null default 0,
  shares int not null default 0,
  reactions jsonb not null default '{}'::jsonb,
  reach int not null default 0,
  impressions int not null default 0,
  unique (post_id, captured_at)
);

-- jobs
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  page_id uuid references public.pages(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','succeeded','failed_retryable','failed_terminal','dead_letter')),
  attempts int not null default 0,
  max_attempts int not null default 5,
  priority int not null default 0,
  scheduled_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  locked_by text,
  next_retry_at timestamptz,
  last_error text,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ai_usage
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  page_id uuid references public.pages(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  provider text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  estimated_cost_usd numeric not null default 0,
  called_at timestamptz not null default now()
);

-- system_events
create table if not exists public.system_events (
  id uuid primary key default gen_random_uuid(),
  severity text not null default 'info' check (severity in ('debug','info','warn','error')),
  category text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- app_settings (singleton)
-- Guard: if an older install created this table with a uuid id, drop it so
-- the canonical int-singleton shape below can be re-created cleanly.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_settings'
      and column_name = 'id'
      and data_type <> 'integer'
  ) then
    execute 'drop table public.app_settings cascade';
  end if;
end $$;

create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  installer_version text not null default '1.0.0',
  schema_version int not null default 1,
  telemetry_enabled boolean not null default false,
  daily_spend_cap_usd numeric not null default 1.0,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

-- strategy_insights
create table if not exists public.strategy_insights (
  page_id uuid not null references public.pages(id) on delete cascade,
  window_days int not null,
  best_posting_hour int,
  best_topics text[] not null default '{}',
  avg_engagement_rate numeric,
  computed_at timestamptz not null default now(),
  primary key (page_id, window_days)
);

-- Indexes
create index if not exists idx_jobs_claimable on public.jobs (status, scheduled_at) where status in ('pending','failed_retryable');
create index if not exists idx_jobs_lease on public.jobs (lease_expires_at) where status = 'processing';
create index if not exists idx_briefs_page_slot on public.content_briefs (page_id, slot_start);
create index if not exists idx_posts_page_pub on public.posts (page_id, published_at desc);
create index if not exists idx_snap_post_time on public.engagement_snapshots (post_id, captured_at desc);
create index if not exists idx_events_created on public.system_events (created_at desc);
create index if not exists idx_usage_page_called on public.ai_usage (page_id, called_at desc);

-- Grants: authenticated + anon get full CRUD (this install has no auth).
-- The security boundary is project access, not row-level auth.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  public.pages, public.content_briefs, public.posts,
  public.engagement_snapshots, public.jobs, public.ai_usage,
  public.system_events, public.app_settings, public.strategy_insights
  to anon, authenticated;
grant all on
  public.pages, public.content_briefs, public.posts,
  public.engagement_snapshots, public.jobs, public.ai_usage,
  public.system_events, public.app_settings, public.strategy_insights
  to service_role;

-- RLS: enabled with permissive policies for v1 (no-auth model).
alter table public.pages enable row level security;
alter table public.content_briefs enable row level security;
alter table public.posts enable row level security;
alter table public.engagement_snapshots enable row level security;
alter table public.jobs enable row level security;
alter table public.ai_usage enable row level security;
alter table public.system_events enable row level security;
alter table public.app_settings enable row level security;
alter table public.strategy_insights enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array['pages','content_briefs','posts','engagement_snapshots','jobs','ai_usage','system_events','app_settings','strategy_insights']) loop
    execute format('drop policy if exists "open_all" on public.%I', t);
    execute format('create policy "open_all" on public.%I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- RPC: claim_jobs (race-free)
create or replace function public.claim_jobs(_limit int default 5, _worker text default 'worker')
returns setof public.jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.jobs
  set status = 'processing',
      attempts = attempts + 1,
      lease_expires_at = now() + interval '5 minutes',
      locked_by = _worker,
      updated_at = now()
  where id in (
    select id from public.jobs
    where (status = 'pending' and scheduled_at <= now())
       or (status = 'processing' and lease_expires_at < now() - interval '30 seconds')
       or (status = 'failed_retryable' and next_retry_at <= now())
    order by priority desc, scheduled_at asc
    limit _limit
    for update skip locked
  )
  returning *;
end $$;

grant execute on function public.claim_jobs(int, text) to anon, authenticated, service_role;

-- Record migration
insert into public._migrations (id, name) values (1, 'init') on conflict (id) do nothing;
`,
  },
  {
    id: 2,
    name: "automation_runtime",
    sql: `
-- Automation runtime support
create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table public.jobs
  add column if not exists completed_at timestamptz;

create index if not exists idx_jobs_kind_page_created on public.jobs (kind, page_id, created_at desc);
create index if not exists idx_briefs_publish_due on public.content_briefs (page_id, slot_start, status)
  where status in ('approved','scheduled');

update public.app_settings
set schema_version = 2,
    config = coalesce(config, '{}'::jsonb) || jsonb_build_object('automation_runtime', 'edge_cron'),
    updated_at = now()
where id = 1;

-- Record migration
insert into public._migrations (id, name) values (2, 'automation_runtime') on conflict (id) do nothing;
`,
  },
  {
    id: 4,
    name: "performance_indexes",
    sql: `
-- Performance indexes for common query patterns
create index if not exists idx_briefs_status on public.content_briefs (status) where status in ('draft','approved','scheduled');
create index if not exists idx_briefs_slot_start on public.content_briefs (slot_start desc);
create index if not exists idx_posts_status on public.posts (status) where status in ('pending','published');
create index if not exists idx_posts_idempotency on public.posts (idempotency_key);
create index if not exists idx_snap_captured_at on public.engagement_snapshots (captured_at desc);
create index if not exists idx_snap_captured_at_post on public.engagement_snapshots (post_id, captured_at desc);
create index if not exists idx_jobs_idempotency on public.jobs (idempotency_key) where idempotency_key is not null;
create index if not exists idx_usage_called_at on public.ai_usage (called_at desc);

update public.app_settings set schema_version = 4, updated_at = now() where id = 1;
insert into public._migrations (id, name) values (4, 'performance_indexes') on conflict (id) do nothing;
`,
  },
  {
    id: 3,
    name: "auth_user_isolation",
    sql: `
-- User isolation via Supabase Auth
-- Each table gets a user_id column referencing auth.users
-- RLS policies check auth.uid() instead of open_all

-- Only run if auth schema exists (Supabase Auth enabled)
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'auth') then
    return;
  end if;
end $$;

-- Add user_id columns (nullable for backward compatibility)
alter table public.pages add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.content_briefs add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.posts add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.jobs add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.ai_usage add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Index user_id columns
create index if not exists idx_pages_user on public.pages (user_id);
create index if not exists idx_briefs_user on public.content_briefs (user_id);
create index if not exists idx_posts_user on public.posts (user_id);
create index if not exists idx_jobs_user on public.jobs (user_id);
create index if not exists idx_usage_user on public.ai_usage (user_id);

-- RPC: Set user_id on insert trigger function
create or replace function public.set_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    new.user_id = auth.uid();
  end if;
  return new;
end $$;

-- Drop old open_all policies
do $$
declare t text;
begin
  for t in select unnest(array['pages','content_briefs','posts','engagement_snapshots','jobs','ai_usage','system_events','app_settings','strategy_insights']) loop
    execute format('drop policy if exists "open_all" on public.%I', t);
  end loop;
end $$;

-- Create user-aware RLS policies
-- If auth.uid() is set (user is logged in), enforce user isolation
-- Otherwise fall back to open access (for existing single-user setups)
do $$
declare t text;
begin
  for t in select unnest(array['pages','content_briefs','posts','engagement_snapshots','jobs','ai_usage','system_events','app_settings','strategy_insights']) loop
    execute format('
      create policy "user_or_open" on public.%I
      for all
      using (
        case
          when auth.uid() is not null then user_id = auth.uid()
          else true
        end
      )
      with check (
        case
          when auth.uid() is not null then user_id = auth.uid()
          else true
        end
      )', t);
  end loop;
end $$;

-- Create triggers to auto-set user_id on insert
do $$
declare t text;
begin
  for t in select unnest(array['pages','content_briefs','posts','jobs','ai_usage']) loop
    execute format('
      drop trigger if exists trg_set_user_id on public.%I;
      create trigger trg_set_user_id
      before insert on public.%I
      for each row
      execute function public.set_user_id()', t, t);
  end loop;
end $$;

update public.app_settings
set schema_version = 3,
    config = coalesce(config, '{}'::jsonb) || jsonb_build_object('auth_user_isolation', 'v1'),
    updated_at = now()
where id = 1;

insert into public._migrations (id, name) values (3, 'auth_user_isolation') on conflict (id) do nothing;
`,
  },
  {
    id: 5,
    name: "worker_reliability",
    sql: `
-- Circuit breaker support: index system_events for fast provider cooldown queries
create index if not exists idx_events_circuit
  on public.system_events (category, created_at desc)
  where severity = 'error';

-- Auth finalization: safe NOT NULL for user_id columns (no-op if existing data has nulls)
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pages' and column_name = 'user_id') then
    if not exists (select 1 from public.pages where user_id is null limit 1) then
      alter table public.pages alter column user_id set not null;
    end if;
    if not exists (select 1 from public.content_briefs where user_id is null limit 1) then
      alter table public.content_briefs alter column user_id set not null;
    end if;
    if not exists (select 1 from public.posts where user_id is null limit 1) then
      alter table public.posts alter column user_id set not null;
    end if;
    if not exists (select 1 from public.jobs where user_id is null limit 1) then
      alter table public.jobs alter column user_id set not null;
    end if;
    if not exists (select 1 from public.ai_usage where user_id is null limit 1) then
      alter table public.ai_usage alter column user_id set not null;
    end if;
  end if;
end $$;

update public.app_settings
set schema_version = 5,
    config = coalesce(config, '{}'::jsonb) || jsonb_build_object('worker_reliability', 'v1'),
    updated_at = now()
where id = 1;

insert into public._migrations (id, name) values (5, 'worker_reliability') on conflict (id) do nothing;
`,
  },
];
