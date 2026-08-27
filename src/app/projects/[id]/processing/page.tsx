import ProcessingView from "./processing-view";

export default async function ProcessingPage(
  props: PageProps<"/projects/[id]/processing">
) {
  const { id } = await props.params;
  const search = await props.searchParams;
  const recording = search?.recording;

  return (
    <ProcessingView
      projectId={id}
      recordingId={typeof recording === "string" ? recording : null}
    />
  );
}
