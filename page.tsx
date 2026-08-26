"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseConfigurationError } from "@/lib/supabase/config";

const INTERVIEW_TYPES = [
  { value: "employee_feature", label: "Employee Feature" },
  { value: "executive_interview", label: "Executive Interview" },
  { value: "media_interview", label: "Media Interview" },
  { value: "customer_interview", label: "Customer Interview" },
  { value: "research_interview", label: "Research Interview" },
  { value: "podcast", label: "Podcast" },
  { value: "general", label: "General Interview" },
];

const inputClass =
  "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none";

export default function NewProjectPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [interviewee, setInterviewee] = useState("");
  const [intervieweeRole, setIntervieweeRole] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [interviewType, setInterviewType] = useState("general");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(getSupabaseConfigurationError());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
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

      const { data, error: insertError } = await supabase
        .from("projects")
        .insert({
          user_id: user.id,
          title: title.trim(),
          interviewee: interviewee.trim() || null,
          interviewee_role: intervieweeRole.trim() || null,
          organisation: organisation.trim() || null,
          interview_type: interviewType,
          description: description.trim() || null,
        })
        .select("id")
        .single();

      if (insertError) {
        setError(insertError.message);
        return;
      }

      router.push(`/projects/${data.id}/upload`);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not create this interview."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-10">
      <div className="mx-auto max-w-xl">
        <Link href="/dashboard" className="text-sm text-neutral-500 underline">
          Back to dashboard
        </Link>

        <h1 className="mt-4 text-xl font-semibold text-neutral-900">New interview</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Only the title is required. Everything else helps StoryLens write with better
          context later, and you can fill it in afterwards.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Project title <span className="text-red-600">*</span>
            </label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="25 years at SIFAX — Mrs Adeyemi"
              className={inputClass}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-neutral-700">
                Interviewee
              </label>
              <input
                value={interviewee}
                onChange={(e) => setInterviewee(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700">Role</label>
              <input
                value={intervieweeRole}
                onChange={(e) => setIntervieweeRole(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Organisation
            </label>
            <input
              value={organisation}
              onChange={(e) => setOrganisation(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Interview type
            </label>
            <select
              value={interviewType}
              onChange={(e) => setInterviewType(e.target.value)}
              className={inputClass}
            >
              {INTERVIEW_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this interview for?"
              className={inputClass}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !title.trim()}
            className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {loading ? "Creating…" : "Continue to upload"}
          </button>
        </form>
      </div>
    </main>
  );
}
