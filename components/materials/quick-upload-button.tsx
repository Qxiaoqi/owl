"use client";

import { FileUp, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type QuickUploadButtonProps = {
  kind: "jd" | "resume" | "paper" | "notes";
  label: string;
  workspaceId?: string;
  candidateId?: string;
  primary?: boolean;
};

export function QuickUploadButton({
  kind,
  label,
  workspaceId = "",
  candidateId = "",
  primary = false,
}: QuickUploadButtonProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toast, setToast] = useState("");
  const [fileName, setFileName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const isJdUpload = kind === "jd";

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

  async function upload(file: File) {
    const formData = new FormData();
    formData.set("workspaceId", workspaceId);
    formData.set("candidateId", candidateId);
    formData.set("kind", kind);
    formData.set("file", file);

    setFileName(file.name);
    setIsUploading(true);

    try {
      const response = await fetch(kind === "jd" ? "/api/workspaces/import" : "/api/parse", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "上传失败");
      }
      setIsOpen(false);
      showToast(isJdUpload ? "JD 已提交解析任务，可在任务列表查看进度" : "上传成功");
      router.refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "上传失败");
    } finally {
      setIsUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  return (
    <span className="quick-upload">
      <button
        className={primary ? "button primary" : "button"}
        disabled={isUploading}
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <Upload size={16} />
        {isUploading ? "上传中" : label}
      </button>
      {toast ? <span className="toast-tip">{toast}</span> : null}
      {isOpen ? (
        <div
          className="upload-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false);
            }
          }}
        >
          <section className="upload-modal" aria-modal="true" role="dialog" aria-label={label}>
            <header className="upload-modal-header">
              <div>
                <h2>{label}</h2>
                <p>{isJdUpload ? "提交后会创建 JD 解析任务，进度可在任务列表查看。" : "支持 PDF、DOCX、TXT、Markdown"}</p>
              </div>
              <button className="icon-button" onClick={() => setIsOpen(false)} type="button" aria-label="关闭">
                <X size={18} />
              </button>
            </header>

            <button
              className={isDragging ? "drop-zone dragging" : "drop-zone"}
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
                const file = event.dataTransfer.files?.[0];
                if (file) {
                  void upload(file);
                }
              }}
            >
              <span className="drop-zone-icon">
                <FileUp size={24} />
              </span>
              <strong>{isUploading ? "正在提交" : isDragging ? "松开以上传" : "拖拽文件到这里"}</strong>
              <span>
                {isUploading
                  ? isJdUpload
                    ? "保存完成后会自动关闭弹窗"
                    : "正在解析并保存 confirmed text"
                  : "或点击选择文件"}
              </span>
              {fileName ? <small>{fileName}</small> : null}
            </button>

            <input
              ref={inputRef}
              className="visually-hidden"
              type="file"
              accept=".pdf,.docx,.txt,.md,.markdown"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) {
                  void upload(file);
                }
              }}
            />

          </section>
        </div>
      ) : null}
    </span>
  );
}
