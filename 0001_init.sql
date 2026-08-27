-- StoryLens AI — Batch 0: core schema, regional pricing, RLS lockdown
-- Run this once in Supabase SQL Editor (Project > SQL Editor > New query > paste > Run)

create extension if not exists "pgcrypto";

-- ============================================================
-- 1. PROFILES (mirrors auth.users, one row per signed-up user)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  country text,
  pricing_region text not null default 'international'
    check (pricing_region in ('nigeria', 'international')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- 2. PLANS (regional pricing engine — section 28 of the PRD)
--    Never hard-coded in the frontend. Read from here.
-- ============================================================
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  region text not null check (region in ('nigeria', 'international')),
  currency text not null,
  plan_code text not null check (plan_code in ('free', 'creator', 'pro', 'business')),
  monthly_price numeric,
  annual_price numeric,
  transcription_limit_minutes integer,
  story_limit integer,
  ask_limit integer,
  project_limit integer,
  storage_limit_mb integer,
  created_at timestamptz not null default now(),
  unique (region, plan_code)
);

-- ============================================================
-- 3. SUBSCRIPTIONS
-- ============================================================
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_code text not null default 'free'
    check (plan_code in ('free', 'creator', 'pro', 'business')),
  billing_cycle text not null default 'monthly'
    check (billing_cycle in ('monthly', 'annual')),
  currency text not null default 'NGN',
  status text not null default 'active'
    check (status in ('active', 'past_due', 'cancelled')),
  renewal_date date,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 4. USAGE METERING (section 30)
-- ============================================================
create table public.usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  billing_period date not null, -- first day of the billing month
  transcription_seconds integer not null default 0,
  story_generations integer not null default 0,
  ask_queries integer not null default 0,
  ai_input_tokens bigint not null default 0,
  ai_output_tokens bigint not null default 0,
  storage_bytes bigint not null default 0,
  unique (user_id, billing_period)
);

-- ============================================================
-- 5. PROJECTS
-- ============================================================
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  interviewee text,
  interviewee_role text,
  organisation text,
  interview_type text check (interview_type in (
    'employee_feature', 'executive_interview', 'media_interview',
    'customer_interview', 'research_interview', 'podcast', 'general'
  )),
  description text,
  status text not null default 'draft'
    check (status in ('draft', 'processing', 'ready', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 6. RECORDINGS
-- ============================================================
create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  storage_url text,
  duration_seconds integer,
  transcription_id text, -- AssemblyAI transcript id
  status text not null default 'pending'
    check (status in ('pending', 'uploading', 'transcribing', 'analysing', 'ready', 'failed')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- 7. SPEAKERS
-- ============================================================
create table public.speakers (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references public.recordings(id) on delete cascade,
  speaker_label text not null, -- e.g. 'A', 'B' from AssemblyAI diarization
  speaker_name text,
  speaker_role text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 8. TRANSCRIPT SEGMENTS
--    original_text is never overwritten — edited_text carries edits (section 13)
-- ============================================================
create table public.transcript_segments (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references public.recordings(id) on delete cascade,
  speaker_id uuid references public.speakers(id) on delete set null,
  original_text text not null,
  edited_text text,
  start_time numeric not null,
  end_time numeric not null,
  confidence numeric,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 9. QUOTES
-- ============================================================
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references public.recordings(id) on delete cascade,
  speaker_id uuid references public.speakers(id) on delete set null,
  quote text not null,
  start_time numeric,
  end_time numeric,
  category text check (category in (
    'strong', 'emotional', 'insightful', 'leadership', 'humorous', 'historical', 'reflective'
  )),
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 10. HIGHLIGHTS (story signals — section 14)
-- ============================================================
create table public.highlights (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references public.recordings(id) on delete cascade,
  category text,
  title text,
  summary text,
  start_time numeric,
  end_time numeric,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 11. TIMELINE EVENTS (section 15)
-- ============================================================
create table public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references public.recordings(id) on delete cascade,
  date_reference text,
  event text not null,
  source_segment_id uuid references public.transcript_segments(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 12. WRITING PROFILES (section 19)
-- ============================================================
create table public.writing_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  instructions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 13. GENERATED CONTENT (Story Studio output — section 36)
-- ============================================================
create table public.generated_content (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  content_type text,
  title text,
  content text,
  model text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY — every table locked to its owner
-- ============================================================
alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage enable row level security;
alter table public.projects enable row level security;
alter table public.recordings enable row level security;
alter table public.speakers enable row level security;
alter table public.transcript_segments enable row level security;
alter table public.quotes enable row level security;
alter table public.highlights enable row level security;
alter table public.timeline_events enable row level security;
alter table public.writing_profiles enable row level security;
alter table public.generated_content enable row level security;

-- profiles: a user can only see and edit their own row
create policy "profiles_owner_select" on public.profiles for select using (auth.uid() = id);
create policy "profiles_owner_update" on public.profiles for update using (auth.uid() = id);
create policy "profiles_owner_insert" on public.profiles for insert with check (auth.uid() = id);

-- plans: publicly readable (needed to render pricing pages), never writable from the client
create policy "plans_public_read" on public.plans for select using (true);

-- subscriptions, usage, writing_profiles: owner only
create policy "subscriptions_owner_all" on public.subscriptions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "usage_owner_all" on public.usage for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "writing_profiles_owner_all" on public.writing_profiles for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- projects: owner only
create policy "projects_owner_all" on public.projects for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- generated_content: owner via project chain
create policy "generated_content_owner_all" on public.generated_content for all
  using (exists (
    select 1 from public.projects p
    where p.id = generated_content.project_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.projects p
    where p.id = generated_content.project_id and p.user_id = auth.uid()
  ));

-- recordings: owner via project chain
create policy "recordings_owner_all" on public.recordings for all
  using (exists (
    select 1 from public.projects p
    where p.id = recordings.project_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.projects p
    where p.id = recordings.project_id and p.user_id = auth.uid()
  ));

-- speakers, transcript_segments, quotes, highlights, timeline_events:
-- owner via recording -> project chain
create policy "speakers_owner_all" on public.speakers for all
  using (exists (
    select 1 from public.recordings r join public.projects p on p.id = r.project_id
    where r.id = speakers.recording_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.recordings r join public.projects p on p.id = r.project_id
    where r.id = speakers.recording_id and p.user_id = auth.uid()
  ));

create policy "transcript_segments_owner_all" on public.transcript_segments for all
  using (exists (
    select 1 from public.recordings r join public.projects p on p.id = r.project_id
    where r.id = transcript_segments.recording_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.recordings r join public.projects p on p.id = r.project_id
    where r.id = transcript_segments.recording_id and p.user_id = auth.uid()
  ));

create policy "quotes_owner_all" on public.quotes for all
  using (exists (
    select 1 from public.recordings r join public.projects p on p.id = r.project_id
    where r.id = quotes.recording_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.recordings r join public.projects p on p.id = r.project_id
    where r.id = quotes.recording_id and p.user_id = auth.uid()
  ));

create policy "highlights_owner_all" on public.highlights for all
  using (exists (
    select 1 from public.recordings r join public.projects p on p.id = r.project_id
    where r.id = highlights.recording_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.recordings r join public.projects p on p.id = r.project_id
    where r.id = highlights.recording_id and p.user_id = auth.uid()
  ));

create policy "timeline_events_owner_all" on public.timeline_events for all
  using (exists (
    select 1 from public.recordings r join public.projects p on p.id = r.project_id
    where r.id = timeline_events.recording_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.recordings r join public.projects p on p.id = r.project_id
    where r.id = timeline_events.recording_id and p.user_id = auth.uid()
  ));

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, created_at)
  values (new.id, new.email, now());
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- SEED: starting plan rows (section 25, 26, 27 of the PRD)
-- Prices editable later from Supabase directly — never redeploy for a price change.
-- ============================================================
insert into public.plans (region, currency, plan_code, monthly_price, annual_price, transcription_limit_minutes, story_limit, ask_limit, project_limit, storage_limit_mb) values
  ('nigeria', 'NGN', 'free', 0, null, 30, 1, 5, 2, 500),
  ('nigeria', 'NGN', 'creator', 3500, 35000, 180, 10, 50, 20, 5000),
  ('nigeria', 'NGN', 'pro', 8500, 85000, 500, 30, 200, 100, 20000),
  ('international', 'USD', 'free', 0, null, 30, 1, 5, 2, 500),
  ('international', 'USD', 'creator', 9, 90, 300, 20, 100, 20, 5000),
  ('international', 'USD', 'pro', 24, 240, 1000, 60, 500, 100, 20000);
