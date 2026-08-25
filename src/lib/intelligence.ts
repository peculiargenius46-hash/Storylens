// Server-only. Turns a transcript into themes, story signals and a timeline,
// every item pinned to the transcript segment it came from so nothing the AI
// surfaces is unmoored from what was actually said (PRD sections 4, 14, 15).

import { chatJson, type ChatUsage, type PlanTier } from "@/lib/ai";
import { formatTimestamp } from "@/lib/format";

export type AnalysisSegment = {
  id: string;
  start_time: number;
  speakerName: string;
  text: string;
};

// Keep the prompt within a sane size. A 60-minute interview sits well under this;
// longer recordings get a representative slice rather than an oversized, costly call.
const MAX_TRANSCRIPT_CHARS = 60_000;

const SIGNAL_CATEGORIES = [
  "emotional",
  "insight",
  "anecdote",
  "turning_point",
  "historical",
  "leadership",
  "surprising",
] as const;

export type SignalCategory = (typeof SIGNAL_CATEGORIES)[number];

export type ExtractedTheme = { title: string; summary: string; segmentIndexes: number[] };
export type ExtractedSignal = {
  category: SignalCategory;
  title: string;
  summary: string;
  segmentIndex: number;
};
export type ExtractedTimelineEvent = {
  dateReference: string;
  event: string;
  segmentIndex: number;
};

/** Builds a numbered transcript the model can point back into by index. */
function indexedTranscript(segments: AnalysisSegment[]) {
  const lines: string[] = [];
  let chars = 0;
  let truncated = false;

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const line = `[${i}] (${formatTimestamp(s.start_time)}) ${s.speakerName}: ${s.text}`;
    if (chars + line.length > MAX_TRANSCRIPT_CHARS) {
      truncated = true;
      break;
    }
    lines.push(line);
    chars += line.length + 1;
  }

  return { text: lines.join("\n"), truncated };
}

function clampIndex(value: unknown, max: number): number | null {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < 0 || n >= max) return null;
  return n;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// ---------------------------------------------------------------------------
// Themes — lightweight model. Grouping and naming, not deep interpretation.
// ---------------------------------------------------------------------------
export async function extractThemes(
  segments: AnalysisSegment[],
  plan: PlanTier
): Promise<{ themes: ExtractedTheme[]; usage: ChatUsage }> {
  const { text } = indexedTranscript(segments);

  const system =
    "You identify the recurring subjects in an interview. You only describe what is " +
    "actually discussed. You never invent topics that are not in the transcript. " +
    "You reply with a single JSON object and nothing else.";

  const user =
    "Below is an interview transcript. Each line starts with a segment index in " +
    "square brackets.\n\n" +
    "Identify between 3 and 8 themes that genuinely run through the conversation. " +
    "For each theme give a short title, a one-sentence summary, and the list of " +
    "segment indexes where that theme is discussed (only indexes that appear below).\n\n" +
    'Return JSON shaped exactly like: {"themes":[{"title":"","summary":"",' +
    '"segments":[0,1]}]}\n\n' +
    "TRANSCRIPT:\n" +
    text;

  const { data, usage } = await chatJson<{
    themes?: Array<{ title?: unknown; summary?: unknown; segments?: unknown }>;
  }>(plan, "light", system, user, 1400);

  const themes: ExtractedTheme[] = [];

  for (const raw of data?.themes ?? []) {
    const title = asString(raw?.title);
    if (!title) continue;

    const indexes = Array.isArray(raw?.segments)
      ? raw.segments
          .map((v) => clampIndex(v, segments.length))
          .filter((v): v is number => v !== null)
      : [];

    themes.push({
      title,
      summary: asString(raw?.summary),
      segmentIndexes: Array.from(new Set(indexes)),
    });
  }

  return { themes, usage };
}

// ---------------------------------------------------------------------------
// Story signals — stronger model. Judgement about what carries a story.
// ---------------------------------------------------------------------------
export async function extractSignals(
  segments: AnalysisSegment[],
  plan: PlanTier
): Promise<{ signals: ExtractedSignal[]; usage: ChatUsage }> {
  const { text } = indexedTranscript(segments);

  const system =
    "You are an editor reading an interview for the moments a writer could build a " +
    "story around. You point to real moments in the transcript, never invented ones. " +
    "You reply with a single JSON object and nothing else.";

  const user =
    "Below is an interview transcript. Each line starts with a segment index in " +
    "square brackets.\n\n" +
    "Find the strongest story signals. Each signal must be one of these categories: " +
    SIGNAL_CATEGORIES.join(", ") +
    ".\n\nFor each signal give the category, a short title, a one-sentence note on why " +
    "it matters, and the single segment index it comes from (an index that appears " +
    "below). Aim for the 8 to 16 most useful signals. Do not force categories that " +
    "are not present.\n\n" +
    'Return JSON shaped exactly like: {"signals":[{"category":"insight","title":"",' +
    '"summary":"","segment":0}]}\n\n' +
    "TRANSCRIPT:\n" +
    text;

  const { data, usage } = await chatJson<{
    signals?: Array<{
      category?: unknown;
      title?: unknown;
      summary?: unknown;
      segment?: unknown;
    }>;
  }>(plan, "main", system, user, 1800);

  const signals: ExtractedSignal[] = [];

  for (const raw of data?.signals ?? []) {
    const index = clampIndex(raw?.segment, segments.length);
    if (index === null) continue;

    const title = asString(raw?.title);
    if (!title) continue;

    const category = SIGNAL_CATEGORIES.includes(
      asString(raw?.category) as SignalCategory
    )
      ? (asString(raw?.category) as SignalCategory)
      : "insight";

    signals.push({
      category,
      title,
      summary: asString(raw?.summary),
      segmentIndex: index,
    });
  }

  return { signals, usage };
}

// ---------------------------------------------------------------------------
// Timeline — lightweight model. Pulling dated events, not interpreting them.
// ---------------------------------------------------------------------------
export async function extractTimeline(
  segments: AnalysisSegment[],
  plan: PlanTier
): Promise<{ events: ExtractedTimelineEvent[]; usage: ChatUsage }> {
  const { text } = indexedTranscript(segments);

  const system =
    "You reconstruct the chronology an interviewee describes. You only record events " +
    "that are actually mentioned, with the time reference as the speaker gave it " +
    "(a year, an age, 'after university', and so on). You reply with a single JSON " +
    "object and nothing else.";

  const user =
    "Below is an interview transcript. Each line starts with a segment index in " +
    "square brackets.\n\n" +
    "List the events the speaker places in time, in the order they happened. For each " +
    "one give the time reference exactly as expressed, a short description of the event, " +
    "and the segment index it came from (an index that appears below). If nothing " +
    "datable is mentioned, return an empty list.\n\n" +
    'Return JSON shaped exactly like: {"events":[{"when":"2009","event":"",' +
    '"segment":0}]}\n\n' +
    "TRANSCRIPT:\n" +
    text;

  const { data, usage } = await chatJson<{
    events?: Array<{ when?: unknown; event?: unknown; segment?: unknown }>;
  }>(plan, "light", system, user, 1400);

  const events: ExtractedTimelineEvent[] = [];

  for (const raw of data?.events ?? []) {
    const index = clampIndex(raw?.segment, segments.length);
    if (index === null) continue;

    const event = asString(raw?.event);
    if (!event) continue;

    events.push({
      dateReference: asString(raw?.when),
      event,
      segmentIndex: index,
    });
  }

  return { events, usage };
}
