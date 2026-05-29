export type AnalysisTaskType = "jd_analysis" | "candidate_analysis";

export type AnalysisTaskStatus = "queued" | "running" | "succeeded" | "failed";

export type AnalysisTask = {
  id: string;
  type: AnalysisTaskType;
  status: AnalysisTaskStatus;
  workspaceId: string;
  candidateId?: string;
  title: string;
  currentStep?: string;
  message?: string;
  error?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type CreateAnalysisTaskInput = {
  type: AnalysisTaskType;
  workspaceId: string;
  candidateId?: string;
  title?: string;
  message?: string;
};
