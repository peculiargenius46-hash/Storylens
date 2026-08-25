import Link from "next/link";

type Props = {
  projectId: string;
  active: "overview" | "intelligence";
};

// Overview and Intelligence are live. The rest arrive in later batches and are
// shown greyed so the shape of the workspace is clear from the start (PRD §12).
const COMING = ["Quotes", "Ask", "Story Angles", "Story Studio"];

export default function WorkspaceNav({ projectId, active }: Props) {
  const linkBase = "text-sm pb-1 border-b-2 transition-colors";

  return (
    <nav className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-neutral-200">
      <Link
        href={`/projects/${projectId}`}
        className={`${linkBase} ${
          active === "overview"
            ? "border-neutral-900 font-medium text-neutral-900"
            : "border-transparent text-neutral-500 hover:text-neutral-900"
        }`}
      >
        Overview &amp; Transcript
      </Link>

      <Link
        href={`/projects/${projectId}/intelligence`}
        className={`${linkBase} ${
          active === "intelligence"
            ? "border-neutral-900 font-medium text-neutral-900"
            : "border-transparent text-neutral-500 hover:text-neutral-900"
        }`}
      >
        Intelligence
      </Link>

      {COMING.map((label) => (
        <span
          key={label}
          className={`${linkBase} cursor-not-allowed border-transparent text-neutral-300`}
          title="Arrives in a later batch"
        >
          {label}
        </span>
      ))}
    </nav>
  );
}
