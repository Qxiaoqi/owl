import {
  artifactNames,
  markStepCompleted,
  markStepStarted,
  readTextIfExists,
  resumeConfirmedPath,
  writeResumeTranslationDraft,
} from "@/lib/analysis/artifacts";
import { requestMarkdownCompletion } from "@/lib/analysis/model-client";
import type { CandidateAnalysisState } from "@/lib/analysis/state";

function validateResumeTranslation(markdown: string) {
  const hasHeading = /^#{1,3}\s+/m.test(markdown);
  const hasList = /^[-*]\s+/m.test(markdown);
  if (markdown.trim().length < 120 || !hasHeading || !hasList) {
    throw new Error("Resume translation markdown did not pass quality checks.");
  }
}

async function requestResumeTranslationMarkdown(resumeText: string) {
  return requestMarkdownCompletion([
    {
      role: "system",
      content:
        "你是招聘场景的简历结构化助手。只输出 Markdown，不要 JSON，不要解释。忠实翻译和规整简历，不虚构。",
    },
    {
      role: "user",
      content: [
        "请把下面简历规整成中文版 Markdown。",
        "要求：",
        "- 保留姓名、联系方式、教育、论文/项目、技能、工作经历。",
        "- 使用二级标题和 bullet。",
        "- 保留关键英文专有名词、学校、公司、论文标题。",
        "- 不要输出代码块。",
        "",
        "简历原文：",
        resumeText,
      ].join("\n"),
    },
  ]);
}

export async function translateResumeNode(state: CandidateAnalysisState) {
  const started = await markStepStarted(state, "translate_resume", "正在生成结构化中文简历。");
  const resumeText = await readTextIfExists(resumeConfirmedPath(state.workspaceId, state.candidateId));
  if (!resumeText.trim()) {
    throw new Error("Missing confirmed resume text.");
  }

  let markdown = await requestResumeTranslationMarkdown(resumeText);
  try {
    validateResumeTranslation(markdown);
  } catch {
    markdown = await requestResumeTranslationMarkdown(resumeText);
    validateResumeTranslation(markdown);
  }

  await writeResumeTranslationDraft(state.workspaceId, state.candidateId, markdown);
  return markStepCompleted(started, "translate_resume", {
    resumeTranslationDraft: `analysis/${artifactNames.resumeTranslationDraft}`,
  });
}
