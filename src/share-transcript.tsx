"use client";

import { useState } from "react";

type Props = {
  recordingId: string;
  initialToken: string | null;
};

export default function ShareTranscript({ recordingId, initialToken }: Props) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shareUrl =
    token && typeof window !== "undefined"
      ? `${window.location.origin}/share/${token}`
      : null;

  async function call(action: "share" | "revoke") {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recordingId, action }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error ?? "That did not work.");
      }

      setToken(result.shared ? result.token : null);
      setCopied(false);
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      setError("Could not copy automatically. You can select the link and copy it.");
    }
  }

  return (
    <div className="mt-6 rounded-md border border-neutral-200 bg-white p-4">
      <p className="text-sm font-medium text-neutral-900">Share this transcript</p>

      {!token && (
        <>
          <p className="mt-1 text-sm text-neutral-600">
            Create a link that lets someone read the transcript without signing in.
          </p>
          <button
            type="button"
            onClick={() => call("share")}
            disabled={busy}
            className="mt-3 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create share link"}
          </button>
        </>
      )}

      {token && (
        <>
          <p className="mt-1 text-sm text-neutral-600">
            Anyone with this link can read the transcript.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={shareUrl ?? ""}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700"
            />
            <button
              type="button"
              onClick={copyLink}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <button
            type="button"
            onClick={() => call("revoke")}
            disabled={busy}
            className="mt-3 text-sm text-neutral-600 underline disabled:opacity-50"
          >
            {busy ? "Working…" : "Stop sharing"}
          </button>
        </>
      )}

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
