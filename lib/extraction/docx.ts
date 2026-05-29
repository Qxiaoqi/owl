import mammoth from "mammoth";
import type { ExtractInput, MaterialParser, ParsedMaterial } from "./types";

export const docxParser: MaterialParser = {
  supports(input: ExtractInput) {
    return input.fileName.toLowerCase().endsWith(".docx");
  },

  async parse(input: ExtractInput): Promise<ParsedMaterial> {
    const result = await mammoth.extractRawText({ buffer: input.buffer });
    const paragraphs = result.value
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);

    return {
      source: input.fileName,
      type: "docx",
      text: result.value,
      paragraphs,
      parseWarnings: result.messages.map((message) => message.message),
    };
  },
};
