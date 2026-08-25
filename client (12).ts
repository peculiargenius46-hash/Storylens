const ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2";

function requireApiKey(): string {
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) {
    throw new Error(
      "ASSEMBLYAI_API_KEY is not set. Add it as a server-side environment variable " +
        "(no NEXT_PUBLIC_ prefix) in Netlify's Environment variables screen."
    );
  }
  return key;
}

/**
 * Uploads a file's bytes directly to AssemblyAI's own storage and returns
 * a URL AssemblyAI can transcribe from. Used when we already have the file
 * server-side (e.g. streamed in from our own Supabase Storage signed URL).
 */
export async function uploadToAssemblyAI(fileBytes: ArrayBuffer): Promise<string> {
  const res = await fetch(`${ASSEMBLYAI_BASE}/upload`, {
    method: "POST",
    headers: { authorization: requireApiKey() },
    body: fileBytes,
  });

  if (!res.ok) {
    throw new Error(`AssemblyAI upload failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.upload_url as string;
}

/**
 * Kicks off transcription for a given audio URL (either an AssemblyAI
 * upload_url, or any direct link to an audio/video file that AssemblyAI
 * can fetch itself, e.g. a pasted podcast link).
 *
 * Uses a webhook rather than polling from inside the request, since
 * transcription of a real interview can take minutes, far longer than
 * a serverless function is allowed to stay alive.
 */
export async function startTranscription(params: {
  audioUrl: string;
  webhookUrl: string; // should already include ?recordingId=<id>
}): Promise<string> {
  const webhookSecret = process.env.ASSEMBLYAI_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error(
      "ASSEMBLYAI_WEBHOOK_SECRET is not set. Add any random string as a server-side " +
        "environment variable, it's used to verify webhook calls actually came from AssemblyAI."
    );
  }

  const res = await fetch(`${ASSEMBLYAI_BASE}/transcript`, {
    method: "POST",
    headers: {
      authorization: requireApiKey(),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      audio_url: params.audioUrl,
      speaker_labels: true,
      summarization: true,
      summary_model: "informative",
      summary_type: "bullets",
      webhook_url: params.webhookUrl,
      webhook_auth_header_name: "x-storylens-webhook-secret",
      webhook_auth_header_value: webhookSecret,
    }),
  });

  if (!res.ok) {
    throw new Error(`AssemblyAI transcript request failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.id as string;
}

export async function getTranscript(transcriptId: string) {
  const res = await fetch(`${ASSEMBLYAI_BASE}/transcript/${transcriptId}`, {
    headers: { authorization: requireApiKey() },
  });

  if (!res.ok) {
    throw new Error(`AssemblyAI transcript fetch failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

/**
 * LeMUR (AssemblyAI's LLM layer over a transcript) — used here specifically
 * to pull out action items, which the standard summarization endpoint
 * doesn't produce. Uses the same AssemblyAI key, no separate OpenAI account
 * needed for this batch.
 */
export async function extractActionItems(transcriptId: string): Promise<string[]> {
  const res = await fetch(`https://api.assemblyai.com/lemur/v3/generate/task`, {
    method: "POST",
    headers: {
      authorization: requireApiKey(),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      transcript_ids: [transcriptId],
      prompt:
        "List any concrete action items, next steps, follow-ups, or commitments mentioned " +
        "in this conversation. Reply with ONLY a JSON array of short strings, no other text. " +
        'If there are none, reply with exactly: []',
      final_model: "anthropic/claude-3-5-sonnet",
    }),
  });

  if (!res.ok) {
    // Action items are a nice-to-have, not core — fail soft rather than
    // breaking the whole transcript if LeMUR has a bad moment.
    console.error(`LeMUR action items failed: ${res.status} ${await res.text()}`);
    return [];
  }

  const data = await res.json();
  try {
    const parsed = JSON.parse(data.response.trim());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
