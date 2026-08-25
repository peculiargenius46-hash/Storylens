# StoryLens AI — Batch 0

This is the foundation. No transcription, no AI, no billing yet. Just:

- Sign up / log in / log out, working against real Supabase auth
- A protected dashboard that reads real (currently empty) data from the database
- The full database schema from section 36 of the PRD, plus the regional pricing
  tables from section 28, all locked down with row-level security so a user can
  only ever see their own data
- The landing page from section 7

## 1. Run the database migration

1. Open your Supabase project -> **SQL Editor** -> **New query**
2. Paste in the entire contents of `supabase/migrations/0001_init.sql`
3. Click **Run**

That creates every table, locks each one down with RLS, and seeds the six
starting plan rows (Nigeria + International, Free/Creator/Pro) from sections
25 to 27 of the PRD. Prices are already sitting in that `plans` table, not
hard-coded anywhere in the app, exactly like section 28 asks for.

## 2. Set your environment variables

Copy `.env.local.example` to `.env.local` and fill in your Supabase project URL
and anon/public key. `.env.local` is ignored by Git and must never be committed.

## 3. Push to GitHub

Same as the YCDI hub: open GitHub Desktop, add this folder as a local
repository, commit, publish to a new repository on your GitHub account.

## 4. Deploy on Netlify

1. Import the GitHub repository into Netlify.
2. Open **Site configuration → Environment variables**.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for every
   deploy context that should support authentication.
4. Trigger a new deploy so Next.js can include both public values in the client bundle.

Netlify rebuilds automatically whenever a new commit is pushed to the configured branch.

## What to check once it's live

- Sign up with a real email, you should get a confirmation email, clicking
  it should land you on `/dashboard`
- Log out, log back in, should work
- Try visiting `/dashboard` while logged out, should bounce you to `/login`
- Check the Supabase Table Editor, after signing up, a row should appear in
  `profiles` automatically (that's the trigger in the migration doing its job)

## What's deliberately not here yet

Upload, transcription, AssemblyAI, OpenAI, Interview Intelligence, Story
Studio, billing. That's Batch 1 onward. This batch exists to prove the
foundation is solid before anything gets built on top of it.
