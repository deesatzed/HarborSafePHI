import { mergeSpans } from "./merge.ts";
import { detectGeneratedFor, detectProviderNames, detectRegexSpans, detectRepeatedLastNames } from "./regex.ts";
import { detectSeedSpans } from "./seed.ts";
import type { IdentitySeed, PhiSpan } from "./types.ts";

function propagateLabeledIdentities(text: string, spans: PhiSpan[]): PhiSpan[] {
  const extra: PhiSpan[] = [];
  let n = 0;
  for (const span of spans) {
    if (span.category !== "name") continue;
    const labeled = span.text.match(/^([A-Za-z][A-Za-z'-]+),\s*([A-Za-z][A-Za-z'. -]+)$/);
    if (!labeled) continue;
    const last = labeled[1];
    const rest = labeled[2].replace(/\./g, " ").replace(/\s+/g, " ").trim();
    const parts = rest.split(" ");
    const first = parts[0] ?? "";
    const pieces = [last];
    if (first && last) {
      pieces.push(`${first} ${last}`);
      const middle = parts[1];
      if (middle) {
        pieces.push(`${first} ${middle[0]} ${last}`);
        pieces.push(`${first} ${middle[0]}. ${last}`);
      }
    }
    for (const piece of pieces) {
      if (piece.length < 4) continue;
      const escaped = piece.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`\\b${escaped}\\b`, "gi");
      let match: RegExpExecArray | null;
      while ((match = re.exec(text))) {
        extra.push({
          id: `prop-${n++}`,
          start: match.index,
          end: match.index + match[0].length,
          text: match[0],
          category: "name",
          source: "label",
          confidence: 0.9,
          accepted: true,
        });
        if (re.lastIndex === match.index) re.lastIndex += 1;
      }
    }
  }
  return extra;
}

export function detectLocalPhi(text: string, seed: IdentitySeed): PhiSpan[] {
  const combined = [
    ...detectSeedSpans(text, seed),
    ...detectRegexSpans(text),
    ...detectGeneratedFor(text),
    ...detectProviderNames(text),
    ...detectRepeatedLastNames(text),
  ];
  const first = mergeSpans(text, combined);
  return mergeSpans(text, [...first, ...propagateLabeledIdentities(text, first)]);
}

export function supplementWithLocalPhi(
  text: string,
  openMedSpans: PhiSpan[],
  seed: IdentitySeed = {
    fullName: "",
    aliases: "",
    dob: "",
    mrn: "",
    phone: "",
    email: "",
    address: "",
    zip: "",
  },
): PhiSpan[] {
  const local = detectLocalPhi(text, seed);
  return mergeSpans(text, [...openMedSpans, ...local]);
}

export function mergeDetectorPasses(text: string, passes: PhiSpan[][]): PhiSpan[] {
  const previous = new Map<string, boolean>();
  for (const span of passes[0] ?? []) {
    previous.set(`${span.start}:${span.end}:${span.category}`, span.accepted);
  }
  return mergeSpans(text, passes.flat()).map((span) => {
    const key = `${span.start}:${span.end}:${span.category}`;
    if (previous.has(key)) return { ...span, accepted: previous.get(key) as boolean };
    return span;
  });
}

export function countByCategory(spans: PhiSpan[]): { category: PhiSpan["category"]; total: number; accepted: number }[] {
  const map = new Map<PhiSpan["category"], { total: number; accepted: number }>();
  for (const span of spans) {
    const current = map.get(span.category) ?? { total: 0, accepted: 0 };
    current.total += 1;
    if (span.accepted) current.accepted += 1;
    map.set(span.category, current);
  }
  return [...map.entries()]
    .map(([category, counts]) => ({ category, ...counts }))
    .sort((a, b) => b.total - a.total);
}
