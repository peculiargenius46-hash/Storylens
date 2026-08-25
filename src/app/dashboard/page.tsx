import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfigurationError } from "@/lib/supabase/config";
<<<<<<< HEAD
import { getAllowance } from "@/lib/entitlements";

const STATUS_LABELS: Record<string, string> = {
  draft: "No recording yet",
  processing: "Processing",
  ready: "Ready",
  archived: "Archived",
};
=======
>>>>>>> 7512eb610f46aad19150c45e2eeb7d925347b96a

export default async function DashboardPage() {
  const configurationError = getSupabaseConfigurationError();

  if (configurationError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="w-full max-w-md rounded-md border border-neutral-200 bg-white p-6 text-center">
          <h1 className="text-xl font-semibold text-neutral-900">Dashboard unavailable</h1>
          <p className="mt-2 text-sm text-neutral-600">{configurationError}</p>
          <Link
            href="/login"
            className="mt-4 inline-block text-sm font-medium text-neutral-900 underline"
          >
            Return to login
          </Link>
        </div>
      </main>
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, title, interviewee, status, created_at, updated_at")
    .order("updated_at", { ascending: false });

  const allowance = user ? await getAllowance(supabase, user.id) : null;

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">
              Welcome{user?.email ? `, ${user.email}` : ""}
            </h1>
            <p className="mt-1 text-sm text-neutral-600">
              Plan: {allowance?.planCode ?? "free"}
              {allowance && allowance.limitMinutes !== null
                ? ` · ${allowance.usedMinutes} of ${allowance.limitMinutes} transcription minutes used this month`
                : ""}
            </p>
          </div>
          <form action="/auth/signout" method="post">
            <button className="text-sm text-neutral-500 underline">Log out</button>
          </form>
        </div>

        <div className="mt-6">
          <Link
            href="/projects/new"
            className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            + New interview
          </Link>
        </div>

        <div className="mt-8">
          <h2 className="text-sm font-medium text-neutral-700">Your interviews</h2>

          {(!projects || projects.length === 0) && (
            <p className="mt-3 text-sm text-neutral-500">
              Nothing here yet. Create your first interview and upload a recording to see
              StoryLens transcribe it.
            </p>
          )}

          {projects && projects.length > 0 && (
            <ul className="mt-3 divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white">
              {projects.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                    className="block px-4 py-3 hover:bg-neutral-50"
                  >
                    <p className="text-sm font-medium text-neutral-900">{project.title}</p>
                    <p className="text-xs text-neutral-500">
                      {project.interviewee ?? "No interviewee set"} ·{" "}
                      {STATUS_LABELS[project.status] ?? project.status}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
