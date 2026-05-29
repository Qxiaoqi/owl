import { AddCandidateFlow } from "@/components/candidates/add-candidate-flow";
import { BrandLink } from "@/components/navigation/brand-link";
import { Breadcrumbs } from "@/components/navigation/breadcrumbs";
import { TaskDrawer } from "@/components/tasks/task-drawer";
import { CandidateCardActions } from "@/components/workspaces/candidate-card-actions";
import { getWorkspace, listCandidates, type CandidateSummary } from "@/lib/persistence/domain";
import { LoaderCircle, UserRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export async function CandidateGridPage({ workspaceId }: { workspaceId: string }) {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) {
    notFound();
  }
  const candidates = await listCandidates(workspaceId);

  return (
    <div className="app-shell">
      <header className="sidebar">
        <BrandLink href="/" title={workspace.title} subtitle={`${workspace.status} · ${candidates.length} candidates`} />
        <div className="sidebar-actions">
          <TaskDrawer />
        </div>
      </header>

      <main className="main workspace-page">
        <Breadcrumbs items={[{ label: "JD", href: "/" }, { label: workspace.title }, { label: "候选人" }]} />
        <header className="page-header">
          <div>
            <h1 className="page-title">候选人</h1>
            <p className="page-description">添加新的候选人，或打开已有候选人的简历与面试分析结果。</p>
          </div>
          <div className="page-actions">
            <AddCandidateFlow workspaceId={workspace.id} />
          </div>
        </header>

        <section className="candidate-card-grid" aria-label="候选人列表">
          {candidates.length ? (
            candidates.map((candidate) => (
              <CandidateCard workspaceId={workspace.id} candidate={candidate} key={candidate.id} />
            ))
          ) : (
            <CandidateEmptyCard />
          )}
        </section>
      </main>
    </div>
  );
}

function CandidateEmptyCard() {
  return (
    <div className="candidate-card candidate-card-empty" aria-label="还没有候选人">
      <div className="candidate-avatar" aria-hidden="true">
        <UserRound size={28} />
      </div>
      <div className="candidate-card-body">
        <h2>还没有候选人</h2>
        <p>点击右上角“添加候选人”，上传一份简历后即可创建候选人分析任务。</p>
      </div>
      <div className="candidate-card-footer">
        <span className="badge">等待添加</span>
        <span className="badge">0 位候选人</span>
      </div>
    </div>
  );
}

function formatCandidateStatus(status: string) {
  const statusMap: Record<string, string> = {
    "resume uploaded": "资料已上传",
    analyzing: "分析中",
    "analysis ready": "分析完成",
    "analysis failed": "分析失败",
  };

  return statusMap[status] ?? status;
}

function CandidateCard({ workspaceId, candidate }: { workspaceId: string; candidate: CandidateSummary }) {
  const isAnalyzing = candidate.status === "analyzing";

  return (
    <article className="candidate-card">
      <CandidateCardActions
        apiPath={`/api/workspaces/${encodeURIComponent(workspaceId)}/candidates/${encodeURIComponent(candidate.id)}`}
        candidateName={candidate.name}
      />
      <Link className="candidate-card-link" href={`/workspaces/${workspaceId}/candidates/${candidate.id}`}>
        <div className="candidate-avatar" aria-hidden="true">
          <UserRound size={28} />
        </div>
        <div className="candidate-card-body">
          <h2>{candidate.name}</h2>
          <p>{candidate.title}</p>
          <p>{candidate.note}</p>
        </div>
      </Link>
      <div className="candidate-card-footer">
        <span className={`badge candidate-status-badge${isAnalyzing ? " analyzing" : ""}`}>
          {isAnalyzing ? <LoaderCircle size={13} aria-hidden="true" /> : null}
          {formatCandidateStatus(candidate.status)}
        </span>
        <span className="badge">{candidate.date}</span>
      </div>
    </article>
  );
}
