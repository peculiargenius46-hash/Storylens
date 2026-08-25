import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
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
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-700">Your interviews</h2>
            <Link
              href="/new"
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
            >
              + New Interview
            </Link>
          </div>

          {(!projects || projects.length === 0) && (
            <p className="mt-3 text-sm text-neutral-500">No interviews yet.</p>
          )}

          {projects && projects.length > 0 && (
            <ul className="mt-3 divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white">
              {projects.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}/upload`}
                    className="block px-4 py-3 hover:bg-neutral-50"
                  >
                    <p className="text-sm font-medium text-neutral-900">{project.title}</p>
                    <p className="text-xs text-neutral-500">
                      {project.interviewee ?? "No interviewee set"} — {project.status}
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
