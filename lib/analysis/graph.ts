import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { markAnalysisCompleted, markAnalysisFailed } from "@/lib/analysis/artifacts";
import { analyzeResumeFitNode } from "@/lib/analysis/nodes/analyze-resume-fit";
import { buildQuestionTreeNode } from "@/lib/analysis/nodes/build-question-tree";
import { buildReportDataNode } from "@/lib/analysis/nodes/build-report-data";
import { detectResumeLanguageNode } from "@/lib/analysis/nodes/detect-resume-language";
import { evaluateResumeTranslationNode } from "@/lib/analysis/nodes/evaluate-resume-translation";
import { ensureJdAnalysisNode } from "@/lib/analysis/nodes/ensure-jd-analysis";
import { extractResumeLayoutNode } from "@/lib/analysis/nodes/extract-resume-layout";
import { extractResumeAnnotationsNode } from "@/lib/analysis/nodes/extract-resume-annotations";
import { finalizeResumeTranslationNode } from "@/lib/analysis/nodes/finalize-resume-translation";
import { reviseResumeTranslationNode } from "@/lib/analysis/nodes/revise-resume-translation";
import { translateResumeNode } from "@/lib/analysis/nodes/translate-resume";
import { translateResumeLayoutNode } from "@/lib/analysis/nodes/translate-resume-layout";
import { useOriginalResumeNode } from "@/lib/analysis/nodes/use-original-resume";
import type { CandidateAnalysisState, CandidateAnalysisStep } from "@/lib/analysis/state";
import { createInitialCandidateAnalysisState } from "@/lib/analysis/state";

const CandidateAnalysisAnnotation = Annotation.Root({
  workspaceId: Annotation<string>(),
  candidateId: Annotation<string>(),
  status: Annotation<CandidateAnalysisState["status"]>(),
  currentStep: Annotation<CandidateAnalysisState["currentStep"] | undefined>(),
  completedSteps: Annotation<CandidateAnalysisStep[]>(),
  artifacts: Annotation<CandidateAnalysisState["artifacts"]>(),
  resumeShouldTranslate: Annotation<boolean | undefined>(),
  translationReviewPassed: Annotation<boolean | undefined>(),
  translationRevisionCount: Annotation<number>(),
  errors: Annotation<CandidateAnalysisState["errors"]>(),
});

type GraphState = typeof CandidateAnalysisAnnotation.State;

function toCandidateAnalysisState(state: GraphState): CandidateAnalysisState {
  return {
    workspaceId: state.workspaceId,
    candidateId: state.candidateId,
    status: state.status,
    currentStep: state.currentStep,
    completedSteps: state.completedSteps ?? [],
    artifacts: state.artifacts ?? {},
    resumeShouldTranslate: state.resumeShouldTranslate,
    translationReviewPassed: state.translationReviewPassed,
    translationRevisionCount: state.translationRevisionCount ?? 0,
    errors: state.errors ?? [],
  };
}

function createSafeNode(
  step: CandidateAnalysisStep,
  node: (state: CandidateAnalysisState) => Promise<CandidateAnalysisState>,
) {
  return async (state: GraphState) => {
    const current = toCandidateAnalysisState(state);
    try {
      return await node(current);
    } catch (error) {
      await markAnalysisFailed(current, step, error);
      throw new Error(error instanceof Error ? error.message : "Analysis failed.");
    }
  };
}

async function completeNode(state: GraphState) {
  return markAnalysisCompleted(toCandidateAnalysisState(state));
}

function routeAfterTranslationReview(state: GraphState) {
  return state.translationReviewPassed ? "finalize_resume_translation" : "revise_resume_translation";
}

function routeAfterResumeLayout(state: GraphState) {
  return state.resumeShouldTranslate === false ? "use_original_resume" : "translate_resume";
}

export function createCandidateAnalysisGraph() {
  return new StateGraph(CandidateAnalysisAnnotation)
    .addNode("ensure_jd_analysis", createSafeNode("ensure_jd_analysis", ensureJdAnalysisNode))
    .addNode("detect_resume_language", createSafeNode("detect_resume_language", detectResumeLanguageNode))
    .addNode("extract_resume_layout", createSafeNode("extract_resume_layout", extractResumeLayoutNode))
    .addNode("translate_resume", createSafeNode("translate_resume", translateResumeNode))
    .addNode("evaluate_resume_translation", createSafeNode("evaluate_resume_translation", evaluateResumeTranslationNode))
    .addNode("revise_resume_translation", createSafeNode("revise_resume_translation", reviseResumeTranslationNode))
    .addNode("finalize_resume_translation", createSafeNode("finalize_resume_translation", finalizeResumeTranslationNode))
    .addNode("translate_resume_layout", createSafeNode("translate_resume_layout", translateResumeLayoutNode))
    .addNode("use_original_resume", createSafeNode("use_original_resume", useOriginalResumeNode))
    .addNode("analyze_resume_fit", createSafeNode("analyze_resume_fit", analyzeResumeFitNode))
    .addNode("extract_resume_annotations", createSafeNode("extract_resume_annotations", extractResumeAnnotationsNode))
    .addNode("build_question_tree", createSafeNode("build_question_tree", buildQuestionTreeNode))
    .addNode("build_report_data", createSafeNode("build_report_data", buildReportDataNode))
    .addNode("complete", completeNode)
    .addEdge(START, "ensure_jd_analysis")
    .addEdge("ensure_jd_analysis", "detect_resume_language")
    .addEdge("detect_resume_language", "extract_resume_layout")
    .addConditionalEdges("extract_resume_layout", routeAfterResumeLayout, [
      "translate_resume",
      "use_original_resume",
    ])
    .addEdge("translate_resume", "evaluate_resume_translation")
    .addConditionalEdges("evaluate_resume_translation", routeAfterTranslationReview, [
      "finalize_resume_translation",
      "revise_resume_translation",
    ])
    .addEdge("revise_resume_translation", "evaluate_resume_translation")
    .addEdge("finalize_resume_translation", "translate_resume_layout")
    .addEdge("translate_resume_layout", "analyze_resume_fit")
    .addEdge("use_original_resume", "analyze_resume_fit")
    .addEdge("analyze_resume_fit", "extract_resume_annotations")
    .addEdge("extract_resume_annotations", "build_question_tree")
    .addEdge("build_question_tree", "build_report_data")
    .addEdge("build_report_data", "complete")
    .addEdge("complete", END)
    .compile();
}

export async function runCandidateAnalysisGraph(workspaceId: string, candidateId: string) {
  const graph = createCandidateAnalysisGraph();
  return graph.invoke(createInitialCandidateAnalysisState(workspaceId, candidateId));
}
