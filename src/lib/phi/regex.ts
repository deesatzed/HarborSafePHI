import type { PhiCategory, PhiSpan } from "./types.ts";

type Pattern = {
  category: PhiCategory;
  source: "label" | "regex";
  confidence: number;
  re: RegExp;
  group?: number;
};

const PATTERNS: Pattern[] = [
  {
    category: "email",
    source: "regex",
    confidence: 0.98,
    re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  },
  {
    category: "ssn",
    source: "regex",
    confidence: 0.98,
    re: /\b(?!000|666)(?:\d{3})-(?!00)\d{2}-(?!0000)\d{4}\b/g,
  },
  {
    category: "phone",
    source: "regex",
    confidence: 0.92,
    re: /(?:\+1[-.\s]?)?(?:\(?\d{3}\)?[-.\s])\d{3}[-.\s]\d{4}\b/g,
  },
  {
    category: "url",
    source: "regex",
    confidence: 0.9,
    re: /\bhttps?:\/\/[^\s<>"']+/gi,
  },
  {
    category: "ip",
    source: "regex",
    confidence: 0.9,
    re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
  },
  {
    category: "mrn",
    source: "label",
    confidence: 0.96,
    re: /\b(?:MRN|Medical Record(?: Number)?|Patient ID)\s*[:#]\s*([A-Z0-9-]{4,})/gi,
    group: 1,
  },
  {
    category: "dob",
    source: "label",
    confidence: 0.96,
    re: /\b(?:DOB|Date of Birth|Birth Date)\s*[:#]\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/gi,
    group: 1,
  },
  {
    category: "name",
    source: "label",
    confidence: 0.95,
    re: /\bPatient(?: Name)?\s*[:#]\s*([A-Z][A-Z' -]+,\s*[A-Z][A-Za-z' .-]+)/g,
    group: 1,
  },
  {
    category: "npi",
    source: "label",
    confidence: 0.95,
    re: /\bNPI\s*[:#]?\s*(\d{10})\b/gi,
    group: 1,
  },
  {
    category: "accession",
    source: "label",
    confidence: 0.93,
    re: /\b(?:Accession|CSN|FIN|Encounter(?: Number)?)\s*[:#]\s*([A-Z0-9-]{4,})/gi,
    group: 1,
  },
  {
    category: "plan_id",
    source: "label",
    confidence: 0.93,
    re: /\b(?:Member ID|Subscriber ID|Policy(?: Number)?|Health Plan(?: ID)?)\s*[:#]\s*([A-Z0-9-]{5,})/gi,
    group: 1,
  },
  {
    category: "account",
    source: "label",
    confidence: 0.9,
    re: /\b(?:Account(?: Number)?|Acct)\s*[:#]\s*([A-Z0-9-]{5,})/gi,
    group: 1,
  },
  {
    category: "email",
    source: "label",
    confidence: 0.97,
    re: /\bE-?mail\s*[:#]\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi,
    group: 1,
  },
  {
    category: "phone",
    source: "label",
    confidence: 0.95,
    re: /\b(?:Phone|Tel|Telephone|Mobile|Cell)\s*[:#]\s*((?:\+1[-.\s]?)?(?:\(?\d{3}\)?[-.\s])\d{3}[-.\s]\d{4})/gi,
    group: 1,
  },
  {
    category: "address",
    source: "label",
    confidence: 0.94,
    re: /\bAddress\s*[:#]\s*([^\n]+)/gi,
    group: 1,
  },
  {
    category: "address",
    source: "regex",
    confidence: 0.86,
    re: /\b\d{1,5}\s+[A-Z][A-Za-z0-9.'-]+(?:\s+[A-Z][A-Za-z0-9.'-]+){0,3}\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Dr|Drive|Ln|Lane|Ct|Court|Way|Pkwy|Hwy|Terrace|Place|Pl)\.?\b/g,
  },
  {
    category: "zip",
    source: "regex",
    confidence: 0.8,
    re: /\b(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\s+(\d{5}(?:-\d{4})?)\b/g,
    group: 1,
  },
  {
    category: "address",
    source: "regex",
    confidence: 0.9,
    re: /\b[A-Z][A-Za-z.'-]{2,}(?:[\s]+[A-Z][A-Za-z.'-]{2,}){0,3},?\s+(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\s+\d{5}(?:-\d{4})?\b/g,
  },
  {
    category: "address",
    source: "label",
    confidence: 0.94,
    re: /\bPatient Address\s*[:#]?\s*([^\n]+)/gi,
    group: 1,
  },
  {
    category: "date",
    source: "regex",
    confidence: 0.88,
    re: /\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-](?:19|20)\d{2}\b/g,
  },
  {
    category: "date",
    source: "regex",
    confidence: 0.88,
    re: /\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g,
  },
  {
    category: "date",
    source: "regex",
    confidence: 0.86,
    re: /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+(?:19|20)\d{2}\b/gi,
  },
  {
    category: "npi",
    source: "regex",
    confidence: 0.7,
    re: /\bNPI\s+(\d{10})\b/gi,
    group: 1,
  },
];

export function detectRegexSpans(text: string): PhiSpan[] {
  const spans: PhiSpan[] = [];
  let n = 0;
  for (const pattern of PATTERNS) {
    const re = new RegExp(pattern.re.source, pattern.re.flags.includes("g") ? pattern.re.flags : `${pattern.re.flags}g`);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      const groupIndex = pattern.group ?? 0;
      const captured = match[groupIndex] ?? match[0];
      const offset = match[0].indexOf(captured);
      const start = match.index + (offset >= 0 ? offset : 0);
      const end = start + captured.length;
      const sliced = text.slice(start, end).trim();
      if (sliced.length < 2) continue;
      spans.push({
        id: `re-${n++}`,
        start,
        end: start + sliced.length,
        text: text.slice(start, start + sliced.length),
        category: pattern.category,
        source: pattern.source,
        confidence: pattern.confidence,
        accepted: true,
      });
      if (re.lastIndex === match.index) re.lastIndex += 1;
    }
  }
  return spans;
}

export function detectGeneratedFor(text: string): PhiSpan[] {
  const spans: PhiSpan[] = [];
  const re = /\bGenerated for\s+([A-Z][A-Za-z' .-]{2,60}?)\s+on\b/g;
  let match: RegExpExecArray | null;
  let n = 0;
  while ((match = re.exec(text))) {
    const captured = match[1];
    const start = match.index + match[0].indexOf(captured);
    spans.push({
      id: `gen-${n++}`,
      start,
      end: start + captured.length,
      text: captured,
      category: "name",
      source: "label",
      confidence: 0.94,
      accepted: true,
    });
  }
  return spans;
}

export function detectProviderNames(text: string): PhiSpan[] {
  const spans: PhiSpan[] = [];
  const re = /\b([A-Z][A-Za-z'-]+,\s+[A-Z][A-Za-z'-]+(?:,\s+[A-Z][A-Za-z'-]+)?),?\s+MD\b/g;
  let match: RegExpExecArray | null;
  let n = 0;
  while ((match = re.exec(text))) {
    const captured = match[1];
    const start = match.index;
    spans.push({
      id: `md-${n++}`,
      start,
      end: start + captured.length,
      text: captured,
      category: "name",
      source: "regex",
      confidence: 0.82,
      accepted: true,
    });
  }
  const re2 = /\b(Dr\.\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s+MD)\b/g;
  while ((match = re2.exec(text))) {
    spans.push({
      id: `md-${n++}`,
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
      category: "name",
      source: "regex",
      confidence: 0.78,
      accepted: true,
    });
  }
  return spans;
}

export function detectRepeatedLastNames(text: string): PhiSpan[] {
  const spans: PhiSpan[] = [];
  const names = new Set<string>();
  const labeled = /\bPatient(?: Name)?\s*[:#]\s*([A-Z][A-Z'-]{2,}),\s*([A-Z][A-Za-z]+)/g;
  let match: RegExpExecArray | null;
  while ((match = labeled.exec(text))) {
    names.add(match[1]);
    if (match[2].length >= 3) names.add(`${match[2]} ${match[1]}`);
  }
  let n = 0;
  for (const piece of names) {
    const escaped = piece.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "gi");
    while ((match = re.exec(text))) {
      spans.push({
        id: `ln-${n++}`,
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        category: "name",
        source: "label",
        confidence: 0.91,
        accepted: true,
      });
      if (re.lastIndex === match.index) re.lastIndex += 1;
    }
  }
  return spans;
}
