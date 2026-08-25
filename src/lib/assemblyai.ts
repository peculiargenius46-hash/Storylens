// Server-only AssemblyAI helper.
// ASSEMBLYAI_API_KEY is a server environment variable. It must never be
// prefixed with NEXT_PUBLIC_ and must never be imported into a client component.

const API_BASE = "https://api.assemblyai.com/v2";

export type AssemblyUtterance = {
  speaker: string;
  text: string;
  start: number; // milliseconds
  end: number; // milliseconds
  confidence?: number;
};

export type AssemblyTranscript = {
  id: string;
  status: "queued" | "processing" | "completed" | "error";
  text?: string | null;
  audio_duration?: number | null; // seconds
  utterances?: AssemblyUtterance[] | null;
  error?: string | null;
};

export function hasAssemblyConfig() {
  return Boolean(process.env.ASSEMBLYAI_API_KEY);
}

function apiKey() {
  const key = process.env.ASSEMBLYAI_API_KEY;

  if (!key) {
    throw new Error(
      "Transcription is unavailable because ASSEMBLYAI_API_KEY is not set on the server."
    );
  }

  return key;
}

/**
 * Hands AssemblyAI a temporary signed URL and asks for a diarised transcript.
 * Returns immediately with a transcript id — transcription itself is asynchronous.
 */
export async function submitTranscription(audioUrl: string): Promise<AssemblyTranscript> {
  const response = await fetch(`${API_BASE}/transcript`, {
    method: "POST",
    headers: {
      // AssemblyAI takes the raw key, with no "Bearer" prefix.
      authorization: apiKey(),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      speaker_labels: true,
      punctuate: true,
      format_text: true,
    }),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const detail =
      (body && typeof body === "object" && "error" in body && String(body.error)) ||
      `AssemblyAI returned ${response.status}`;
    throw new Error(detail);
  }

  return body as AssemblyTranscript;
}

export async function getTranscription(transcriptId: string): Promise<AssemblyTranscript> {
  const response = await fetch(`${API_BASE}/transcript/${transcriptId}`, {
    headers: { authorization: apiKey() },
    cache: "no-store",
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const detail =
      (body && typeof body === "object" && "error" in body && String(body.error)) ||
      `AssemblyAI returned ${response.status}`;
    throw new Error(detail);
  }

  return body as AssemblyTranscript;
}
