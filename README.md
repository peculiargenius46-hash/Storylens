# StoryLens AI

Turn conversations into compelling stories.

Built in batches. Batch 0 delivered authentication and the database schema.
Batch 1 delivered the transcription pipeline. **Batch 2 (this one) delivers Interview
Intelligence:** once a transcript is ready, StoryLens reads the whole conversation and
pulls out the themes running through it, the moments worth writing about, and the
timeline of events the interviewee describes. Every item links straight back to the
exact line in the transcript it came from.

---

## Batch 2 setup, in order

Run the database change first, then add the key, then push the code, then wait for
Netlify. Do it in that order. Steps 1 to 3 are one-time.

### 1. Run the new database migration

1. Open your Supabase project.
2. Left sidebar: **SQL Editor**.
3. Click **New query**.
4. Open the file `supabase/migrations/0003_intelligence.sql` from this project (it is
   also attached to the chat on its own), copy everything in it, and paste it into the
   query box.
5. Click **Run**.

Then confirm it actually worked. Do not trust "Success" with no rows. In a new query,
paste this and run it:

```
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('themes', 'theme_segments');
```

You should get **two rows** back. If you do, the migration is in.

### 2. Get at least one AI provider key

StoryLens is not tied to a single AI company. You add a key for whichever provider you
want, and the app uses it. You need **at least one**. Groq is the easiest place to
start because it has a real free tier, so these steps use Groq. If you already have a
provider key in Netlify from earlier, you can skip to step 3.

1. Go to console.groq.com and sign in (Google sign-in is fine).
2. Open **API Keys** in the left menu.
3. Click **Create API Key**, name it `storylens`, and create it.
4. Copy the key straight away. Groq only shows it once. If you lose it, delete it and
   make a new one.

That is enough to run everything on the free chain. If you also want a stronger model
for the quality work (the story signals, and later the story writing), add an OpenAI
key as well: sign in at platform.openai.com, top up a small prepaid amount under
**Settings → Billing** (five to ten dollars goes a long way), then create a key under
**API keys**. Whenever both keys are present, free users stay on Groq and paying users
get OpenAI, with the other one as an automatic backup.

### 3. Add the key to Netlify

1. Netlify → your StoryLens site → **Site configuration** (called **Project
   configuration** on newer menus) → **Environment variables**.
2. **Add a variable**.
3. Key: `GROQ_API_KEY` (exactly that, capitals and underscores, no `NEXT_PUBLIC_`).
   If you also made an OpenAI key, add a second variable called `OPENAI_API_KEY`.
4. Value: the key you just copied.
5. Tick **Contains secret values** if you see it. Save.

Keys live on the server and are never sent to the browser, the same as your
AssemblyAI key.

### 4. Push the code

Open GitHub Desktop, commit the changed files, and click **Push origin**. Netlify
redeploys on its own. Give it two or three minutes to finish before you test.

---

## Testing Batch 2

You need an interview that has already been transcribed (a project sitting at **Ready**
on your dashboard). Then:

1. Open that interview.
2. Under the transcript you will see an **Interview Intelligence** card. Press
   **Analyse this interview**.
3. It ticks through three steps: finding themes, spotting story signals, building the
   timeline. It usually takes under a minute.
4. When it finishes, press **Open Interview Intelligence**.
5. On that page you will see the overview stats, the themes (click one to see every
   place it was discussed), the story signals grouped by type, and the timeline.
6. Click the grey quote under any item to jump to that exact spot in the transcript.

If a step fails partway (a dropped connection, a slow response), the card lets you pick
up from where it stopped, or start over. Running it again cleanly replaces the previous
results, it never doubles them up.

---

## Good to know

**Cost depends on the provider.** On Groq's free tier, analysing an interview costs
nothing while you are inside their limits. On a paid provider like OpenAI it is usually
fractions of a cent to a few cents per interview. Either way the tokens used are counted
against the user's account and stored, the same as transcription minutes.

**Which model does what, and who gets what.** There are two dials. First, the task:
themes and the timeline are cheap work and go to a lighter model, the story signals are
quality work and go to a stronger one, per the PRD. Second, the person: free users run
on the low-cost chain, paying users on the stronger chain. Each combination is an
ordered list of `provider:model` pairs. StoryLens tries the first, and if it is rate
limited, down, or its key has been removed, it falls through to the next one that has a
key. So if a free model stops being free, or a provider goes dark, the work keeps
running on whatever else you have configured, with no code change.

You can set any of these lists in Netlify without touching code:
`AI_FREE_LIGHT`, `AI_FREE_MAIN`, `AI_PAID_LIGHT`, `AI_PAID_MAIN`. For example,
`AI_FREE_MAIN=groq:llama-3.3-70b-versatile, openai:gpt-4o-mini` means "use Groq's 70B
model, and if it is unavailable, fall back to OpenAI's mini." Leave them unset and
sensible defaults are used. The full list of supported providers and their key names is
in `.env.local.example`.

**Nothing invented.** The analysis only points at real moments in the transcript. Every
theme, signal, and timeline entry carries a link to the line it came from, so you can
always check it against what was actually said.

**Re-analysing.** There is a quiet **Re-analyse** option once results exist, on both the
workspace card and the Intelligence page. Use it after you rename speakers or edit the
transcript and want the intelligence to reflect the change.

---

## What's in this batch

| Area | What it does |
| --- | --- |
| `/projects/[id]/intelligence` | The Interview Intelligence page: overview, themes, signals, timeline (PRD sections 14 and 15) |
| Workspace card | Runs the analysis and links into the Intelligence page (section 12) |
| `/api/analyze` | Runs the analysis one step at a time. Server only |
| `/api/analyze/status` | Reports where the analysis has got to, so it can resume |
| `src/lib/ai.ts` | Server-only, provider-independent chat client. Model routing (section 34) plus fallback across providers |
| `src/lib/intelligence.ts` | The extraction itself, with each result pinned to its source segment |

New tables: `themes` and `theme_segments`. Story signals reuse the existing
`highlights` table (with a new link to their source line), and the timeline reuses
`timeline_events`. Analysis progress is tracked on the `recordings` row so a run can
recover if it is interrupted.

---

## Next batch

Batch 3 builds the Quote Library on top of this same intelligence layer.

---

## Local development (optional)

Copy `.env.local.example` to `.env.local`, fill in the values (including at least one
AI provider key such as `GROQ_API_KEY`), then:

```
npm install
npm run dev
```
