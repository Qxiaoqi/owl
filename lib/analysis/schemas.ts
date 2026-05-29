import { z } from "zod";

export const EvidenceSchema = z.object({
  source: z.string(),
  quote: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

export const AnnotationSchema = z.object({
  id: z.string(),
  source: z.string().default("resume"),
  sourceBlockId: z.string(),
  page: z.number(),
  targetText: z.string(),
  displayText: z.string().default(""),
  category: z.enum(["strength", "risk", "concept", "evidence"]).default("evidence"),
  title: z.string(),
  note: z.string().default(""),
  linkedQuestionIds: z.array(z.string()).default([]),
  evidence: z.array(EvidenceSchema).default([]),
});

export const JdAnalysisSchema = z.object({
  title: z.string().nullable().optional(),
  summary: z.string().default(""),
  mustHaveSkills: z.array(z.string()).default([]),
  niceToHaveSkills: z.array(z.string()).default([]),
  competencyModel: z.array(z.record(z.string(), z.unknown())).default([]),
  interviewFocus: z.array(z.string()).default([]),
  evidence: z.array(EvidenceSchema).default([]),
});

export const ResumeFitSchema = z.object({
  candidateName: z.string().nullable().optional(),
  contact: z.record(z.string(), z.unknown()).default({}),
  headline: z.string().default(""),
  strengths: z.array(z.union([z.record(z.string(), z.unknown()), z.string()])).default([]),
  risks: z.array(z.union([z.record(z.string(), z.unknown()), z.string()])).default([]),
  gaps: z.array(z.union([z.record(z.string(), z.unknown()), z.string()])).default([]),
  mustHaveMatches: z.array(z.record(z.string(), z.unknown())).default([]),
  jdFit: z.record(z.string(), z.unknown()).default({}),
  evidence: z.array(EvidenceSchema).default([]),
});

export const ResumeAnnotationsSchema = z.object({
  annotations: z.array(AnnotationSchema).default([]),
});

export const LayoutBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const ResumeSourceLayoutBlockSchema = z.object({
  id: z.string(),
  page: z.number(),
  type: z.enum(["line", "section", "name", "contact"]),
  text: z.string(),
  box: LayoutBoxSchema,
  fontSize: z.number(),
});

export const ResumeSourceLayoutSchema = z.object({
  pages: z.array(
    z.object({
      page: z.number(),
      width: z.number(),
      height: z.number(),
    }),
  ),
  blocks: z.array(ResumeSourceLayoutBlockSchema),
});

export const ResumeTranslationLayoutSchema = z.object({
  pages: z.array(
    z.object({
      page: z.number(),
      width: z.number(),
      height: z.number(),
    }),
  ),
  blocks: z.array(
    z.object({
      id: z.string(),
      sourceBlockId: z.string(),
      page: z.number(),
      type: z.enum(["line", "section", "name", "contact"]),
      sourceText: z.string(),
      translatedText: z.string(),
      box: LayoutBoxSchema,
      fontSize: z.number(),
    }),
  ),
});

export const ResumeLanguageSchema = z.object({
  language: z.enum(["zh", "en", "mixed", "unknown"]),
  confidence: z.number().min(0).max(1).default(0),
  chineseRatio: z.number().min(0).max(1).default(0),
  latinRatio: z.number().min(0).max(1).default(0),
  shouldTranslate: z.boolean(),
  reason: z.string().default(""),
});

export const ResumeBlockTranslationsSchema = z.object({
  blocks: z.array(
    z.object({
      sourceBlockId: z.string(),
      translatedText: z.string(),
    }),
  ),
});

export const ResumeTranslationReviewSchema = z.object({
  passed: z.boolean(),
  score: z.number().min(0).max(100).default(0),
  issues: z.array(z.string()).default([]),
  revisionInstruction: z.string().default(""),
});

export const PaperAnalysisSchema = z.object({
  papers: z.array(z.record(z.string(), z.unknown())).default([]),
  annotations: z.array(AnnotationSchema).default([]),
});

export const InterviewQuestionSchema = z.object({
  id: z.string(),
  topic: z.string().default(""),
  source: z.string().default("resume"),
  questionType: z.enum(["project_deep_dive", "jd_fit", "risk_check"]).default("project_deep_dive"),
  sourceBlockId: z.string().default(""),
  linkedAnnotationIds: z.array(z.string()).default([]),
  question: z.string(),
  purpose: z.string().default(""),
  goodAnswer: z.string().default(""),
  goodAnswerExample: z.string().default(""),
  weakAnswerSignals: z.array(z.string()).default([]),
  followUps: z.array(z.string()).default([]),
  evidence: z.array(z.string()).default([]),
});

export const QuestionTreeSchema = z.object({
  questions: z.array(InterviewQuestionSchema).default([]),
});

export const InterviewNotesReviewSchema = z.object({
  summary: z.string().default(""),
  qa: z.array(z.record(z.string(), z.unknown())).default([]),
  risksUpdated: z.array(z.union([z.record(z.string(), z.unknown()), z.string()])).default([]),
  nextRoundQuestions: z.array(z.union([z.record(z.string(), z.unknown()), z.string()])).default([]),
});

export type JdAnalysis = z.infer<typeof JdAnalysisSchema>;
export type ResumeFit = z.infer<typeof ResumeFitSchema>;
export type ResumeAnnotations = z.infer<typeof ResumeAnnotationsSchema>;
export type ResumeSourceLayout = z.infer<typeof ResumeSourceLayoutSchema>;
export type ResumeSourceLayoutBlock = z.infer<typeof ResumeSourceLayoutBlockSchema>;
export type ResumeTranslationLayout = z.infer<typeof ResumeTranslationLayoutSchema>;
export type ResumeLanguage = z.infer<typeof ResumeLanguageSchema>;
export type ResumeBlockTranslations = z.infer<typeof ResumeBlockTranslationsSchema>;
export type ResumeTranslationReview = z.infer<typeof ResumeTranslationReviewSchema>;
export type PaperAnalysis = z.infer<typeof PaperAnalysisSchema>;
export type QuestionTree = z.infer<typeof QuestionTreeSchema>;
export type InterviewNotesReview = z.infer<typeof InterviewNotesReviewSchema>;

export const schemasByStep = {
  analyze_jd: JdAnalysisSchema,
  analyze_resume: ResumeFitSchema,
  explain_paper: PaperAnalysisSchema,
  build_question_tree: QuestionTreeSchema,
  review_interview_notes: InterviewNotesReviewSchema,
} as const;
