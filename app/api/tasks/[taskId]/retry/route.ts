import { isSafePathSegment } from "@/lib/persistence/files";
import { patchTask, readTask } from "@/lib/tasks/store";
import { startAnalysisTask } from "@/lib/tasks/runner";
import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await params;
    if (!isSafePathSegment(taskId)) {
      return NextResponse.json({ ok: false, error: "Invalid taskId." }, { status: 400 });
    }
    const task = await readTask(taskId);
    if (!task) {
      return NextResponse.json({ ok: false, error: "Task not found." }, { status: 404 });
    }
    if (task.status === "running" || task.status === "queued") {
      return NextResponse.json({ ok: true, task });
    }
    if (task.status !== "failed") {
      return NextResponse.json({ ok: false, error: "Only failed tasks can be retried." }, { status: 400 });
    }

    const next = await patchTask(taskId, {
      status: "queued",
      currentStep: undefined,
      message: "任务已重新提交，正在排队。",
      error: undefined,
      completedAt: undefined,
      retryCount: task.retryCount + 1,
    });
    startAnalysisTask(taskId);

    return NextResponse.json({ ok: true, task: next });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Retry task failed." },
      { status: 500 },
    );
  }
}
