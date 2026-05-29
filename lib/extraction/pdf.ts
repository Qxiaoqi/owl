import { extractPdfText } from "@/lib/pdf/source-layout";
import type { ExtractInput, MaterialParser, ParsedMaterial } from "./types";

export const pdfParser: MaterialParser = {
  supports(input: ExtractInput) {
    return input.fileName.toLowerCase().endsWith(".pdf") || input.mimeType === "application/pdf";
  },

  async parse(input: ExtractInput): Promise<ParsedMaterial> {
    const result = await extractPdfText(input.buffer);
    const text = result.text.trim();
    const warnings = text.length === 0 ? ["PDF parsed empty text. Upload DOCX/TXT or paste text."] : [];

    return {
      source: input.fileName,
      type: "pdf",
      text,
      pages: result.pages,
      parseWarnings: warnings,
    };
  },
};
