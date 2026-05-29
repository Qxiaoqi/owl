import { isSafePathSegment, readJson, workspacePath } from "@/lib/persistence/files";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

type SourceMeta = {
  fileName: string;
  mimeType: string;
  sourceName: string;
  size: number;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId") || "";
    const candidateId = searchParams.get("candidateId") || "";
    const kind = searchParams.get("kind") || "resume";

    if (![workspaceId, candidateId, kind].every(isSafePathSegment)) {
      return NextResponse.json({ ok: false, error: "Invalid material path." }, { status: 400 });
    }

    const basePath = workspacePath(workspaceId, "candidates", candidateId, "materials", kind);
    const meta = await readJson<SourceMeta>(path.join(basePath, "source.json"));
    if (!isSafePathSegment(meta.sourceName)) {
      return NextResponse.json({ ok: false, error: "Invalid source file." }, { status: 400 });
    }

    const buffer = await readFile(path.join(basePath, meta.sourceName));
    return new Response(buffer, {
      headers: {
        "content-type": meta.mimeType || "application/octet-stream",
        "content-disposition": `inline; filename="${encodeURIComponent(meta.fileName)}"`,
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Source file not found." }, { status: 404 });
  }
}
