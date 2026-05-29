import { JdAnalysisSchema, type JdAnalysis } from "@/lib/analysis/schemas";
import { requestJsonCompletion } from "@/lib/analysis/model-client";

export async function analyzeJdText(jdText: string): Promise<JdAnalysis> {
  return requestJsonCompletion(
    [
      {
        role: "system",
        content:
          "你是招聘 JD 解析器。只返回合法 JSON，不要 markdown，不要解释。字段必须包括 title, summary, mustHaveSkills, niceToHaveSkills, competencyModel, interviewFocus, evidence。除 JD 原文短引用 quote 和英文专有名词外，所有生成内容都使用简体中文。",
      },
      {
        role: "user",
        content: [
          "请解析下面的 JD，输出 JSON：",
          "{",
          '  "title": "岗位标题，尽量短，不要包含公司介绍或无关前缀",',
          '  "summary": "1-2 句话总结岗位职责和候选人画像",',
          '  "mustHaveSkills": ["必备能力或经验"],',
          '  "niceToHaveSkills": ["加分项"],',
          '  "competencyModel": [{"name": "能力项", "signals": ["可验证信号"], "weight": "high|medium|low"}],',
          '  "interviewFocus": ["面试时最需要验证的问题"],',
          '  "evidence": [{"source": "jd", "quote": "JD 原文短引用", "note": "为什么重要"}]',
          "}",
          "要求：",
          "- title、summary、mustHaveSkills、niceToHaveSkills、competencyModel、interviewFocus、evidence.note 都用简体中文表达。",
          "- 英文公司名、技术名词、产品名可以保留英文。",
          "- competencyModel.weight 只能使用 high、medium、low。",
          "- evidence.quote 必须保留 JD 原文短引用，不要翻译。",
          "",
          "JD 原文：",
          jdText,
        ].join("\n"),
      },
    ],
    JdAnalysisSchema,
  );
}
