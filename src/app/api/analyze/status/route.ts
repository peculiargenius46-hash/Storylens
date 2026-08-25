import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export async function GET(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Supabase is not configured on the server." },
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
    .select("id, status, analysis_status, analysis_step, analysis_error")
    .eq("id", recordingId)
    .maybeSingle();

  if (!recording) {
    return NextResponse.json({ error: "Recording not found." }, { status: 404 });
  }

  return NextResponse.json({
    status: recording.analysis_status,
    step: recording.analysis_step,
    totalSteps: 3,
    error: recording.analysis_error,
    transcriptReady: recording.status === "ready",
  });
}
