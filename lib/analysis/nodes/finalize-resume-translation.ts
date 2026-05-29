import {
  artifactNames,
  markStepCompleted,
  markStepStarted,
  readResumeTranslationDraft,
  writeResumeTranslation,
} from "@/lib/analysis/artifacts";
import type { CandidateAnalysisState } from "@/lib/analysis/state";

export async function finalizeResumeTranslationNode(state: CandidateAnalysisState) {
  const started = await markStepStarted(state, "finalize_resume_translation", "正在保存中文简历。");
  const markdown = await readResumeTranslationDraft(state.workspaceId, state.candidateId);
  if (!markdown.trim()) {
    throw new Error("Missing resume translation draft.");
  }

  await writeResumeTranslation(state.workspaceId, state.candidateId, markdown);
  return markStepCompleted(started, "finalize_resume_translation", {
    resumeTranslation: `analysis/${artifactNames.resumeTranslation}`,
  });
}
