-- StoryLens AI — Batch 1: upload, recording, link-based transcription
-- Run this in Supabase SQL Editor after 0001_init.sql has already been run.

-- ============================================================
-- 1. New columns on recordings
-- ============================================================
alter table public.recordings
  add column if not exists source_type text not null default 'upload'
    check (source_type in ('upload', 'record', 'link')),
  add column if not exists source_url text, -- the pasted external link, if source_type = 'link'
  add column if not exists summary text,
  add column if not exists action_items jsonb not null default '[]'::jsonb,
  add column if not exists share_token uuid unique default gen_random_uuid(),
  add column if not exists error_message text;

-- ============================================================
-- 2. Storage bucket for uploaded / recorded audio
--    Private bucket — files are only reachable through signed URLs
--    generated server-side, never a public URL.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do nothing;

-- ============================================================
-- 3. Storage RLS — files live at {user_id}/{project_id}/{recording_id}/{filename}
--    A user can only touch files under their own user_id folder.
-- ============================================================
create policy "recordings_storage_owner_select" on storage.objects
  for select using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "recordings_storage_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "recordings_storage_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Note: public sharing does NOT use an RLS policy here. A policy that only
-- checks "share_token is not null" would let any anonymous visitor read
-- every shared recording, not just the one they actually have the link to,
-- since RLS can't compare against a value the client supplies in a URL.
-- Instead, the share page is served by a server route using the service
-- role key, which looks up the recording by an EXACT match on share_token.
-- Everything else (transcript_segments, quotes, etc.) stays owner-only.
