const SDOH_START =
  /^(Housing Insecurity|Food Needs|Transportation|Utilities|Financial Insecurity|Medical Access|Clothing\/Household|Employment|Childcare|Sex and Gender Information)\b/i;

const KEEP_HEADER =
  /^(Allergies|Medications|Ended Medications|Active Problems|Immunizations|Social History|Last Filed Vital Signs|Procedures|Results|Progress Notes?|Office Visit|Assessment|Plan|Past Medical|Surgical History|Imaging|Pathology|Encounter|HPI|History of Present)\b/i;

export const MODEL_INPUT_LIMIT = 120_000;
const TRUNCATION_MARKER =
  "\n\n[...middle administrative pages omitted to preserve visit notes...]\n\n";

export type CanonicalPayload = {
  text: string;
  sourceCharacterCount: number;
  characterCount: number;
  truncated: boolean;
};

export function dropAdministrativeNoise(text: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];
  let skippingSDOH = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^--- Page \d+ ---$/.test(trimmed)) continue;
    if (SDOH_START.test(trimmed)) {
      skippingSDOH = true;
      continue;
    }
    if (skippingSDOH) {
      if (KEEP_HEADER.test(trimmed) || trimmed.startsWith("Last Filed")) {
        skippingSDOH = false;
      } else {
        continue;
      }
    }
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function canonicalizePayload(
  redactedWithDates: string,
  limit = MODEL_INPUT_LIMIT,
): CanonicalPayload {
  if (typeof redactedWithDates !== "string") {
    throw new Error("Missing de-identified text.");
  }
  const normalized = redactedWithDates.replace(/\r\n?/g, "\n").trim();
  const cleaned = dropAdministrativeNoise(normalized);
  const boundedLimit = Number.isInteger(limit) && limit > 0
    ? Math.min(limit, MODEL_INPUT_LIMIT)
    : MODEL_INPUT_LIMIT;
  if (cleaned.length <= boundedLimit) {
    return {
      text: cleaned,
      sourceCharacterCount: normalized.length,
      characterCount: cleaned.length,
      truncated: false,
    };
  }
  if (boundedLimit <= TRUNCATION_MARKER.length) {
    const text = cleaned.slice(0, boundedLimit);
    return {
      text,
      sourceCharacterCount: normalized.length,
      characterCount: text.length,
      truncated: true,
    };
  }
  const usable = boundedLimit - TRUNCATION_MARKER.length;
  const head = Math.floor(usable * 0.45);
  const tail = usable - head;
  const text = `${cleaned.slice(0, head)}${TRUNCATION_MARKER}${cleaned.slice(-tail)}`;
  return {
    text,
    sourceCharacterCount: normalized.length,
    characterCount: text.length,
    truncated: true,
  };
}

export function prepareModelInput(redactedWithDates: string, limit = MODEL_INPUT_LIMIT): string {
  return canonicalizePayload(redactedWithDates, limit).text;
}
