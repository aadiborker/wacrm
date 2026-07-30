/**
 * Extract plain text from uploaded knowledge-base files.
 * Supports PDF, DOCX, Markdown (.md / .markdown), and plain .txt.
 */

import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

export class FileImportError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "FileImportError";
  }
}

export type KnowledgeFileKind = "pdf" | "docx" | "md" | "txt";

export interface ExtractedFile {
  kind: KnowledgeFileKind;
  filename: string;
  title: string;
  content: string;
  /** Stored on ai_knowledge_documents.source_url for display. */
  sourceLabel: string;
}

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_TEXT_CHARS = 120_000;
const MIN_TEXT_CHARS = 40;

const EXT_TO_KIND: Record<string, KnowledgeFileKind> = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".md": "md",
  ".markdown": "md",
  ".txt": "txt",
};

export function detectFileKind(
  filename: string,
  mime?: string | null,
): KnowledgeFileKind | null {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot) : "";
  if (EXT_TO_KIND[ext]) return EXT_TO_KIND[ext];

  const m = (mime ?? "").toLowerCase();
  if (m.includes("pdf")) return "pdf";
  if (
    m.includes(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ) ||
    m.includes("application/msword")
  ) {
    // .doc (legacy) is not supported by mammoth — only treat as docx when
    // the name says so; otherwise reject below.
    return lower.endsWith(".docx") ? "docx" : null;
  }
  if (m.includes("text/markdown") || m.includes("text/x-markdown")) return "md";
  if (m.startsWith("text/plain")) return "txt";
  return null;
}

export async function extractTextFromUpload(
  file: File,
): Promise<ExtractedFile> {
  if (!file || file.size <= 0) {
    throw new FileImportError("Choose a file to upload.");
  }
  if (file.size > MAX_BYTES) {
    throw new FileImportError(
      "File is too large (max 8 MB). Split it or paste the key sections.",
      413,
    );
  }

  const filename = (file.name || "document").trim() || "document";
  const kind = detectFileKind(filename, file.type);
  if (!kind) {
    throw new FileImportError(
      "Unsupported file type. Upload PDF, DOCX, Markdown (.md), or TXT.",
    );
  }
  // Reject legacy .doc even if mime looks word-like
  if (filename.toLowerCase().endsWith(".doc") && !filename.toLowerCase().endsWith(".docx")) {
    throw new FileImportError(
      "Legacy .doc is not supported — save as .docx or PDF and try again.",
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let content = "";

  if (kind === "pdf") {
    content = await extractPdf(buffer);
  } else if (kind === "docx") {
    content = await extractDocx(buffer);
  } else {
    content = buffer.toString("utf8");
    if (kind === "md") content = stripMarkdownNoise(content);
  }

  content = content.replace(/\r\n/g, "\n").trim().slice(0, MAX_TEXT_CHARS);
  if (content.length < MIN_TEXT_CHARS) {
    throw new FileImportError(
      "Could not extract enough text from that file (scanned/image-only PDFs need OCR — paste text instead).",
      422,
    );
  }

  return {
    kind,
    filename,
    title: titleFromFilename(filename),
    content,
    sourceLabel: `upload:${filename}`,
  };
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const text =
      typeof result === "string"
        ? result
        : typeof (result as { text?: string })?.text === "string"
          ? (result as { text: string }).text
          : "";
    return text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "PDF parse failed";
    throw new FileImportError(`Could not read PDF: ${msg}`, 422);
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? "";
  } catch (err) {
    const msg = err instanceof Error ? err.message : "DOCX parse failed";
    throw new FileImportError(`Could not read DOCX: ${msg}`, 422);
  }
}

function titleFromFilename(filename: string): string {
  return filename
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .slice(0, 200) || "Uploaded document";
}

/** Light cleanup so front matter / excessive markdown junk don't dominate. */
function stripMarkdownNoise(src: string): string {
  let s = src;
  if (s.startsWith("---")) {
    const end = s.indexOf("\n---", 3);
    if (end !== -1) s = s.slice(end + 4);
  }
  return s
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1");
}

export function isUploadSourceLabel(source: string | null | undefined): boolean {
  return !!source && source.startsWith("upload:");
}

export function displayUploadFilename(source: string): string {
  return source.replace(/^upload:/, "");
}
