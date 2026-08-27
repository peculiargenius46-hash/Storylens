"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const POLL_MS = 5000;

type Stage = "waiting" | "transcribing" | "saving" | "ready" | "failed";

const STEPS: { key: Stage; label: string; doneLabel: string }[] = [
  { key: "waiting", label: "Preparing your recording…", doneLabel: "Recording uploaded" },
  {
    key: "transcribing",
    label: "Transcribing the conversation…",
    doneLabel: "Transcript created",
  },
  {
    key: "saving",
    label: "Identifying speakers…",
    doneLabel: "Speakers identified",
  },
  { key: "ready", label: "Preparing StoryLens…", doneLabel: "Ready" },
];

type Props = {
  projectId: string;
  recordingId: string | null;
};

export default function ProcessingView({ projectId: id, recordingId }: Props) {
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("waiting");
  const [error, setError] = useState<string | null>(
    recordingId ? null : "No recording was specified."
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!recordingId) return;

    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const response = await fetch(
          `/api/transcribe/status?recordingId=${recordingId}`,
          { cache: "no-store" }
        );
        const result = await response.json().catch(() => null);

        if (!active) return;

        if (!response.ok) {
          setError(result?.error ?? "Could not check the transcription status.");
          return;
        }

        setNotice(result?.warning ?? null);

        if (result?.status === "ready") {
          setStage("ready");
          // Give the tick a moment to land before moving on.
          setTimeout(() => router.push(`/projects/${id}`), 900);
          return;
        }

        if (result?.status === "failed") {
          setStage("failed");
          setError(result?.error ?? "Transcription failed.");
          return;
        }

        setStage(result?.status === "analysing" ? "saving" : "transcribing");
        timer = setTimeout(poll, POLL_MS);
      } catch {
        if (!active) return;
        // Network blips shouldn't kill the page. Keep trying quietly.
        timer = setTimeout(poll, POLL_MS);
      }
    }

    poll();
    const ticker = setInterval(() => setElapsed((value) => value + 1), 1000);

    return () => {
      active = false;
      clearTimeout(timer);
      clearInterval(ticker);
    };
  }, [recordingId, id, router]);

  const currentIndex = STEPS.findIndex((step) => step.key === stage);

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-10">
      <div className="mx-auto max-w-xl">
        <Link href="/dashboard" className="text-sm text-neutral-500 underline">
          Back to dashboard
        </Link>

        <h1 className="mt-4 text-xl font-semibold text-neutral-900">
          Processing your interview
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          You can close this tab. Processing carries on and the interview will be waiting
          on your dashboard.
        </p>

        <div className="mt-6 rounded-md border border-neutral-200 bg-white p-5">
          <ul className="space-y-3">
            {STEPS.map((step, index) => {
              const done = stage !== "failed" && index < currentIndex;
              const active = stage !== "failed" && index === currentIndex;

              return (
                <li key={step.key} className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 text-sm ${
                      done
                        ? "text-green-600"
                        : active
                          ? "text-neutral-900"
                          : "text-neutral-300"
                    }`}
                  >
                    {done ? "✓" : active ? "•" : "○"}
                  </span>
                  <span
                    className={`text-sm ${
                      done
                        ? "text-neutral-500"
                        : active
                          ? "font-medium text-neutral-900"
                          : "text-neutral-400"
                    }`}
                  >
                    {done ? step.doneLabel : step.label}
                  </span>
                </li>
              );
            })}
          </ul>

          {stage !== "failed" && stage !== "ready" && (
            <p className="mt-5 border-t border-neutral-100 pt-4 text-xs text-neutral-500">
              Roughly {Math.floor(elapsed / 60)}m {elapsed % 60}s so far. Transcription
              usually takes a fraction of the recording&apos;s length, so a one hour
              interview lands in a few minutes.
            </p>
          )}
        </div>

        {notice && (
          <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {notice}
          </p>
        )}

        {error && (
          <div className="mt-4 rounded-md bg-red-50 px-3 py-3 text-sm text-red-700">
            <p>{error}</p>
            <Link
              href={`/projects/${id}/upload`}
              className="mt-2 inline-block font-medium underline"
            >
              Try uploading again
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
