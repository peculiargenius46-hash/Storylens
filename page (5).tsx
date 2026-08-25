import { createAdminClient } from "@/lib/supabase/admin";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

export default async function SharedTranscriptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();

  // Exact match on share_token — this is the entire access control for this
  // page. Anyone without the exact token gets nothing, anyone with it sees
  // only this one recording, nothing else.
  const { data: recording } = await admin
    .from("recordings")
    .select("id, summary, action_items")
    .eq("share_token", token)
    .maybeSingle();

  if (!recording) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 text-center">
        <p className="text-sm text-neutral-500">
          This link isn&apos;t valid, or the transcript is no longer shared.
        </p>
      </main>
    );
  }

  const { data: segments } = await admin
    .from("transcript_segments")
    .select("id, original_text, start_time, end_time, speakers(speaker_label, speaker_name)")
    .eq("recording_id", recording.id)
    .order("start_time", { ascending: true });

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs uppercase tracking-wide text-neutral-400">
          Shared transcript · view only
        </p>
        <h1 className="mt-1 text-xl font-semibold text-neutral-900">StoryLens Transcript</h1>

        {recording.summary && (
          <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-neutral-900">Summary</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-neutral-700">
              {recording.summary}
            </p>
          </div>
        )}

        {recording.action_items && (recording.action_items as string[]).length > 0 && (
          <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-neutral-900">Action Points</h2>
            <ul className="mt-2 space-y-1.5">
              {(recording.action_items as string[]).map((item, i) => (
                <li key={i} className="flex gap-2 text-sm text-neutral-700">
                  <span className="text-neutral-400">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 space-y-4">
          {(segments ?? []).map((seg) => {
            const speaker = Array.isArray(seg.speakers) ? seg.speakers[0] : seg.speakers;
            return (
              <div key={seg.id} className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-mono text-neutral-400">
                    {formatTime(seg.start_time)}
                  </span>
                  <span className="text-xs font-semibold text-neutral-600">
                    {speaker?.speaker_name ?? `Speaker ${speaker?.speaker_label ?? "?"}`}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-neutral-800">{seg.original_text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
