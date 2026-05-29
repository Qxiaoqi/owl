import { BrandLink } from "@/components/navigation/brand-link";
import { Breadcrumbs } from "@/components/navigation/breadcrumbs";
import { TaskDrawer } from "@/components/tasks/task-drawer";
import { JdAnalysisSchema, type JdAnalysis } from "@/lib/analysis/schemas";
import { getWorkspace } from "@/lib/persistence/domain";
import { readJson, workspacePath } from "@/lib/persistence/files";
import { notFound } from "next/navigation";

async function readJdAnalysis(workspaceId: string): Promise<JdAnalysis | null> {
  try {
    const parsed = JdAnalysisSchema.safeParse(
      await readJson<unknown>(workspacePath(workspaceId, "jd", "analysis.json")),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function FieldList({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) {
    return <p className="muted-copy">{empty}</p>;
  }

  return (
    <ul className="detail-list">
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  );
}

function formatRecordValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "未填写";
  }
  if (Array.isArray(value)) {
    return value.map(formatRecordValue).join("、");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function formatRecordLabel(key: string) {
  const labelMap: Record<string, string> = {
    name: "能力项",
    signals: "可验证信号",
    weight: "权重",
    description: "说明",
    evidence: "依据",
    questions: "面试问题",
  };

  return labelMap[key] ?? key;
}

function formatWeight(value: unknown) {
  const weightMap: Record<string, string> = {
    high: "高",
    medium: "中",
    low: "低",
  };
  return weightMap[String(value)] ?? formatRecordValue(value);
}

function getSignals(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(formatRecordValue).filter(Boolean);
}

function CompetencyModel({ items }: { items: Array<Record<string, unknown>> }) {
  if (!items.length) {
    return <p className="muted-copy">暂无能力模型。</p>;
  }

  return (
    <div className="competency-grid">
      {items.map((item, index) => (
        <div className="competency-card" key={index}>
          <div className="competency-card-header">
            <h3>{formatRecordValue(item.name) || `能力项 ${index + 1}`}</h3>
            {item.weight ? <span className="competency-weight">权重 {formatWeight(item.weight)}</span> : null}
          </div>

          {getSignals(item.signals).length ? (
            <div className="competency-signals" aria-label="可验证信号">
              {getSignals(item.signals).map((signal, signalIndex) => (
                <span key={`${signal}-${signalIndex}`}>{signal}</span>
              ))}
            </div>
          ) : null}

          {Object.entries(item)
            .filter(([key]) => !["name", "signals", "weight"].includes(key))
            .map(([key, value]) => (
              <div className="competency-extra" key={key}>
                <span>{formatRecordLabel(key)}</span>
                <strong>{formatRecordValue(value)}</strong>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

export default async function JdDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) {
    notFound();
  }

  const jdAnalysis = await readJdAnalysis(workspace.id);

  return (
    <div className="app-shell">
      <header className="sidebar">
        <BrandLink href={`/workspaces/${workspace.id}`} title={workspace.title} subtitle={`${workspace.status} · JD detail`} />
        <div className="top-meta">
          <TaskDrawer />
          <span className="badge">{workspace.date}</span>
        </div>
      </header>

      <main className="main workspace-page">
        <Breadcrumbs
          items={[
            { label: "JD", href: "/" },
            { label: workspace.title, href: `/workspaces/${workspace.id}` },
            { label: "详情" },
          ]}
        />
        <header className="page-header">
          <div>
            <h1 className="page-title">{jdAnalysis?.title || workspace.title}</h1>
            <p className="page-description">{jdAnalysis?.summary || workspace.description}</p>
          </div>
        </header>

        <section className="jd-detail-layout" aria-label="JD 详情">
          <div className="paper-card jd-detail-card">
            <div className="panel-header">
              <h2 className="panel-title">解析结果</h2>
            </div>
            <div className="panel-body jd-detail-sections">
              <section>
                <p className="section-label">必备能力</p>
                <FieldList items={jdAnalysis?.mustHaveSkills ?? []} empty="暂无必备能力解析。" />
              </section>
              <section>
                <p className="section-label">加分项</p>
                <FieldList items={jdAnalysis?.niceToHaveSkills ?? []} empty="暂无加分项解析。" />
              </section>
              <section>
                <p className="section-label">面试关注点</p>
                <FieldList items={jdAnalysis?.interviewFocus ?? []} empty="暂无面试关注点。" />
              </section>
              <section>
                <p className="section-label">能力模型</p>
                <CompetencyModel items={jdAnalysis?.competencyModel ?? []} />
              </section>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
