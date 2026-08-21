import { mergeSpans } from "./merge.ts";
import type { PhiCategory, PhiSpan } from "./types.ts";

export type TextRange = {
  start: number;
  end: number;
  text: string;
};

export function findLikeThis(text: string, surface: string): TextRange[] {
  const needle = surface.trim();
  if (needle.length < 2) return [];
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = needle.length <= 3 ? new RegExp(`\\b${escaped}\\b`, "gi") : new RegExp(escaped, "gi");
  const hits: TextRange[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    hits.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
    });
    if (re.lastIndex === match.index) re.lastIndex += 1;
  }
  return hits;
}

export function applyManualRedaction(args: {
  text: string;
  spans: PhiSpan[];
  range: TextRange;
  category: PhiCategory;
  others: boolean;
}): PhiSpan[] {
  const ranges = args.others ? findLikeThis(args.text, args.range.text) : [args.range];
  const incoming: PhiSpan[] = ranges.map((range, index) => ({
    id: `man-${range.start}-${index}`,
    start: range.start,
    end: range.end,
    text: args.text.slice(range.start, range.end),
    category: args.category,
    source: "manual",
    confidence: 1,
    accepted: true,
  }));
  return mergeSpans(args.text, [...args.spans, ...incoming]);
}

export function keepSpan(spans: PhiSpan[], id: string): PhiSpan[] {
  return spans.map((span) => (span.id === id ? { ...span, accepted: false } : span));
}

export function offsetsFromSelection(root: HTMLElement): TextRange | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const prefix = document.createRange();
  prefix.selectNodeContents(root);
  prefix.setEnd(range.startContainer, range.startOffset);
  const start = prefix.toString().length;
  const text = range.toString();
  if (!text.trim()) return null;
  return { start, end: start + text.length, text };
}
