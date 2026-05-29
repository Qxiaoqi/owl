"use client";

import { PdfResumeViewer } from "@/components/candidates/pdf-resume-viewer";
import { TranslatedLayoutViewer } from "@/components/candidates/translated-layout-viewer";
import type { QuestionTree, ResumeAnnotations, ResumeTranslationLayout } from "@/lib/analysis/schemas";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

export function ResumeReview({
  candidateName,
  resumeText,
  translationLayout,
  annotations,
  questions,
  showTranslation,
  resumeSource,
}: {
  candidateName: string;
  resumeText?: string;
  translationLayout?: ResumeTranslationLayout | null;
  annotations?: ResumeAnnotations["annotations"];
  questions?: QuestionTree["questions"];
  showTranslation?: boolean;
  resumeSource?: {
    url: string;
    fileName?: string;
    mimeType?: string;
  };
}) {
  const normalizedText = resumeText?.trim();
  const hasLayout = Boolean(translationLayout);
  const hasPdfSource = resumeSource?.mimeType === "application/pdf";
  const useOriginalForAnnotations = hasLayout && hasPdfSource;
  const showAnnotatedPdf = useOriginalForAnnotations;
  const shouldShowTranslatedPage = showTranslation !== false;
  const canToggleOriginal = showTranslation !== false && hasLayout && !useOriginalForAnnotations;
  const [isOriginalHidden, setIsOriginalHidden] = useState(false);
  const shouldHideOriginal = canToggleOriginal && isOriginalHidden;
  const shouldShowOriginal = useOriginalForAnnotations || showTranslation === false || !shouldHideOriginal;

  if (!normalizedText) {
    return (
      <section className="paper-card">
        <div className="empty-state">
          <h2>还没有简历文本</h2>
          <p>请回到候选人列表，通过“添加候选人”上传简历。</p>
        </div>
      </section>
    );
  }

  return (
    <>
      {canToggleOriginal ? (
        <div className="resume-view-controls" aria-label="简历视图切换">
          <span>简历视图</span>
          <button
            className="button resume-original-toggle"
            type="button"
            aria-pressed={shouldHideOriginal}
            onClick={() => setIsOriginalHidden((current) => !current)}
            title={shouldHideOriginal ? "显示英文原文" : "收起英文原文"}
          >
            {shouldHideOriginal ? <Eye size={16} /> : <EyeOff size={16} />}
            {shouldHideOriginal ? "显示原文" : "收起原文"}
          </button>
        </div>
      ) : null}

      <section
        className={`resume-shell${!shouldShowTranslatedPage ? " single" : ""}${
          shouldHideOriginal ? " source-collapsed" : ""
        }`}
        aria-label="简历详情"
      >
        {shouldShowOriginal ? (
          <article
            className={`original-source-page ${
              resumeSource?.mimeType === "application/pdf" ? "resume-page pdf-source-page" : "resume-page"
            }`}
          >
            <div className="resume-page-header">
              <span>Original Resume</span>
              <span>{showAnnotatedPdf ? "PDF source · 标注与问题" : resumeSource?.mimeType === "application/pdf" ? "PDF source" : "confirmed text"}</span>
            </div>
            {resumeSource?.mimeType === "application/pdf" ? (
              <PdfResumeViewer
                sourceUrl={resumeSource.url}
                fileName={resumeSource.fileName}
                layout={useOriginalForAnnotations ? translationLayout : null}
                annotations={useOriginalForAnnotations ? (annotations ?? []) : []}
                questions={useOriginalForAnnotations ? (questions ?? []) : []}
              />
            ) : (
              <>
                <h1 className="resume-name">{candidateName}</h1>
                <pre className="resume-text">{normalizedText}</pre>
              </>
            )}
          </article>
        ) : null}

        {shouldShowTranslatedPage ? (
          <article className="resume-page chinese translated-source-page">
            <div className="resume-page-header">
              <span>Chinese Resume</span>
              <span>{translationLayout ? "中文翻译" : "待生成"}</span>
            </div>
            {translationLayout ? (
              <TranslatedLayoutViewer
                layout={translationLayout}
                annotations={useOriginalForAnnotations ? [] : (annotations ?? [])}
                questions={useOriginalForAnnotations ? [] : (questions ?? [])}
              />
            ) : (
              <div className="empty-state compact">
                <h2>坐标化中文版待生成</h2>
                <p>重新运行候选人分析后，这里会展示和原 PDF 版式对应的中文版本。</p>
              </div>
            )}
          </article>
        ) : null}
      </section>
    </>
  );
}
