import {
  artifactNames,
  markStepCompleted,
  markStepStarted,
  readTextIfExists,
  resumeConfirmedPath,
  writeResumeLanguage,
} from "@/lib/analysis/artifacts";
import { requestJsonCompletion } from "@/lib/analysis/model-client";
import { ResumeLanguageSchema, type ResumeLanguage } from "@/lib/analysis/schemas";
import type { CandidateAnalysisState } from "@/lib/analysis/state";

function countMatches(text: string, pattern: RegExp) {
  return text.match(pattern)?.length ?? 0;
}

function localDetectResumeLanguage(text: string): ResumeLanguage | null {
  const cjk = countMatches(text, /[\u3400-\u9fff]/g);
  const latin = countMatches(text, /[A-Za-z]/g);
  const effective = cjk + latin;
  const chineseRatio = effective ? cjk / effective : 0;
  const latinRatio = effective ? latin / effective : 0;

  if (effective < 80) {
    return {
      language: "unknown",
      confidence: 0.25,
      chineseRatio,
      latinRatio,
      shouldTranslate: true,
      reason: "有效文本过短，默认进入翻译链路。",
    };
  }

  if (cjk >= 80 && chineseRatio >= 0.2) {
    return {
      language: latinRatio >= 0.25 ? "mixed" : "zh",
      confidence: Math.min(0.98, 0.75 + chineseRatio),
      chineseRatio,
      latinRatio,
      shouldTranslate: false,
      reason: "中文字符占比足够，判断为中文或中文主导简历。",
    };
  }

  if (chineseRatio < 0.05 && latinRatio >= 0.35) {
    return {
      language: "en",
      confidence: Math.min(0.98, 0.75 + latinRatio * 0.2),
      chineseRatio,
      latinRatio,
      shouldTranslate: true,
      reason: "英文字符占主导，进入中文翻译链路。",
    };
  }

  return null;
}

async function modelDetectResumeLanguage(text: string, chineseRatio: number, latinRatio: number) {
  return requestJsonCompletion([
    {
      role: "system",
      content: "你是招聘系统的简历语言分类器。只返回合法 JSON，不要解释，不要 markdown。",
    },
    {
      role: "user",
      content: [
        "判断下面简历是否需要翻译成中文。",
        "规则：中文或中文主导简历 shouldTranslate=false；英文主导简历 shouldTranslate=true。",
        "返回字段：language(zh/en/mixed/unknown), confidence(0-1), shouldTranslate, reason。",
        `本地统计 chineseRatio=${chineseRatio.toFixed(4)}, latinRatio=${latinRatio.toFixed(4)}`,
        "",
        text.slice(0, 4000),
      ].join("\n"),
    },
  ], ResumeLanguageSchema);
}

export async function detectResumeLanguageNode(state: CandidateAnalysisState) {
  const started = await markStepStarted(state, "detect_resume_language", "正在判断简历语言。");
  const resumeText = await readTextIfExists(resumeConfirmedPath(state.workspaceId, state.candidateId));
  if (!resumeText.trim()) {
    throw new Error("Missing confirmed resume text.");
  }

  const cjk = countMatches(resumeText, /[\u3400-\u9fff]/g);
  const latin = countMatches(resumeText, /[A-Za-z]/g);
  const effective = cjk + latin;
  const chineseRatio = effective ? cjk / effective : 0;
  const latinRatio = effective ? latin / effective : 0;
  let result = localDetectResumeLanguage(resumeText);

  if (!result) {
    try {
      result = await modelDetectResumeLanguage(resumeText, chineseRatio, latinRatio);
      result = {
        ...result,
        chineseRatio,
        latinRatio,
      };
    } catch {
      result = {
        language: "unknown",
        confidence: 0.35,
        chineseRatio,
        latinRatio,
        shouldTranslate: true,
        reason: "语言分类模型不可用，默认进入翻译链路。",
      };
    }
  }

  await writeResumeLanguage(state.workspaceId, state.candidateId, result);
  return markStepCompleted({
    ...started,
    resumeShouldTranslate: result.shouldTranslate,
  }, "detect_resume_language", {
    resumeLanguage: `analysis/${artifactNames.resumeLanguage}`,
  });
}
