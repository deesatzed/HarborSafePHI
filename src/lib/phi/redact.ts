import { formatDateToken, indexDate } from "./dates";
import { CATEGORY_TOKEN, type DateMode, type PhiSpan } from "./types";

export type RedactionResult = {
  redacted: string;
  acceptedCount: number;
  originIso: string | null;
};

export function redactText(text: string, spans: PhiSpan[], dateMode: DateMode): RedactionResult {
  const accepted = spans.filter((span) => span.accepted).sort((a, b) => a.start - b.start);
  const origin = indexDate(accepted);
  let cursor = 0;
  let out = "";
  for (const span of accepted) {
    if (span.start < cursor) continue;
    out += text.slice(cursor, span.start);
    if (span.category === "date" || span.category === "dob") {
      out += formatDateToken(span, dateMode, origin);
    } else {
      out += CATEGORY_TOKEN[span.category];
    }
    cursor = span.end;
  }
  out += text.slice(cursor);
  return {
    redacted: out,
    acceptedCount: accepted.length,
    originIso: origin ? origin.toISOString().slice(0, 10) : null,
  };
}

export type TextSegment = {
  text: string;
  span: PhiSpan | null;
};

export function segmentText(text: string, spans: PhiSpan[]): TextSegment[] {
  const ordered = [...spans].sort((a, b) => a.start - b.start);
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const span of ordered) {
    if (span.start > cursor) {
      segments.push({ text: text.slice(cursor, span.start), span: null });
    }
    segments.push({ text: text.slice(span.start, span.end), span });
    cursor = Math.max(cursor, span.end);
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), span: null });
  }
  return segments;
}
