-- StoryLens AI — Batch 2: Interview Intelligence
-- Run this once in Supabase SQL Editor (Project > SQL Editor > New query > paste > Run).
--
-- After running, confirm the two new tables exist with:
--   select table_name from information_schema.tables
--   where table_schema = 'public' and table_name in ('themes', 'theme_segments');
-- You should get two rows back. "Success" with no rows does not mean it worked.
--
-- Story Signals live in the existing `highlights` table and the Timeline lives in the
-- existing `timeline_events` table (both created in Batch 0), so this migration only
-- adds Themes plus the columns that track the analysis job on a recording.

-- ============================================================
-- 1. ANALYSIS TRACKING ON RECORDINGS
--    Kept separate from `status` so the transcription lifecycle and the
--    intelligence lifecycle never step on each other. A recording is
--    status = 'ready' (transcript saved) long before analysis has run.
-- ============================================================
alter table public.recordings
  add column if not exists analysis_status text not null default 'idle'
    check (analysis_status in ('idle', 'analysing', 'ready', 'failed'));

alter table public.recordings
  add column if not exists analysis_step integer not null default 0;

alter table public.recordings
  add column if not exists analysis_error text;

alter table public.recordings
  add column if not exists analysis_updated_at timestamptz not null default now();

-- Story signals (the `highlights` table) gain a link to the exact segment they
-- came from, so every signal on the Intelligence page opens the moment it refers to.
alter table public.highlights
  add column if not exists source_segment_id uuid
    references public.transcript_segments(id) on delete set null;

-- ============================================================
-- 2. THEMES (section 14 — selecting a theme reveals its transcript sections)
-- ============================================================
create table if not exists public.themes (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references public.recordings(id) on delete cascade,
  title text not null,
  summary text,
  created_at timestamptz not null default now()
);

-- Which transcript segments belong to a theme. This is what makes a theme
-- clickable back to the exact places it was discussed.
create table if not exists public.theme_segments (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null references public.themes(id) on delete cascade,
  segment_id uuid not null references public.transcript_segments(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (theme_id, segment_id)
);

-- ============================================================
-- 3. ROW LEVEL SECURITY — owner only, via the recording -> project chain
-- ============================================================
alter table public.themes enable row level security;
alter table public.theme_segments enable row level security;

drop policy if exists "themes_owner_all" on public.themes;
create policy "themes_owner_all" on public.themes for all
  using (exists (
    select 1 from public.recordings r
    join public.projects p on p.id = r.project_id
    where r.id = themes.recording_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.recordings r
    join public.projects p on p.id = r.project_id
    where r.id = themes.recording_id and p.user_id = auth.uid()
  ));

drop policy if exists "theme_segments_owner_all" on public.theme_segments;
create policy "theme_segments_owner_all" on public.theme_segments for all
  using (exists (
    select 1 from public.themes t
    join public.recordings r on r.id = t.recording_id
    join public.projects p on p.id = r.project_id
    where t.id = theme_segments.theme_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.themes t
    join public.recordings r on r.id = t.recording_id
    join public.projects p on p.id = r.project_id
    where t.id = theme_segments.theme_id and p.user_id = auth.uid()
  ));

-- ============================================================
-- 4. LOOKUP SPEED
--    Everything on the Intelligence page is read one-recording-at-a-time.
-- ============================================================
create index if not exists themes_recording_idx on public.themes (recording_id);
create index if not exists theme_segments_theme_idx on public.theme_segments (theme_id);
create index if not exists highlights_recording_idx on public.highlights (recording_id);
create index if not exists timeline_events_recording_idx on public.timeline_events (recording_id);
