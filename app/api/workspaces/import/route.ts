import { parseMaterial, parsedMaterialToText } from "@/lib/extraction";
import { inferTitleFromText, makeId } from "@/lib/persistence/domain";
import { ensureDataRoot, workspacePath, writeJson, writeText } from "@/lib/persistence/files";
import { createTask } from "@/lib/tasks/store";
import { startAnalysisTask } from "@/lib/tasks/runner";
import { NextResponse } from "next/server";

async function persistWorkspaceFromJd(input: {
  text: string;
  fallbackTitle: string;
  parsed?: unknown;
}) {
  const title = inferTitleFromText(input.text, input.fallbackTitle);
  const workspaceId = makeId("jd", `${title}-${Date.now()}`);
  const now = new Date().toISOString();

  await writeJson(workspacePath(workspaceId, "workspace.json"), {
    id: workspaceId,
    title,
    description: "JD 已提交解析任务，完成后会更新岗位摘要。",
    status: "jd uploaded",
    createdAt: now,
    updatedAt: now,
  });
  if (input.parsed) {
    await writeJson(workspacePath(workspaceId, "jd", "parsed.json"), input.parsed);
  }
  await writeText(workspacePath(workspaceId, "jd", "confirmed.md"), input.text);

  const task = await createTask({
    type: "jd_analysis",
    workspaceId,
    title: `${title} · JD 解析`,
    message: "JD 已上传，模型解析任务已提交。",
  });
  startAnalysisTask(task.id);

  return { workspaceId, title, taskId: task.id };
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const pastedText = String(form.get("text") || "");

    await ensureDataRoot();

    if (file instanceof File) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const parsed = await parseMaterial({
        buffer,
        fileName: file.name,
        mimeType: file.type,
      });
      const text = parsedMaterialToText(parsed);
      const result = await persistWorkspaceFromJd({
        text,
        fallbackTitle: file.name.replace(/\.[^.]+$/, ""),
        parsed,
      });

      return NextResponse.json({ ok: true, ...result });
    }

    if (pastedText.trim()) {
      const result = await persistWorkspaceFromJd({
        text: pastedText,
        fallbackTitle: "New JD",
      });

      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json({ ok: false, error: "Missing file or text." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Import failed." },
      { status: 500 },
    );
  }
}
