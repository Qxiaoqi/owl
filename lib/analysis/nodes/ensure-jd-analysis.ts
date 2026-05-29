import {
  jdConfirmedPath,
  markStepCompleted,
  markStepStarted,
  readJdAnalysis,
  readTextIfExists,
  writeJdAnalysis,
} from "@/lib/analysis/artifacts";
import { analyzeJdText } from "@/lib/analysis/jd-parser";
import type { CandidateAnalysisState } from "@/lib/analysis/state";

export async function ensureJdAnalysisNode(state: CandidateAnalysisState) {
  const started = await markStepStarted(state, "ensure_jd_analysis", "正在准备 JD 分析结果。");
  const existing = await readJdAnalysis(state.workspaceId);
  if (existing) {
    return markStepCompleted(started, "ensure_jd_analysis", {
      jdAnalysis: "jd/analysis.json",
    });
  }

  const jdText = await readTextIfExists(jdConfirmedPath(state.workspaceId));
  if (!jdText.trim()) {
    throw new Error("Missing confirmed JD text.");
  }

  const analysis = await analyzeJdText(jdText);
  await writeJdAnalysis(state.workspaceId, analysis);
  return markStepCompleted(started, "ensure_jd_analysis", {
    jdAnalysis: "jd/analysis.json",
  });
}
