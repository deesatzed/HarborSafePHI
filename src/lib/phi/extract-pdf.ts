import type { ExtractedPdf } from "./types";

type TextItem = {
  str?: string;
  transform?: number[];
};

export async function extractPdfText(file: File): Promise<ExtractedPdf> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: ExtractedPdf["pages"] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items as TextItem[];
    let text = "";
    let lastY: number | null = null;
    for (const item of items) {
      const str = item.str ?? "";
      if (!str) continue;
      const y = item.transform?.[5];
      if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 3) {
        text += "\n";
      } else if (text && !text.endsWith("\n") && !text.endsWith(" ") && !str.startsWith(" ")) {
        const glue = /[A-Za-z0-9]$/.test(text) && /^[A-Za-z0-9]/.test(str) ? " " : "";
        text += glue;
      }
      text += str;
      if (y !== undefined) lastY = y;
    }
    pages.push({ pageNumber, text: text.trim() });
  }

  const joined = pages
    .map((page) => (pages.length > 1 ? `--- Page ${page.pageNumber} ---\n${page.text}` : page.text))
    .join("\n\n");

  return {
    fileName: file.name,
    pageCount: doc.numPages,
    text: joined,
    pages,
    hasTextLayer: joined.replace(/\s/g, "").length > 20,
  };
}

export async function buildSamplePdf(): Promise<File> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const { SAMPLE_CHART, SAMPLE_FILE_NAME } = await import("./sample-chart");
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
