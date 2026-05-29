import { BrandLink } from "@/components/navigation/brand-link";
import { Breadcrumbs } from "@/components/navigation/breadcrumbs";
import { ReportShell } from "@/components/report/report-shell";
import { TaskDrawer } from "@/components/tasks/task-drawer";
import {
  JdAnalysisSchema,
  QuestionTreeSchema,
  ResumeAnnotationsSchema,
  ResumeFitSchema,
} from "@/lib/analysis/schemas";
import { buildReportData } from "@/lib/report/build-report-data";
import { getCandidate, getWorkspace } from "@/lib/persistence/domain";
import { readJson, workspacePath } from "@/lib/persistence/files";
import { readFile } from "node:fs/promises";
import { notFound } from "next/navigation";

async function readParsedJson<T>(filePath: string, schema: { safeParse: (data: unknown) => { success: true; data: T } | { success: false } }) {
  try {
    const data = await readJson<unknown>(filePath);
    const parsed = schema.safeParse(data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
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

async function readResumeTranslation(workspaceId: string, candidateId: string) {
  try {
    return await readFile(
      workspacePath(workspaceId, "candidates", candidateId, "analysis", "resume_translation.md"),
      "utf8",
    );
  } catch {
    return "";
  }
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ workspaceId: string; candidateId: string }>;
}) {
  const { workspaceId, candidateId } = await params;
  const workspace = await getWorkspace(workspaceId);
  const candidate = await getCandidate(workspaceId, candidateId);
  if (!workspace || !candidate) {
    notFound();
  }
  const jdAnalysis = await readParsedJson(workspacePath(workspace.id, "jd", "analysis.json"), JdAnalysisSchema);
  const resumeFit = await readParsedJson(
    workspacePath(workspace.id, "candidates", candidate.id, "analysis", "resume_fit.json"),
    ResumeFitSchema,
  );
  const resumeAnnotations = await readParsedJson(
    workspacePath(workspace.id, "candidates", candidate.id, "analysis", "resume_annotations.json"),
    ResumeAnnotationsSchema,
  );
  const questionTree = await readParsedJson(
    workspacePath(workspace.id, "candidates", candidate.id, "analysis", "question_tree.json"),
    QuestionTreeSchema,
  );
  const resumeTranslation = await readResumeTranslation(workspace.id, candidate.id);
  const candidateAnalysis = resumeFit ? { ...resumeFit, annotations: resumeAnnotations?.annotations ?? [] } : null;
  const report = buildReportData({
    workspaceId,
    candidateId,
    jd: jdAnalysis ?? {
      title: workspace.title,
      summary: workspace.description,
    },
    candidate: candidateAnalysis ?? {
      candidateName: candidate.name,
      headline: candidate.note,
      jdFit: { score: "N/A", summary: "等待真实分析产物。" },
      risks: [],
    },
    paper: { papers: [], annotations: [] },
    questionTree: questionTree ?? { questions: [] },
    resumeTranslation,
    confirmedResumeText: candidate.resumeText,
  });

  return (
    <div className="app-shell">
      <header className="sidebar">
        <BrandLink href={`/workspaces/${workspace.id}/candidates/${candidate.id}`} title={candidate.name} subtitle={workspace.title} />
        <div className="top-meta">
          <TaskDrawer />
          <span className="badge">{formatCandidateStatus(candidate.status)}</span>
          <span className="badge">{candidate.date}</span>
        </div>
      </header>

      <main className="main report-detail-main">
        <Breadcrumbs
          items={[
            { label: "JD", href: "/" },
            { label: workspace.title, href: `/workspaces/${workspace.id}` },
            { label: candidate.name, href: `/workspaces/${workspace.id}/candidates/${candidate.id}` },
            { label: "报告" },
          ]}
        />
        <ReportShell report={report} />
      </main>
    </div>
  );
}
