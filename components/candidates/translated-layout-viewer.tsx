"use client";

import { X } from "lucide-react";
import { useMemo, useState } from "react";
import type { QuestionTree, ResumeAnnotations, ResumeTranslationLayout } from "@/lib/analysis/schemas";

type ResumeAnnotation = ResumeAnnotations["annotations"][number];
type InterviewQuestion = QuestionTree["questions"][number];
type TranslatedBlock = ResumeTranslationLayout["blocks"][number];
type Selection =
  | { type: "annotation"; id: string }
  | { type: "question"; id: string }
  | { type: "supplemental" }
  | null;

function containsCjk(text: string) {
  return /[\u3400-\u9fff]/.test(text);
}

function translatedFontSize(block: TranslatedBlock) {
  const scaleByType: Record<TranslatedBlock["type"], number> = {
    name: 1.14,
    contact: 1.04,
    section: 1.16,
    line: 1.18,
  };
  const scale = containsCjk(block.translatedText) ? scaleByType[block.type] : 1.08;
  const maxByType: Record<TranslatedBlock["type"], number> = {
    name: 32,
    contact: 16,
    section: 26,
    line: 30,
  };
  return Math.max(11, Math.min(maxByType[block.type], block.fontSize * scale));
}

function mergeCrowdedTranslatedBlocks(blocks: TranslatedBlock[]) {
  const merged: TranslatedBlock[] = [];
  const ordered = [...blocks].sort((a, b) => (Math.abs(a.box.y - b.box.y) > 1 ? a.box.y - b.box.y : a.box.x - b.box.x));

  for (const block of ordered) {
    const previous = merged.at(-1);
    const shouldMerge =
      previous &&
      previous.type === "line" &&
      block.type === "line" &&
      Math.abs(previous.box.x - block.box.x) <= 36 &&
      block.box.y - previous.box.y < Math.max(previous.fontSize, block.fontSize) * 0.75;

    if (!shouldMerge) {
      merged.push(block);
      continue;
    }

    const right = Math.max(previous.box.x + previous.box.width, block.box.x + block.box.width);
    const bottom = Math.max(previous.box.y + previous.box.height, block.box.y + block.box.height);
    merged[merged.length - 1] = {
      ...previous,
      id: `${previous.id}_${block.id}`,
      translatedText: `${previous.translatedText} ${normalizeBullet(block.translatedText)}`.replace(/\s+/g, " ").trim(),
      sourceText: `${previous.sourceText} ${normalizeBullet(block.sourceText)}`.replace(/\s+/g, " ").trim(),
      box: {
        ...previous.box,
        x: Math.min(previous.box.x, block.box.x),
        width: right - Math.min(previous.box.x, block.box.x),
        height: bottom - previous.box.y,
      },
    };
  }

  return merged;
}

function normalizeBullet(text: string) {
  return text.replace(/^\s*[●•]\s*/, "");
}

function isEmphasizedLine(block: TranslatedBlock) {
  if (block.type !== "line") {
    return false;
  }
  const text = block.sourceText.trim();
  const dateRange =
    /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z.]*\s+\d{4}\s*[-–]\s*(?:Present|Current|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z.]*\s+\d{4}|\d{4})/i;
  const numericRange = /\b(?:19|20)\d{2}(?:[./-]\d{1,2})?\s*[-–]\s*(?:Present|Current|(?:19|20)\d{2}(?:[./-]\d{1,2})?)/i;
  return (dateRange.test(text) || numericRange.test(text)) && /[,|]/.test(text);
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

function questionBelongsToBlock(question: InterviewQuestion, sourceBlockId: string) {
  return question.sourceBlockId === sourceBlockId;
}

export function TranslatedLayoutViewer({
  layout,
  annotations,
  questions,
}: {
  layout: ResumeTranslationLayout;
  annotations: ResumeAnnotation[];
  questions: InterviewQuestion[];
}) {
  const [selection, setSelection] = useState<Selection>(null);
  const annotationsByBlock = useMemo(() => {
    const map = new Map<string, ResumeAnnotation[]>();
    for (const annotation of annotations) {
      const current = map.get(annotation.sourceBlockId) ?? [];
      current.push(annotation);
      map.set(annotation.sourceBlockId, current);
    }
    return map;
  }, [annotations]);
  const selectedAnnotation =
    selection?.type === "annotation" ? annotations.find((annotation) => annotation.id === selection.id) ?? null : null;
  const selectedQuestion =
    selection?.type === "question" ? questions.find((question) => question.id === selection.id) ?? null : null;
  const linkedQuestionBadges = selectedAnnotation
    ? questions.filter((question) => selectedAnnotation.linkedQuestionIds.includes(question.id))
    : [];
  const questionAnnotations = selectedQuestion
    ? annotations.filter((annotation) => selectedQuestion.linkedAnnotationIds.includes(annotation.id))
    : [];
  const inlineQuestionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const block of layout.blocks) {
      const blockQuestions = questions.filter((question) => questionBelongsToBlock(question, block.sourceBlockId));
      for (const question of blockQuestions) {
        ids.add(question.id);
      }
    }
    return ids;
  }, [layout.blocks, questions]);
  const supplementalQuestions = questions.filter((question) => !inlineQuestionIds.has(question.id));
  const questionIndexById = useMemo(() => {
    const map = new Map<string, number>();
    questions.forEach((question, index) => map.set(question.id, index + 1));
    return map;
  }, [questions]);

  if (!layout.pages.length || !layout.blocks.length) {
    return null;
  }

  return (
    <>
      <div className="translated-layout-viewer">
        {layout.pages.map((page) => {
          const pageBlocks = mergeCrowdedTranslatedBlocks(layout.blocks.filter((block) => block.page === page.page));
          return (
            <div className="translated-layout-page-wrap" key={page.page}>
              <div className="translated-layout-page" style={{ aspectRatio: `${page.width} / ${page.height}` }}>
                {pageBlocks.map((block) => {
                  const blockAnnotations = annotationsByBlock.get(block.sourceBlockId) ?? [];
                  const primaryAnnotation = blockAnnotations[0];
                  const blockQuestions = questions.filter((question) =>
                    questionBelongsToBlock(question, block.sourceBlockId),
                  );
                  const isBullet = /^\s*[●•]/.test(block.translatedText);
                  const rightPadding = block.type === "section" || block.type === "name" ? 42 : 24;
                  const readableWidth = page.width - block.box.x - rightPadding;
                  return (
                    <button
                      className={`translated-layout-block ${block.type}${isBullet ? " bullet" : ""}${
                        isEmphasizedLine(block) ? " emphasized" : ""
                      }${
                        primaryAnnotation ? ` annotated ${categoryClass(primaryAnnotation.category)}` : ""
                      }`}
                      key={block.id}
                      type="button"
                      data-source-block-id={block.sourceBlockId}
                      disabled={!primaryAnnotation}
                      onClick={() => primaryAnnotation && setSelection({ type: "annotation", id: primaryAnnotation.id })}
                      style={{
                        left: `${(block.box.x / page.width) * 100}%`,
                        top: `${(block.box.y / page.height) * 100}%`,
                        width: `${Math.min(96, (readableWidth / page.width) * 100)}%`,
                        fontSize: `${translatedFontSize(block)}px`,
                      }}
                    >
                      {isBullet ? normalizeBullet(block.translatedText) : block.translatedText}
                      {primaryAnnotation ? (
                        <span className="annotation-tooltip">
                          <strong>{primaryAnnotation.title}</strong>
                          {primaryAnnotation.note}
                        </span>
                      ) : null}
                      {blockQuestions.length ? (
                        <span className="inline-question-pills" aria-label="关联问题">
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
              <div className="pdf-page-number">Page {page.page}</div>
            </div>
          );
        })}
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
              {selection.type === "supplemental" ? (
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

            {selection.type === "supplemental" ? (
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
      ) : null}
    </>
  );
}
