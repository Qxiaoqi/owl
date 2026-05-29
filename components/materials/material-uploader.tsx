"use client";

import { Upload } from "lucide-react";
import { useState } from "react";

type ParseResponse = {
  ok: boolean;
  text?: string;
  warnings?: string[];
  error?: string;
};

type MaterialUploaderProps = {
  defaultKind?: string;
  title?: string;
  eyebrow?: string;
};

export function MaterialUploader({
  defaultKind = "resume",
  title = "材料解析",
  eyebrow = "Materials",
}: MaterialUploaderProps) {
  const [kind, setKind] = useState(defaultKind);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState("");
  const [status, setStatus] = useState("等待上传或粘贴");
  const [isPending, setIsPending] = useState(false);

  async function parse(formData: FormData) {
    setIsPending(true);
    setStatus("解析中");

    try {
      formData.set("workspaceId", "demo");
      formData.set("candidateId", "demo");
      formData.set("kind", kind);
      if (text.trim()) {
        formData.set("text", text);
      }

      const response = await fetch("/api/parse", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as ParseResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "解析失败");
      }

      setPreview(data.text || "");
      setStatus(data.warnings?.length ? data.warnings.join("；") : "已解析并写入 confirmed text");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "解析失败");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="section-label">{eyebrow}</p>
          <h2 className="panel-title">{title}</h2>
        </div>
        <span className="badge ready">{status}</span>
      </div>
      <div className="panel-body">
        <form action={parse} className="material-drop">
          <div className="form-grid">
            <label className="field-label">
              材料类型
              <select className="select" value={kind} onChange={(event) => setKind(event.target.value)}>
                <option value="resume">简历</option>
                <option value="paper">论文</option>
                <option value="notes">面试记录</option>
                <option value="jd">JD</option>
              </select>
            </label>
            <label className="field-label">
              上传文件
              <input className="file-input" name="file" type="file" accept=".pdf,.docx,.txt,.md,.markdown" />
            </label>
          </div>
          <label className="field-label">
            confirmed text
            <textarea
              className="textarea"
              placeholder="也可以直接粘贴文本。粘贴文本会优先作为 confirmed text 保存。"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          <button className="button primary" disabled={isPending} type="submit">
            <Upload size={16} />
            {isPending ? "解析中" : "解析并确认"}
          </button>
        </form>

        {preview ? (
          <textarea
            className="textarea"
            readOnly
            style={{ marginTop: 14 }}
            value={preview}
            aria-label="解析预览"
          />
        ) : null}
      </div>
    </div>
  );
}
