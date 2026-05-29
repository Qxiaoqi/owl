import { readFile } from "node:fs/promises";
import {
  JdAnalysisSchema,
  QuestionTreeSchema,
  ResumeAnnotationsSchema,
  ResumeFitSchema,
  ResumeLanguageSchema,
  ResumeSourceLayoutSchema,
  ResumeTranslationLayoutSchema,
  ResumeTranslationReviewSchema,
  type JdAnalysis,
  type QuestionTree,
  type ResumeAnnotations,
  type ResumeFit,
  type ResumeLanguage,
  type ResumeSourceLayout,
  type ResumeTranslationLayout,
  type ResumeTranslationReview,
} from "@/lib/analysis/schemas";
import type { CandidateAnalysisState, CandidateAnalysisStep } from "@/lib/analysis/state";
import { readJson, workspacePath, writeJson, writeText } from "@/lib/persistence/files";

type CandidateJson = {
  id: string;
  name?: string;
  title?: string;
  status?: string;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
};

export const artifactNames = {
  analysisState: "analysis-state.json",
  jdAnalysis: "jd_analysis.json",
  resumeLanguage: "resume_language.json",
  resumeSourceLayout: "resume_source_layout.json",
  resumeTranslationLayout: "resume_translation_layout.json",
  resumeTranslationDraft: "resume_translation_draft.md",
  resumeTranslationReview: "resume_translation_review.json",
  resumeTranslation: "resume_translation.md",
  resumeFit: "resume_fit.json",
  resumeAnnotations: "resume_annotations.json",
  questionTree: "question_tree.json",
  reportData: "report-data.json",
} as const;

export function analysisPath(workspaceId: string, candidateId: string, fileName: string) {
  return workspacePath(workspaceId, "candidates", candidateId, "analysis", fileName);
}

export function candidateJsonPath(workspaceId: string, candidateId: string) {
  return workspacePath(workspaceId, "candidates", candidateId, "candidate.json");
}

export function jdAnalysisPath(workspaceId: string) {
  return workspacePath(workspaceId, "jd", "analysis.json");
}

export function jdConfirmedPath(workspaceId: string) {
  return workspacePath(workspaceId, "jd", "confirmed.md");
}

export function resumeConfirmedPath(workspaceId: string, candidateId: string) {
  return workspacePath(workspaceId, "candidates", candidateId, "materials", "resume", "confirmed.md");
}

export function resumeSourceLayoutPath(workspaceId: string, candidateId: string) {
  return workspacePath(workspaceId, "candidates", candidateId, "materials", "resume", "source_layout.json");
}

export function resumeSourcePdfPath(workspaceId: string, candidateId: string) {
  return workspacePath(workspaceId, "candidates", candidateId, "materials", "resume", "source.pdf");
}

export async function readTextIfExists(filePath: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

export async function readJsonIfExists<T>(filePath: string) {
  try {
    return await readJson<T>(filePath);
  } catch {
    return null;
  }
}

export async function updateCandidateStatus(
  workspaceId: string,
  candidateId: string,
  status: string,
  note: string,
) {
  const filePath = candidateJsonPath(workspaceId, candidateId);
  const candidate = await readJson<CandidateJson>(filePath);
  await writeJson(filePath, {
    ...candidate,
    status,
    note,
    updatedAt: new Date().toISOString(),
  });
}

export async function saveAnalysisState(state: CandidateAnalysisState) {
  await writeJson(
    analysisPath(state.workspaceId, state.candidateId, artifactNames.analysisState),
    state,
  );
}

export async function markStepStarted(
  state: CandidateAnalysisState,
  step: CandidateAnalysisStep,
  note: string,
) {
  const next = {
    ...state,
    status: "running" as const,
    currentStep: step,
  };
  await updateCandidateStatus(state.workspaceId, state.candidateId, "analyzing", note);
  await saveAnalysisState(next);
  return next;
}

export async function markStepCompleted(
  state: CandidateAnalysisState,
  step: CandidateAnalysisStep,
  patch: Partial<CandidateAnalysisState["artifacts"]> = {},
) {
  const next = {
    ...state,
    artifacts: {
      ...state.artifacts,
      ...patch,
    },
    completedSteps: state.completedSteps.includes(step)
      ? state.completedSteps
      : [...state.completedSteps, step],
  };
  await saveAnalysisState(next);
  return next;
}

export async function markAnalysisFailed(
  state: CandidateAnalysisState,
  step: CandidateAnalysisStep,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : "分析失败，请稍后重试。";
  const next = {
    ...state,
    status: "failed" as const,
    currentStep: step,
    errors: [
      ...state.errors,
      {
        step,
        message,
        retryable: true,
        at: new Date().toISOString(),
      },
    ],
  };
  await updateCandidateStatus(state.workspaceId, state.candidateId, "analysis failed", `${step} 失败：${message}`);
  await saveAnalysisState(next);
  return next;
}

export async function markAnalysisCompleted(state: CandidateAnalysisState) {
  const next = {
    ...state,
    status: "completed" as const,
    currentStep: undefined,
  };
  await updateCandidateStatus(state.workspaceId, state.candidateId, "analysis ready", "分析完成，可查看简历详情和报告。");
  await saveAnalysisState(next);
  return next;
}

export async function readJdAnalysis(workspaceId: string): Promise<JdAnalysis | null> {
  const data = await readJsonIfExists<unknown>(jdAnalysisPath(workspaceId));
  const parsed = JdAnalysisSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function writeJdAnalysis(workspaceId: string, analysis: JdAnalysis) {
  await writeJson(jdAnalysisPath(workspaceId), analysis);
}

export async function readResumeLanguage(workspaceId: string, candidateId: string): Promise<ResumeLanguage | null> {
  const data = await readJsonIfExists<unknown>(
    analysisPath(workspaceId, candidateId, artifactNames.resumeLanguage),
  );
  const parsed = ResumeLanguageSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function writeResumeLanguage(workspaceId: string, candidateId: string, language: ResumeLanguage) {
  await writeJson(analysisPath(workspaceId, candidateId, artifactNames.resumeLanguage), language);
}

export async function readResumeFit(workspaceId: string, candidateId: string): Promise<ResumeFit | null> {
  const data = await readJsonIfExists<unknown>(
    analysisPath(workspaceId, candidateId, artifactNames.resumeFit),
  );
  const parsed = ResumeFitSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function readResumeAnnotations(
  workspaceId: string,
  candidateId: string,
): Promise<ResumeAnnotations | null> {
  const data = await readJsonIfExists<unknown>(
    analysisPath(workspaceId, candidateId, artifactNames.resumeAnnotations),
  );
  const parsed = ResumeAnnotationsSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function readQuestionTree(workspaceId: string, candidateId: string): Promise<QuestionTree | null> {
  const data = await readJsonIfExists<unknown>(
    analysisPath(workspaceId, candidateId, artifactNames.questionTree),
  );
  const parsed = QuestionTreeSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function writeResumeTranslation(workspaceId: string, candidateId: string, markdown: string) {
  await writeText(analysisPath(workspaceId, candidateId, artifactNames.resumeTranslation), markdown);
}

export async function readResumeTranslation(workspaceId: string, candidateId: string) {
  return readTextIfExists(analysisPath(workspaceId, candidateId, artifactNames.resumeTranslation));
}

export async function readResumeSourceLayout(
  workspaceId: string,
  candidateId: string,
): Promise<ResumeSourceLayout | null> {
  const data =
    (await readJsonIfExists<unknown>(analysisPath(workspaceId, candidateId, artifactNames.resumeSourceLayout))) ??
    (await readJsonIfExists<unknown>(resumeSourceLayoutPath(workspaceId, candidateId)));
  const parsed = ResumeSourceLayoutSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function writeResumeSourceLayout(
  workspaceId: string,
  candidateId: string,
  layout: ResumeSourceLayout,
) {
  await writeJson(analysisPath(workspaceId, candidateId, artifactNames.resumeSourceLayout), layout);
}

export async function readResumeTranslationLayout(
  workspaceId: string,
  candidateId: string,
): Promise<ResumeTranslationLayout | null> {
  const data = await readJsonIfExists<unknown>(
    analysisPath(workspaceId, candidateId, artifactNames.resumeTranslationLayout),
  );
  const parsed = ResumeTranslationLayoutSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function writeResumeTranslationLayout(
  workspaceId: string,
  candidateId: string,
  layout: ResumeTranslationLayout,
) {
  await writeJson(analysisPath(workspaceId, candidateId, artifactNames.resumeTranslationLayout), layout);
}

export async function writeResumeTranslationDraft(workspaceId: string, candidateId: string, markdown: string) {
  await writeText(analysisPath(workspaceId, candidateId, artifactNames.resumeTranslationDraft), markdown);
}

export async function readResumeTranslationDraft(workspaceId: string, candidateId: string) {
  return readTextIfExists(analysisPath(workspaceId, candidateId, artifactNames.resumeTranslationDraft));
}

export async function writeResumeTranslationReview(
  workspaceId: string,
  candidateId: string,
  review: ResumeTranslationReview,
) {
  await writeJson(analysisPath(workspaceId, candidateId, artifactNames.resumeTranslationReview), review);
}

export async function readResumeTranslationReview(
  workspaceId: string,
  candidateId: string,
): Promise<ResumeTranslationReview | null> {
  const data = await readJsonIfExists<unknown>(
    analysisPath(workspaceId, candidateId, artifactNames.resumeTranslationReview),
  );
  const parsed = ResumeTranslationReviewSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}
