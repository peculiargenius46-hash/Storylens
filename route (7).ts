import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { hasAssemblyConfig, submitTranscription } from "@/lib/assemblyai";

// Signed URL lifetime. AssemblyAI downloads the file when the job is accepted,
// so this only has to outlive the queue, not the whole transcription.
const SIGNED_URL_SECONDS = 60 * 60 * 2;

export async function POST(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Supabase is not configured on the server." },
      { status: 500 }
    );
  }

  if (!hasAssemblyConfig()) {
    return NextResponse.json(
      {
        error:
          "Transcription is unavailable because ASSEMBLYAI_API_KEY has not been set on the server.",
      },
      { status: 500 }
    );
  }

  let recordingId: string | undefined;

  try {
    const body = await request.json();
    recordingId = typeof body?.recordingId === "string" ? body.recordingId : undefined;
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

  // Row level security already restricts this to recordings the user owns,
  // so a missing row means "not yours" just as much as "doesn't exist".
  const { data: recording } = await supabase
    .from("recordings")
    .select("id, storage_url, source_type, source_url, status, transcription_id")
    .eq("id", recordingId)
    .maybeSingle();

  if (!recording) {
    return NextResponse.json({ error: "Recording not found." }, { status: 404 });
  }

  if (recording.transcription_id) {
    // Already submitted. Don't pay for the same audio twice.
    return NextResponse.json({ status: "transcribing", alreadySubmitted: true });
  }

  // Two ways in. An uploaded or browser-recorded file lives in private storage
  // and needs a temporary signed address before AssemblyAI can fetch it. A
  // pasted link is already a public address and is handed over as it stands.
  let audioUrl: string;

  if (recording.source_type === "link") {
    if (!recording.source_url) {
      return NextResponse.json(
        { error: "This recording has no link saved against it." },
        { status: 400 }
      );
    }

    audioUrl = recording.source_url;
  } else {
    if (!recording.storage_url) {
      return NextResponse.json(
        { error: "This recording has no uploaded file yet." },
        { status: 400 }
      );
    }

    const { data: signed, error: signError } = await supabase.storage
      .from("recordings")
      .createSignedUrl(recording.storage_url, SIGNED_URL_SECONDS);

    if (signError || !signed?.signedUrl) {
      return NextResponse.json(
        {
          error:
            signError?.message ?? "Could not prepare the recording for transcription.",
        },
        { status: 500 }
      );
    }

    audioUrl = signed.signedUrl;
  }

  try {
    const transcript = await submitTranscription(audioUrl);

    await supabase
      .from("recordings")
      .update({
        transcription_id: transcript.id,
        status: "transcribing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", recording.id);

    return NextResponse.json({ status: "transcribing", transcriptionId: transcript.id });
  } catch (error) {
    await supabase.from("recordings").update({ status: "failed" }).eq("id", recording.id);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Transcription could not be started.",
      },
      { status: 502 }
    );
  }
}
