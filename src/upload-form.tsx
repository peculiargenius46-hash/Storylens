"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatFileSize, formatDuration, safeFileName } from "@/lib/format";

// Supabase caps uploads at 50 MB on the free plan. Raising it is a setting
// change in Storage, not a code change, so this stays a plain constant.
const MAX_FILE_MB = 50;

const ACCEPTED = "audio/*,video/*";

// YouTube pages are not audio files. Transcribing one means extracting the
// audio first, which is against YouTube's terms for third-party tools. Any
// other direct audio or video link is fine: podcast hosts, Dropbox, Drive
// direct links, a file on your own server.
const YOUTUBE_HOSTS = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "music.youtube.com",
];

type Source = "upload" | "record" | "link";

type Props = {
  projectId: string;
  remainingMinutes: number | null;
};

export default function UploadForm({ projectId, remainingMinutes }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [source, setSource] = useState<Source>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Recording state
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Link state
  const [link, setLink] = useState("");

  // If the user walks away mid-recording, stop the microphone rather than
  // leaving the browser's recording indicator on.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stream.getTracks().forEach((track) => track.stop());
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function switchSource(next: Source) {
    if (busy || isRecording) return;
    setSource(next);
    setError(null);
  }

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
  function readDuration(next: Blob, isVideo = false) {
    const url = URL.createObjectURL(next);
    const media = document.createElement(isVideo ? "video" : "audio");

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

  async function startRecording() {
    setError(null);
    setRecordedBlob(null);
    setDurationSeconds(null);

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError(
        "This browser will not allow in-page recording. You can record with your phone's voice recorder and upload the file instead."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setRecordedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        // The recorded length we counted is more reliable than asking the
        // decoder, because webm from MediaRecorder often reports no duration.
        setDurationSeconds(recordSecondsRef.current);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
      setRecordSeconds(0);
      recordSecondsRef.current = 0;

      timerRef.current = setInterval(() => {
        recordSecondsRef.current += 1;
        setRecordSeconds(recordSecondsRef.current);
      }, 1000);
    } catch {
      setError(
        "Could not reach your microphone. Check that this site is allowed to use it in your browser settings, then try again."
      );
    }
  }

  // Kept in a ref as well as state, because the recorder's onstop callback
  // captures the value from when recording began and would otherwise read zero.
  const recordSecondsRef = useRef(0);

  function stopRecording() {
    recorderRef.current?.stop();
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function discardRecording() {
    setRecordedBlob(null);
    setDurationSeconds(null);
    setRecordSeconds(0);
    recordSecondsRef.current = 0;
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }

  function checkLink(value: string): string | null {
    let parsed: URL;

    try {
      parsed = new URL(value.trim());
    } catch {
      return "That does not look like a full web address. It should start with https://";
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "The link needs to start with http:// or https://";
    }

    if (YOUTUBE_HOSTS.includes(parsed.hostname.toLowerCase())) {
      return "YouTube links are not supported. Paste a direct link to an audio or video file instead, for example a podcast host's file link or a Dropbox share link.";
    }

    return null;
  }

  async function handleStart() {
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

      let recordingId: string;

      if (source === "link") {
        const problem = checkLink(link);
        if (problem) throw new Error(problem);

        setStage("Saving the link…");

        const { data: recording, error: recordingError } = await supabase
          .from("recordings")
          .insert({
            project_id: projectId,
            status: "pending",
            source_type: "link",
            source_url: link.trim(),
          })
          .select("id")
          .single();

        if (recordingError) throw new Error(recordingError.message);
        recordingId = recording.id;
      } else {
        // Uploads and browser recordings both end up as bytes in storage, so
        // from here they follow exactly the same path.
        const blob: Blob | null = source === "record" ? recordedBlob : file;
        if (!blob) throw new Error("Nothing to send yet.");

        const filename =
          source === "record"
            ? `recording-${Date.now()}.webm`
            : safeFileName((file as File).name);

        setStage("Creating the recording…");

        const { data: recording, error: recordingError } = await supabase
          .from("recordings")
          .insert({
            project_id: projectId,
            status: "uploading",
            source_type: source,
          })
          .select("id")
          .single();

        if (recordingError) throw new Error(recordingError.message);
        recordingId = recording.id;

        // Path shape matters: the first folder is the owner's id, which is what
        // the storage policies check.
        const path = `${user.id}/${recordingId}/${filename}`;

        setStage("Uploading your recording…");

        const { error: uploadError } = await supabase.storage
          .from("recordings")
          .upload(path, blob, { contentType: blob.type || undefined, upsert: false });

        if (uploadError) throw new Error(uploadError.message);

        await supabase
          .from("recordings")
          .update({
            storage_url: path,
            duration_seconds: durationSeconds ? Math.round(durationSeconds) : null,
            status: "pending",
          })
          .eq("id", recordingId);
      }

      await supabase
        .from("projects")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", projectId);

      setStage("Sending it for transcription…");

      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recordingId }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error ?? "Transcription could not be started.");
      }

      router.push(`/projects/${projectId}/processing?recording=${recordingId}`);
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

  const canStart =
    !busy &&
    ((source === "upload" && Boolean(file)) ||
      (source === "record" && Boolean(recordedBlob) && !isRecording) ||
      (source === "link" && link.trim().length > 0));

  const tabs: Array<{ id: Source; label: string }> = [
    { id: "upload", label: "Upload a file" },
    { id: "record", label: "Record now" },
    { id: "link", label: "Paste a link" },
  ];

  return (
    <div className="mt-6">
      <div className="flex gap-1 rounded-md bg-neutral-100 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => switchSource(tab.id)}
            disabled={busy || isRecording}
            className={`flex-1 rounded px-3 py-2 text-sm font-medium transition disabled:opacity-50 ${
              source === tab.id
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {source === "upload" && (
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
          className={`mt-4 cursor-pointer rounded-md border-2 border-dashed px-6 py-10 text-center transition ${
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
      )}

      {source === "record" && (
        <div className="mt-4 rounded-md border border-neutral-200 bg-white px-6 py-8 text-center">
          {!recordedBlob && (
            <>
              <p className="text-sm text-neutral-700">
                {isRecording
                  ? "Recording. Speak normally, then stop when you are done."
                  : "Record the interview straight from this page using your microphone."}
              </p>

              {isRecording && (
                <p className="mt-3 text-2xl font-semibold tabular-nums text-neutral-900">
                  {formatDuration(recordSeconds)}
                </p>
              )}

              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={busy}
                className={`mt-4 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                  isRecording
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-neutral-900 hover:bg-neutral-800"
                }`}
              >
                {isRecording ? "Stop recording" : "Start recording"}
              </button>

              {!isRecording && (
                <p className="mt-3 text-xs text-neutral-500">
                  Your browser will ask for microphone permission the first time.
                </p>
              )}
            </>
          )}

          {recordedBlob && (
            <>
              <p className="text-sm font-medium text-neutral-900">
                Recording ready · {formatDuration(durationSeconds)}
              </p>

              {previewUrl && (
                <audio controls src={previewUrl} className="mx-auto mt-3 w-full" />
              )}

              <button
                type="button"
                onClick={discardRecording}
                disabled={busy}
                className="mt-3 text-sm text-neutral-600 underline disabled:opacity-50"
              >
                Discard and record again
              </button>
            </>
          )}
        </div>
      )}

      {source === "link" && (
        <div className="mt-4 rounded-md border border-neutral-200 bg-white p-5">
          <label htmlFor="recording-link" className="text-sm font-medium text-neutral-900">
            Direct link to an audio or video file
          </label>

          <input
            id="recording-link"
            type="url"
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              setError(null);
            }}
            placeholder="https://example.com/interview.mp3"
            disabled={busy}
            className="mt-2 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900 disabled:opacity-50"
          />

          <p className="mt-3 text-xs text-neutral-500">
            The link must point straight at the file itself, not at a page that plays it.
            Podcast hosts, Dropbox and file links all work. YouTube links are not
            supported.
          </p>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {source === "upload" && file && (
        <div className="mt-4 rounded-md border border-neutral-200 bg-white p-4">
          <p className="text-sm font-medium text-neutral-900">{file.name}</p>
          <p className="mt-1 text-xs text-neutral-500">
            {formatFileSize(file.size)} · {formatDuration(durationSeconds)}
          </p>
        </div>
      )}

      {source !== "link" && estimatedMinutes !== null && (
        <div className="mt-4 rounded-md border border-neutral-200 bg-white p-4">
          <p className="text-sm text-neutral-700">
            This will use about {estimatedMinutes}{" "}
            {estimatedMinutes === 1 ? "minute" : "minutes"} of your allowance.
            {remainingMinutes !== null && ` You have ${remainingMinutes} left this month.`}
          </p>

          {overAllowance && (
            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              That is longer than the allowance left on your plan. It will still process
              for now, since billing limits are not enforced yet, but the usage will show
              on your dashboard.
            </p>
          )}
        </div>
      )}

      {source === "link" && (
        <p className="mt-4 text-xs text-neutral-500">
          The length of a linked recording is only known once transcription finishes, so
          the allowance it uses will appear on your dashboard afterwards.
        </p>
      )}

      <button
        onClick={handleStart}
        disabled={!canStart}
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
