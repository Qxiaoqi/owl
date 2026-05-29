import {
  analysisPath,
  artifactNames,
  markStepCompleted,
  markStepStarted,
  readJdAnalysis,
  readResumeAnnotations,
  readResumeFit,
  readResumeSourceLayout,
  readTextIfExists,
  resumeConfirmedPath,
} from "@/lib/analysis/artifacts";
import { requestJsonCompletion } from "@/lib/analysis/model-client";
import { QuestionTreeSchema } from "@/lib/analysis/schemas";
import type { CandidateAnalysisState } from "@/lib/analysis/state";
import { writeJson } from "@/lib/persistence/files";

export async function buildQuestionTreeNode(state: CandidateAnalysisState) {
  const started = await markStepStarted(state, "build_question_tree", "正在生成面试问题树。");
  const jd = await readJdAnalysis(state.workspaceId);
  const fit = await readResumeFit(state.workspaceId, state.candidateId);
  const annotations = await readResumeAnnotations(state.workspaceId, state.candidateId);

  if (!jd) {
    throw new Error("Missing JD analysis.");
  }
  if (!fit) {
    throw new Error("Missing resume fit analysis.");
  }
  if (!annotations) {
    throw new Error("Missing resume annotations.");
  }
  const resumeText = await readTextIfExists(resumeConfirmedPath(state.workspaceId, state.candidateId));
  if (!resumeText.trim()) {
    throw new Error("Missing confirmed resume text.");
  }
  const resumeLayout = await readResumeSourceLayout(state.workspaceId, state.candidateId);
  if (!resumeLayout?.blocks.length) {
    throw new Error("Missing resume source layout blocks.");
  }
  const resumeBlocks = resumeLayout.blocks.map((block) => ({
    id: block.id,
    page: block.page,
    type: block.type,
    text: block.text,
  }));

  const questionTree = await requestJsonCompletion(
    [
      {
        role: "system",
        content:
          "你是技术面试问题树生成器。只返回合法 JSON，不要 markdown，不要解释。问题要帮助面试官尽可能理解候选人的真实能力、项目深度、决策方式、协作方式、成长潜力和岗位匹配度。不要把所有问题都强行往 JD 匹配上靠。",
      },
      {
        role: "user",
        content: [
          "请输出 JSON：",
          "{",
          '  "questions": [{"id": "q_1", "topic": "主题", "source": "resume|jd", "questionType": "project_deep_dive|jd_fit|risk_check", "sourceBlockId": "简历块 id", "linkedAnnotationIds": ["可选关联标注 id"], "question": "主问题", "purpose": "验证目的", "goodAnswer": "好回答特征", "goodAnswerExample": "好的回答例子", "weakAnswerSignals": ["弱回答信号"], "followUps": ["追问"], "evidence": ["依据"]}]',
          "}",
          "要求：生成一组供面试官选择的问题库，通常 12-28 个高价值主问题；数量不是硬目标，如果简历中的项目/经历较多，可以超过 28 个，但必须避免重复、空泛和低价值问题；每个字段用短句。",
          "锚点要求：sourceBlockId 是问题在原始 PDF 简历上的唯一直接显示位置，必须来自“简历块列表”的 id；中文翻译页只用于阅读，不承载定位。每个问题只能给 1 个 sourceBlockId，优先绑定到原文 PDF 中该经历标题行、项目标题行或最能代表问题依据的关键 bullet 行；不要为了表达多个依据绑定多个块，其他依据写入 evidence 或 followUps。linkedAnnotationIds 只是可选证据关联，不决定显示位置，可以为空。",
          "问题生成采用双主线，不允许所有问题都围绕 JD 匹配：A 项目/经历深挖；B JD 匹配验证。",
          "项目/经历深挖问题 questionType=project_deep_dive，至少占主问题的 65%。它们必须直接围绕候选人简历中的具体项目、经历、职责和结果展开，不要求和 JD 强相关。目标是判断真实参与度、ownership、技术深度、方案选择、关键取舍、复杂问题处理、协作方式、结果影响和复盘能力。",
          "JD 匹配验证问题 questionType=jd_fit，用于验证岗位关键能力、能力迁移、缺口和岗位风险，但不能覆盖全部问题。",
          "风险核验问题 questionType=risk_check，用于验证简历中描述模糊、成果可疑、职责边界不清、时间线或能力证据不足的地方。",
          "必须先在内部识别候选人简历全文中的所有经历锚点：工作经历、实习经历、研究经历、课程/项目经历、开源/论文/竞赛、重要个人项目。不要只看简历标注，因为标注可能集中在少数项目。",
          "覆盖要求：对每个有信息量的经历锚点至少生成 1 个 project_deep_dive 主问题，除非该锚点只有职位/标题没有可追问信息，或与另一个锚点高度重复。一个经历锚点只要包含项目目标、职责、技术栈、结果指标、业务影响、研究方法或产出之一，就算有信息量。",
          "分布约束：任何单一经历锚点最多生成 3 个主问题，除非所有其他有信息量的锚点都已经被覆盖。不要因为某个项目与 JD 最相关，就把多数问题集中在它上面。",
          "生成顺序：1 先为每个有信息量的经历锚点各生成 1 个覆盖问题；2 再对信息量特别高、复杂度高或候选人声称贡献大的锚点补第 2-3 个主问题；3 最后补充 jd_fit 和 risk_check 问题。",
          "高质量项目/经历即使不是 JD 最直接匹配点，也必须生成用于深挖 ownership、技术判断、业务结果和复盘能力的问题。面试官会自行选择要问的问题，不要因为总量控制而漏掉有信息量的经历。",
          "如果一个问题只是把项目经历强行改写成 JD 能力验证，而没有追问项目本身的背景、职责、难点、方案、取舍或结果，则视为低质量问题，不要生成。",
          "去重要求：不要生成只换说法的问题；同一锚点的相似问题应合并，细节放到 followUps；低信息量经历可以跳过，但不要跳过包含明确项目目标、职责、技术、结果或影响的经历。",
          "审计要求：每个 project_deep_dive 问题的 topic 必须包含具体经历锚点名称，例如“AWS RiskLens AI 实习”“Santa Clara EHR 研究助理”“Goal-Conditioned Maze 项目”；evidence 数组第一项必须写“经历锚点：<名称>”，第二项必须写“绑定块：<sourceBlockId>”。",
          "如果某个经历锚点没有对应问题，你必须能用 evidence 或 purpose 体现跳过原因；但不要为了减少问题数而跳过有内容的经历。",
          "goodAnswer 写评价特征，不要写成完整答案。",
          "goodAnswerExample 写一段候选人可参考的好回答示例，要具体、有业务/技术细节、不过度虚构。",
          "followUps 以 5 个为目标，但质量优先；如果没有足够有价值的深入方向，可以少于 5 个，不能为了凑数生成空泛问题。",
          "followUps 需要层层深入：后一个追问应基于前一个回答继续挖掘事实、细节、判断、边界、结果或复盘，不要求固定覆盖某几个方面。",
          "",
          "JD 分析：",
          JSON.stringify(jd),
          "",
          "候选人完整简历：",
          resumeText,
          "",
          "简历块列表（sourceBlockId 只能从这里选择）：",
          JSON.stringify(resumeBlocks),
          "",
          "匹配分析：",
          JSON.stringify(fit),
          "",
          "简历标注：",
          JSON.stringify(annotations),
        ].join("\n"),
      },
    ],
    QuestionTreeSchema,
  );

  await writeJson(
    analysisPath(state.workspaceId, state.candidateId, artifactNames.questionTree),
    questionTree,
  );
  return markStepCompleted(started, "build_question_tree", {
    questionTree: `analysis/${artifactNames.questionTree}`,
  });
}
