import { analyzeJdText } from "@/lib/analysis/jd-parser";
import { runCandidateAnalysisGraph } from "@/lib/analysis/graph";
import { readJson, workspacePath, writeJson } from "@/lib/persistence/files";
import { patchTask, readTask } from "@/lib/tasks/store";

type WorkspaceJson = {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  analysisWarning?: string;
};

type CandidateJson = {
  id: string;
  name?: string;
  title?: string;
  status?: string;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
};

async function readText(filePath: string) {
  const { readFile } = await import("node:fs/promises");
  return readFile(filePath, "utf8");
}

async function updateWorkspaceFromJdAnalysis(workspaceId: string) {
  const jdText = await readText(workspacePath(workspaceId, "jd", "confirmed.md"));
  const analysis = await analyzeJdText(jdText);
  const workspacePathName = workspacePath(workspaceId, "workspace.json");
  const workspace = await readJson<WorkspaceJson>(workspacePathName);
  const title = analysis.title || workspace.title || "未命名 JD";
  const now = new Date().toISOString();

  await writeJson(workspacePath(workspaceId, "jd", "analysis.json"), analysis);
  await writeJson(workspacePathName, {
    ...workspace,
    title,
    description: analysis.summary || workspace.description || "JD 已解析，等待添加候选人。",
    status: "jd analyzed",
    updatedAt: now,
    analysisWarning: undefined,
  });

  return title;
}

async function candidateTaskTitle(workspaceId: string, candidateId?: string) {
  if (!candidateId) {
    return "候选人分析";
  }

  try {
    const candidate = await readJson<CandidateJson>(
      workspacePath(workspaceId, "candidates", candidateId, "candidate.json"),
    );
    return candidate.name ? `${candidate.name} 的候选人分析` : "候选人分析";
  } catch {
    return "候选人分析";
  }
}

export async function runAnalysisTask(taskId: string) {
  const task = await readTask(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  try {
    await patchTask(taskId, {
      status: "running",
      currentStep: task.type === "jd_analysis" ? "analyze_jd" : "ensure_jd_analysis",
      message: task.type === "jd_analysis" ? "模型正在解析 JD。" : "正在运行候选人分析流程。",
      error: undefined,
      completedAt: undefined,
    });

    if (task.type === "jd_analysis") {
      const title = await updateWorkspaceFromJdAnalysis(task.workspaceId);
      await patchTask(taskId, {
        status: "succeeded",
        title: `${title} · JD 解析`,
        currentStep: undefined,
        message: "JD 解析完成。",
        completedAt: new Date().toISOString(),
      });
      return;
    }

    if (!task.candidateId) {
      throw new Error("Missing candidateId for candidate analysis task.");
    }

    await runCandidateAnalysisGraph(task.workspaceId, task.candidateId);
    await patchTask(taskId, {
      status: "succeeded",
      title: await candidateTaskTitle(task.workspaceId, task.candidateId),
      currentStep: undefined,
      message: "候选人分析完成。",
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    await patchTask(taskId, {
      status: "failed",
      message: "任务失败。",
      error: error instanceof Error ? error.message : "任务失败，请稍后重试。",
      completedAt: new Date().toISOString(),
    });
  }
}

export function startAnalysisTask(taskId: string) {
  void runAnalysisTask(taskId);
}
