import {
  artifactNames,
  markStepCompleted,
  markStepStarted,
  readResumeSourceLayout,
  readTextIfExists,
  resumeConfirmedPath,
  writeResumeTranslation,
  writeResumeTranslationLayout,
} from "@/lib/analysis/artifacts";
import type { ResumeTranslationLayout } from "@/lib/analysis/schemas";
import type { CandidateAnalysisState } from "@/lib/analysis/state";

const SYNTHETIC_PAGE = {
  width: 595,
  height: 842,
};

function chunkLine(line: string) {
  const characters = Array.from(line.trim());
  const chunks: string[] = [];
  const chunkSize = 42;
  for (let index = 0; index < characters.length; index += chunkSize) {
    chunks.push(characters.slice(index, index + chunkSize).join(""));
  }
  return chunks.length ? chunks : [line.trim()];
}

function buildSyntheticTranslationLayout(resumeText: string): ResumeTranslationLayout {
  const blocks: ResumeTranslationLayout["blocks"] = [];
  const pages: ResumeTranslationLayout["pages"] = [{ page: 1, ...SYNTHETIC_PAGE }];
  let page = 1;
  let y = 44;
  let blockIndex = 1;

  for (const rawLine of resumeText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      y += 10;
      continue;
    }

    for (const text of chunkLine(line)) {
      if (y > SYNTHETIC_PAGE.height - 48) {
        page += 1;
        pages.push({ page, ...SYNTHETIC_PAGE });
        y = 44;
      }

      const type = blockIndex === 1 ? "name" : /^[#【\[]|^[一二三四五六七八九十]+[、.]/.test(text) ? "section" : "line";
      blocks.push({
        id: `tr_txt_${page}_${blockIndex}`,
        sourceBlockId: `txt_${page}_${blockIndex}`,
        page,
        type,
        sourceText: text,
        translatedText: text,
        box: {
          x: 48,
          y,
          width: SYNTHETIC_PAGE.width - 96,
          height: type === "name" ? 22 : 18,
        },
        fontSize: type === "name" ? 18 : type === "section" ? 13 : 11,
      });
      y += type === "name" ? 28 : type === "section" ? 24 : 21;
      blockIndex += 1;
    }
  }

  return { pages, blocks };
}

export async function useOriginalResumeNode(state: CandidateAnalysisState) {
  const started = await markStepStarted(
    state,
    "use_original_resume",
    "简历为中文，跳过翻译。",
  );
  const resumeText = await readTextIfExists(
    resumeConfirmedPath(state.workspaceId, state.candidateId),
  );
  if (!resumeText.trim()) {
    throw new Error("Missing confirmed resume text.");
  }

  await writeResumeTranslation(
    state.workspaceId,
    state.candidateId,
    resumeText,
  );

  const sourceLayout = await readResumeSourceLayout(
    state.workspaceId,
    state.candidateId,
  );
  const patch: Partial<CandidateAnalysisState["artifacts"]> = {
    resumeTranslation: `analysis/${artifactNames.resumeTranslation}`,
  };

  const layout: ResumeTranslationLayout = sourceLayout
    ? {
        pages: sourceLayout.pages,
        blocks: sourceLayout.blocks.map((block) => ({
          id: `tr_${block.id}`,
          sourceBlockId: block.id,
          page: block.page,
          type: block.type,
          sourceText: block.text,
          translatedText: block.text,
          box: block.box,
          fontSize: block.fontSize,
        })),
      }
    : buildSyntheticTranslationLayout(resumeText);

  if (!layout.blocks.length) {
    throw new Error("Missing resume text blocks.");
  }

  await writeResumeTranslationLayout(
    state.workspaceId,
    state.candidateId,
    layout,
  );
  patch.resumeTranslationLayout = `analysis/${artifactNames.resumeTranslationLayout}`;

  return markStepCompleted(started, "use_original_resume", patch);
}
