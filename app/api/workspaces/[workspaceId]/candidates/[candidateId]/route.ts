import { isSafePathSegment, workspacePath } from "@/lib/persistence/files";
import { deleteTasksForTarget } from "@/lib/tasks/store";
import { rm } from "node:fs/promises";
import { NextResponse } from "next/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; candidateId: string }> },
) {
  try {
    const { workspaceId, candidateId } = await params;
    if (![workspaceId, candidateId].every(isSafePathSegment)) {
      return NextResponse.json({ ok: false, error: "Invalid candidate path." }, { status: 400 });
    }

    await rm(workspacePath(workspaceId, "candidates", candidateId), { recursive: true, force: true });
    await deleteTasksForTarget({ workspaceId, candidateId });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Delete candidate failed." },
      { status: 500 },
    );
  }
}
