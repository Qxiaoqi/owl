import { analyzeJdText } from "@/lib/analysis/jd-parser";
import { runCandidateAnalysisGraph } from "@/lib/analysis/graph";
import { isSafePathSegment, readJson, workspacePath, writeJson } from "@/lib/persistence/files";
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";

type CandidateJson = {
  id: string;
  name?: string;
  title?: string;
  status?: string;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
};

async function updateCandidateStatus(workspaceId: string, candidateId: string, status: string, note: string) {
  const filePath = workspacePath(workspaceId, "candidates", candidateId, "candidate.json");
  const candidate = await readJson<CandidateJson>(filePath);
  await writeJson(filePath, {
    ...candidate,
    status,
    note,
    updatedAt: new Date().toISOString(),
  });
}

async function runJdAnalysis(workspaceId: string) {
  const jdText = await readFile(workspacePath(workspaceId, "jd", "confirmed.md"), "utf8");
  const analysis = await analyzeJdText(jdText);
  await writeJson(workspacePath(workspaceId, "jd", "analysis.json"), analysis);
  return analysis;
}

export async function POST(request: Request) {
  let workspaceId = "";
  let candidateId = "";

  try {
    const body = await request.json();
    const step = String(body.step || "candidate_analysis");
    workspaceId = String(body.workspaceId || "");
    candidateId = String(body.candidateId || "");

    if (!workspaceId) {
      return NextResponse.json({ ok: false, error: "Missing workspaceId." }, { status: 400 });
    }
    if (!isSafePathSegment(workspaceId)) {
      return NextResponse.json({ ok: false, error: "Invalid workspaceId." }, { status: 400 });
    }

    if (step === "analyze_jd") {
      const artifact = await runJdAnalysis(workspaceId);
      return NextResponse.json({
        ok: true,
        step,
        output: "jd_analysis.json",
        artifact,
        mode: "model",
      });
    }

    if (!candidateId) {
      return NextResponse.json({ ok: false, error: "Missing candidateId." }, { status: 400 });
    }
    if (!isSafePathSegment(candidateId)) {
      return NextResponse.json({ ok: false, error: "Invalid candidateId." }, { status: 400 });
    }

    await updateCandidateStatus(workspaceId, candidateId, "analyzing", "正在分析候选人资料。");
    const state = await runCandidateAnalysisGraph(workspaceId, candidateId);

    return NextResponse.json({
      ok: true,
      step: "candidate_analysis",
      output: "analysis-state.json",
      artifact: state,
      mode: "langgraph",
    });
  } catch (error) {
    if (workspaceId && candidateId) {
      try {
        const candidate = await readJson<CandidateJson>(
          workspacePath(workspaceId, "candidates", candidateId, "candidate.json"),
        );
        if (candidate.status !== "analysis failed") {
          await updateCandidateStatus(
            workspaceId,
            candidateId,
            "analysis failed",
            error instanceof Error ? error.message : "分析失败，请稍后重试。",
          );
        }
      } catch {
        // Preserve the original analysis error.
      }
    }

    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Analysis failed." },
      { status: 500 },
    );
  }
}
