import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { hasAssemblyConfig, getTranscription } from "@/lib/assemblyai";
import { recordTranscriptionUsage } from "@/lib/entitlements";

export async function GET(request: Request) {
  if (!hasSupabaseConfig() || !hasAssemblyConfig()) {
    return NextResponse.json(
      { error: "Transcription is not fully configured on the server." },
      { status: 500 }
    );
  }

  const recordingId = new URL(request.url).searchParams.get("recordingId");

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

  const { data: recording } = await supabase
    .from("recordings")
    .select("id, project_id, status, transcription_id, duration_seconds")
    .eq("id", recordingId)
    .maybeSingle();

  if (!recording) {
    return NextResponse.json({ error: "Recording not found." }, { status: 404 });
  }

  if (recording.status === "ready") {
    return NextResponse.json({ status: "ready" });
  }

  if (recording.status === "failed") {
    return NextResponse.json({ status: "failed", error: "Transcription failed." });
  }

  if (!recording.transcription_id) {
    return NextResponse.json({ status: recording.status });
  }

  let transcript;

  try {
    transcript = await getTranscription(recording.transcription_id);
  } catch (error) {
    return NextResponse.json(
      {
        status: "transcribing",
        warning:
          error instanceof Error ? error.message : "Could not reach AssemblyAI just now.",
      },
      { status: 200 }
    );
  }

  if (transcript.status === "error") {
    await supabase.from("recordings").update({ status: "failed" }).eq("id", recording.id);

    return NextResponse.json({
      status: "failed",
      error: transcript.error ?? "AssemblyAI could not transcribe this recording.",
    });
  }

  if (transcript.status !== "completed") {
    return NextResponse.json({ status: "transcribing" });
  }

  // Completed. Claim the recording before writing, so two overlapping polls
  // can't both insert the same transcript. Only one update will match.
  const now = new Date().toISOString();

  let { data: claimed } = await supabase
    .from("recordings")
    .update({ status: "analysing", updated_at: now })
    .eq("id", recording.id)
    .eq("status", "transcribing")
    .select("id");

  // If a previous save died partway (a timeout, a dropped connection), the row
  // would sit in "analysing" forever. Pick it back up once it has clearly gone quiet.
  if (!claimed || claimed.length === 0) {
    const stale = new Date(Date.now() - 3 * 60 * 1000).toISOString();

    ({ data: claimed } = await supabase
      .from("recordings")
      .update({ status: "analysing", updated_at: now })
      .eq("id", recording.id)
      .eq("status", "analysing")
      .lt("updated_at", stale)
      .select("id"));
  }

  if (!claimed || claimed.length === 0) {
    // Another request is already saving it, or it just finished saving.
    const { data: current } = await supabase
      .from("recordings")
      .select("status")
      .eq("id", recording.id)
      .maybeSingle();

    return NextResponse.json({ status: current?.status === "ready" ? "ready" : "transcribing" });
  }

  try {
    // Clear anything a previous half-finished attempt left behind, so recovering
    // a stalled save produces one clean transcript rather than a doubled one.
    await supabase.from("transcript_segments").delete().eq("recording_id", recording.id);
    await supabase.from("speakers").delete().eq("recording_id", recording.id);

    const utterances = transcript.utterances ?? [];

    // One speakers row per diarised label (A, B, C…). Names come later,
    // when the user confirms who is who on the workspace page.
    const labels = Array.from(new Set(utterances.map((u) => u.speaker))).sort();

    const speakerIdByLabel = new Map<string, string>();

    if (labels.length > 0) {
      const { data: insertedSpeakers, error: speakerError } = await supabase
        .from("speakers")
        .insert(labels.map((label) => ({ recording_id: recording.id, speaker_label: label })))
        .select("id, speaker_label");

      if (speakerError) throw new Error(speakerError.message);

      for (const speaker of insertedSpeakers ?? []) {
        speakerIdByLabel.set(speaker.speaker_label, speaker.id);
      }
    }

    if (utterances.length > 0) {
      const segments = utterances.map((utterance) => ({
        recording_id: recording.id,
        speaker_id: speakerIdByLabel.get(utterance.speaker) ?? null,
        original_text: utterance.text,
        // AssemblyAI returns milliseconds; the database stores seconds.
        start_time: utterance.start / 1000,
        end_time: utterance.end / 1000,
        confidence: utterance.confidence ?? null,
      }));

      const { error: segmentError } = await supabase
        .from("transcript_segments")
        .insert(segments);

      if (segmentError) throw new Error(segmentError.message);
    } else if (transcript.text) {
      // No diarisation came back (single speaker or very short audio).
      // Keep the transcript rather than losing it.
      const { error: fallbackError } = await supabase.from("transcript_segments").insert({
        recording_id: recording.id,
        original_text: transcript.text,
        start_time: 0,
        end_time: transcript.audio_duration ?? 0,
      });

      if (fallbackError) throw new Error(fallbackError.message);
    }

    const durationSeconds = Math.round(transcript.audio_duration ?? 0);

    await supabase
      .from("recordings")
      .update({
        status: "ready",
        duration_seconds: durationSeconds,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recording.id);

    await supabase
      .from("projects")
      .update({ status: "ready", updated_at: new Date().toISOString() })
      .eq("id", recording.project_id);

    if (durationSeconds > 0) {
      await recordTranscriptionUsage(supabase, user.id, durationSeconds);
    }

    return NextResponse.json({
      status: "ready",
      speakers: labels.length,
      segments: utterances.length,
    });
  } catch (error) {
    // Hand the claim back so a later poll can retry instead of hanging forever.
    await supabase
      .from("recordings")
      .update({ status: "transcribing", updated_at: new Date().toISOString() })
      .eq("id", recording.id);

    return NextResponse.json(
      {
        status: "transcribing",
        warning:
          error instanceof Error ? error.message : "Could not save the transcript yet.",
      },
      { status: 200 }
    );
  }
}
