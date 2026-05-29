export type ParsedMaterial = {
  source: string;
  type: "pdf" | "docx" | "txt" | "md" | "paste";
  text?: string;
  pages?: Array<{
    page: number;
    text: string;
  }>;
  paragraphs?: string[];
  parseWarnings?: string[];
};

export type ExtractInput = {
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
};

export interface MaterialParser {
  supports(input: ExtractInput): boolean;
  parse(input: ExtractInput): Promise<ParsedMaterial>;
}
