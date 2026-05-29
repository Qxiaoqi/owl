import {
  analysisPath,
  artifactNames,
  markStepCompleted,
  markStepStarted,
  readJdAnalysis,
  readResumeFit,
  readResumeTranslationLayout,
} from "@/lib/analysis/artifacts";
import { requestJsonCompletion } from "@/lib/analysis/model-client";
import { ResumeAnnotationsSchema } from "@/lib/analysis/schemas";
import type { CandidateAnalysisState } from "@/lib/analysis/state";
import { writeJson } from "@/lib/persistence/files";

export async function extractResumeAnnotationsNode(state: CandidateAnalysisState) {
  const started = await markStepStarted(state, "extract_resume_annotations", "正在提取简历证据标注。");
  const jd = await readJdAnalysis(state.workspaceId);
  const fit = await readResumeFit(state.workspaceId, state.candidateId);
  const layout = await readResumeTranslationLayout(state.workspaceId, state.candidateId);

  if (!jd) {
    throw new Error("Missing JD analysis.");
  }
  if (!fit) {
    throw new Error("Missing resume fit analysis.");
  }
  if (!layout?.blocks.length) {
    throw new Error("Missing resume translation layout.");
  }

  const annotations = await requestJsonCompletion(
    [
      {
        role: "system",
        content:
          "你是面试官的简历证据标注助手。只返回合法 JSON，不要 markdown，不要解释。标注必须绑定到输入中的 sourceBlockId。标注只表示证据类型，不生成面试问题。",
      },
      {
        role: "user",
        content: [
          "请输出 JSON：",
          "{",
          '  "annotations": [{"id": "a_1", "source": "resume", "sourceBlockId": "p1_b10", "page": 1, "targetText": "可高亮短文本", "displayText": "展示文本", "category": "strength|risk|concept|evidence", "title": "标注标题", "note": "证据解释", "linkedQuestionIds": [], "evidence": [{"source": "resume|jd", "quote": "原文短引用", "note": "解释"}]}]',
          "}",
          "要求：",
          "- 生成 6-12 个标注。",
          "- category 只能是 strength、risk、concept、evidence。",
          "- 不要使用 question 作为 category；追问由 question_tree 单独生成。",
          "- sourceBlockId 必须来自输入 blocks，不允许编造。",
          "- page 必须等于该 block 的 page。",
          "- targetText 必须是 sourceText 或 translatedText 中的短片段，不要跨 block。",
          "- displayText 面向用户展示，可用中文概括。",
          "- 优先标注 JD 强相关优势、风险缺口、关键技术概念和重要证据。",
          "",
          "JD 分析：",
          JSON.stringify(jd),
          "",
          "匹配分析：",
          JSON.stringify(fit),
          "",
          "简历 blocks：",
          JSON.stringify({
            blocks: layout.blocks.map((block) => ({
              sourceBlockId: block.sourceBlockId,
              page: block.page,
              type: block.type,
              sourceText: block.sourceText,
              translatedText: block.translatedText,
            })),
          }),
        ].join("\n"),
      },
    ],
    ResumeAnnotationsSchema,
  );

  await writeJson(
    analysisPath(state.workspaceId, state.candidateId, artifactNames.resumeAnnotations),
    annotations,
  );
  return markStepCompleted(started, "extract_resume_annotations", {
    resumeAnnotations: `analysis/${artifactNames.resumeAnnotations}`,
  });
}
