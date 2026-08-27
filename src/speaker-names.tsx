"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Speaker = {
  id: string;
  speaker_label: string;
  speaker_name: string | null;
};

export default function SpeakerNames({ speakers }: { speakers: Speaker[] }) {
  const router = useRouter();
  const [names, setNames] = useState<Record<string, string>>(
    Object.fromEntries(speakers.map((s) => [s.id, s.speaker_name ?? ""]))
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (speakers.length === 0) return null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const supabase = createClient();

      for (const speaker of speakers) {
        const value = names[speaker.id]?.trim() ?? "";

        if (value === (speaker.speaker_name ?? "")) continue;

        const { error: updateError } = await supabase
          .from("speakers")
          .update({ speaker_name: value || null })
          .eq("id", speaker.id);

        if (updateError) throw new Error(updateError.message);
      }

      setSaved(true);
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Could not save those names."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-medium text-neutral-900">Who is speaking?</h2>
      <p className="mt-1 text-xs text-neutral-500">
        StoryLens separated the voices but it cannot know their names. Name them once and
        the transcript updates everywhere.
      </p>

      <div className="mt-3 space-y-3">
        {speakers.map((speaker) => (
          <div key={speaker.id} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-sm text-neutral-600">
              Speaker {speaker.speaker_label}
            </span>
            <input
              value={names[speaker.id] ?? ""}
              onChange={(e) =>
                setNames((prev) => ({ ...prev, [speaker.id]: e.target.value }))
              }
              placeholder="Add a name"
              className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-900 focus:outline-none"
            />
          </div>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-4 rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {saving ? "Saving…" : saved ? "Saved" : "Save names"}
      </button>
    </div>
  );
}
