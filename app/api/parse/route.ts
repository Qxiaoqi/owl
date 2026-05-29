import { parseMaterial, parsedMaterialToText } from "@/lib/extraction";
import { inferCandidateName } from "@/lib/persistence/domain";
import {
  ensureDataRoot,
  isSafePathSegment,
  workspacePath,
  writeBinary,
  writeJson,
  writeText,
} from "@/lib/persistence/files";
import { extractPdfSourceLayout } from "@/lib/pdf/source-layout";
import { NextResponse } from "next/server";

function safeSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function fileExtension(fileName: string) {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "bin";
}

function mimeTypeForFile(file: File, extension: string) {
  if (file.type) {
    return file.type;
  }
  if (extension === "pdf") {
    return "application/pdf";
  }
  if (extension === "md" || extension === "markdown") {
    return "text/markdown";
  }
  if (extension === "txt") {
    return "text/plain";
  }
  return "application/octet-stream";
}

function materialBasePath(workspaceId: string, candidateId: string, kind: string, fileName?: string) {
  if (kind === "resume" || kind === "jd") {
    return workspacePath(workspaceId, "candidates", candidateId, "materials", kind);
  }

  const segment = fileName ? safeSegment(fileName) || `upload-${Date.now()}` : `paste-${Date.now()}`;
  return workspacePath(workspaceId, "candidates", candidateId, "materials", kind, segment);
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const workspaceId = String(form.get("workspaceId") || "");
    const candidateId = String(form.get("candidateId") || "");
    const kind = String(form.get("kind") || "resume");
    const file = form.get("file");
    const pastedText = String(form.get("text") || "");

    await ensureDataRoot();

    if (!workspaceId || !candidateId) {
      return NextResponse.json({ ok: false, error: "Missing workspaceId or candidateId." }, { status: 400 });
    }
    if (![workspaceId, candidateId, kind].every(isSafePathSegment)) {
      return NextResponse.json({ ok: false, error: "Invalid material path." }, { status: 400 });
    }

    if (file instanceof File) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const parsed = await parseMaterial({
        buffer,
        fileName: file.name,
        mimeType: file.type,
      });
      const text = parsedMaterialToText(parsed);
      const basePath = materialBasePath(workspaceId, candidateId, kind, file.name);
      const extension = fileExtension(file.name);
      const sourceName = `source.${extension}`;
      const mimeType = mimeTypeForFile(file, extension);

      await writeBinary(`${basePath}/${sourceName}`, buffer);
      await writeJson(`${basePath}/source.json`, {
        fileName: file.name,
        mimeType,
        sourceName,
        size: buffer.length,
      });
      if (mimeType === "application/pdf") {
        try {
          const sourceLayout = await extractPdfSourceLayout(buffer);
          await writeJson(`${basePath}/source_layout.json`, sourceLayout);
        } catch {
          // PDF layout is used for visual alignment only; parsing text should still succeed.
        }
      }
      await writeJson(`${basePath}/parsed.json`, parsed);
      await writeText(`${basePath}/confirmed.md`, text);

      if (kind === "resume") {
        const now = new Date().toISOString();
        await writeJson(workspacePath(workspaceId, "candidates", candidateId, "candidate.json"), {
          id: candidateId,
          name: inferCandidateName(text, file.name.replace(/\.[^.]+$/, "")),
          title: "候选人",
          status: "resume uploaded",
          note: "简历已上传，等待分析。",
          createdAt: now,
          updatedAt: now,
        });
      }

      return NextResponse.json({
        ok: true,
        material: parsed,
        text,
        warnings: parsed.parseWarnings ?? [],
      });
    }

    if (pastedText.trim()) {
      const parsed = {
        source: "paste",
        type: "paste" as const,
        text: pastedText,
      };
      const basePath = materialBasePath(workspaceId, candidateId, kind);

      await writeJson(`${basePath}/parsed.json`, parsed);
      await writeText(`${basePath}/confirmed.md`, pastedText);

      if (kind === "resume") {
        const now = new Date().toISOString();
        await writeJson(workspacePath(workspaceId, "candidates", candidateId, "candidate.json"), {
          id: candidateId,
          name: inferCandidateName(pastedText, candidateId),
          title: "候选人",
          status: "resume uploaded",
          note: "简历已上传，等待分析。",
          createdAt: now,
          updatedAt: now,
        });
      }

      return NextResponse.json({
        ok: true,
        material: parsed,
        text: pastedText,
        warnings: [],
      });
    }

    return NextResponse.json({ ok: false, error: "Missing file or text." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Parse failed." },
      { status: 500 },
    );
  }
}
