const SDOH_START =
  /^(Housing Insecurity|Food Needs|Transportation|Utilities|Financial Insecurity|Medical Access|Clothing\/Household|Employment|Childcare|Sex and Gender Information)\b/i;

const KEEP_HEADER =
  /^(Allergies|Medications|Ended Medications|Active Problems|Immunizations|Social History|Last Filed Vital Signs|Procedures|Results|Progress Notes?|Office Visit|Assessment|Plan|Past Medical|Surgical History|Imaging|Pathology|Encounter|HPI|History of Present)\b/i;

export const MODEL_INPUT_LIMIT = 120_000;

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

export function prepareModelInput(redactedWithDates: string, limit = MODEL_INPUT_LIMIT): string {
  const cleaned = dropAdministrativeNoise(redactedWithDates);
  if (cleaned.length <= limit) return cleaned;
  const marker = "\n\n[...middle administrative pages omitted to preserve visit notes...]\n\n";
  const usable = Math.max(24, limit - marker.length);
  const head = Math.floor(usable * 0.45);
  const tail = usable - head;
  return `${cleaned.slice(0, head)}${marker}${cleaned.slice(-tail)}`;
}
