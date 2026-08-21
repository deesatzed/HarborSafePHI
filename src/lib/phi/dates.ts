import type { DateMode, PhiSpan } from "./types.ts";

const DATE_RE =
  /^((?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-](?:19|20)\d{2}|(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+(?:19|20)\d{2})$/i;

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

export function parseDate(value: string): Date | null {
  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const slash = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) {
    const date = new Date(Number(slash[3]), Number(slash[1]) - 1, Number(slash[2]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const named = trimmed.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (named) {
    const month = MONTHS[named[1].toLowerCase().slice(0, 4)] ?? MONTHS[named[1].toLowerCase().slice(0, 3)];
    if (month === undefined) return null;
    const date = new Date(Number(named[3]), month, Number(named[2]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

export function looksLikeDate(value: string): boolean {
  return DATE_RE.test(value.trim());
}

const FORTY_YEARS_MS = 40 * 365.25 * 86_400_000;

export function indexDate(spans: PhiSpan[]): Date | null {
  const dates = spans
    .filter((span) => span.category === "date")
    .map((span) => parseDate(span.text))
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => a.getTime() - b.getTime());
  if (dates.length === 0) return null;
  const newest = dates[dates.length - 1];
  const clinical = dates.filter((date) => newest.getTime() - date.getTime() <= FORTY_YEARS_MS);
  return clinical[0] ?? newest;
}

export function formatDateToken(span: PhiSpan, mode: DateMode, origin: Date | null): string {
  if (span.category === "dob") return "[DOB]";
  if (mode === "keep") return span.text;
  const parsed = parseDate(span.text);
  if (!parsed) return "[DATE]";
  if (mode === "year") return String(parsed.getFullYear());
  if (!origin) return "[DATE]";
  const days = Math.round((parsed.getTime() - origin.getTime()) / 86_400_000);
  if (days === 0) return "Day 0";
  return days > 0 ? `Day +${days}` : `Day ${days}`;
}
