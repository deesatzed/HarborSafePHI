import type { ExtractedPdf } from "./types.ts";
import {
  joinPageTexts,
  reconstructPageText,
  snapshotExtractors,
  type PdfTextSpan,
} from "./pdf-text.ts";

type PdfJsTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
};

function spansFromContent(items: PdfJsTextItem[]): PdfTextSpan[] {
  const spans: PdfTextSpan[] = [];
  for (const item of items) {
    if (typeof item.str !== "string") continue;
    const transform = item.transform;
    spans.push({
      str: item.str,
      x: transform?.[4] ?? 0,
      y: transform?.[5] ?? 0,
      width: item.width ?? 0,
      height: item.height ?? Math.abs(transform?.[3] ?? 0),
      hasEOL: Boolean(item.hasEOL),
    });
  }
  return spans;
}

export async function extractPdfText(file: File): Promise<ExtractedPdf> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pageItems: PdfTextSpan[][] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    pageItems.push(spansFromContent(content.items as PdfJsTextItem[]));
  }

  const extractors = snapshotExtractors(pageItems);
  const pages = pageItems.map((items, index) => ({
    pageNumber: index + 1,
    text: reconstructPageText(items, "layout"),
  }));
  const text = joinPageTexts(pages, doc.numPages);

  return {
    fileName: file.name,
    pageCount: doc.numPages,
    text,
    pages,
    hasTextLayer: text.replace(/\s/g, "").length > 20,
    extractor: "layout",
    extractors,
  };
}

export async function buildSamplePdf(): Promise<File> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const { SAMPLE_CHART, SAMPLE_FILE_NAME } = await import("./sample-chart.ts");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Courier);
  const chunks = SAMPLE_CHART.split("--- Page 2 ---");
  for (const chunk of chunks) {
    const page = pdf.addPage([612, 792]);
    const lines = chunk.trim().split("\n");
    let y = 760;
    for (const line of lines) {
      if (y < 40) break;
      page.drawText(line.slice(0, 92), {
        x: 36,
        y,
        size: 9,
        font,
        color: rgb(0.11, 0.11, 0.09),
      });
      y -= 12;
    }
  }
  const bytes = await pdf.save();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new File([copy], SAMPLE_FILE_NAME, { type: "application/pdf" });
}
