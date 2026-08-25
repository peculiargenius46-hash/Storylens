import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfigurationError } from "@/lib/supabase/config";
import { getAllowance } from "@/lib/entitlements";
import UploadForm from "./upload-form";

export default async function UploadPage(props: PageProps<"/projects/[id]/upload">) {
  const { id } = await props.params;
  const configurationError = getSupabaseConfigurationError();

  if (configurationError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <p className="text-sm text-neutral-600">{configurationError}</p>
      </main>
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: project } = await supabase
    .from("projects")
    .select("id, title, interviewee")
    .eq("id", id)
    .maybeSingle();

  if (!project) notFound();

  const allowance = user ? await getAllowance(supabase, user.id) : null;

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-10">
      <div className="mx-auto max-w-xl">
        <Link href="/dashboard" className="text-sm text-neutral-500 underline">
          Back to dashboard
        </Link>

        <h1 className="mt-4 text-xl font-semibold text-neutral-900">
          Upload the recording
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          {project.title}
          {project.interviewee ? ` · ${project.interviewee}` : ""}
        </p>

        {allowance && (
          <p className="mt-3 text-sm text-neutral-600">
            Plan: {allowance.planCode}
            {allowance.remainingMinutes !== null
              ? ` · ${allowance.remainingMinutes} transcription minutes left this month`
              : ""}
          </p>
        )}

        <UploadForm
          projectId={project.id}
          remainingMinutes={allowance?.remainingMinutes ?? null}
        />
      </div>
    </main>
  );
}
