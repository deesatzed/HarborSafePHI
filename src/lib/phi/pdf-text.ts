import type { ExtractorId, ExtractorSnapshot } from "./types.ts";

export type PdfTextSpan = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hasEOL?: boolean;
};

export type { ExtractorId, ExtractorSnapshot };

export const EXTRACTORS: {
  id: ExtractorId;
  label: string;
  hint: string;
}[] = [
  {
    id: "layout",
    label: "Layout",
    hint: "Group glyphs into lines by Y, insert spaces from X gaps. Harbor default.",
  },
  {
    id: "haseol",
    label: "hasEOL (unpdf)",
    hint: "Concatenate pdf.js items; newline only when hasEOL is set. This is unpdf extractText.",
  },
  {
    id: "naive",
    label: "Naive join (pdf-parse)",
    hint: "Join every item with a space. Classic pdf-parse default.",
  },
  {
    id: "legacy",
    label: "Legacy Harbor",
    hint: "Newline on Y jump > 3px; space only between alphanumeric runs.",
  },
];

function itemHeight(item: PdfTextSpan): number {
  return item.height > 0 ? item.height : 10;
}

function itemWidth(item: PdfTextSpan): number {
  if (item.width > 0) return item.width;
  return item.str.length * itemHeight(item) * 0.5;
}

function reconstructLayout(items: PdfTextSpan[]): string {
  type Line = { y: number; height: number; items: PdfTextSpan[] };
  const lines: Line[] = [];
  for (const item of items) {
    if (!item.str) continue;
    const height = itemHeight(item);
    const threshold = Math.max(2, height * 0.35);
    let line = lines.find((row) => Math.abs(row.y - item.y) <= Math.max(threshold, row.height * 0.35));
    if (!line) {
      line = { y: item.y, height, items: [] };
      lines.push(line);
    } else {
      line.height = Math.max(line.height, height);
    }
    line.items.push(item);
  }
  lines.sort((a, b) => b.y - a.y);
  const out: string[] = [];
  let prevY: number | null = null;
  let prevHeight = 10;
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    if (prevY !== null && prevY - line.y > Math.max(prevHeight, line.height) * 2.2) {
      out.push("");
    }
    let row = "";
    let prev: PdfTextSpan | null = null;
    for (const item of line.items) {
      if (prev) {
        const gap = item.x - (prev.x + itemWidth(prev));
        const need = Math.max(itemHeight(prev), itemHeight(item)) * 0.18;
        const spaced = /\s$/.test(row) || /^\s/.test(item.str);
        if (!spaced && gap > need) row += " ";
      }
      row += item.str;
      prev = item;
    }
    out.push(row.replace(/[ \t]+/g, " ").replace(/ +$/g, ""));
    prevY = line.y;
    prevHeight = line.height;
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function reconstructHasEol(items: PdfTextSpan[]): string {
  return items
    .map((item) => item.str + (item.hasEOL ? "\n" : ""))
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function reconstructNaive(items: PdfTextSpan[]): string {
  return items
    .map((item) => item.str)
    .filter(Boolean)
    .join(" ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function reconstructLegacy(items: PdfTextSpan[]): string {
  let text = "";
  let lastY: number | null = null;
  for (const item of items) {
    if (!item.str) continue;
    if (lastY !== null && Math.abs(item.y - lastY) > 3) {
      text += "\n";
    } else if (text && !text.endsWith("\n") && !text.endsWith(" ") && !item.str.startsWith(" ")) {
      const glue = /[A-Za-z0-9]$/.test(text) && /^[A-Za-z0-9]/.test(item.str) ? " " : "";
      text += glue;
    }
    text += item.str;
    lastY = item.y;
  }
  return text.trim();
}

export function reconstructPageText(items: PdfTextSpan[], method: ExtractorId): string {
  switch (method) {
    case "layout":
      return reconstructLayout(items);
    case "haseol":
      return reconstructHasEol(items);
    case "naive":
      return reconstructNaive(items);
    case "legacy":
      return reconstructLegacy(items);
  }
}

export function joinPageTexts(pages: { pageNumber: number; text: string }[], pageCount: number): string {
  return pages
    .map((page) => (pageCount > 1 ? `--- Page ${page.pageNumber} ---\n${page.text}` : page.text))
    .join("\n\n");
}

export function scoreExtract(text: string): {
  chars: number;
  lines: number;
  camelGlue: number;
  letterDigitGlue: number;
} {
  return {
    chars: text.length,
    lines: text ? text.split("\n").length : 0,
    camelGlue: (text.match(/[a-z][A-Z]/g) ?? []).length,
    letterDigitGlue: (text.match(/[A-Za-z]\d/g) ?? []).length + (text.match(/\d[A-Za-z]/g) ?? []).length,
  };
}

export function snapshotExtractors(pageItems: PdfTextSpan[][]): ExtractorSnapshot[] {
  const pageCount = pageItems.length;
  return EXTRACTORS.map((meta) => {
    const pages = pageItems.map((items, index) => ({
      pageNumber: index + 1,
      text: reconstructPageText(items, meta.id),
    }));
    const text = joinPageTexts(pages, pageCount);
    return { ...meta, text, ...scoreExtract(text) };
  });
}

export function formatExtractorCompare(snapshots: ExtractorSnapshot[]): string {
  const header = snapshots
    .map(
      (row) =>
        `${row.id}\tchars=${row.chars}\tlines=${row.lines}\tgluedCamel=${row.camelGlue}\tgluedLetterDigit=${row.letterDigitGlue}\t${row.label}`,
    )
    .join("\n");
  const bodies = snapshots
    .map(
      (row) =>
        `===== ${row.label} (${row.id}) =====\n${row.hint}\nchars=${row.chars} lines=${row.lines} gluedCamel=${row.camelGlue} gluedLetterDigit=${row.letterDigitGlue}\n\n${row.text}`,
    )
    .join("\n\n");
  return `Harbor PDF text comparison — same pdf.js items, four assemblers.\nunpdf and pdf-parse are not different engines; they wrap pdf.js.\nCloud extractors are omitted because they would send the chart off this device.\n\n${header}\n\n${bodies}\n`;
}
