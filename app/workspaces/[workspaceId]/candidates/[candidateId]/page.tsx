import { CandidateDetailPage } from "@/components/candidates/candidate-detail-page";

export default async function CandidatePage({
  params,
}: {
  params: Promise<{ workspaceId: string; candidateId: string }>;
}) {
  const { workspaceId, candidateId } = await params;
  return <CandidateDetailPage workspaceId={workspaceId} candidateId={candidateId} />;
}
