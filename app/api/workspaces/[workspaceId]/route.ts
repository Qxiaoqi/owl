import { isSafePathSegment, workspacePath } from "@/lib/persistence/files";
import { deleteTasksForTarget } from "@/lib/tasks/store";
import { rm } from "node:fs/promises";
import { NextResponse } from "next/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    if (!isSafePathSegment(workspaceId)) {
      return NextResponse.json({ ok: false, error: "Invalid workspaceId." }, { status: 400 });
    }

    await rm(workspacePath(workspaceId), { recursive: true, force: true });
    await deleteTasksForTarget({ workspaceId });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Delete workspace failed." },
      { status: 500 },
    );
  }
}
