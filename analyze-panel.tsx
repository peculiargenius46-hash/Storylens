"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AnalysisStatus = "idle" | "analysing" | "ready" | "failed";

const STEP_LABELS: { running: string; done: string }[] = [
  { running: "Finding the themes…", done: "Themes found" },
  { running: "Spotting the story signals…", done: "Story signals found" },
  { running: "Building the timeline…", done: "Timeline built" },
];

const TOTAL = STEP_LABELS.length;

type Props = {
  recordingId: string;
  initialStatus: AnalysisStatus;
  initialStep: number;
  initialError?: string | null;
};

export default function AnalyzePanel({
  recordingId,
  initialStatus,
  initialStep,
  initialError,
}: Props) {
  const router = useRouter();

  const [status, setStatus] = useState<AnalysisStatus>(initialStatus);
  const [step, setStep] = useState<number>(initialStep);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [running, setRunning] = useState(false);

  async function run(restart: boolean) {
    setRunning(true);
    setError(null);
    setStatus("analysing");

    let first = true;
    // A short safety cap so a misbehaving response can't loop forever.
    for (let guard = 0; guard <= TOTAL + 1; guard++) {
      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ recordingId, restart: first && restart }),
        });
        first = false;

        const result = await response.json().catch(() => null);

        if (!response.ok) {
          setStatus("failed");
          setError(result?.error ?? "The analysis could not run just now.");
          setRunning(false);
          return;
        }

        if (result?.status === "failed") {
          setStep(result?.step ?? step);
          setStatus("failed");
          setError(result?.error ?? "One of the steps failed.");
          setRunning(false);
          return;
        }

        setStep(result?.step ?? step);

        if (result?.done) {
          setStatus("ready");
          setRunning(false);
          // Reveal the results, which are rendered server-side.
          router.refresh();
          return;
        }
      } catch {
        setStatus("failed");
        setError("The connection dropped. You can pick up where it stopped.");
        setRunning(false);
        return;
      }
    }

    setRunning(false);
  }

  if (status === "ready") {
    return (
      <button
        onClick={() => run(true)}
        disabled={running}
        className="text-sm font-medium text-neutral-500 underline disabled:opacity-50"
      >
        {running ? "Re-analysing…" : "Re-analyse this interview"}
      </button>
    );
  }

  const primaryLabel = running
    ? "Working…"
    : status === "failed"
      ? "Try again from where it stopped"
      : step > 0
        ? "Resume analysis"
        : "Analyse this interview";

  return (
    <div className="rounded-md border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-medium text-neutral-900">Interview Intelligence</h2>
      <p className="mt-1 text-xs text-neutral-500">
        StoryLens reads the whole transcript and pulls out the themes, the moments worth
        writing about, and the chronology. This runs on your AI provider and usually takes
        under a minute.
      </p>

      <ul className="mt-4 space-y-2">
        {STEP_LABELS.map((label, index) => {
          const done = index < step;
          const active = running && index === step;

          return (
            <li key={index} className="flex items-start gap-3">
              <span
                className={`mt-0.5 text-sm ${
                  done ? "text-green-600" : active ? "text-neutral-900" : "text-neutral-300"
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
                {done ? label.done : label.running}
              </span>
            </li>
          );
        })}
      </ul>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="mt-4 flex items-center gap-4">
        <button
          onClick={() => run(false)}
          disabled={running}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {primaryLabel}
        </button>

        {status === "failed" && !running && step > 0 && (
          <button
            onClick={() => run(true)}
            className="text-sm text-neutral-500 underline"
          >
            Start over
          </button>
        )}
      </div>
    </div>
  );
}
