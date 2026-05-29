import "pdfjs-dist/legacy/build/pdf.worker.mjs";
import { getDocument, Util, type PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { ResumeSourceLayout, ResumeSourceLayoutBlock } from "@/lib/analysis/schemas";

type TextItemLike = {
  str: string;
  transform: number[];
  width: number;
  height: number;
};

type TextSpan = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
};

type TextLine = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
};

type TypedTextLine = TextLine & {
  type: ResumeSourceLayoutBlock["type"];
};

function median(values: number[]) {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function pageToSpans(page: PDFPageProxy) {
  const viewport = page.getViewport({ scale: 1 });
  const textContent = await page.getTextContent();
  const spans = textContent.items
    .filter((item) => "str" in item && Boolean(item.str.trim()))
    .map((item) => {
      const textItem = item as TextItemLike;
      const tx = Util.transform(viewport.transform, textItem.transform);
      const fontSize = Math.hypot(tx[2], tx[3]);
      const height = Math.max(fontSize, textItem.height);
      return {
        text: textItem.str,
        x: tx[4],
        y: tx[5] - height,
        width: Math.max(1, textItem.width),
        height,
        fontSize,
      };
    })
    .sort((a, b) => (Math.abs(a.y - b.y) > 2 ? a.y - b.y : a.x - b.x));

  return { viewport, spans };
}

function spansToLines(spans: TextSpan[]): TextLine[] {
  const lines: TextSpan[][] = [];

  for (const span of spans) {
    const line = lines.find((item) => Math.abs(item[0].y - span.y) <= Math.max(2.5, span.fontSize * 0.25));
    if (line) {
      line.push(span);
    } else {
      lines.push([span]);
    }
  }

  return lines
    .map((line) => {
      const sorted = line.sort((a, b) => a.x - b.x);
      const x = Math.min(...sorted.map((span) => span.x));
      const y = Math.min(...sorted.map((span) => span.y));
      const right = Math.max(...sorted.map((span) => span.x + span.width));
      const bottom = Math.max(...sorted.map((span) => span.y + span.height));
      return {
        text: sorted.map((span) => span.text).join(" ").replace(/\s+/g, " ").trim(),
        x,
        y,
        width: right - x,
        height: bottom - y,
        fontSize: median(sorted.map((span) => span.fontSize)),
      };
    })
    .filter((line) => line.text);
}

function inferLineType(line: TextLine, index: number, allLines: TextLine[]): ResumeSourceLayoutBlock["type"] {
  const fontMedian = median(allLines.map((item) => item.fontSize));
  const leftMedian = median(allLines.map((item) => item.x));
  const wordCount = line.text.split(/\s+/).filter(Boolean).length;

  if (index === 0 || (index < 3 && line.fontSize >= fontMedian * 1.35 && wordCount <= 5)) {
    return "name";
  }
  if (index < 4 && /@|\+?\d[\d\s().-]{6,}/.test(line.text)) {
    return "contact";
  }
  if (
    line.fontSize >= fontMedian * 1.12 &&
    line.x <= leftMedian + 24 &&
    line.text.length <= 48 &&
    wordCount <= 6
  ) {
    return "section";
  }
  return "line";
}

function startsBullet(text: string) {
  return /^\s*[●•]\s*/.test(text);
}

function looksLikeResumeHeading(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const dateRange =
    /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z.]*\s+\d{4}\s*[-–]\s*(?:Present|Current|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z.]*\s+\d{4}|\d{4})/i;
  const numericRange = /\b(?:19|20)\d{2}(?:[./-]\d{1,2})?\s*[-–]\s*(?:Present|Current|(?:19|20)\d{2}(?:[./-]\d{1,2})?)/i;
  const hasRoleSeparator = /[,|]/.test(normalized);
  return (dateRange.test(normalized) || numericRange.test(normalized)) && hasRoleSeparator;
}

function mergeLinesIntoBlocks(lines: TextLine[], pageNumber: number): TypedTextLine[] {
  const typedLines = lines.map((line, index) => ({
    ...line,
    type: pageNumber === 1 ? inferLineType(line, index, lines) : inferLineType(line, index + 4, lines),
  }));
  const blocks: TypedTextLine[] = [];

  for (const line of typedLines) {
    const previous = blocks.at(-1);
    const previousBottom = previous ? previous.y + previous.height : 0;
    const verticalGap = previous ? line.y - previousBottom : Number.POSITIVE_INFINITY;
    const isContinuation =
      previous &&
      previous.type === "line" &&
      line.type === "line" &&
      !startsBullet(line.text) &&
      !looksLikeResumeHeading(previous.text) &&
      verticalGap >= 0 &&
      verticalGap <= Math.max(previous.fontSize, line.fontSize) * 1.05 &&
      line.x >= previous.x + 4;

    if (!isContinuation) {
      blocks.push({ ...line });
      continue;
    }

    const right = Math.max(previous.x + previous.width, line.x + line.width);
    const bottom = Math.max(previous.y + previous.height, line.y + line.height);
    previous.text = `${previous.text} ${line.text}`.replace(/\s+/g, " ").trim();
    previous.width = right - previous.x;
    previous.height = bottom - previous.y;
    previous.fontSize = median([previous.fontSize, line.fontSize]);
  }

  return blocks;
}

export async function extractPdfSourceLayout(buffer: Buffer): Promise<ResumeSourceLayout> {
  const document = await getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
  }).promise;

  const pages: ResumeSourceLayout["pages"] = [];
  const blocks: ResumeSourceLayout["blocks"] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const { viewport, spans } = await pageToSpans(page);
    const lines = mergeLinesIntoBlocks(spansToLines(spans), pageNumber);
    pages.push({ page: pageNumber, width: viewport.width, height: viewport.height });
    lines.forEach((line, index) => {
      blocks.push({
        id: `p${pageNumber}_b${index}`,
        page: pageNumber,
        type: line.type,
        text: line.text,
        box: {
          x: line.x,
          y: line.y,
          width: line.width,
          height: line.height,
        },
        fontSize: line.fontSize,
      });
    });
  }

  await document.destroy();
  return { pages, blocks };
}

export async function extractPdfText(buffer: Buffer) {
  const layout = await extractPdfSourceLayout(buffer);
  const pages = layout.pages.map((page) => ({
    page: page.page,
    text: layout.blocks
      .filter((block) => block.page === page.page)
      .map((block) => block.text)
      .join("\n"),
  }));

  return {
    text: pages.map((page) => page.text).join("\n\n").trim(),
    pages,
  };
}
