"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type RecordingStatus =
  | "pending"
  | "uploading"
  | "transcribing"
  | "analysing"
  | "ready"
  | "failed";

const STEPS: { status: RecordingStatus; label: string }[] = [
  { status: "uploading", label: "Recording uploaded" },
  { status: "transcribing", label: "Transcribing conversation" },
  { status: "analysing", label: "Identifying speakers & analysing" },
  { status: "ready", label: "Ready" },
];

function stepIndex(status: RecordingStatus) {
  const order: RecordingStatus[] = ["uploading", "transcribing", "analysing", "ready"];
  return order.indexOf(status);
}

export default function ProcessingPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();

  const projectId = params.id as string;
  const recordingId = searchParams.get("recording");

  const [status, setStatus] = useState<RecordingStatus>("uploading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!recordingId) return;

    let cancelled = false;

    async function poll() {
      const { data } = await supabase
        .from("recordings")
        .select("status, error_message")
        .eq("id", recordingId)
        .single();

      if (cancelled || !data) return;

      setStatus(data.status as RecordingStatus);
      if (data.error_message) setErrorMessage(data.error_message);

      if (data.status === "ready") {
        setTimeout(() => router.push(`/projects/${projectId}/transcript?recording=${recordingId}`), 800);
        return;
      }

      if (data.status !== "failed") {
        setTimeout(poll, 3000);
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [recordingId, projectId, router, supabase]);

  const currentIndex = stepIndex(status);

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-lg font-semibold text-neutral-900">Preparing StoryLens…</h1>
        <p className="mt-1 text-sm text-neutral-500">
          You can leave this page, processing continues in the background.
        </p>

        {status === "failed" ? (
          <div className="mt-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            <p className="font-medium">Something went wrong.</p>
            <p className="mt-1">{errorMessage ?? "The transcription failed."}</p>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {STEPS.map((step, i) => {
              const done = i < currentIndex || status === "ready";
              const active = i === currentIndex && status !== "ready";
              return (
                <li key={step.status} className="flex items-center gap-3">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                      done
                        ? "bg-green-600 text-white"
                        : active
                        ? "border-2 border-neutral-900"
                        : "border border-neutral-300"
                    }`}
                  >
                    {done ? "✓" : ""}
                  </span>
                  <span
                    className={`text-sm ${
                      done || active ? "text-neutral-900" : "text-neutral-400"
                    }`}
                  >
                    {step.label}
                    {active ? "…" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
