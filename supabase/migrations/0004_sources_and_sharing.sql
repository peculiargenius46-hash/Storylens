-- StoryLens AI — Batch 3: recording sources + transcript sharing
--
-- Run this in the Supabase SQL editor BEFORE uploading the code files.
-- Safe to run more than once: every statement checks for itself first.
--
-- What this adds and why:
--
-- 1. source_type  — how the recording got here: an uploaded file, something
--                   recorded in the browser, or a pasted link. The pipeline
--                   needs to know, because a pasted link has no file in
--                   storage and must be handed to AssemblyAI directly.
--
-- 2. source_url   — for pasted links only, the direct audio/video address.
--                   Stays empty for uploads and recordings.
--
-- 3. share_token  — a long random string that makes one transcript readable
--                   without logging in. Null means not shared. Revoking a
--                   share is just setting this back to null.
--
-- Note on sharing and security: there is deliberately NO row-level security
-- policy here granting anonymous read access. An RLS policy broad enough to
-- serve share links would expose every shared recording to anyone who guessed
-- a URL shape. Instead the share page runs on the server, matches the exact
-- token, and returns only that one recording. The token never becomes a
-- database-wide permission.

-- 1. Recording source ------------------------------------------------------

alter table public.recordings
  add column if not exists source_type text not null default 'upload';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'recordings_source_type_check'
  ) then
    alter table public.recordings
      add constraint recordings_source_type_check
      check (source_type in ('upload', 'record', 'link'));
  end if;
end $$;

alter table public.recordings
  add column if not exists source_url text;

-- 2. Sharing ---------------------------------------------------------------

alter table public.recordings
  add column if not exists share_token text;

alter table public.recordings
  add column if not exists shared_at timestamptz;

-- Two people must never end up with the same token.
create unique index if not exists recordings_share_token_key
  on public.recordings (share_token)
  where share_token is not null;
