import { readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { assertSafePathSegment, dataRoot, writeJson } from "@/lib/persistence/files";
import type { AnalysisTask, CreateAnalysisTaskInput } from "@/lib/tasks/types";

function taskRoot() {
  return path.join(dataRoot, "tasks");
}

export function taskPath(taskId: string) {
  assertSafePathSegment(taskId, "taskId");
  return path.join(taskRoot(), `${taskId}.json`);
}

function makeTaskId(type: string) {
  return `task-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function readTask(taskId: string) {
  return readJsonIfExists<AnalysisTask>(taskPath(taskId));
}

export async function writeTask(task: AnalysisTask) {
  await writeJson(taskPath(task.id), task);
  return task;
}

export async function createTask(input: CreateAnalysisTaskInput) {
  const now = new Date().toISOString();
  const task: AnalysisTask = {
    id: makeTaskId(input.type),
    type: input.type,
    status: "queued",
    workspaceId: input.workspaceId,
    candidateId: input.candidateId,
    title: input.title || (input.type === "jd_analysis" ? "JD 解析" : "候选人分析"),
    message: input.message || "任务已提交，等待开始。",
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  return writeTask(task);
}

export async function patchTask(taskId: string, patch: Partial<AnalysisTask>) {
  const existing = await readTask(taskId);
  if (!existing) {
    throw new Error(`Task not found: ${taskId}`);
  }

  return writeTask({
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

export async function listTasks(filter: { workspaceId?: string } = {}) {
  let files: string[] = [];
  try {
    files = await readdir(taskRoot());
  } catch {
    return [];
  }

  const tasks = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map((file) => readJsonIfExists<AnalysisTask>(path.join(taskRoot(), file))),
  );

  return tasks
    .filter((task): task is AnalysisTask => Boolean(task))
    .filter((task) => !filter.workspaceId || task.workspaceId === filter.workspaceId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteTasksForTarget(filter: { workspaceId: string; candidateId?: string }) {
  const tasks = await listTasks({ workspaceId: filter.workspaceId });
  const targetTasks = tasks.filter((task) => {
    if (filter.candidateId) {
      return task.candidateId === filter.candidateId;
    }
    return true;
  });

  await Promise.all(
    targetTasks.map(async (task) => {
      try {
        await unlink(taskPath(task.id));
      } catch {
        // Task cleanup is best-effort; resource deletion should still succeed.
      }
    }),
  );
}
