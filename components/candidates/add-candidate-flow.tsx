"use client";

import { FileUp, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function AddCandidateFlow({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState("");
  const [candidateId, setCandidateId] = useState(() => `candidate-${Date.now()}`);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  function showToast(message: string) {
    setToast(message);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => setToast(""), 2400);
  }

  function resetFlow() {
    setIsDragging(false);
    setIsUploading(false);
    setIsSubmitting(false);
  }

  async function uploadOne(file: File) {
    const formData = new FormData();
    formData.set("workspaceId", workspaceId);
    formData.set("candidateId", candidateId);
    formData.set("kind", "resume");
    formData.set("file", file);

    setIsUploading(true);

    const response = await fetch("/api/parse", {
      method: "POST",
      body: formData,
    });
    const data = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "上传失败");
    }
  }

  async function uploadFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    const targetFiles = files.slice(0, 1);

    if (!targetFiles.length) {
      return;
    }

    setIsUploading(true);

    try {
      for (const file of targetFiles) {
        await uploadOne(file);
      }

      await submitCandidateTask(candidateId);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "上传失败");
    } finally {
      setIsUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  async function submitCandidateTask(targetCandidateId: string) {
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "candidate_analysis",
          workspaceId,
          candidateId: targetCandidateId,
        }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "提交任务失败");
      }

      setIsOpen(false);
      showToast("候选人分析任务已提交，可在任务列表查看进度");
      router.refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "提交任务失败");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button
        className="button primary"
        type="button"
        onClick={() => {
          resetFlow();
          setCandidateId(`candidate-${Date.now()}`);
          setIsOpen(true);
        }}
      >
        <UserPlus size={16} />
        添加候选人
      </button>
      {toast ? <span className="toast-tip">{toast}</span> : null}
      {isOpen ? (
        <div
          className="upload-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (!isUploading && !isSubmitting && event.target === event.currentTarget) {
              setIsOpen(false);
            }
          }}
        >
          <section className="upload-modal candidate-flow" aria-modal="true" role="dialog" aria-label="添加候选人">
            <header className="upload-modal-header">
              <div>
                <h2>添加候选人</h2>
                <p>上传一份候选人简历，系统会解析并创建候选人分析任务。</p>
              </div>
              <button className="icon-button" disabled={isUploading || isSubmitting} onClick={() => setIsOpen(false)} type="button" aria-label="关闭">
                <X size={18} />
              </button>
            </header>

            <button
              className={isDragging ? "drop-zone dragging" : "drop-zone"}
              disabled={isUploading || isSubmitting}
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setIsDragging(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                if (event.dataTransfer.files.length) {
                  void uploadFiles(event.dataTransfer.files);
                }
              }}
            >
              <span className="drop-zone-icon">
                <FileUp size={24} />
              </span>
              <strong>{isSubmitting ? "正在提交任务" : isUploading ? "上传中" : isDragging ? "松开以上传" : "上传简历"}</strong>
              <span>
                {isSubmitting
                  ? "任务创建完成后会自动关闭弹窗"
                  : isDragging
                    ? "文件会作为候选人简历保存"
                    : "支持 PDF、DOCX、TXT、Markdown。上传完成后会自动提交分析任务。"}
              </span>
            </button>

            <input
              ref={inputRef}
              className="visually-hidden"
              type="file"
              accept=".pdf,.docx,.txt,.md,.markdown"
              onChange={(event) => {
                if (event.currentTarget.files?.length) {
                  void uploadFiles(event.currentTarget.files);
                }
              }}
            />
          </section>
        </div>
      ) : null}
    </>
  );
}
