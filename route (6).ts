import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTranscript, extractActionItems } from "@/lib/assemblyai/client";

export async function POST(request: Request) {
  // Verify this call genuinely came from AssemblyAI, not just anyone who
  // guessed the URL — AssemblyAI echoes back the header/value we set
  // when we started the job.
  const expectedSecret = process.env.ASSEMBLYAI_WEBHOOK_SECRET;
  const providedSecret = request.headers.get("x-storylens-webhook-secret");

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const recordingId = url.searchParams.get("recordingId");
  if (!recordingId) {
    return NextResponse.json({ error: "Missing recordingId." }, { status: 400 });
  }

  const body = await request.json();
  const transcriptId = body.transcript_id as string;
  const status = body.status as string;

  const admin = createAdminClient();

  if (status === "error") {
    await admin
      .from("recordings")
      .update({ status: "failed", error_message: body.error ?? "AssemblyAI returned an error." })
      .eq("id", recordingId);
    return NextResponse.json({ ok: true });
  }

  if (status !== "completed") {
    // ignore intermediate statuses, we only act once it's fully done
    return NextResponse.json({ ok: true });
  }

  await admin.from("recordings").update({ status: "analysing" }).eq("id", recordingId);

  const transcript = await getTranscript(transcriptId);

  // Create a speaker row per unique diarized label (A, B, C…)
  const speakerLabels: string[] = Array.from(
    new Set((transcript.utterances ?? []).map((u: { speaker: string }) => u.speaker))
  );

  const speakerIdByLabel = new Map<string, string>();

  for (const label of speakerLabels) {
    const { data: speaker, error } = await admin
      .from("speakers")
      .insert({ recording_id: recordingId, speaker_label: label })
      .select("id")
      .single();

    if (!error && speaker) {
      speakerIdByLabel.set(label, speaker.id);
    }
  }

  // Insert one transcript_segment per AssemblyAI utterance
  const segments = (transcript.utterances ?? []).map(
    (u: { speaker: string; text: string; start: number; end: number; confidence: number }) => ({
      recording_id: recordingId,
      speaker_id: speakerIdByLabel.get(u.speaker) ?? null,
      original_text: u.text,
      start_time: u.start / 1000, // AssemblyAI gives milliseconds, schema stores seconds
      end_time: u.end / 1000,
      confidence: u.confidence,
    })
  );

  if (segments.length > 0) {
    await admin.from("transcript_segments").insert(segments);
  }

  // Action items via LeMUR — best-effort, never blocks marking the recording ready
  const actionItems = await extractActionItems(transcriptId);

  await admin
    .from("recordings")
    .update({
      status: "ready",
      duration_seconds: transcript.audio_duration ? Math.round(transcript.audio_duration) : null,
      summary: transcript.summary ?? null,
      action_items: actionItems,
    })
    .eq("id", recordingId);

  return NextResponse.json({ ok: true });
}
