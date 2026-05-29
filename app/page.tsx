import { QuickUploadButton } from "@/components/materials/quick-upload-button";
import { BrandLink } from "@/components/navigation/brand-link";
import { Breadcrumbs } from "@/components/navigation/breadcrumbs";
import { TaskDrawer } from "@/components/tasks/task-drawer";
import { JdRowActions } from "@/components/workspaces/jd-row-actions";
import { listWorkspaces } from "@/lib/persistence/domain";
import Link from "next/link";

export default async function Home() {
  const jobs = await listWorkspaces();

  return (
    <div className="app-shell">
      <header className="sidebar">
        <BrandLink href="/" title="Owl" subtitle="JD workspace" />
        <div className="sidebar-actions">
          <TaskDrawer />
        </div>
      </header>

      <main className="main workspace-page">
        <Breadcrumbs items={[{ label: "JD" }]} />
        <header className="page-header">
          <div>
            <h1 className="page-title">JD</h1>
            <p className="page-description">选择一个正在招聘的岗位，查看候选人进展、简历解读和面试准备内容。</p>
          </div>
          <div className="page-actions">
            <QuickUploadButton kind="jd" label="上传 JD" primary />
          </div>
        </header>

        <section className="paper-card" aria-label="JD 列表">
          {jobs.length ? (
            jobs.map((job) => (
              <div className="jd-row" key={job.id}>
                <Link className="jd-row-main" href={`/workspaces/${job.id}`}>
                  <div className="row-title-line">
                    <h2 className="row-title">{job.title}</h2>
                    <span className="badge">{job.date}</span>
                  </div>
                  <p className="row-subtitle">
                    {job.description}
                    {job.candidateCount ? ` · ${job.candidateCount} 位候选人` : ""}
                  </p>
                </Link>
                <JdRowActions
                  apiPath={`/api/workspaces/${encodeURIComponent(job.id)}`}
                  detailPath={`/workspaces/${job.id}/jd`}
                  title={job.title}
                />
              </div>
            ))
          ) : (
            <div className="empty-state">
              <h2>还没有 JD</h2>
              <p>上传第一个 JD 后，就可以开始添加候选人并查看简历分析。</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
