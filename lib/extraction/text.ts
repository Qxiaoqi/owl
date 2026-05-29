import type { ExtractInput, MaterialParser, ParsedMaterial } from "./types";

const textExtensions = new Set([".txt", ".md", ".markdown"]);

export const textParser: MaterialParser = {
  supports(input: ExtractInput) {
    const lower = input.fileName.toLowerCase();
    return [...textExtensions].some((extension) => lower.endsWith(extension));
  },

  async parse(input: ExtractInput): Promise<ParsedMaterial> {
    const lower = input.fileName.toLowerCase();
    const type = lower.endsWith(".md") || lower.endsWith(".markdown") ? "md" : "txt";
    return {
      source: input.fileName,
      type,
      text: input.buffer.toString("utf8"),
    };
  },
};
