import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { startTranscription } from "@/lib/assemblyai/client";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  }

  const { recordingId } = await request.json();
  if (!recordingId) {
    return NextResponse.json({ error: "recordingId is required." }, { status: 400 });
  }

  // RLS ensures this only returns a row if the current user actually owns it
  // (via the recordings -> projects -> user_id chain).
  const { data: recording, error: fetchError } = await supabase
    .from("recordings")
    .select("id, project_id, source_type, source_url")
    .eq("id", recordingId)
    .single();

  if (fetchError || !recording) {
    return NextResponse.json({ error: "Recording not found." }, { status: 404 });
  }

  let audioUrl: string;

  if (recording.source_type === "link") {
    if (!recording.source_url) {
      return NextResponse.json({ error: "No link was provided." }, { status: 400 });
    }
    audioUrl = recording.source_url;
  } else {
    // uploaded or recorded audio lives in our private Storage bucket —
    // find the file, then get AssemblyAI a temporary signed URL to fetch it from.
    const { data: files } = await supabase.storage
      .from("recordings")
      .list(`${user.id}/${recording.project_id}/${recording.id}`);

    const fileName = files?.[0]?.name;
    if (!fileName) {
      return NextResponse.json({ error: "Uploaded file not found in storage." }, { status: 404 });
    }

    const { data: signed, error: signError } = await supabase.storage
      .from("recordings")
      .createSignedUrl(
        `${user.id}/${recording.project_id}/${recording.id}/${fileName}`,
        60 * 60 // 1 hour — long enough for AssemblyAI to fetch even a large file
      );

    if (signError || !signed) {
      return NextResponse.json({ error: "Couldn't create a signed URL." }, { status: 500 });
    }

    audioUrl = signed.signedUrl;
  }

  const origin = new URL(request.url).origin;
  const webhookUrl = `${origin}/api/assemblyai/webhook?recordingId=${recording.id}`;

  try {
    const transcriptId = await startTranscription({ audioUrl, webhookUrl });

    await supabase
      .from("recordings")
      .update({ transcription_id: transcriptId, status: "transcribing" })
      .eq("id", recording.id);

    return NextResponse.json({ ok: true, transcriptId });
  } catch (err) {
    await supabase
      .from("recordings")
      .update({
        status: "failed",
        error_message: err instanceof Error ? err.message : "Unknown error starting transcription.",
      })
      .eq("id", recording.id);

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start transcription." },
      { status: 500 }
    );
  }
}
