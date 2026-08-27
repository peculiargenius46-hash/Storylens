import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfigurationError } from "@/lib/supabase/config";
import { formatTimestamp, formatDuration } from "@/lib/format";
import WorkspaceNav from "../workspace-nav";
import AnalyzePanel from "../analyze-panel";

// Story signal categories, shown in the order the PRD lists them (section 14).
const SIGNAL_GROUPS: { key: string; label: string }[] = [
  { key: "emotional", label: "Emotional moments" },
  { key: "insight", label: "Strong insights" },
  { key: "anecdote", label: "Memorable anecdotes" },
  { key: "turning_point", label: "Turning points" },
  { key: "historical", label: "Historical references" },
  { key: "leadership", label: "Leadership lessons" },
  { key: "surprising", label: "Surprising statements" },
];

function snippet(text: string, max = 160) {
  const clean = text.trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}

export default async function IntelligencePage(
  props: PageProps<"/projects/[id]/intelligence">
) {
  const { id } = await props.params;
  const configurationError = getSupabaseConfigurationError();

  if (configurationError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <p className="text-sm text-neutral-600">{configurationError}</p>
      </main>
    );
  }

  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, title, interviewee, interviewee_role, organisation, status")
    .eq("id", id)
    .maybeSingle();

  if (!project) notFound();

  const { data: recording } = await supabase
    .from("recordings")
    .select(
      "id, status, duration_seconds, analysis_status, analysis_step, analysis_error"
    )
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const header = (
    <>
      <Link href="/dashboard" className="text-sm text-neutral-500 underline">
        Back to dashboard
      </Link>
      <div className="mt-4">
        <h1 className="text-xl font-semibold text-neutral-900">{project.title}</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {[project.interviewee, project.interviewee_role, project.organisation]
            .filter(Boolean)
            .join(" · ") || "No interviewee details yet"}
        </p>
      </div>
      <WorkspaceNav projectId={project.id} active="intelligence" />
    </>
  );

  const shell = (body: React.ReactNode) => (
    <main className="min-h-screen bg-neutral-50 px-6 py-10">
      <div className="mx-auto max-w-3xl">
        {header}
        <div className="mt-8">{body}</div>
      </div>
    </main>
  );

  if (!recording) {
    return shell(
      <div className="rounded-md border border-neutral-200 bg-white p-5">
        <p className="text-sm text-neutral-700">
          Nothing has been uploaded to this interview yet.
        </p>
        <Link
          href={`/projects/${project.id}/upload`}
          className="mt-3 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Upload a recording
        </Link>
      </div>
    );
  }

  if (recording.status !== "ready") {
    return shell(
      <div className="rounded-md border border-neutral-200 bg-white p-5">
        <p className="text-sm text-neutral-700">
          The transcript is still being prepared. Intelligence can run once it is ready.
        </p>
        <Link
          href={`/projects/${project.id}/processing?recording=${recording.id}`}
          className="mt-3 inline-block text-sm font-medium text-neutral-900 underline"
        >
          Watch the progress
        </Link>
      </div>
    );
  }

  // Transcript is ready. Pull everything the page needs in parallel.
  const [
    { data: speakers },
    { data: segments },
    { data: themes },
    { data: highlights },
    { data: timeline },
  ] = await Promise.all([
    supabase
      .from("speakers")
      .select("id, speaker_label, speaker_name")
      .eq("recording_id", recording.id),
    supabase
      .from("transcript_segments")
      .select("id, start_time, speaker_id, original_text, edited_text")
      .eq("recording_id", recording.id)
      .order("start_time"),
    supabase
      .from("themes")
      .select("id, title, summary, theme_segments(segment_id)")
      .eq("recording_id", recording.id)
      .order("created_at"),
    supabase
      .from("highlights")
      .select("id, category, title, summary, start_time, source_segment_id")
      .eq("recording_id", recording.id),
    supabase
      .from("timeline_events")
      .select("id, date_reference, event, source_segment_id")
      .eq("recording_id", recording.id)
      .order("created_at"),
  ]);

  const speakerName = new Map(
    (speakers ?? []).map((s) => [
      s.id,
      s.speaker_name?.trim() || `Speaker ${s.speaker_label}`,
    ])
  );

  const segmentById = new Map(
    (segments ?? []).map((s) => [
      s.id,
      {
        start_time: Number(s.start_time),
        speaker: s.speaker_id ? speakerName.get(s.speaker_id) ?? "Speaker" : "Speaker",
        text: (s.edited_text ?? s.original_text ?? "").trim(),
      },
    ])
  );

  const wordCount = (segments ?? []).reduce((total, s) => {
    const words = (s.edited_text ?? s.original_text ?? "").trim().split(/\s+/);
    return total + (words[0] ? words.length : 0);
  }, 0);

  const analysisReady = recording.analysis_status === "ready";

  // A link back to the exact transcript line, plus a short quote from it.
  const source = (segmentId: string | null) => {
    if (!segmentId) return null;
    const seg = segmentById.get(segmentId);
    if (!seg) return null;

    return (
      <Link
        href={`/projects/${project.id}#seg-${segmentId}`}
        className="mt-1 block rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-500 hover:bg-neutral-100"
      >
        <span className="font-medium text-neutral-600">
          {seg.speaker} · {formatTimestamp(seg.start_time)}
        </span>
        <span className="mt-0.5 block text-neutral-500">{snippet(seg.text)}</span>
      </Link>
    );
  };

  const overview = (
    <div className="grid grid-cols-3 gap-3">
      {[
        { label: "Length", value: formatDuration(recording.duration_seconds) },
        {
          label: "Speakers",
          value: String((speakers ?? []).length || "—"),
        },
        { label: "Words", value: wordCount ? wordCount.toLocaleString() : "—" },
      ].map((stat) => (
        <div
          key={stat.label}
          className="rounded-md border border-neutral-200 bg-white p-4"
        >
          <p className="text-xs text-neutral-500">{stat.label}</p>
          <p className="mt-1 text-sm font-medium text-neutral-900">{stat.value}</p>
        </div>
      ))}
    </div>
  );

  if (!analysisReady) {
    return shell(
      <div className="space-y-6">
        {overview}
        <AnalyzePanel
          recordingId={recording.id}
          initialStatus={
            recording.analysis_status === "analysing"
              ? "analysing"
              : recording.analysis_status === "failed"
                ? "failed"
                : "idle"
          }
          initialStep={recording.analysis_step ?? 0}
          initialError={recording.analysis_error}
        />
      </div>
    );
  }

  const signalsByCategory = new Map<string, typeof highlights>();
  for (const h of highlights ?? []) {
    const key = h.category ?? "insight";
    const list = signalsByCategory.get(key) ?? [];
    list.push(h);
    signalsByCategory.set(key, list);
  }

  return shell(
    <div className="space-y-8">
      {overview}

      {/* THEMES */}
      <section>
        <h2 className="text-sm font-semibold text-neutral-900">Themes</h2>
        {(themes ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No themes were identified.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {(themes ?? []).map((theme) => {
              const links = (theme.theme_segments ?? []) as { segment_id: string }[];
              return (
                <details
                  key={theme.id}
                  className="rounded-md border border-neutral-200 bg-white p-4"
                >
                  <summary className="cursor-pointer list-none">
                    <span className="text-sm font-medium text-neutral-900">
                      {theme.title}
                    </span>
                    {theme.summary && (
                      <span className="mt-1 block text-sm text-neutral-600">
                        {theme.summary}
                      </span>
                    )}
                    <span className="mt-1 block text-xs text-neutral-400">
                      {links.length} place{links.length === 1 ? "" : "s"} in the transcript
                    </span>
                  </summary>
                  <div className="mt-3 space-y-1">
                    {links.map((link) => (
                      <div key={link.segment_id}>{source(link.segment_id)}</div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>

      {/* STORY SIGNALS */}
      <section>
        <h2 className="text-sm font-semibold text-neutral-900">Story signals</h2>
        {(highlights ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No story signals were found.</p>
        ) : (
          <div className="mt-3 space-y-5">
            {SIGNAL_GROUPS.map((group) => {
              const items = signalsByCategory.get(group.key) ?? [];
              if (items.length === 0) return null;

              return (
                <div key={group.key}>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    {group.label}
                  </h3>
                  <div className="mt-2 space-y-2">
                    {items.map((signal) => (
                      <div
                        key={signal.id}
                        className="rounded-md border border-neutral-200 bg-white p-4"
                      >
                        <p className="text-sm font-medium text-neutral-900">
                          {signal.title}
                        </p>
                        {signal.summary && (
                          <p className="mt-1 text-sm text-neutral-600">{signal.summary}</p>
                        )}
                        {source(signal.source_segment_id)}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* TIMELINE */}
      <section>
        <h2 className="text-sm font-semibold text-neutral-900">Timeline</h2>
        {(timeline ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">
            Nothing datable was mentioned in this interview.
          </p>
        ) : (
          <ol className="mt-3 space-y-2">
            {(timeline ?? []).map((entry) => (
              <li
                key={entry.id}
                className="rounded-md border border-neutral-200 bg-white p-4"
              >
                <div className="flex items-baseline gap-3">
                  {entry.date_reference && (
                    <span className="shrink-0 text-sm font-medium text-neutral-900">
                      {entry.date_reference}
                    </span>
                  )}
                  <span className="text-sm text-neutral-700">{entry.event}</span>
                </div>
                {source(entry.source_segment_id)}
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="border-t border-neutral-100 pt-4">
        <AnalyzePanel
          recordingId={recording.id}
          initialStatus="ready"
          initialStep={recording.analysis_step ?? 3}
        />
      </div>
    </div>
  );
}
