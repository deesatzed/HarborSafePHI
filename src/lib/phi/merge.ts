import { isFrozenClinicalTerm } from "./freeze";
import { SAFE_HARBOR_DEFAULT_ON, type PhiSpan } from "./types";

const SOURCE_RANK: Record<PhiSpan["source"], number> = {
  seed: 4,
  label: 3,
  regex: 2,
  openmed: 1,
};

function overlaps(a: PhiSpan, b: PhiSpan): boolean {
  return a.start < b.end && b.start < a.end;
}

function prefer(a: PhiSpan, b: PhiSpan): PhiSpan {
  const aLen = a.end - a.start;
  const bLen = b.end - b.start;
  if (aLen !== bLen) return aLen > bLen ? a : b;
  if (SOURCE_RANK[a.source] !== SOURCE_RANK[b.source]) {
    return SOURCE_RANK[a.source] > SOURCE_RANK[b.source] ? a : b;
  }
  return a.confidence >= b.confidence ? a : b;
}

export function mergeSpans(text: string, incoming: PhiSpan[]): PhiSpan[] {
  const cleaned = incoming
    .filter((span) => span.end > span.start)
    .filter((span) => !isFrozenClinicalTerm(span.text, text, span.start, span.end))
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const kept: PhiSpan[] = [];
  for (const span of cleaned) {
    const hit = kept.findIndex((other) => overlaps(other, span));
    if (hit === -1) {
      kept.push(span);
      continue;
    }
    kept[hit] = prefer(kept[hit], span);
  }

  return kept
    .map((span, index) => ({
      ...span,
      id: span.id || `span-${index}`,
      text: text.slice(span.start, span.end),
      accepted: SAFE_HARBOR_DEFAULT_ON.has(span.category),
    }))
    .sort((a, b) => a.start - b.start);
}

export function toggleSpan(spans: PhiSpan[], id: string): PhiSpan[] {
  return spans.map((span) => (span.id === id ? { ...span, accepted: !span.accepted } : span));
}

export function setCategoryAccepted(spans: PhiSpan[], category: PhiSpan["category"], accepted: boolean): PhiSpan[] {
  return spans.map((span) => (span.category === category ? { ...span, accepted } : span));
}
