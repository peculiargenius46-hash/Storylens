-- StoryLens AI — Batch 1: recordings storage bucket + owner-only access
-- Run this once in Supabase SQL Editor (Project > SQL Editor > New query > paste > Run)
--
-- Files live at:  recordings/{user_id}/{recording_id}/{filename}
-- The first folder in the path is the owner's user id, which is what every
-- policy below checks. A user can never read or write another user's folder.

-- ============================================================
-- 1. BUCKET (private — no public URLs, ever)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do nothing;

-- ============================================================
-- 2. STORAGE POLICIES — owner-only, matched on the first folder
-- ============================================================
drop policy if exists "recordings_insert_own_folder" on storage.objects;
drop policy if exists "recordings_select_own_folder" on storage.objects;
drop policy if exists "recordings_update_own_folder" on storage.objects;
drop policy if exists "recordings_delete_own_folder" on storage.objects;

create policy "recordings_insert_own_folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "recordings_select_own_folder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "recordings_update_own_folder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "recordings_delete_own_folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- 3. RECORDING HEARTBEAT
--    Lets the status endpoint tell a save that is genuinely in progress
--    from one that died halfway and needs picking up again.
-- ============================================================
alter table public.recordings
  add column if not exists updated_at timestamptz not null default now();

-- ============================================================
-- 4. TRANSCRIPT SEGMENT LOOKUP SPEED
--    Transcripts are always read in timestamp order for one recording.
-- ============================================================
create index if not exists transcript_segments_recording_start_idx
  on public.transcript_segments (recording_id, start_time);

create index if not exists speakers_recording_idx
  on public.speakers (recording_id);
