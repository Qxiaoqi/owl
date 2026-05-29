import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { dataRoot, workspacePath } from "./files";

export type WorkspaceSummary = {
  id: string;
  title: string;
  description: string;
  status: string;
  date: string;
  candidateCount: number;
};

export type CandidateSummary = {
  id: string;
  name: string;
  title: string;
  status: string;
  date: string;
  note: string;
  resumeText?: string;
};

type WorkspaceJson = {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
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

export function makeId(prefix: string, value: string) {
  const slug = value
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${prefix}-${slug || Date.now()}`;
}

export function inferTitleFromText(text: string, fallback: string) {
  const line = text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean);
  return (line || fallback).replace(/^#+\s*/, "").slice(0, 100);
}

export function inferCandidateName(text: string, fallback: string) {
  const line = text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item && !item.includes("@") && item.length <= 80);
  return (line || fallback).replace(/^#+\s*/, "").slice(0, 80);
}

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

async function listDirectories(dirPath: string) {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

export async function listWorkspaces(): Promise<WorkspaceSummary[]> {
  const workspaceRoot = path.join(dataRoot, "workspaces");
  const ids = await listDirectories(workspaceRoot);
  const items = await Promise.all(
    ids.map(async (id) => {
      const workspace = await readJsonIfExists<WorkspaceJson>(workspacePath(id, "workspace.json"));
      const candidates = await listCandidates(id);
      return {
        id,
        title: workspace?.title || id,
        description: workspace?.description || `${candidates.length} 位候选人`,
        status: workspace?.status || "jd confirmed",
        date: (workspace?.updatedAt || workspace?.createdAt || new Date().toISOString()).slice(0, 10),
        candidateCount: candidates.length,
      };
    }),
  );

  return items.sort((a, b) => b.date.localeCompare(a.date));
}

export async function getWorkspace(id: string): Promise<WorkspaceSummary | null> {
  const workspace = await readJsonIfExists<WorkspaceJson>(workspacePath(id, "workspace.json"));
  if (!workspace) {
    return null;
  }
  const candidates = await listCandidates(id);
  return {
    id,
    title: workspace.title || id,
    description: workspace.description || `${candidates.length} 位候选人`,
    status: workspace.status || "jd confirmed",
    date: (workspace.updatedAt || workspace.createdAt || new Date().toISOString()).slice(0, 10),
    candidateCount: candidates.length,
  };
}

export async function listCandidates(
  workspaceId: string,
): Promise<CandidateSummary[]> {
  const candidateRoot = workspacePath(workspaceId, "candidates");
  const ids = await listDirectories(candidateRoot);
  const items = await Promise.all(
    ids.map(async (id) => {
      const candidate = await readJsonIfExists<CandidateJson>(workspacePath(workspaceId, "candidates", id, "candidate.json"));
      if (!candidate) {
        return null;
      }
      return {
        id,
        name: candidate.name || id,
        title: candidate.title || "候选人",
        status: candidate.status || "resume uploaded",
        date: (candidate.updatedAt || candidate.createdAt || new Date().toISOString()).slice(0, 10),
        note: candidate.note || "简历已上传，等待分析。",
      };
    }),
  );
  const candidates = items.filter((item): item is CandidateSummary => Boolean(item));

  return candidates.sort((a, b) => b.date.localeCompare(a.date));
}

export async function getCandidate(workspaceId: string, candidateId: string): Promise<CandidateSummary | null> {
  const candidate = await readJsonIfExists<CandidateJson>(workspacePath(workspaceId, "candidates", candidateId, "candidate.json"));
  if (!candidate) {
    return null;
  }
  let resumeText = "";
  try {
    resumeText = await readFile(workspacePath(workspaceId, "candidates", candidateId, "materials", "resume", "confirmed.md"), "utf8");
  } catch {
    resumeText = "";
  }

  return {
    id: candidateId,
    name: candidate.name || candidateId,
    title: candidate.title || "候选人",
    status: candidate.status || "resume uploaded",
    date: (candidate.updatedAt || candidate.createdAt || new Date().toISOString()).slice(0, 10),
    note: candidate.note || "简历已上传，等待分析。",
    resumeText,
  };
}
