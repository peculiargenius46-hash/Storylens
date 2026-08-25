"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Tab = "file" | "record" | "link";

const MAX_FILE_MB = 500;
const YOUTUBE_HOSTS = ["youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"];

export default function UploadPage() {
  const params = useParams();
  const projectId = params.id as string;
  const router = useRouter();
  const supabase = createClient();

  const [projectTitle, setProjectTitle] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("file");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // file tab
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // record tab
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // link tab
  const [link, setLink] = useState("");

  useEffect(() => {
    supabase
      .from("projects")
      .select("title")
      .eq("id", projectId)
      .single()
      .then(({ data }) => setProjectTitle(data?.title ?? null));
  }, [projectId, supabase]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) setFile(dropped);
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setRecordedBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordSeconds(0);
      timerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch {
      setError(
        "Couldn't access your microphone. Check that this site has permission to use it."
      );
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function isDirectLinkPlausible(url: string): { ok: boolean; reason?: string } {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, reason: "That doesn't look like a valid URL." };
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { ok: false, reason: "Link must start with http:// or https://." };
    }
    if (YOUTUBE_HOSTS.includes(parsed.hostname)) {
      return {
        ok: false,
        reason:
          "YouTube links aren't supported. Paste a direct link to an audio or video file instead (a podcast host's file link, a Dropbox share link, etc).",
      };
    }
    return { ok: true };
  }

  async function createRecordingRow(sourceType: "upload" | "record" | "link", sourceUrl?: string) {
    const { data, error } = await supabase
      .from("recordings")
      .insert({
        project_id: projectId,
        source_type: sourceType,
        source_url: sourceUrl ?? null,
        status: "uploading",
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return data.id as string;
  }

  async function uploadBytesToStorage(recordingId: string, blob: Blob, filename: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not logged in.");

    const path = `${user.id}/${projectId}/${recordingId}/${filename}`;
    const { error } = await supabase.storage.from("recordings").upload(path, blob, {
      upsert: true,
    });
    if (error) throw new Error(error.message);
    return path;
  }

  async function kickOffTranscription(recordingId: string) {
    const res = await fetch("/api/recordings/start-transcription", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recordingId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Failed to start transcription.");
    }
  }

  async function handleFileSubmit() {
    if (!file) return;
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`That file is larger than the ${MAX_FILE_MB}MB limit for this batch.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const recordingId = await createRecordingRow("upload");
      await uploadBytesToStorage(recordingId, file, file.name);
      await kickOffTranscription(recordingId);
      router.push(`/projects/${projectId}/processing?recording=${recordingId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  async function handleRecordSubmit() {
    if (!recordedBlob) return;
    setBusy(true);
    setError(null);
    try {
      const recordingId = await createRecordingRow("record");
      await uploadBytesToStorage(recordingId, recordedBlob, "recording.webm");
      await kickOffTranscription(recordingId);
      router.push(`/projects/${projectId}/processing?recording=${recordingId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  async function handleLinkSubmit() {
    const check = isDirectLinkPlausible(link);
    if (!check.ok) {
      setError(check.reason ?? "Invalid link.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const recordingId = await createRecordingRow("link", link);
      await kickOffTranscription(recordingId);
      router.push(`/projects/${projectId}/processing?recording=${recordingId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  function formatSeconds(s: number) {
    const m = Math.floor(s / 60)
      .toString()
      .padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-10">
      <div className="mx-auto max-w-lg">
        <h1 className="text-xl font-semibold text-neutral-900">
          Upload{projectTitle ? ` — ${projectTitle}` : ""}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          Pick a file, record directly, or paste a link to something already online.
        </p>

        <div className="mt-6 flex gap-2 rounded-lg bg-neutral-200 p-1">
          {(["file", "record", "link"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium capitalize transition ${
                tab === t ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"
              }`}
            >
              {t === "file" ? "Pick a file" : t === "record" ? "Record" : "Paste a link"}
            </button>
          ))}
        </div>

        {error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {tab === "file" && (
          <div className="mt-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center ${
                dragOver ? "border-neutral-900 bg-neutral-100" : "border-neutral-300"
              }`}
            >
              {file ? (
                <div>
                  <p className="text-sm font-medium text-neutral-900">{file.name}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {(file.size / (1024 * 1024)).toFixed(1)} MB
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-neutral-600">Drag and drop an audio or video file</p>
                  <p className="mt-1 text-xs text-neutral-400">or</p>
                </>
              )}
              <label className="mt-3 cursor-pointer rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                Choose file
                <input
                  type="file"
                  accept="audio/*,video/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <button
              onClick={handleFileSubmit}
              disabled={!file || busy}
              className="mt-4 w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {busy ? "Uploading…" : "Start Processing"}
            </button>
          </div>
        )}

        {tab === "record" && (
          <div className="mt-4 flex flex-col items-center rounded-lg border border-neutral-200 bg-white px-6 py-10 text-center">
            <p className="text-2xl font-mono text-neutral-900">{formatSeconds(recordSeconds)}</p>

            {!isRecording && !recordedBlob && (
              <button
                onClick={startRecording}
                className="mt-4 rounded-full bg-red-600 px-6 py-3 text-sm font-medium text-white hover:bg-red-700"
              >
                ● Start Recording
              </button>
            )}

            {isRecording && (
              <button
                onClick={stopRecording}
                className="mt-4 rounded-full bg-neutral-900 px-6 py-3 text-sm font-medium text-white hover:bg-neutral-800"
              >
                ■ Stop
              </button>
            )}

            {!isRecording && recordedBlob && (
              <div className="mt-4 w-full space-y-3">
                <audio controls src={URL.createObjectURL(recordedBlob)} className="w-full" />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setRecordedBlob(null);
                      setRecordSeconds(0);
                    }}
                    className="flex-1 rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    Discard & redo
                  </button>
                  <button
                    onClick={handleRecordSubmit}
                    disabled={busy}
                    className="flex-1 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                  >
                    {busy ? "Uploading…" : "Start Processing"}
                  </button>
                </div>
              </div>
            )}

            <p className="mt-4 text-xs text-neutral-400">
              Recording happens right in your browser. Nothing is uploaded until you stop and
              confirm.
            </p>
          </div>
        )}

        {tab === "link" && (
          <div className="mt-4 space-y-3">
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://example.com/interview.mp3"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
            <p className="text-xs text-neutral-500">
              Works with any direct link to an audio or video file. YouTube links aren&apos;t
              supported.
            </p>
            <button
              onClick={handleLinkSubmit}
              disabled={!link || busy}
              className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {busy ? "Starting…" : "Start Processing"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
