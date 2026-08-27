import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

// 32 random bytes as url-safe text. Long enough that guessing one is not a
// realistic attack, which matters because the token is the only thing standing
// between a link and a private interview.
function newToken() {
  return randomBytes(24).toString("base64url");
}

export async function POST(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Supabase is not configured on the server." },
      { status: 500 }
    );
  }

  let recordingId: string | undefined;
  let action: string | undefined;

  try {
    const body = await request.json();
    recordingId = typeof body?.recordingId === "string" ? body.recordingId : undefined;
    action = typeof body?.action === "string" ? body.action : "share";
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

  // This read runs as the signed-in user, so row level security decides whether
  // they own the recording. Someone else's id simply comes back empty.
  const { data: recording } = await supabase
    .from("recordings")
    .select("id, share_token")
    .eq("id", recordingId)
    .maybeSingle();

  if (!recording) {
    return NextResponse.json({ error: "Recording not found." }, { status: 404 });
  }

  if (action === "revoke") {
    const { error } = await supabase
      .from("recordings")
      .update({ share_token: null, shared_at: null })
      .eq("id", recording.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ shared: false });
  }

  // Sharing twice should hand back the same link rather than quietly breaking
  // the one already sent to someone.
  if (recording.share_token) {
    return NextResponse.json({ shared: true, token: recording.share_token });
  }

  const token = newToken();

  const { error } = await supabase
    .from("recordings")
    .update({ share_token: token, shared_at: new Date().toISOString() })
    .eq("id", recording.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ shared: true, token });
}
