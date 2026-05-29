import {
  artifactNames,
  jdAnalysisPath,
  markStepCompleted,
  markStepStarted,
  readJdAnalysis,
  readTextIfExists,
  resumeConfirmedPath,
  analysisPath,
} from "@/lib/analysis/artifacts";
import { requestJsonCompletion } from "@/lib/analysis/model-client";
import { ResumeFitSchema } from "@/lib/analysis/schemas";
import type { CandidateAnalysisState } from "@/lib/analysis/state";
import { writeJson } from "@/lib/persistence/files";

export async function analyzeResumeFitNode(state: CandidateAnalysisState) {
  const started = await markStepStarted(state, "analyze_resume_fit", "正在分析简历与 JD 的匹配度。");
  const jd = await readJdAnalysis(state.workspaceId);
  if (!jd) {
    throw new Error(`Missing JD analysis at ${jdAnalysisPath(state.workspaceId)}.`);
  }

  const resumeText = await readTextIfExists(resumeConfirmedPath(state.workspaceId, state.candidateId));
  if (!resumeText.trim()) {
    throw new Error("Missing confirmed resume text.");
  }

  const fit = await requestJsonCompletion(
    [
      {
        role: "system",
        content:
          "你是招聘简历匹配分析器。只返回合法 JSON，不要 markdown，不要解释。只分析 JD 匹配、优势、风险和 gap，不要生成完整中文简历。",
      },
      {
        role: "user",
        content: [
          "请输出 JSON：",
          "{",
          '  "candidateName": "候选人姓名或 null",',
          '  "contact": {"email": "如有", "phone": "如有", "location": "如有"},',
          '  "headline": "一句话候选人画像",',
          '  "strengths": ["相对 JD 的优势"],',
          '  "risks": ["相对 JD 的风险或待验证点"],',
          '  "gaps": ["和 JD 要求相比的缺口"],',
          '  "mustHaveMatches": [{"requirement": "JD 必备项", "match": "strong|partial|weak|missing", "evidence": "简短依据"}],',
          '  "jdFit": {"score": 0-100, "summary": "匹配度解释"},',
          '  "evidence": [{"source": "resume|jd", "quote": "原文短引用", "note": "解释"}]',
          "}",
          "要求：数组每类最多 8 项，字段保持短句。",
          "",
          "JD 分析：",
          JSON.stringify(jd),
          "",
          "候选人简历：",
          resumeText,
        ].join("\n"),
      },
    ],
    ResumeFitSchema,
  );

  await writeJson(
    analysisPath(state.workspaceId, state.candidateId, artifactNames.resumeFit),
    fit,
  );
  return markStepCompleted(started, "analyze_resume_fit", {
    resumeFit: `analysis/${artifactNames.resumeFit}`,
  });
}
