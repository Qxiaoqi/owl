import {
  artifactNames,
  markStepCompleted,
  markStepStarted,
  readResumeTranslationDraft,
  readTextIfExists,
  resumeConfirmedPath,
  writeResumeTranslationReview,
} from "@/lib/analysis/artifacts";
import { requestJsonCompletion } from "@/lib/analysis/model-client";
import { ResumeTranslationReviewSchema } from "@/lib/analysis/schemas";
import type { CandidateAnalysisState } from "@/lib/analysis/state";

export async function evaluateResumeTranslationNode(state: CandidateAnalysisState) {
  const started = await markStepStarted(state, "evaluate_resume_translation", "正在质检中文简历翻译。");
  const resumeText = await readTextIfExists(resumeConfirmedPath(state.workspaceId, state.candidateId));
  const markdown = await readResumeTranslationDraft(state.workspaceId, state.candidateId);
  if (!resumeText.trim()) {
    throw new Error("Missing confirmed resume text.");
  }
  if (!markdown.trim()) {
    throw new Error("Missing resume translation draft.");
  }

  const review = await requestJsonCompletion([
    {
      role: "system",
      content:
        "你是招聘产品中的简历翻译质检员。只返回合法 JSON，不要 markdown，不要解释。你负责判断候选人简历的中文版 Markdown 是否适合直接展示给中文招聘用户。",
    },
    {
      role: "user",
      content: [
        "请质检下面的中文版简历 Markdown。",
        "判断标准：",
        "- 它应该是中文版简历，而不是英文简历。",
        "- 姓名、邮箱、学校/公司名称、论文标题、技术名词可以保留英文。",
        "- 教育、技能、工作经历、项目等栏目和普通经历描述应面向中文用户可读。",
        "- 不应遗漏原简历中的主要教育、论文/项目、技能、工作经历。",
        "- Markdown 应适合渲染为简历页面。",
        "",
        "返回 JSON 字段：",
        "- passed: 是否可直接展示。",
        "- score: 0-100。",
        "- issues: 具体问题列表。",
        "- revisionInstruction: 如果不通过，给修订节点的简短修订指令。",
        "",
        "原始简历：",
        resumeText,
        "",
        "中文版 Markdown 草稿：",
        markdown,
      ].join("\n"),
    },
  ], ResumeTranslationReviewSchema);

  await writeResumeTranslationReview(state.workspaceId, state.candidateId, review);
  const passed = review.passed && review.score >= 70;

  if (!passed && state.translationRevisionCount >= 1) {
    throw new Error(`中文简历翻译质检未通过：${review.issues.join("；") || "质量不足"}`);
  }

  return markStepCompleted(
    {
      ...started,
      translationReviewPassed: passed,
    },
    "evaluate_resume_translation",
    {
      resumeTranslationReview: `analysis/${artifactNames.resumeTranslationReview}`,
    },
  );
}
