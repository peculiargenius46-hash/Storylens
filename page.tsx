"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Speaker = { speaker_label: string; speaker_name: string | null };

type Segment = {
  id: string;
  original_text: string;
  start_time: number;
  end_time: number;
  speakers: Speaker | Speaker[] | null;
};

function speakerOf(seg: Segment): Speaker | null {
  if (!seg.speakers) return null;
  return Array.isArray(seg.speakers) ? seg.speakers[0] ?? null : seg.speakers;
}

type Recording = {
  id: string;
  summary: string | null;
  action_items: string[];
  share_token: string | null;
  duration_seconds: number | null;
};

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

export default function TranscriptPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const projectId = params.id as string;
  const recordingId = searchParams.get("recording");

  const [recording, setRecording] = useState<Recording | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!recordingId) return;

    const { data: rec } = await supabase
      .from("recordings")
      .select("id, summary, action_items, share_token, duration_seconds")
      .eq("id", recordingId)
      .single();

    const { data: segs } = await supabase
      .from("transcript_segments")
      .select("id, original_text, start_time, end_time, speakers(speaker_label, speaker_name)")
      .eq("recording_id", recordingId)
      .order("start_time", { ascending: true });

    setRecording(rec as Recording);
    setSegments((segs as Segment[] | null) ?? []);
    setLoading(false);
  }, [recordingId, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleShare() {
    if (!recording?.share_token) return;
    const shareUrl = `${window.location.origin}/share/${recording.share_token}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: "Interview transcript", url: shareUrl });
        return;
      } catch {
        // user cancelled the native share sheet — fall through to copy
      }
    }

    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCopyTranscript() {
    const text = segments
      .map((s) => {
        const speaker = speakerOf(s);
        return `[${formatTime(s.start_time)}] ${speaker?.speaker_name ?? `Speaker ${speaker?.speaker_label ?? "?"}`}: ${s.original_text}`;
      })
      .join("\n\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="text-sm text-neutral-500">Loading transcript…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-semibold text-neutral-900">Transcript</h1>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={handleCopyTranscript}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Copy transcript
            </button>
            <button
              onClick={handleShare}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
            >
              Share
            </button>
          </div>
        </div>

        {copied && <p className="mt-2 text-xs text-green-600">Copied to clipboard.</p>}

        {recording?.summary && (
          <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-neutral-900">Summary</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-neutral-700">
              {recording.summary}
            </p>
          </div>
        )}

        {recording?.action_items && recording.action_items.length > 0 && (
          <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-neutral-900">Action Points</h2>
            <ul className="mt-2 space-y-1.5">
              {recording.action_items.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm text-neutral-700">
                  <span className="text-neutral-400">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 space-y-4">
          {segments.length === 0 && (
            <p className="text-sm text-neutral-500">No transcript segments found.</p>
          )}
          {segments.map((seg) => {
            const speaker = speakerOf(seg);
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
