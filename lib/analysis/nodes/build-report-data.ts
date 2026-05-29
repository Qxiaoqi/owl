import {
  analysisPath,
  artifactNames,
  markStepCompleted,
  markStepStarted,
  readJdAnalysis,
  readQuestionTree,
  readResumeAnnotations,
  readResumeFit,
  readResumeTranslation,
} from "@/lib/analysis/artifacts";
import { buildReportData } from "@/lib/report/build-report-data";
import type { CandidateAnalysisState } from "@/lib/analysis/state";
import { writeJson } from "@/lib/persistence/files";

export async function buildReportDataNode(state: CandidateAnalysisState) {
  const started = await markStepStarted(state, "build_report_data", "正在整理分析报告。");
  const jd = await readJdAnalysis(state.workspaceId);
  const resumeFit = await readResumeFit(state.workspaceId, state.candidateId);
  const resumeAnnotations = await readResumeAnnotations(state.workspaceId, state.candidateId);
  const questionTree = await readQuestionTree(state.workspaceId, state.candidateId);
  const resumeTranslation = await readResumeTranslation(state.workspaceId, state.candidateId);

  if (!jd || !resumeFit || !resumeAnnotations || !questionTree) {
    throw new Error("Missing required analysis artifact for report data.");
  }

  const report = buildReportData({
    workspaceId: state.workspaceId,
    candidateId: state.candidateId,
    jd,
    candidate: {
      ...resumeFit,
      annotations: resumeAnnotations.annotations,
    },
    questionTree,
    resumeTranslation,
  });

  await writeJson(
    analysisPath(state.workspaceId, state.candidateId, artifactNames.reportData),
    report,
  );
  return markStepCompleted(started, "build_report_data", {
    reportData: `analysis/${artifactNames.reportData}`,
  });
}
