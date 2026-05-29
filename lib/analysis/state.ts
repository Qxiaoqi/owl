export const candidateAnalysisSteps = [
  "ensure_jd_analysis",
  "detect_resume_language",
  "extract_resume_layout",
  "translate_resume",
  "evaluate_resume_translation",
  "revise_resume_translation",
  "finalize_resume_translation",
  "translate_resume_layout",
  "use_original_resume",
  "analyze_resume_fit",
  "extract_resume_annotations",
  "build_question_tree",
  "build_report_data",
] as const;

export type CandidateAnalysisStep = (typeof candidateAnalysisSteps)[number];

export type CandidateAnalysisState = {
  workspaceId: string;
  candidateId: string;
  status: "idle" | "running" | "completed" | "failed";
  currentStep?: CandidateAnalysisStep;
  completedSteps: CandidateAnalysisStep[];
  artifacts: {
    jdAnalysis?: string;
    resumeLanguage?: string;
    resumeSourceLayout?: string;
    resumeTranslationLayout?: string;
    resumeTranslationDraft?: string;
    resumeTranslationReview?: string;
    resumeTranslation?: string;
    resumeFit?: string;
    resumeAnnotations?: string;
    questionTree?: string;
    reportData?: string;
  };
  resumeShouldTranslate?: boolean;
  translationReviewPassed?: boolean;
  translationRevisionCount: number;
  errors: Array<{
    step: CandidateAnalysisStep;
    message: string;
    retryable: boolean;
    at: string;
  }>;
};

export function createInitialCandidateAnalysisState(
  workspaceId: string,
  candidateId: string,
): CandidateAnalysisState {
  return {
    workspaceId,
    candidateId,
    status: "idle",
    completedSteps: [],
    artifacts: {},
    translationRevisionCount: 0,
    errors: [],
  };
}
