import { describe, expect, it } from "vitest";
import {
  detectFileKind,
  displayUploadFilename,
  isUploadSourceLabel,
} from "./extract-file";

describe("detectFileKind", () => {
  it("maps extensions", () => {
    expect(detectFileKind("a.PDF")).toBe("pdf");
    expect(detectFileKind("brief.docx")).toBe("docx");
    expect(detectFileKind("notes.md")).toBe("md");
    expect(detectFileKind("notes.markdown")).toBe("md");
    expect(detectFileKind("plain.txt")).toBe("txt");
    expect(detectFileKind("photo.png")).toBeNull();
  });
});

describe("upload source labels", () => {
  it("round-trips filename display", () => {
    expect(isUploadSourceLabel("upload:brochure.pdf")).toBe(true);
    expect(displayUploadFilename("upload:brochure.pdf")).toBe("brochure.pdf");
    expect(isUploadSourceLabel("https://example.com")).toBe(false);
  });
});
