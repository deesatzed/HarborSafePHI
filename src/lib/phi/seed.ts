import type { IdentitySeed, PhiSpan } from "./types.ts";

function uniquePieces(seed: IdentitySeed): string[] {
  const pieces = [
    seed.fullName,
    ...seed.aliases.split(/[,;\n]/),
    seed.dob,
    seed.mrn,
    seed.phone,
    seed.email,
    seed.address,
    seed.zip,
  ]
    .map((value) => value.trim())
    .filter((value) => value.length >= 2);

  const expanded: string[] = [];
  for (const piece of pieces) {
    expanded.push(piece);
    if (piece.includes(",")) {
      const [last, rest] = piece.split(",").map((part) => part.trim());
      if (last && rest) {
        expanded.push(`${rest} ${last}`);
        expanded.push(last);
        const first = rest.split(/\s+/)[0];
        if (first && first.length > 1) expanded.push(`${first} ${last}`);
      }
    } else if (/\s/.test(piece) && piece === seed.fullName.trim()) {
      const parts = piece.split(/\s+/);
      if (parts.length >= 2) {
        const last = parts[parts.length - 1];
        const first = parts[0];
        expanded.push(`${last}, ${first}`);
        expanded.push(last);
        if (parts.length >= 3) {
          const middle = parts[1];
          expanded.push(`${first} ${middle[0]} ${last}`);
          expanded.push(`${first} ${middle[0]}. ${last}`);
          expanded.push(`${first} ${middle[0]}.`);
        }
      }
    }
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of expanded) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    if (item.length < 2) continue;
    seen.add(key);
    out.push(item);
  }
  return out.sort((a, b) => b.length - a.length);
}

function categoryFor(piece: string, seed: IdentitySeed): PhiSpan["category"] {
  const lower = piece.toLowerCase();
  if (seed.email && lower === seed.email.trim().toLowerCase()) return "email";
  if (seed.mrn && lower === seed.mrn.trim().toLowerCase()) return "mrn";
  if (seed.phone && piece.replace(/\D/g, "").length >= 10) return "phone";
  if (seed.dob && lower === seed.dob.trim().toLowerCase()) return "dob";
  if (seed.zip && lower === seed.zip.trim().toLowerCase()) return "zip";
  if (seed.address && lower === seed.address.trim().toLowerCase()) return "address";
  return "name";
}

export function detectSeedSpans(text: string, seed: IdentitySeed): PhiSpan[] {
  const spans: PhiSpan[] = [];
  let n = 0;
  for (const piece of uniquePieces(seed)) {
    const escaped = piece.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "gi");
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      spans.push({
        id: `seed-${n++}`,
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        category: categoryFor(piece, seed),
        source: "seed",
        confidence: 0.99,
        accepted: true,
      });
      if (re.lastIndex === match.index) re.lastIndex += 1;
    }
  }
  return spans;
}
