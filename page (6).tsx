import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfigurationError } from "@/lib/supabase/config";
import { formatTimestamp, formatDuration } from "@/lib/format";

// This page is deliberately public, so it must not use the signed-in browser
// client. It runs on the server with the service role key and matches ONE exact
// token. Nothing else is ever returned, and there is no row level security
// policy granting anonymous reads, so a share link can never widen into access
// to anybody else's interviews.
export const dynamic = "force-dynamic";

type SharedSegment = {
  id: string;
  original_text: string | null;
  edited_text: string | null;
  start_time: number | null;
  speaker_id: string | null;
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) return null;

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default async function SharedTranscriptPage(props: PageProps<"/share/[token]">) {
  const { token } = await props.params;

  if (getSupabaseConfigurationError()) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <p className="text-sm text-neutral-600">This link is unavailable right now.</p>
      </main>
    );
  }

  const supabase = adminClient();

  if (!supabase) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <p className="text-sm text-neutral-600">
          Sharing is unavailable because the server is missing its configuration.
        </p>
      </main>
    );
  }

  // Exact match only. No pattern matching, no listing.
  const { data: recording } = await supabase
    .from("recordings")
    .select("id, duration_seconds, project_id, share_token")
    .eq("share_token", token)
    .maybeSingle();

  if (!recording || recording.share_token !== token) notFound();

  const { data: project } = await supabase
    .from("projects")
    .select("title, interviewee, interviewee_role, organisation")
    .eq("id", recording.project_id)
    .maybeSingle();

  const { data: speakers } = await supabase
    .from("speakers")
    .select("id, speaker_label, speaker_name")
    .eq("recording_id", recording.id);

  const { data: segments } = await supabase
    .from("transcript_segments")
    .select("id, speaker_id, original_text, edited_text, start_time")
    .eq("recording_id", recording.id)
    .order("start_time");

  const speakerById = new Map((speakers ?? []).map((s) => [s.id, s]));

  function speakerName(segment: SharedSegment) {
    if (!segment.speaker_id) return "Speaker";
    const speaker = speakerById.get(segment.speaker_id);
    if (!speaker) return "Speaker";
    return speaker.speaker_name || `Speaker ${speaker.speaker_label}`;
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          Shared transcript
        </p>

        <h1 className="mt-2 text-xl font-semibold text-neutral-900">
          {project?.title ?? "Interview transcript"}
        </h1>

        <p className="mt-1 text-sm text-neutral-600">
          {[project?.interviewee, project?.interviewee_role, project?.organisation]
            .filter(Boolean)
            .join(" · ") || "Interview transcript"}
        </p>

        <p className="mt-1 text-xs text-neutral-500">
          {formatDuration(recording.duration_seconds)}
        </p>

        <div className="mt-8 space-y-4">
          {(segments ?? []).length === 0 && (
            <p className="rounded-md border border-neutral-200 bg-white p-5 text-sm text-neutral-600">
              This transcript is empty.
            </p>
          )}

          {(segments ?? []).map((segment) => (
            <div key={segment.id} className="rounded-md border border-neutral-200 bg-white p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium text-neutral-900">
                  {speakerName(segment as SharedSegment)}
                </p>
                <p className="text-xs tabular-nums text-neutral-500">
                  {formatTimestamp(segment.start_time ?? 0)}
                </p>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-neutral-700">
                {segment.edited_text || segment.original_text}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-neutral-400">
          Shared with StoryLens AI
        </p>
      </div>
    </main>
  );
}
