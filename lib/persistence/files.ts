import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const dataRoot = path.join(process.cwd(), ".owl-data");

export async function ensureDataRoot() {
  await mkdir(dataRoot, { recursive: true });
}

export function isSafePathSegment(value: string) {
  return Boolean(value) && !value.includes("/") && !value.includes("\\") && !value.includes("..");
}

export function assertSafePathSegment(value: string, label = "path segment") {
  if (!isSafePathSegment(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}

export function workspacePath(workspaceId: string, ...segments: string[]) {
  assertSafePathSegment(workspaceId, "workspaceId");
  for (const segment of segments) {
    assertSafePathSegment(segment);
  }
  return path.join(dataRoot, "workspaces", workspaceId, ...segments);
}

export async function writeJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export async function writeText(filePath: string, value: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf8");
}

export async function writeBinary(filePath: string, value: Buffer) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value);
}
