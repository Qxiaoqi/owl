import { ResumeReview } from "@/components/candidates/resume-review";
import { BrandLink } from "@/components/navigation/brand-link";
import { Breadcrumbs } from "@/components/navigation/breadcrumbs";
import { TaskDrawer } from "@/components/tasks/task-drawer";
import {
  QuestionTreeSchema,
  ResumeAnnotationsSchema,
  ResumeLanguageSchema,
  ResumeTranslationLayoutSchema,
} from "@/lib/analysis/schemas";
import { getCandidate, getWorkspace } from "@/lib/persistence/domain";
import { readJson, workspacePath } from "@/lib/persistence/files";
import { FileText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

async function readResumeTranslationLayout(workspaceId: string, candidateId: string) {
  try {
    const data = await readJson<unknown>(
      workspacePath(workspaceId, "candidates", candidateId, "analysis", "resume_translation_layout.json"),
    );
    const parsed = ResumeTranslationLayoutSchema.safeParse(data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function readResumeAnnotations(workspaceId: string, candidateId: string) {
  try {
    const data = await readJson<unknown>(
      workspacePath(workspaceId, "candidates", candidateId, "analysis", "resume_annotations.json"),
    );
    const parsed = ResumeAnnotationsSchema.safeParse(data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function readQuestionTree(workspaceId: string, candidateId: string) {
  try {
    const data = await readJson<unknown>(
      workspacePath(workspaceId, "candidates", candidateId, "analysis", "question_tree.json"),
    );
    const parsed = QuestionTreeSchema.safeParse(data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function shouldShowTranslation(workspaceId: string, candidateId: string) {
  try {
    const data = await readJson<unknown>(
      workspacePath(workspaceId, "candidates", candidateId, "analysis", "resume_language.json"),
    );
    const parsed = ResumeLanguageSchema.safeParse(data);
    return parsed.success ? parsed.data.shouldTranslate : true;
  } catch {
    return true;
  }
}

type SourceMeta = {
  fileName: string;
  mimeType: string;
  sourceName: string;
  size: number;
};

async function readResumeSource(workspaceId: string, candidateId: string) {
  try {
    const meta = await readJson<SourceMeta>(
      workspacePath(workspaceId, "candidates", candidateId, "materials", "resume", "source.json"),
    );
    return {
      fileName: meta.fileName,
      mimeType: meta.mimeType,
      url: `/api/materials/source?workspaceId=${encodeURIComponent(workspaceId)}&candidateId=${encodeURIComponent(candidateId)}&kind=resume`,
    };
  } catch {
    return undefined;
  }
}

export async function CandidateDetailPage({
  workspaceId,
  candidateId,
}: {
  workspaceId: string;
  candidateId: string;
}) {
  const workspace = await getWorkspace(workspaceId);
  const candidate = await getCandidate(workspaceId, candidateId);
  if (!workspace || !candidate) {
    notFound();
  }
  const resumeTranslationLayout = await readResumeTranslationLayout(workspaceId, candidateId);
  const resumeAnnotations = await readResumeAnnotations(workspaceId, candidateId);
  const questionTree = await readQuestionTree(workspaceId, candidateId);
  const showTranslation = await shouldShowTranslation(workspaceId, candidateId);
  const resumeSource = await readResumeSource(workspaceId, candidateId);

  return (
    <div className="app-shell">
      <header className="sidebar">
        <BrandLink href={`/workspaces/${workspace.id}`} title={candidate.name} subtitle={workspace.title} />
        <div className="top-meta">
          <Link className="button primary" href={`/workspaces/${workspace.id}/candidates/${candidate.id}/report`}>
            <FileText size={16} />
            详细报告
          </Link>
          <TaskDrawer />
        </div>
      </header>

      <main className="main resume-detail-main">
        <Breadcrumbs
          items={[
            { label: "JD", href: "/" },
            { label: workspace.title, href: `/workspaces/${workspace.id}` },
            { label: candidate.name },
            { label: "简历" },
          ]}
        />
        <ResumeReview
          candidateName={candidate.name}
          resumeText={candidate.resumeText}
          translationLayout={resumeTranslationLayout}
          annotations={resumeAnnotations?.annotations ?? []}
          questions={questionTree?.questions ?? []}
          showTranslation={showTranslation}
          resumeSource={resumeSource}
        />
      </main>
    </div>
  );
}
