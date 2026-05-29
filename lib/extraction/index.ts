import { docxParser } from "./docx";
import { pdfParser } from "./pdf";
import { textParser } from "./text";
import type { ExtractInput, ParsedMaterial } from "./types";

const parsers = [pdfParser, docxParser, textParser];

export async function parseMaterial(input: ExtractInput): Promise<ParsedMaterial> {
  const parser = parsers.find((candidate) => candidate.supports(input));
  if (!parser) {
    throw new Error(`Unsupported material type: ${input.fileName}`);
  }
  return parser.parse(input);
}

export function parsedMaterialToText(material: ParsedMaterial): string {
  if (material.text) {
    return material.text;
  }
  if (material.pages?.length) {
    return material.pages.map((page) => page.text).join("\n\n");
  }
  if (material.paragraphs?.length) {
    return material.paragraphs.join("\n\n");
  }
  return "";
}
