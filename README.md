# StoryLens AI

Turn conversations into compelling stories.

Built in batches. Batch 0 delivered authentication and the database schema.
**Batch 1 (this one) delivers the transcription pipeline end to end:** create an
interview, upload a recording, AssemblyAI transcribes it with the speakers separated,
and the transcript appears in the project workspace.

---

## Batch 1 setup — do these in order

You only have to do steps 1 and 2 once. After that, deploys are automatic.

### 1. Run the new database migration

1. Open your Supabase project.
2. Left sidebar: **SQL Editor**.
3. Click **New query**.
4. Open the file `supabase/migrations/0002_storage.sql` from this project, copy
   everything in it, and paste it into the query box.
5. Click **Run**.

You should see "Success. No rows returned." That creates the private `recordings`
storage bucket, locks it to each user's own folder, and adds a heartbeat column so a
transcription that stalls can recover itself.

**If step 5 gives a permissions error** on the policy lines, create the bucket by hand
instead: Supabase sidebar → **Storage** → **New bucket** → name it exactly
`recordings` → leave **Public bucket** switched OFF → **Save**. Then re-run the file.

### 2. Add your AssemblyAI key to Netlify

1. Netlify → your StoryLens site → **Site configuration** (called **Project
   configuration** on newer menus) → **Environment variables**.
2. **Add a variable**.
3. Key: `ASSEMBLYAI_API_KEY` (exactly that, capitals and underscores).
4. Value: your key from the AssemblyAI dashboard.
5. Tick **Contains secret values** if you see it. Save.

The key stays on the server. It is never sent to the browser, which is the whole
reason this app runs on Next.js server routes instead of a static site.

### 3. Push the code

Open GitHub Desktop, commit the changed files, and click **Push origin**. Netlify
picks it up and redeploys on its own. Give it two or three minutes.

---

## Testing Batch 1

Log in, then:

1. Dashboard → **+ New interview**. Give it a title, press **Continue to upload**.
2. Drag in a short recording. Start with something small, two or three minutes, so
   you get an answer quickly.
3. Press **Start processing**.
4. The processing page ticks through the stages and moves you to the workspace when
   the transcript is ready.
5. On the workspace, name the speakers and press **Save names**. The transcript
   relabels itself.

A two minute clip is usually done in well under a minute. A one hour interview
lands in a few minutes.

---

## Good to know

**Upload size.** Supabase caps uploads at 50 MB on the free plan, so the upload
screen refuses anything larger. A one hour interview exported as a mono MP3 fits
comfortably. If you need more, raise the limit in Supabase under Storage settings.

**Usage.** Transcribed minutes are counted against your plan and shown on the
dashboard. Limits are recorded but not yet enforced. The paywall comes in a later
batch, so nothing will block you while you test.

**Leaving the page.** Processing continues even if you close the tab. The interview
will be waiting on your dashboard.

**Your recordings are private.** The storage bucket is not public, and every file
lives in a folder keyed to your user id. Even with a direct link, another account
cannot read it. AssemblyAI receives a temporary signed link that expires.

---

## What's in this batch

| Area | What it does |
| --- | --- |
| `/projects/new` | The New Interview form (PRD section 9) |
| `/projects/[id]/upload` | Drag-and-drop upload, size and length preview, allowance check (section 10) |
| `/projects/[id]/processing` | Live progress checklist while transcription runs (section 11) |
| `/projects/[id]` | Project workspace: speaker naming and the transcript (sections 12 and 13) |
| `/api/transcribe` | Sends the recording to AssemblyAI. Server only |
| `/api/transcribe/status` | Checks progress, saves the transcript, meters usage |
| `src/lib/entitlements.ts` | Reads plan allowances from the `plans` table, never hard-coded |

Original transcript text is stored in `original_text` and never overwritten. Edits
will go into `edited_text` when the transcript editor arrives, which keeps the
distinction the PRD insists on between what was said and what was changed.

---

## Next batch

Batch 2 wires up OpenAI for Interview Intelligence: themes, story signals, and the
timeline. That will need an `OPENAI_API_KEY` added to Netlify the same way.

---

## Local development (optional)

Copy `.env.local.example` to `.env.local`, fill in the three values, then:

```
npm install
npm run dev
```
