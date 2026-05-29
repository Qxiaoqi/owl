"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import type { QuestionTree, ResumeAnnotations, ResumeTranslationLayout } from "@/lib/analysis/schemas";

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();
  return pdfjs;
}

type ResumeAnnotation = ResumeAnnotations["annotations"][number];
type InterviewQuestion = QuestionTree["questions"][number];
type Selection =
  | { type: "annotation"; id: string }
  | { type: "question"; id: string }
  | { type: "supplemental" }
  | null;

type TextSpan = {
  id: string;
  text: string;
  left: number;
  top: number;
  fontSize: number;
  width: number;
  height: number;
};

function questionBelongsToBlock(question: InterviewQuestion, sourceBlockId: string) {
  return question.sourceBlockId === sourceBlockId;
}

export function PdfResumeViewer({ sourceUrl, fileName, layout, annotations, questions }: {
  sourceUrl: string;
  fileName?: string;
  layout?: ResumeTranslationLayout | null;
  annotations?: ResumeAnnotation[];
  questions?: InterviewQuestion[];
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pdfjs, setPdfjs] = useState<PdfJs | null>(null);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<Selection>(null);
  const safeAnnotations = annotations ?? [];
  const safeQuestions = questions ?? [];
  const annotationsByBlock = new Map<string, ResumeAnnotation[]>();
  for (const annotation of safeAnnotations) {
    const current = annotationsByBlock.get(annotation.sourceBlockId) ?? [];
    current.push(annotation);
    annotationsByBlock.set(annotation.sourceBlockId, current);
  }
  const inlineQuestionIds = new Set<string>();
  for (const block of layout?.blocks ?? []) {
    for (const question of safeQuestions) {
      if (questionBelongsToBlock(question, block.sourceBlockId)) {
        inlineQuestionIds.add(question.id);
      }
    }
  }
  const supplementalQuestions = safeQuestions.filter((question) => !inlineQuestionIds.has(question.id));
  const selectedAnnotation =
    selection?.type === "annotation" ? safeAnnotations.find((annotation) => annotation.id === selection.id) ?? null : null;
  const selectedQuestion =
    selection?.type === "question" ? safeQuestions.find((question) => question.id === selection.id) ?? null : null;
  const linkedQuestionBadges = selectedAnnotation
    ? safeQuestions.filter((question) => selectedAnnotation.linkedQuestionIds.includes(question.id))
    : [];
  const questionAnnotations = selectedQuestion
    ? safeAnnotations.filter((annotation) => selectedQuestion.linkedAnnotationIds.includes(annotation.id))
    : [];
  const questionIndexById = new Map<string, number>();
  safeQuestions.forEach((question, index) => questionIndexById.set(question.id, index + 1));

  useEffect(() => {
    let cancelled = false;
    setError("");
    setPdf(null);

    loadPdfJs()
      .then(async (loadedPdfjs) => {
        const document = await loadedPdfjs.getDocument({ url: sourceUrl }).promise;
        if (!cancelled) {
          setPdfjs(loadedPdfjs);
          setPdf(document);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "PDF 加载失败。");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sourceUrl]);

  if (error) {
    return (
      <div className="pdf-empty">
        <strong>PDF 原文加载失败</strong>
        <p>{error}</p>
      </div>
    );
  }

  if (!pdf || !pdfjs) {
    return (
      <div className="pdf-empty">
        <strong>正在加载 PDF 原文</strong>
        <p>{fileName || "source.pdf"}</p>
      </div>
    );
  }

  return (
    <>
      <div className="pdf-viewer" aria-label="PDF 原文预览">
        {Array.from({ length: pdf.numPages }, (_, index) => (
          <PdfPageView
            annotationsByBlock={annotationsByBlock}
            document={pdf}
            key={index + 1}
            layout={layout ?? null}
            pageNumber={index + 1}
            pdfjs={pdfjs}
            questionIndexById={questionIndexById}
            questions={safeQuestions}
            setSelection={setSelection}
          />
        ))}
      </div>

      {supplementalQuestions.length ? (
        <button
          className="supplemental-question-tab"
          type="button"
          onClick={() => setSelection({ type: "supplemental" })}
          aria-label={`补充问题 ${supplementalQuestions.length} 个`}
        >
          <span>补充问题</span>
          <strong>{supplementalQuestions.length}</strong>
        </button>
      ) : null}

      {selection ? (
        <AnnotationDrawer
          linkedQuestionBadges={linkedQuestionBadges}
          questionAnnotations={questionAnnotations}
          questionIndexById={questionIndexById}
          selectedAnnotation={selectedAnnotation}
          selectedQuestion={selectedQuestion}
          selection={selection}
          setSelection={setSelection}
          supplementalQuestions={supplementalQuestions}
        />
      ) : null}
    </>
  );
}

function PdfPageView({
  document,
  pageNumber,
  pdfjs,
  layout,
  annotationsByBlock,
  questions,
  questionIndexById,
  setSelection,
}: {
  document: PDFDocumentProxy;
  pageNumber: number;
  pdfjs: PdfJs;
  layout: ResumeTranslationLayout | null;
  annotationsByBlock: Map<string, ResumeAnnotation[]>;
  questions: InterviewQuestion[];
  questionIndexById: Map<string, number>;
  setSelection: (selection: Selection) => void;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [textSpans, setTextSpans] = useState<TextSpan[]>([]);

  useEffect(() => {
    let cancelled = false;
    let renderTask: RenderTask | null = null;

    async function renderPage() {
      const page = await document.getPage(pageNumber);
      if (cancelled) {
        return;
      }

      const containerWidth = pageRef.current?.clientWidth || 680;
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.max(0.75, containerWidth / baseViewport.width);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) {
        return;
      }

      const deviceScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * deviceScale);
      canvas.height = Math.floor(viewport.height * deviceScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
      setPageSize({ width: viewport.width, height: viewport.height });

      renderTask = page.render({ canvas, canvasContext: context, viewport });
      await renderTask.promise;

      if (!cancelled) {
        const spans = await createTextSpans(page, viewport, pdfjs);
        setTextSpans(spans);
      }
    }

    void renderPage();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [document, pageNumber, pdfjs]);

  return (
    <div className="pdf-page-wrap" ref={pageRef}>
      <div className="pdf-page" style={{ width: pageSize.width || undefined, height: pageSize.height || undefined }}>
        <canvas className="pdf-canvas" ref={canvasRef} />
        <div className="pdf-text-layer" aria-hidden="true">
          {textSpans.map((span) => (
            <span
              key={span.id}
              style={{
                left: span.left,
                top: span.top,
                fontSize: span.fontSize,
                width: span.width,
                height: span.height,
              }}
            >
              {span.text}
            </span>
          ))}
        </div>
        {layout ? (
          <PdfAnnotationLayer
            annotationsByBlock={annotationsByBlock}
            layout={layout}
            pageNumber={pageNumber}
            questionIndexById={questionIndexById}
            questions={questions}
            setSelection={setSelection}
          />
        ) : null}
      </div>
      <div className="pdf-page-number">Page {pageNumber}</div>
    </div>
  );
}

function categoryClass(category: string) {
  if (category === "risk") {
    return "red";
  }
  if (category === "concept") {
    return "amber";
  }
  return "blue";
}

function categoryLabel(category: string) {
  const labels: Record<string, string> = {
    strength: "优势",
    risk: "风险",
    concept: "概念",
    evidence: "证据",
  };
  return labels[category] ?? "标注";
}

function questionTypeLabel(questionType: string) {
  const labels: Record<string, string> = {
    project_deep_dive: "项目深挖",
    jd_fit: "JD 匹配",
    risk_check: "风险核验",
  };
  return labels[questionType] ?? "面试问题";
}

function PdfAnnotationLayer({
  layout,
  pageNumber,
  annotationsByBlock,
  questions,
  questionIndexById,
  setSelection,
}: {
  layout: ResumeTranslationLayout;
  pageNumber: number;
  annotationsByBlock: Map<string, ResumeAnnotation[]>;
  questions: InterviewQuestion[];
  questionIndexById: Map<string, number>;
  setSelection: (selection: Selection) => void;
}) {
  const page = layout.pages.find((item) => item.page === pageNumber);
  if (!page) {
    return null;
  }
  const pageBlocks = layout.blocks.filter((block) => block.page === pageNumber);
  return (
    <div className="pdf-annotation-layer" aria-label="简历标注层">
      {pageBlocks.map((block) => {
        const blockAnnotations = annotationsByBlock.get(block.sourceBlockId) ?? [];
        const primaryAnnotation = blockAnnotations[0];
        const blockQuestions = questions.filter((question) => questionBelongsToBlock(question, block.sourceBlockId));
        if (!primaryAnnotation && !blockQuestions.length) {
          return null;
        }
        return (
          <button
            className={`pdf-annotation-block${primaryAnnotation ? ` annotated ${categoryClass(primaryAnnotation.category)}` : ""}`}
            key={block.id}
            type="button"
            onClick={() => primaryAnnotation && setSelection({ type: "annotation", id: primaryAnnotation.id })}
            style={{
              left: `${(block.box.x / page.width) * 100}%`,
              top: `${(block.box.y / page.height) * 100}%`,
              width: `${(block.box.width / page.width) * 100}%`,
              height: `${(Math.max(block.box.height, block.fontSize * 1.4) / page.height) * 100}%`,
            }}
            title={primaryAnnotation?.title}
          >
            {blockQuestions.length ? (
              <span className="pdf-question-pills" aria-label="关联问题">
                {blockQuestions.map((question) => (
                  <span
                    className="inline-question-pill"
                    key={question.id}
                    role="button"
                    tabIndex={0}
                    title={question.question}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelection({ type: "question", id: question.id });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        setSelection({ type: "question", id: question.id });
                      }
                    }}
                  >
                    Q{questionIndexById.get(question.id) ?? "?"}
                  </span>
                ))}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function AnnotationDrawer({
  selection,
  selectedAnnotation,
  selectedQuestion,
  linkedQuestionBadges,
  questionAnnotations,
  supplementalQuestions,
  questionIndexById,
  setSelection,
}: {
  selection: Selection;
  selectedAnnotation: ResumeAnnotation | null;
  selectedQuestion: InterviewQuestion | null;
  linkedQuestionBadges: InterviewQuestion[];
  questionAnnotations: ResumeAnnotation[];
  supplementalQuestions: InterviewQuestion[];
  questionIndexById: Map<string, number>;
  setSelection: (selection: Selection) => void;
}) {
  return (
    <div className="annotation-drawer-layer" role="presentation" onClick={() => setSelection(null)}>
      <aside className="annotation-drawer" aria-label="详情" onClick={(event) => event.stopPropagation()}>
        <header>
          {selectedAnnotation ? (
            <div>
              <span className={`badge ${categoryClass(selectedAnnotation.category)}`}>
                {categoryLabel(selectedAnnotation.category)}
              </span>
              <h2>{selectedAnnotation.title}</h2>
            </div>
          ) : null}
          {selectedQuestion ? (
            <div>
              <span className="badge blue">面试问题</span>
              <span className="badge">{questionTypeLabel(selectedQuestion.questionType)}</span>
              <h2>{selectedQuestion.topic || "问题详情"}</h2>
            </div>
          ) : null}
          {selection?.type === "supplemental" ? (
            <div>
              <span className="badge amber">补充问题</span>
              <h2>无简历锚点的问题</h2>
            </div>
          ) : null}
          <button className="icon-button" type="button" aria-label="关闭" onClick={() => setSelection(null)}>
            <X size={18} />
          </button>
        </header>

        {selectedAnnotation ? (
          <>
            <section>
              <h3>标注内容</h3>
              <p>{selectedAnnotation.note || selectedAnnotation.displayText || selectedAnnotation.targetText}</p>
            </section>
            {selectedAnnotation.evidence.length ? (
              <section>
                <h3>证据</h3>
                {selectedAnnotation.evidence.map((item, index) => (
                  <p key={`${item.source}-${index}`}>
                    {item.quote ? `“${item.quote}”` : item.note}
                    {item.quote && item.note ? ` ${item.note}` : null}
                  </p>
                ))}
              </section>
            ) : null}
            {linkedQuestionBadges.length ? (
              <section>
                <h3>关联问题</h3>
                <div className="linked-question-list">
                  {linkedQuestionBadges.map((question, index) => (
                    <button
                      type="button"
                      key={question.id}
                      onClick={() => setSelection({ type: "question", id: question.id })}
                    >
                      Q{questionIndexById.get(question.id) ?? index + 1}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        {selectedQuestion ? (
          <>
            <section>
              <h3>主问题</h3>
              <p>{selectedQuestion.question}</p>
            </section>
            <section>
              <h3>验证目的</h3>
              <p>{selectedQuestion.purpose}</p>
            </section>
            {selectedQuestion.goodAnswer ? (
              <section>
                <h3>好回答特征</h3>
                <p>{selectedQuestion.goodAnswer}</p>
              </section>
            ) : null}
            {selectedQuestion.goodAnswerExample ? (
              <section>
                <h3>好的回答例子</h3>
                <p>{selectedQuestion.goodAnswerExample}</p>
              </section>
            ) : null}
            {selectedQuestion.weakAnswerSignals.length ? (
              <section>
                <h3>弱回答信号</h3>
                <ul className="drawer-list">
                  {selectedQuestion.weakAnswerSignals.map((signal) => (
                    <li key={signal}>{signal}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {selectedQuestion.followUps.length ? (
              <section>
                <h3>追问</h3>
                <ul className="drawer-list">
                  {selectedQuestion.followUps.map((followUp) => (
                    <li key={followUp}>{followUp}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {questionAnnotations.length ? (
              <section>
                <h3>关联标注</h3>
                <div className="linked-annotation-list">
                  {questionAnnotations.map((annotation) => (
                    <button
                      type="button"
                      key={annotation.id}
                      onClick={() => setSelection({ type: "annotation", id: annotation.id })}
                    >
                      <span className={`badge ${categoryClass(annotation.category)}`}>
                        {categoryLabel(annotation.category)}
                      </span>
                      <strong>{annotation.title}</strong>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        {selection?.type === "supplemental" ? (
          <section>
            <h3>补充问题</h3>
            <div className="supplemental-question-list">
              {supplementalQuestions.map((question) => (
                <button
                  type="button"
                  key={question.id}
                  onClick={() => setSelection({ type: "question", id: question.id })}
                >
                  <span>Q{questionIndexById.get(question.id) ?? "?"}</span>
                  <strong>{question.topic || question.question}</strong>
                  <small>{question.question}</small>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </aside>
    </div>
  );
}

async function createTextSpans(page: PDFPageProxy, viewport: ReturnType<PDFPageProxy["getViewport"]>, pdfjs: PdfJs) {
  const textContent = await page.getTextContent();

  return textContent.items
    .filter((item) => "str" in item && Boolean(item.str.trim()))
    .map((item, index) => {
      const textItem = item as { str: string; transform: number[]; width: number; height: number };
      const tx = pdfjs.Util.transform(viewport.transform, textItem.transform);
      const fontSize = Math.hypot(tx[2], tx[3]);
      const height = Math.max(fontSize, textItem.height * viewport.scale);
      return {
        id: `${index}-${textItem.str}`,
        text: textItem.str,
        left: tx[4],
        top: tx[5] - height,
        fontSize,
        width: Math.max(1, textItem.width * viewport.scale),
        height,
      };
    });
}
