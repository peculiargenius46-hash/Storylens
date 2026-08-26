import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfigurationError } from "@/lib/supabase/config";
import { formatTimestamp, formatDuration } from "@/lib/format";
import SpeakerNames from "./speaker-names";
import WorkspaceNav from "./workspace-nav";
import AnalyzePanel from "./analyze-panel";
import ShareTranscript from "./share-transcript";

export default async function ProjectPage(props: PageProps<"/projects/[id]">) {
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
    .select("id, title, interviewee, interviewee_role, organisation, status, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!project) notFound();

  const { data: recording } = await supabase
    .from("recordings")
    .select(
      "id, status, duration_seconds, created_at, analysis_status, analysis_step, analysis_error, share_token"
    )
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: speakers } = recording
    ? await supabase
        .from("speakers")
        .select("id, speaker_label, speaker_name")
        .eq("recording_id", recording.id)
        .order("speaker_label")
    : { data: null };

  const { data: segments } = recording
    ? await supabase
        .from("transcript_segments")
        .select("id, speaker_id, original_text, edited_text, start_time")
        .eq("recording_id", recording.id)
        .order("start_time")
    : { data: null };

  const speakerById = new Map((speakers ?? []).map((s) => [s.id, s]));

  const readyRecording =
    recording && recording.status === "ready" ? recording : null;
  const analysisReady = recording?.analysis_status === "ready";

  const [themeCount, signalCount, timelineCount] =
    recording && analysisReady
      ? await Promise.all([
          supabase
            .from("themes")
            .select("id", { count: "exact", head: true })
            .eq("recording_id", recording.id),
          supabase
            .from("highlights")
            .select("id", { count: "exact", head: true })
            .eq("recording_id", recording.id),
          supabase
            .from("timeline_events")
            .select("id", { count: "exact", head: true })
            .eq("recording_id", recording.id),
        ]).then((results) => results.map((r) => r.count ?? 0))
      : [0, 0, 0];

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <Link href="/dashboard" className="text-sm text-neutral-500 underline">
          Back to dashboard
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">{project.title}</h1>
            <p className="mt-1 text-sm text-neutral-600">
              {[project.interviewee, project.interviewee_role, project.organisation]
                .filter(Boolean)
                .join(" · ") || "No interviewee details yet"}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              {formatDuration(recording?.duration_seconds)} · {project.status}
            </p>
          </div>
        </div>

        <WorkspaceNav projectId={project.id} active="overview" />

        {!recording && (
          <div className="mt-8 rounded-md border border-neutral-200 bg-white p-5">
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
        )}

        {recording && recording.status !== "ready" && recording.status !== "failed" && (
          <div className="mt-8 rounded-md border border-neutral-200 bg-white p-5">
            <p className="text-sm text-neutral-700">
              This recording is still being processed.
            </p>
            <Link
              href={`/projects/${project.id}/processing?recording=${recording.id}`}
              className="mt-3 inline-block text-sm font-medium text-neutral-900 underline"
            >
              Watch the progress
            </Link>
          </div>
        )}

        {recording?.status === "failed" && (
          <div className="mt-8 rounded-md bg-red-50 p-5">
            <p className="text-sm text-red-700">
              Transcription failed for this recording.
            </p>
            <Link
              href={`/projects/${project.id}/upload`}
              className="mt-2 inline-block text-sm font-medium text-red-700 underline"
            >
              Upload it again
            </Link>
          </div>
        )}

        {recording?.status === "ready" && (
          <div className="mt-8 space-y-6">
            <SpeakerNames speakers={speakers ?? []} />

            {readyRecording &&
              (analysisReady ? (
                <div className="rounded-md border border-neutral-200 bg-white p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-medium text-neutral-900">
                        Interview Intelligence
                      </h2>
                      <p className="mt-1 text-sm text-neutral-600">
                        {themeCount} themes · {signalCount} story signals ·{" "}
                        {timelineCount} timeline events
                      </p>
                    </div>
                    <Link
                      href={`/projects/${project.id}/intelligence`}
                      className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
                    >
                      Open Interview Intelligence
                    </Link>
                  </div>
                  <div className="mt-4 border-t border-neutral-100 pt-3">
                    <AnalyzePanel
                      recordingId={readyRecording.id}
                      initialStatus="ready"
                      initialStep={readyRecording.analysis_step ?? 3}
                    />
                  </div>
                </div>
              ) : (
                <AnalyzePanel
                  recordingId={readyRecording.id}
                  initialStatus={
                    readyRecording.analysis_status === "analysing"
                      ? "analysing"
                      : readyRecording.analysis_status === "failed"
                        ? "failed"
                        : "idle"
                  }
                  initialStep={readyRecording.analysis_step ?? 0}
                  initialError={readyRecording.analysis_error}
                />
              ))}

            {readyRecording && (
              <ShareTranscript
                recordingId={readyRecording.id}
                initialToken={readyRecording.share_token ?? null}
              />
            )}

            <div>
              <h2 className="text-sm font-medium text-neutral-700">Transcript</h2>

              {(!segments || segments.length === 0) && (
                <p className="mt-3 text-sm text-neutral-500">
                  No transcript segments were saved for this recording.
                </p>
              )}

              {segments && segments.length > 0 && (
                <div className="mt-3 divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white">
                  {segments.map((segment) => {
                    const speaker = segment.speaker_id
                      ? speakerById.get(segment.speaker_id)
                      : null;
                    const name =
                      speaker?.speaker_name?.trim() ||
                      (speaker ? `Speaker ${speaker.speaker_label}` : "Speaker");

                    return (
                      <div
                        key={segment.id}
                        id={`seg-${segment.id}`}
                        className="scroll-mt-6 px-4 py-3 target:bg-amber-50"
                      >
                        <div className="flex items-baseline gap-3">
                          <span className="text-sm font-medium text-neutral-900">
                            {name}
                          </span>
                          <span className="text-xs text-neutral-400">
                            {formatTimestamp(Number(segment.start_time))}
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-neutral-700">
                          {segment.edited_text ?? segment.original_text}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </main>
  );
}
