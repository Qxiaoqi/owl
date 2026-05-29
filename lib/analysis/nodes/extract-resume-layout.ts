import { readFile } from "node:fs/promises";
import {
  artifactNames,
  markStepCompleted,
  markStepStarted,
  readResumeSourceLayout,
  resumeSourcePdfPath,
  writeResumeSourceLayout,
} from "@/lib/analysis/artifacts";
import type { CandidateAnalysisState } from "@/lib/analysis/state";
import { extractPdfSourceLayout } from "@/lib/pdf/source-layout";

export async function extractResumeLayoutNode(state: CandidateAnalysisState) {
  const started = await markStepStarted(state, "extract_resume_layout", "正在提取 PDF 简历版式。");

  try {
    const buffer = await readFile(resumeSourcePdfPath(state.workspaceId, state.candidateId));
    const layout = await extractPdfSourceLayout(buffer);
    if (!layout.blocks.length) {
      throw new Error("PDF 简历没有提取到可定位文本，无法生成坐标化中文简历。");
    }
    await writeResumeSourceLayout(state.workspaceId, state.candidateId, layout);
    return markStepCompleted(started, "extract_resume_layout", {
      resumeSourceLayout: `analysis/${artifactNames.resumeSourceLayout}`,
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      const existing = await readResumeSourceLayout(state.workspaceId, state.candidateId);
      if (existing) {
        await writeResumeSourceLayout(state.workspaceId, state.candidateId, existing);
        return markStepCompleted(started, "extract_resume_layout", {
          resumeSourceLayout: `analysis/${artifactNames.resumeSourceLayout}`,
        });
      }
      return markStepCompleted(started, "extract_resume_layout", {});
    }
    throw error;
  }
}
