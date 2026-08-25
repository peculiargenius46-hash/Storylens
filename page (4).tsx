"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const INTERVIEW_TYPES = [
  { value: "employee_feature", label: "Employee Feature" },
  { value: "executive_interview", label: "Executive Interview" },
  { value: "media_interview", label: "Media Interview" },
  { value: "customer_interview", label: "Customer Interview" },
  { value: "research_interview", label: "Research Interview" },
  { value: "podcast", label: "Podcast" },
  { value: "general", label: "General Interview" },
];

export default function NewInterviewPage() {
  const router = useRouter();
  const supabase = createClient();

  const [title, setTitle] = useState("");
  const [interviewee, setInterviewee] = useState("");
  const [intervieweeRole, setIntervieweeRole] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [interviewType, setInterviewType] = useState("general");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You need to be logged in.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        title,
        interviewee: interviewee || null,
        interviewee_role: intervieweeRole || null,
        organisation: organisation || null,
        interview_type: interviewType,
        description: description || null,
        status: "draft",
      })
      .select("id")
      .single();

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push(`/projects/${data.id}/upload`);
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-10">
      <form onSubmit={handleSubmit} className="mx-auto max-w-lg space-y-5">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">New Interview</h1>
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <div>
          <label className="block text-sm font-medium text-neutral-700">
            Project title <span className="text-red-500">*</span>
          </label>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Adaeze's 20 Years at the Company"
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700">Interviewee name</label>
            <input
              value={interviewee}
              onChange={(e) => setInterviewee(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700">Interviewee role</label>
            <input
              value={intervieweeRole}
              onChange={(e) => setIntervieweeRole(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">Organisation</label>
          <input
            value={organisation}
            onChange={(e) => setOrganisation(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">Interview type</label>
          <select
            value={interviewType}
            onChange={(e) => setInterviewType(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          >
            {INTERVIEW_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !title}
          className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {loading ? "Creating…" : "Continue to Upload"}
        </button>
      </form>
    </main>
  );
}
