import { buildReportData } from "@/lib/report/build-report-data";
import { isSafePathSegment, workspacePath, writeJson } from "@/lib/persistence/files";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const workspaceId = String(body.workspaceId || "");
    const candidateId = String(body.candidateId || "");
    if (!workspaceId || !candidateId) {
      return NextResponse.json({ ok: false, error: "Missing workspaceId or candidateId." }, { status: 400 });
    }
    if (![workspaceId, candidateId].every(isSafePathSegment)) {
      return NextResponse.json({ ok: false, error: "Invalid report path." }, { status: 400 });
    }
    const report = buildReportData({
      workspaceId,
      candidateId,
      jd: body.jd,
      candidate: body.candidate,
      paper: body.paper,
      questionTree: body.questionTree,
      notesReview: body.notesReview,
      confirmedResumeText: body.confirmedResumeText,
      confirmedPaperText: body.confirmedPaperText,
    });

    await writeJson(workspacePath(workspaceId, "candidates", candidateId, "report-data.json"), report);

    return NextResponse.json({ ok: true, report });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Report build failed." },
      { status: 500 },
    );
  }
}
