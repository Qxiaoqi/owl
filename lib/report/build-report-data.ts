import type {
  InterviewNotesReview,
  JdAnalysis,
  PaperAnalysis,
  QuestionTree,
  ResumeFit,
  ResumeAnnotations,
} from "@/lib/analysis/schemas";

type CandidateReportAnalysis = Partial<ResumeFit> & Partial<ResumeAnnotations>;

export type ReportData = {
  metadata: {
    generatedAt: string;
    mode: "localhost";
    workspaceId: string;
    candidateId: string;
  };
  jd: Partial<JdAnalysis>;
  candidate: CandidateReportAnalysis;
  paper: Partial<PaperAnalysis>;
  questionTree: Partial<QuestionTree>;
  notesReview?: Partial<InterviewNotesReview>;
  resumeTranslation?: string;
  workspace: {
    confirmedResumeText?: string;
    confirmedPaperText?: string;
    annotations: unknown[];
  };
};

export function buildReportData(input: {
  workspaceId: string;
  candidateId: string;
  jd?: Partial<JdAnalysis>;
  candidate?: CandidateReportAnalysis;
  paper?: Partial<PaperAnalysis>;
  questionTree?: Partial<QuestionTree>;
  notesReview?: Partial<InterviewNotesReview>;
  resumeTranslation?: string;
  confirmedResumeText?: string;
  confirmedPaperText?: string;
}): ReportData {
  const annotations = [
    ...(input.candidate?.annotations ?? []),
    ...(input.paper?.annotations ?? []),
  ];

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      mode: "localhost",
      workspaceId: input.workspaceId,
      candidateId: input.candidateId,
    },
    jd: input.jd ?? {},
    candidate: input.candidate ?? {},
    paper: input.paper ?? {},
    questionTree: input.questionTree ?? {},
    notesReview: input.notesReview,
    resumeTranslation: input.resumeTranslation,
    workspace: {
      confirmedResumeText: input.confirmedResumeText,
      confirmedPaperText: input.confirmedPaperText,
      annotations,
    },
  };
}
