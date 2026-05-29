import {
  artifactNames,
  markStepCompleted,
  markStepStarted,
  readResumeSourceLayout,
  resumeSourcePdfPath,
  writeResumeTranslationLayout,
} from "@/lib/analysis/artifacts";
import { requestJsonCompletion } from "@/lib/analysis/model-client";
import { ResumeBlockTranslationsSchema, type ResumeTranslationLayout } from "@/lib/analysis/schemas";
import type { CandidateAnalysisState } from "@/lib/analysis/state";
import { access } from "node:fs/promises";

const blocksPerRequest = 40;

type SourceBlock = NonNullable<Awaited<ReturnType<typeof readResumeSourceLayout>>>["blocks"][number];

async function hasSourcePdf(workspaceId: string, candidateId: string) {
  try {
    await access(resumeSourcePdfPath(workspaceId, candidateId));
    return true;
  } catch {
    return false;
  }
}

function hasChinese(text: string) {
  return /[\u3400-\u9fff]/.test(text);
}

function shouldTranslateToChinese(block: SourceBlock) {
  if (block.type === "name" || block.type === "contact") {
    return false;
  }
  return /[A-Za-z]{3,}/.test(block.text);
}

function validateChineseTranslation(sourceBlocks: SourceBlock[], translatedBlocks: Array<{ sourceBlockId: string; translatedText: string }>) {
  const translatedById = new Map(translatedBlocks.map((block) => [block.sourceBlockId, block.translatedText.trim()]));
  const missing = sourceBlocks.filter((block) => !translatedById.has(block.id));
  if (missing.length) {
    throw new Error(`坐标化翻译缺少 ${missing.length} 个 block。`);
  }

  const requiredChineseBlocks = sourceBlocks.filter(shouldTranslateToChinese);
  const chineseBlocks = requiredChineseBlocks.filter((block) => hasChinese(translatedById.get(block.id) ?? ""));
  const sectionBlocks = sourceBlocks.filter((block) => block.type === "section");
  const chineseSections = sectionBlocks.filter((block) => hasChinese(translatedById.get(block.id) ?? ""));

  if (sectionBlocks.length && chineseSections.length < Math.ceil(sectionBlocks.length * 0.6)) {
    throw new Error("坐标化翻译质量不合格：大部分 section 标题仍是英文。");
  }
  if (requiredChineseBlocks.length >= 6 && chineseBlocks.length < Math.ceil(requiredChineseBlocks.length * 0.35)) {
    throw new Error("坐标化翻译质量不合格：中文内容比例过低。");
  }

  return translatedById;
}

async function requestLayoutTranslation(sourceBlocks: SourceBlock[], retryReason?: string) {
  return requestJsonCompletion([
    {
      role: "system",
      content: [
        "你是招聘场景的中文简历翻译助手。",
        "只返回合法 JSON，不要 markdown，不要解释。",
        "必须把每个 block 的 translatedText 翻译成简体中文。",
        "姓名、邮箱、学校/公司名称、论文标题、技术栈名称可以保留英文。",
        "英文 section heading 必须翻译，例如 Education -> 教育，Publication -> 论文，Skills -> 技能，Work Experiences -> 工作经历。",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        retryReason ? `上一版不合格：${retryReason}` : "请把下面 PDF 简历版式 block 翻译成中文。",
        "要求：",
        "- sourceBlockId 必须原样返回。",
        "- 每个输入 block 都必须返回一个对应条目。",
        "- translatedText 面向中文招聘用户可读，不能整段照抄英文。",
        "- 不要新增、删除、合并 block。",
        "",
        JSON.stringify({
          blocks: sourceBlocks.map((block) => ({
            sourceBlockId: block.id,
            type: block.type,
            text: block.text,
          })),
        }),
      ].join("\n"),
    },
  ], ResumeBlockTranslationsSchema);
}

async function translateBlocks(sourceBlocks: SourceBlock[]) {
  const translationById = new Map<string, string>();

  for (let index = 0; index < sourceBlocks.length; index += blocksPerRequest) {
    const chunk = sourceBlocks.slice(index, index + blocksPerRequest);
    let translated = await requestLayoutTranslation(chunk);
    let chunkTranslations: Map<string, string>;
    try {
      chunkTranslations = validateChineseTranslation(chunk, translated.blocks);
    } catch (error) {
      translated = await requestLayoutTranslation(chunk, error instanceof Error ? error.message : "中文比例过低");
      chunkTranslations = validateChineseTranslation(chunk, translated.blocks);
    }

    for (const [sourceBlockId, translatedText] of chunkTranslations.entries()) {
      translationById.set(sourceBlockId, translatedText);
    }
  }

  return translationById;
}

export async function translateResumeLayoutNode(state: CandidateAnalysisState) {
  const started = await markStepStarted(state, "translate_resume_layout", "正在生成坐标化中文简历。");
  const sourceLayout = await readResumeSourceLayout(state.workspaceId, state.candidateId);
  if (!sourceLayout) {
    if (await hasSourcePdf(state.workspaceId, state.candidateId)) {
      throw new Error("PDF 简历版式产物缺失，无法生成坐标化中文简历。");
    }
    return markStepCompleted(started, "translate_resume_layout", {});
  }

  const sourceBlocks = sourceLayout.blocks;
  const translationById = await translateBlocks(sourceBlocks);

  const layout: ResumeTranslationLayout = {
    pages: sourceLayout.pages,
    blocks: sourceBlocks.map((block) => ({
      id: `tr_${block.id}`,
      sourceBlockId: block.id,
      page: block.page,
      type: block.type,
      sourceText: block.text,
      translatedText: translationById.get(block.id) ?? block.text,
      box: block.box,
      fontSize: block.fontSize,
    })),
  };

  await writeResumeTranslationLayout(state.workspaceId, state.candidateId, layout);
  return markStepCompleted(started, "translate_resume_layout", {
    resumeTranslationLayout: `analysis/${artifactNames.resumeTranslationLayout}`,
  });
}
