import { readJsonIfExists } from "@/lib/analysis/artifacts";
import type { CandidateAnalysisState } from "@/lib/analysis/state";
import { createTask, listTasks } from "@/lib/tasks/store";
import { startAnalysisTask } from "@/lib/tasks/runner";
import { isSafePathSegment, workspacePath } from "@/lib/persistence/files";
import { NextResponse } from "next/server";

function stepLabel(step?: string) {
  const labels: Record<string, string> = {
    ensure_jd_analysis: "准备 JD 分析结果",
    detect_resume_language: "判断简历语言",
    extract_resume_layout: "提取 PDF 简历版式",
    translate_resume: "翻译并结构化简历",
    evaluate_resume_translation: "质检中文简历翻译",
    revise_resume_translation: "修订中文简历翻译",
    finalize_resume_translation: "保存中文简历",
    translate_resume_layout: "生成坐标化中文简历",
    use_original_resume: "中文简历跳过翻译",
    analyze_resume_fit: "分析简历与 JD 匹配度",
    extract_resume_annotations: "提取可点击标注",
    build_question_tree: "生成面试问题树",
    build_report_data: "生成报告数据",
  };

  return step ? labels[step] || step : undefined;
}

async function enrichTask(task: Awaited<ReturnType<typeof listTasks>>[number]) {
  if (task.type !== "candidate_analysis" || !task.candidateId || task.status !== "running") {
    return task;
  }

  const state = await readJsonIfExists<CandidateAnalysisState>(
    workspacePath(task.workspaceId, "candidates", task.candidateId, "analysis", "analysis-state.json"),
  );

  if (!state?.currentStep) {
    return task;
  }

  return {
    ...task,
    currentStep: state.currentStep,
    message: stepLabel(state.currentStep),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId") || undefined;
  if (workspaceId && !isSafePathSegment(workspaceId)) {
    return NextResponse.json({ ok: false, error: "Invalid workspaceId." }, { status: 400 });
  }
  const tasks = await Promise.all((await listTasks({ workspaceId })).map(enrichTask));
  return NextResponse.json({ ok: true, tasks });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const type = String(body.type || "");
    const workspaceId = String(body.workspaceId || "");
    const candidateId = body.candidateId ? String(body.candidateId) : undefined;

    if (type !== "jd_analysis" && type !== "candidate_analysis") {
      return NextResponse.json({ ok: false, error: "Invalid task type." }, { status: 400 });
    }
    if (!workspaceId) {
      return NextResponse.json({ ok: false, error: "Missing workspaceId." }, { status: 400 });
    }
    if (!isSafePathSegment(workspaceId)) {
      return NextResponse.json({ ok: false, error: "Invalid workspaceId." }, { status: 400 });
    }
    if (type === "candidate_analysis" && !candidateId) {
      return NextResponse.json({ ok: false, error: "Missing candidateId." }, { status: 400 });
    }
    if (candidateId && !isSafePathSegment(candidateId)) {
      return NextResponse.json({ ok: false, error: "Invalid candidateId." }, { status: 400 });
    }

    const task = await createTask({
      type,
      workspaceId,
      candidateId,
      title: typeof body.title === "string" ? body.title : undefined,
      message: "任务已提交，正在排队。",
    });
    startAnalysisTask(task.id);

    return NextResponse.json({ ok: true, task });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Create task failed." },
      { status: 500 },
    );
  }
}
