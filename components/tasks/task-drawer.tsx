"use client";

import { CheckCircle2, ClipboardList, Loader2, RotateCcw, X, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type AnalysisTask = {
  id: string;
  type: "jd_analysis" | "candidate_analysis";
  status: "queued" | "running" | "succeeded" | "failed";
  workspaceId: string;
  candidateId?: string;
  title: string;
  currentStep?: string;
  message?: string;
  error?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

function statusLabel(status: AnalysisTask["status"]) {
  const labels = {
    queued: "排队中",
    running: "进行中",
    succeeded: "已完成",
    failed: "失败",
  };
  return labels[status];
}

function taskHref(task: AnalysisTask) {
  if (task.type === "candidate_analysis" && task.candidateId) {
    return `/workspaces/${task.workspaceId}/candidates/${task.candidateId}`;
  }
  return `/workspaces/${task.workspaceId}`;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TaskDrawer() {
  const router = useRouter();
  const previousStatuses = useRef<Record<string, AnalysisTask["status"]>>({});
  const [isOpen, setIsOpen] = useState(false);
  const [tasks, setTasks] = useState<AnalysisTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const activeCount = useMemo(
    () => tasks.filter((task) => task.status === "queued" || task.status === "running").length,
    [tasks],
  );

  async function loadTasks() {
    setIsLoading(true);
    try {
      const response = await fetch("/api/tasks", { cache: "no-store" });
      const data = (await response.json()) as { ok?: boolean; tasks?: AnalysisTask[] };
      if (response.ok && data.ok && data.tasks) {
        setError("");
        const nextStatuses = Object.fromEntries(data.tasks.map((task) => [task.id, task.status]));
        const completed = data.tasks.some((task) => {
          const previous = previousStatuses.current[task.id];
          return previous && previous !== task.status && (task.status === "succeeded" || task.status === "failed");
        });
        previousStatuses.current = nextStatuses;
        setTasks(data.tasks);
        if (completed) {
          router.refresh();
        }
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "任务列表加载失败。");
    } finally {
      setIsLoading(false);
    }
  }

  async function retryTask(taskId: string) {
    const response = await fetch(`/api/tasks/${taskId}/retry`, { method: "POST" });
    if (response.ok) {
      await loadTasks();
    }
  }

  useEffect(() => {
    void loadTasks();
    const timer = window.setInterval(() => {
      void loadTasks();
    }, activeCount ? 1800 : 5000);
    return () => window.clearInterval(timer);
  }, [activeCount]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const drawer = (
    <div className="task-drawer-backdrop" role="presentation" onClick={() => setIsOpen(false)}>
      <aside className="task-drawer" aria-label="任务列表" onClick={(event) => event.stopPropagation()}>
        <header className="task-drawer-header">
          <div>
            <h2>任务</h2>
            <p>所有 JD 和候选人分析任务</p>
          </div>
          <button className="icon-button" type="button" onClick={() => setIsOpen(false)} aria-label="关闭任务列表">
            <X size={18} />
          </button>
        </header>

        <div className="task-list">
          {error ? (
            <div className="task-empty">
              <ClipboardList size={24} />
              <strong>任务加载失败</strong>
              <p>{error}</p>
            </div>
          ) : tasks.length ? (
            tasks.map((task) => (
              <article
                className={`task-item ${task.status}`}
                key={task.id}
                role="link"
                tabIndex={0}
                onClick={() => {
                  setIsOpen(false);
                  router.push(taskHref(task));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setIsOpen(false);
                    router.push(taskHref(task));
                  }
                }}
              >
                <div className="task-status-icon" aria-hidden="true">
                  {task.status === "running" || task.status === "queued" ? (
                    <Loader2 size={16} />
                  ) : task.status === "succeeded" ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <XCircle size={16} />
                  )}
                </div>
                <div className="task-item-body">
                  <div className="task-item-topline">
                    <strong>{task.title}</strong>
                    <span>{statusLabel(task.status)}</span>
                  </div>
                  <p>{task.error || task.message || "等待任务状态更新。"}</p>
                  <div className="task-meta">
                    <span>{task.type === "jd_analysis" ? "JD 解析" : "候选人分析"}</span>
                    <span>{formatTime(task.updatedAt)}</span>
                    {task.retryCount ? <span>重试 {task.retryCount}</span> : null}
                  </div>
                  {task.status === "failed" ? (
                    <div className="task-actions">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void retryTask(task.id);
                        }}
                      >
                        <RotateCcw size={14} />
                        重试
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <div className="task-empty">
              <ClipboardList size={24} />
              <strong>暂无任务</strong>
              <p>{isLoading ? "正在读取任务列表。" : "上传 JD 或添加候选人后，进度会显示在这里。"}</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );

  return (
    <>
      <button className="button task-trigger" type="button" onClick={() => setIsOpen(true)}>
        <ClipboardList size={16} />
        任务
        {activeCount ? <span className="task-count">{activeCount}</span> : null}
      </button>

      {isOpen ? createPortal(drawer, document.body) : null}
    </>
  );
}
