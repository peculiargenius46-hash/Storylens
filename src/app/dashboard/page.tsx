import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfigurationError } from "@/lib/supabase/config";

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
    .select("id, title, interviewee, status, created_at")
    .order("created_at", { ascending: false });

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan_code, status")
    .eq("user_id", user?.id)
    .maybeSingle();

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">
              Welcome{user?.email ? `, ${user.email}` : ""}
            </h1>
            <p className="mt-1 text-sm text-neutral-600">
              Plan: {subscription?.plan_code ?? "free"}
            </p>
          </div>
          <form action="/auth/signout" method="post">
            <button className="text-sm text-neutral-500 underline">Log out</button>
          </form>
        </div>

        <div className="mt-8">
          <h2 className="text-sm font-medium text-neutral-700">Your interviews</h2>

          {(!projects || projects.length === 0) && (
            <p className="mt-3 text-sm text-neutral-500">
              No interviews yet. Nothing to upload against yet either, this is the empty state
              on purpose, batch one wires up New Interview and Upload.
            </p>
          )}

          {projects && projects.length > 0 && (
            <ul className="mt-3 divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white">
              {projects.map((project) => (
                <li key={project.id} className="px-4 py-3">
                  <p className="text-sm font-medium text-neutral-900">{project.title}</p>
                  <p className="text-xs text-neutral-500">
                    {project.interviewee ?? "No interviewee set"} — {project.status}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
