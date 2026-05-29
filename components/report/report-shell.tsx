import type { ReportData } from "@/lib/report/build-report-data";

function questionTypeLabel(questionType: string) {
  const labels: Record<string, string> = {
    project_deep_dive: "项目深挖",
    jd_fit: "JD 匹配",
    risk_check: "风险核验",
  };
  return labels[questionType] ?? "面试问题";
}

export function ReportShell({ report }: { report: ReportData }) {
  const questions = report.questionTree.questions ?? [];
  const risks = report.candidate.risks ?? [];
  const mustHaveSkills = report.jd.mustHaveSkills ?? [];
  const niceToHaveSkills = report.jd.niceToHaveSkills ?? [];

  return (
    <article className="report-page">
      <header className="report-header">
        <div>
          <p className="resume-page-header">
            <span>Candidate Report</span>
            <span>{report.metadata.generatedAt.slice(0, 10)}</span>
          </p>
          <h1>{report.candidate.candidateName ?? "候选人"}</h1>
          <p>{report.candidate.headline ?? "等待简历分析结果。"}</p>
        </div>
        <div className="report-score">
          <span>{String(report.candidate.jdFit?.score ?? "N/A")}</span>
          <small>JD Fit</small>
        </div>
      </header>

      <section className="report-section">
        <h2>岗位匹配</h2>
        <p>{String(report.candidate.jdFit?.summary ?? "等待匹配度分析。")}</p>
        <div className="report-tags">
          {mustHaveSkills.map((skill) => (
            <span className="badge ready" key={skill}>
              {skill}
            </span>
          ))}
          {niceToHaveSkills.map((skill) => (
            <span className="badge" key={skill}>
              {skill}
            </span>
          ))}
        </div>
      </section>

      <section className="report-section">
        <h2>JD 摘要</h2>
        <p>{report.jd.summary ?? "等待 JD 分析结果。"}</p>
      </section>

      <section className="report-section">
        <h2>风险点</h2>
        {risks.length ? (
          <ul>
            {risks.map((risk, index) => (
              <li key={index}>{typeof risk === "string" ? risk : JSON.stringify(risk)}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">暂无风险产物。</p>
        )}
      </section>

      <section className="report-section">
        <h2>面试问题</h2>
        {questions.length ? (
          <ol>
            {questions.map((question) => (
              <li key={question.id}>
                <span className="badge blue">{questionTypeLabel(question.questionType)}</span>
                <strong>{question.question}</strong>
                <p>{question.purpose}</p>
                {question.goodAnswer ? <p>好回答特征：{question.goodAnswer}</p> : null}
                {question.goodAnswerExample ? <p>好的回答例子：{question.goodAnswerExample}</p> : null}
                {question.followUps?.length ? (
                  <>
                    <p className="muted">追问：</p>
                    <ol className="report-followups">
                      {question.followUps.map((followUp) => (
                        <li key={followUp}>{followUp}</li>
                      ))}
                    </ol>
                  </>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">暂无问题树。</p>
        )}
      </section>
    </article>
  );
}
