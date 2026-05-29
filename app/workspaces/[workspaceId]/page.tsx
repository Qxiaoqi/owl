import { CandidateGridPage } from "@/components/workspaces/candidate-grid-page";

export default async function WorkspacePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  return <CandidateGridPage workspaceId={workspaceId} />;
}
