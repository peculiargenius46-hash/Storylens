# StoryLens AI — Batch 1

Adds real upload, real transcription, and the first working slice of
Interview Intelligence:

- New Interview form (project title, interviewee, type, etc.)
- Upload page with three ways in: pick a file, record directly in the
  browser, or paste a direct link to an audio/video file
- AssemblyAI transcription with speaker diarization, running in the
  background via a webhook (so it isn't limited by how long a single
  request is allowed to run)
- Processing page showing real progress, not a spinner
- Transcript page: speaker-labelled segments with timestamps, an automatic
  summary, and auto-extracted action points
- Copy transcript, and a Share button that generates a public read-only
  link anyone can open without logging in

## 1. Run the new database migration

Same as before: Supabase SQL Editor > New query > paste the entire contents
of `supabase/migrations/0002_batch1_upload.sql` > Run.

This adds the new columns on `recordings`, creates a private Storage bucket
called `recordings`, and locks it down so a user can only ever touch their
own files.

## 2. Collect three new values before deploying

You'll need all three of these in Netlify's environment variables, on top
of the two from Batch 0:

1. **Supabase service role key** — Supabase Dashboard > Settings > API >
   there are two keys listed, `anon` (which you already have) and
   `service_role`. Copy the service_role one. Treat this one as genuinely
   secret, it bypasses every security rule in the database, never share it
   or put it anywhere public.
2. **AssemblyAI API key** — from your AssemblyAI dashboard.
3. **A webhook secret you make up yourself** — any random string, at least
   20-something characters. This isn't issued by anyone, you're inventing
   a password StoryLens uses to confirm a transcription result actually
   came from AssemblyAI.

## 3. Add them in Netlify

Site configuration > Environment variables > Add a variable, one at a time:

- `SUPABASE_SERVICE_ROLE_KEY`
- `ASSEMBLYAI_API_KEY`
- `ASSEMBLYAI_WEBHOOK_SECRET`

None of these three get the `NEXT_PUBLIC_` prefix. That prefix is what
tells Next.js "it's fine if the browser sees this", and these three are
the opposite of fine to expose.

## 4. Push and deploy

GitHub Desktop as usual: commit, push to main. Netlify rebuilds
automatically.

## What to check once it's live

- Dashboard > + New Interview > fill in a title > Continue to Upload
- Try all three upload tabs. Recording needs microphone permission, your
  browser will prompt for it.
- After starting processing, you should land on a page showing real steps
  ticking off (uploaded, transcribing, analysing, ready), then it
  auto-forwards to the transcript once done
- The transcript should show speaker-labelled, timestamped segments, plus
  a Summary box and an Action Points box above them
- Click Share, then open that link in a private/incognito window, it
  should show the transcript with no login required
- Click Copy transcript, paste it somewhere, confirm it's readable text

## Known limits in this batch

- No transcript editing yet (section 13's edit/highlight/note features
  come later)
- No project workspace overview page yet, clicking a project on the
  dashboard goes straight to Upload
- A project can only really be worked with one recording at a time in this
  batch's UI, even though the database already supports many
- Files are capped at 500MB for now
- YouTube links are deliberately not supported (explained to you earlier,
  legal grey area around extracting audio from YouTube specifically),
  any other direct audio/video link works fine
