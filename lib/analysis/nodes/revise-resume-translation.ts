import {
  artifactNames,
  markStepCompleted,
  markStepStarted,
  readResumeTranslationDraft,
  readResumeTranslationReview,
  readTextIfExists,
  resumeConfirmedPath,
  writeResumeTranslationDraft,
} from "@/lib/analysis/artifacts";
import { requestMarkdownCompletion } from "@/lib/analysis/model-client";
import type { CandidateAnalysisState } from "@/lib/analysis/state";

function validateRevision(markdown: string) {
  if (markdown.trim().length < 120 || !/^#{1,3}\s+/m.test(markdown) || !/^[-*]\s+/m.test(markdown)) {
    throw new Error("Revised resume translation markdown did not pass basic checks.");
  }
}

export async function reviseResumeTranslationNode(state: CandidateAnalysisState) {
  const started = await markStepStarted(state, "revise_resume_translation", "正在根据质检结果修订中文简历。");
  const resumeText = await readTextIfExists(resumeConfirmedPath(state.workspaceId, state.candidateId));
  const markdown = await readResumeTranslationDraft(state.workspaceId, state.candidateId);
  const review = await readResumeTranslationReview(state.workspaceId, state.candidateId);
  if (!resumeText.trim()) {
    throw new Error("Missing confirmed resume text.");
  }
  if (!markdown.trim()) {
    throw new Error("Missing resume translation draft.");
  }
  if (!review) {
    throw new Error("Missing resume translation review.");
  }

  const revised = await requestMarkdownCompletion([
    {
      role: "system",
      content:
        "你是招聘场景的简历结构化助手。只输出 Markdown，不要 JSON，不要解释。根据质检意见修订中文版简历，忠实翻译和规整简历，不虚构。",
    },
    {
      role: "user",
      content: [
        "请根据质检意见修订下面的中文版 Markdown。",
        "要求：",
        "- 保留姓名、联系方式、教育、论文/项目、技能、工作经历。",
        "- 使用二级标题和 bullet。",
        "- 保留关键英文专有名词、学校、公司、论文标题。",
        "- 不要输出代码块。",
        "",
        "质检意见：",
        review.revisionInstruction || review.issues.join("；") || "请提升中文可读性和完整性。",
        "",
        "原始简历：",
        resumeText,
        "",
        "待修订 Markdown：",
        markdown,
      ].join("\n"),
    },
  ]);

  validateRevision(revised);
  await writeResumeTranslationDraft(state.workspaceId, state.candidateId, revised);

  return markStepCompleted(
    {
      ...started,
      translationReviewPassed: false,
      translationRevisionCount: state.translationRevisionCount + 1,
    },
    "revise_resume_translation",
    {
      resumeTranslationDraft: `analysis/${artifactNames.resumeTranslationDraft}`,
    },
  );
}
