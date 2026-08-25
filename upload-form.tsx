"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatFileSize, formatDuration, safeFileName } from "@/lib/format";

// Supabase caps uploads at 50 MB on the free plan. Raising it is a setting
// change in Storage, not a code change, so this stays a plain constant.
const MAX_FILE_MB = 50;

const ACCEPTED = "audio/*,video/*";

type Props = {
  projectId: string;
  remainingMinutes: number | null;
};

export default function UploadForm({ projectId, remainingMinutes }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null);

  function chooseFile(next: File | null) {
    setError(null);
    setDurationSeconds(null);

    if (!next) {
      setFile(null);
      return;
    }

    if (next.size > MAX_FILE_MB * 1024 * 1024) {
      setFile(null);
      setError(
        `That file is ${formatFileSize(next.size)}. The current upload limit is ${MAX_FILE_MB} MB. A shorter recording, or the same recording exported as a smaller audio file, will go through.`
      );
      return;
    }

    setFile(next);
    readDuration(next);
  }

  // Reads length straight from the browser's media decoder so we can show the
  // user how much of their allowance the recording will use before they commit.
  function readDuration(next: File) {
    const url = URL.createObjectURL(next);
    const media = document.createElement(
      next.type.startsWith("video") ? "video" : "audio"
    );

    media.preload = "metadata";
    media.onloadedmetadata = () => {
      if (Number.isFinite(media.duration)) {
        setDurationSeconds(media.duration);
      }
      URL.revokeObjectURL(url);
    };
    media.onerror = () => URL.revokeObjectURL(url);
    media.src = url;
  }

  async function handleStart() {
    if (!file) return;

    setBusy(true);
    setError(null);

    try {
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setStage("Creating the recording…");

      const { data: recording, error: recordingError } = await supabase
        .from("recordings")
        .insert({ project_id: projectId, status: "uploading" })
        .select("id")
        .single();

      if (recordingError) throw new Error(recordingError.message);

      // Path shape matters: the first folder is the owner's id, which is what
      // the storage policies check.
      const path = `${user.id}/${recording.id}/${safeFileName(file.name)}`;

      setStage("Uploading your recording…");

      const { error: uploadError } = await supabase.storage
        .from("recordings")
        .upload(path, file, { contentType: file.type || undefined, upsert: false });

      if (uploadError) throw new Error(uploadError.message);

      await supabase
        .from("recordings")
        .update({
          storage_url: path,
          duration_seconds: durationSeconds ? Math.round(durationSeconds) : null,
          status: "pending",
        })
        .eq("id", recording.id);

      await supabase
        .from("projects")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", projectId);

      setStage("Sending it for transcription…");

      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recordingId: recording.id }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error ?? "Transcription could not be started.");
      }

      router.push(`/projects/${projectId}/processing?recording=${recording.id}`);
    } catch (startError) {
      setError(
        startError instanceof Error ? startError.message : "Something went wrong."
      );
      setBusy(false);
      setStage("");
    }
  }

  const estimatedMinutes = durationSeconds ? Math.ceil(durationSeconds / 60) : null;
  const overAllowance =
    remainingMinutes !== null &&
    estimatedMinutes !== null &&
    estimatedMinutes > remainingMinutes;

  return (
    <div className="mt-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          chooseFile(e.dataTransfer.files?.[0] ?? null);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-md border-2 border-dashed px-6 py-10 text-center transition ${
          dragging
            ? "border-neutral-900 bg-neutral-100"
            : "border-neutral-300 bg-white hover:border-neutral-400"
        }`}
      >
        <p className="text-sm font-medium text-neutral-900">
          Drag your recording here, or click to choose a file
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Audio or video, up to {MAX_FILE_MB} MB
        </p>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {file && (
        <div className="mt-4 rounded-md border border-neutral-200 bg-white p-4">
          <p className="text-sm font-medium text-neutral-900">{file.name}</p>
          <p className="mt-1 text-xs text-neutral-500">
            {formatFileSize(file.size)} · {formatDuration(durationSeconds)}
          </p>

          {estimatedMinutes !== null && (
            <p className="mt-3 text-sm text-neutral-700">
              This will use about {estimatedMinutes}{" "}
              {estimatedMinutes === 1 ? "minute" : "minutes"} of your allowance.
              {remainingMinutes !== null && ` You have ${remainingMinutes} left this month.`}
            </p>
          )}

          {overAllowance && (
            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              That is longer than the allowance left on your plan. It will still process
              for now, since billing limits are not enforced yet, but the usage will show
              on your dashboard.
            </p>
          )}
        </div>
      )}

      <button
        onClick={handleStart}
        disabled={!file || busy}
        className="mt-6 w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {busy ? stage || "Working…" : "Start processing"}
      </button>

      {busy && (
        <p className="mt-2 text-center text-xs text-neutral-500">
          Large files take a moment. Please keep this tab open until it moves on.
        </p>
      )}
    </div>
  );
}
