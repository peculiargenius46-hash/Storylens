import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-6 text-center">
      <div className="max-w-xl">
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
          Turn Conversations Into Compelling Stories
        </h1>
        <p className="mt-4 text-base text-neutral-600">
          Upload an interview. StoryLens finds the moments, quotes, insights and stories
          hidden inside it.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/signup"
            className="w-full rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 sm:w-auto"
          >
            Upload Your First Interview
          </Link>
          <Link
            href="/login"
            className="w-full rounded-md border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 sm:w-auto"
          >
            Log in
          </Link>
        </div>

        <p className="mt-4 text-xs text-neutral-400">No payment card required for a Free account.</p>
      </div>
    </main>
  );
}
