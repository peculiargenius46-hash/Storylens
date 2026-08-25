import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { hasAIConfig } from "@/lib/ai";
import { recordAiUsage, getPlanTier } from "@/lib/entitlements";
import {
  extractThemes,
  extractSignals,
  extractTimeline,
  type AnalysisSegment,
} from "@/lib/intelligence";

// Three ordered steps. analysis_step counts how many are done (0..3).
const STEPS = ["themes", "signals", "timeline"] as const;
const TOTAL = STEPS.length;

type SegmentRow = {
  id: string;
  start_time: number;
  speaker_id: string | null;
  original_text: string;
  edited_text: string | null;
};

export async function POST(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Supabase is not configured on the server." },
      { status: 500 }
    );
  }

  if (!hasAIConfig()) {
    return NextResponse.json(
      {
        error:
          "Interview Intelligence is unavailable because no AI provider key has been set on the server. Add at least one, for example GROQ_API_KEY or OPENAI_API_KEY.",
      },
      { status: 500 }
    );
  }

  let recordingId: string | undefined;
  let restart = false;

  try {
    const body = await request.json();
    recordingId = typeof body?.recordingId === "string" ? body.recordingId : undefined;
    restart = body?.restart === true;
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }

  if (!recordingId) {
    return NextResponse.json({ error: "recordingId is required." }, { status: 400 });
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // RLS keeps this to recordings the user owns.
  const { data: recording } = await supabase
    .from("recordings")
    .select("id, status, analysis_status, analysis_step")
    .eq("id", recordingId)
    .maybeSingle();

  if (!recording) {
    return NextResponse.json({ error: "Recording not found." }, { status: 404 });
  }

  if (recording.status !== "ready") {
    return NextResponse.json(
      { error: "This recording has no finished transcript to analyse yet." },
      { status: 409 }
    );
  }

  // Free users run on the low-cost model chain, paying users on the stronger
  // one. The chains themselves live in src/lib/ai.ts and the environment.
  const plan = await getPlanTier(supabase, user.id);

  const now = () => new Date().toISOString();

  // A fresh run wipes the slate. Per-step deletes below also keep retries clean,
  // but restarting resets the counter so step 0 runs again.
  if (restart) {
    await supabase
      .from("recordings")
      .update({
        analysis_status: "analysing",
        analysis_step: 0,
        analysis_error: null,
        analysis_updated_at: now(),
      })
      .eq("id", recording.id);
    recording.analysis_step = 0;
  }

  if (recording.analysis_status === "ready" && !restart) {
    return NextResponse.json({ status: "ready", step: TOTAL, totalSteps: TOTAL, done: true });
  }

  const step = Math.min(Math.max(recording.analysis_step ?? 0, 0), TOTAL);

  if (step >= TOTAL) {
    await supabase
      .from("recordings")
      .update({ analysis_status: "ready", analysis_updated_at: now() })
      .eq("id", recording.id);
    return NextResponse.json({ status: "ready", step: TOTAL, totalSteps: TOTAL, done: true });
  }

  // Heartbeat — marks the job as actively running for this step.
  await supabase
    .from("recordings")
    .update({ analysis_status: "analysing", analysis_error: null, analysis_updated_at: now() })
    .eq("id", recording.id);

  // Load the transcript once, with speaker names resolved for cleaner prompts.
  const { data: speakers } = await supabase
    .from("speakers")
    .select("id, speaker_label, speaker_name")
    .eq("recording_id", recording.id);

  const speakerById = new Map(
    (speakers ?? []).map((s) => [
      s.id,
      s.speaker_name?.trim() || `Speaker ${s.speaker_label}`,
    ])
  );

  const { data: segmentRows } = await supabase
    .from("transcript_segments")
    .select("id, start_time, speaker_id, original_text, edited_text")
    .eq("recording_id", recording.id)
    .order("start_time");

  const segments: AnalysisSegment[] = (segmentRows ?? []).map((row: SegmentRow) => ({
    id: row.id,
    start_time: Number(row.start_time),
    speakerName: row.speaker_id ? speakerById.get(row.speaker_id) ?? "Speaker" : "Speaker",
    text: (row.edited_text ?? row.original_text ?? "").trim(),
  }));

  if (segments.length === 0) {
    await supabase
      .from("recordings")
      .update({
        analysis_status: "failed",
        analysis_error: "There is no transcript to analyse.",
        analysis_updated_at: now(),
      })
      .eq("id", recording.id);

    return NextResponse.json({
      status: "failed",
      step,
      totalSteps: TOTAL,
      error: "There is no transcript to analyse.",
    });
  }

  const current = STEPS[step];

  try {
    if (current === "themes") {
      // Rebuild this step from scratch so a retry never leaves doubled rows.
      await supabase.from("themes").delete().eq("recording_id", recording.id);

      const { themes, usage } = await extractThemes(segments, plan);
      await recordAiUsage(supabase, user.id, usage.inputTokens, usage.outputTokens);

      for (const theme of themes) {
        const { data: inserted, error } = await supabase
          .from("themes")
          .insert({
            recording_id: recording.id,
            title: theme.title,
            summary: theme.summary || null,
          })
          .select("id")
          .single();

        if (error) throw new Error(error.message);

        const links = theme.segmentIndexes
          .map((i) => segments[i]?.id)
          .filter((id): id is string => Boolean(id))
          .map((segment_id) => ({ theme_id: inserted.id, segment_id }));

        if (links.length > 0) {
          await supabase.from("theme_segments").insert(links);
        }
      }
    } else if (current === "signals") {
      await supabase.from("highlights").delete().eq("recording_id", recording.id);

      const { signals, usage } = await extractSignals(segments, plan);
      await recordAiUsage(supabase, user.id, usage.inputTokens, usage.outputTokens);

      if (signals.length > 0) {
        const rows = signals.map((signal) => {
          const segment = segments[signal.segmentIndex];
          return {
            recording_id: recording.id,
            category: signal.category,
            title: signal.title,
            summary: signal.summary || null,
            start_time: segment ? segment.start_time : null,
            end_time: null,
            source_segment_id: segment ? segment.id : null,
          };
        });

        const { error } = await supabase.from("highlights").insert(rows);
        if (error) throw new Error(error.message);
      }
    } else if (current === "timeline") {
      await supabase.from("timeline_events").delete().eq("recording_id", recording.id);

      const { events, usage } = await extractTimeline(segments, plan);
      await recordAiUsage(supabase, user.id, usage.inputTokens, usage.outputTokens);

      if (events.length > 0) {
        const rows = events.map((event) => ({
          recording_id: recording.id,
          date_reference: event.dateReference || null,
          event: event.event,
          source_segment_id: segments[event.segmentIndex]?.id ?? null,
        }));

        const { error } = await supabase.from("timeline_events").insert(rows);
        if (error) throw new Error(error.message);
      }
    }
  } catch (error) {
    await supabase
      .from("recordings")
      .update({
        analysis_status: "failed",
        analysis_error:
          error instanceof Error ? error.message : "That step could not be completed.",
        analysis_updated_at: now(),
      })
      .eq("id", recording.id);

    return NextResponse.json({
      status: "failed",
      step,
      totalSteps: TOTAL,
      error:
        error instanceof Error ? error.message : "That step could not be completed.",
    });
  }

  const nextStep = step + 1;
  const done = nextStep >= TOTAL;

  await supabase
    .from("recordings")
    .update({
      analysis_status: done ? "ready" : "analysing",
      analysis_step: nextStep,
      analysis_updated_at: now(),
    })
    .eq("id", recording.id);

  return NextResponse.json({
    status: done ? "ready" : "analysing",
    step: nextStep,
    totalSteps: TOTAL,
    done,
  });
}
