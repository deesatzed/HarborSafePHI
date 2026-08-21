import type { CanonicalLabel, OpenMedSpan, TokenClassificationPipeline } from "openmed";
import { mergeSpans } from "./merge";
import type { DetectorSource, PhiCategory, PhiSpan } from "./types";

export const OPENMED_MODEL = "OpenMed/OpenMed-PII-ClinicalE5-Small-33M-v1-onnx-android";

export type OpenMedDevice = "webgpu" | "wasm";

export type OpenMedStatus = {
  ready: boolean;
  loading: boolean;
  device: OpenMedDevice | null;
  error: string | null;
  progress: string;
};

type LoadedEngine = {
  pipeline: TokenClassificationPipeline;
  device: OpenMedDevice;
};

let engine: LoadedEngine | null = null;
let loading: Promise<LoadedEngine> | null = null;

const LABEL_TO_CATEGORY: Partial<Record<CanonicalLabel, PhiCategory>> = {
  ACCOUNT_NUMBER: "account",
  AGE: "age",
  API_KEY: "other_id",
  BIC: "other_id",
  BUILDING_NUMBER: "address",
  CREDIT_CARD: "account",
  CVV: "other_id",
  DATE: "date",
  DATE_OF_BIRTH: "dob",
  EMAIL: "email",
  FIRST_NAME: "name",
  GPS_COORDINATES: "address",
  IBAN: "account",
  ID_NUM: "other_id",
  IMEI: "device",
  IP_ADDRESS: "ip",
  LAST_NAME: "name",
  LOCATION: "address",
  MAC_ADDRESS: "device",
  MASKED_NUMBER: "other_id",
  MIDDLE_NAME: "name",
  ORGANIZATION: "org",
  OTHER: "other_id",
  PASSWORD: "other_id",
  PERSON: "name",
  PHONE: "phone",
  PIN: "other_id",
  PREFIX: "name",
  SSN: "ssn",
  STREET_ADDRESS: "address",
  URL: "url",
  USERNAME: "other_id",
  VEHICLE_REGISTRATION: "other_id",
  VIN: "other_id",
  ZIPCODE: "zip",
};

const SKIP_LABELS = new Set<CanonicalLabel>([
  "GENDER",
  "OCCUPATION",
  "JOB_TITLE",
  "JOB_DEPARTMENT",
  "EYE_COLOR",
  "HEIGHT",
  "AMOUNT",
  "CURRENCY",
  "TIME",
  "CREDIT_CARD_ISSUER",
  "ORDINAL_DIRECTION",
]);

export function chunkText(text: string, size = 900, overlap = 80): { start: number; text: string }[] {
  if (text.length <= size) return [{ start: 0, text }];
  const chunks: { start: number; text: string }[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + size);
    chunks.push({ start, text: text.slice(start, end) });
    if (end === text.length) break;
    start = end - overlap;
  }
  return chunks;
}

export function headerScanText(pages: { text: string }[], fullText: string): { start: number; text: string }[] {
  if (pages.length === 0) return chunkText(fullText.slice(0, 4000));
  const windows: { start: number; text: string }[] = [];
  const seen = new Set<string>();
  let cursor = 0;
  for (const page of pages) {
    const header = page.text.slice(0, 700);
    const idx = fullText.indexOf(header.slice(0, 80), Math.max(0, cursor - 20));
    const start = idx >= 0 ? idx : cursor;
    const key = `${start}:${header.length}`;
    if (!seen.has(key) && header.trim()) {
      windows.push({ start, text: fullText.slice(start, start + Math.min(700, page.text.length)) });
      seen.add(key);
    }
    cursor += page.text.length;
  }
  if (fullText.length > 0) {
    windows.unshift({ start: 0, text: fullText.slice(0, Math.min(4000, fullText.length)) });
  }
  return windows;
}

export async function loadOpenMed(
  onProgress?: (message: string) => void,
): Promise<LoadedEngine> {
  if (engine) return engine;
  if (loading) return loading;

  loading = (async () => {
    onProgress?.("Loading OpenMed runtime…");
    const openmed = await import("openmed");
    const caps = openmed.detectOrtWebCapabilities();
    const tryLoad = async (device: OpenMedDevice, variant: "fp16" | "int8") => {
      onProgress?.(
        device === "webgpu"
          ? "Downloading OpenMed PII model for WebGPU…"
          : "Downloading OpenMed PII model for WASM…",
      );
      const pipeline = await openmed.loadOnnxModel(OPENMED_MODEL, {
        variant,
        device: device === "webgpu" ? "webgpu" : "wasm",
        allowRemoteModels: true,
      });
      return { pipeline, device };
    };

    try {
      if (caps.webgpu) {
        try {
          engine = await tryLoad("webgpu", "fp16");
          onProgress?.("OpenMed ready on WebGPU.");
          return engine;
        } catch {
          onProgress?.("WebGPU unavailable, falling back to WASM…");
        }
      }
      engine = await tryLoad("wasm", "int8");
      onProgress?.("OpenMed ready on WASM.");
      return engine;
    } catch (error) {
      loading = null;
      const message = error instanceof Error ? error.message : "OpenMed failed to load";
      throw new Error(message);
    }
  })();

  return loading;
}

function toPhiSpan(span: OpenMedSpan, text: string, offset: number, index: number): PhiSpan | null {
  if (SKIP_LABELS.has(span.canonical_label)) return null;
  if ((span.score ?? 1) < 0.35) return null;
  const category = LABEL_TO_CATEGORY[span.canonical_label];
  if (!category) return null;
  const start = span.start + offset;
  const end = span.end + offset;
  const surface = text.slice(start, end);
  if (!surface.trim()) return null;
  if (category === "age") {
    const n = Number.parseInt(surface.replace(/[^\d]/g, ""), 10);
    if (!Number.isNaN(n) && n < 90) return null;
  }
  return {
    id: `om-${offset}-${index}`,
    start,
    end,
    text: surface,
    category,
    source: "openmed" as DetectorSource,
    confidence: span.score ?? 0.7,
    accepted: true,
    label: span.canonical_label,
  };
}

export async function scanWithOpenMed(args: {
  text: string;
  windows: { start: number; text: string }[];
  onProgress?: (message: string) => void;
}): Promise<{ spans: PhiSpan[]; device: OpenMedDevice }> {
  const loaded = await loadOpenMed(args.onProgress);
  const openmed = await import("openmed");
  const found: PhiSpan[] = [];
  let i = 0;
  for (const window of args.windows) {
    i += 1;
    args.onProgress?.(`OpenMed scanning window ${i} of ${args.windows.length}…`);
    const raw = await openmed.extractPii(window.text, {
      pipeline: loaded.pipeline,
      threshold: 0.35,
      detector: "openmed",
      hashSecret: "harbor-local",
    });
    raw.forEach((span, index) => {
      const mapped = toPhiSpan(span, args.text, window.start, found.length + index);
      if (mapped) found.push(mapped);
    });
  }
  return { spans: mergeSpans(args.text, found), device: loaded.device };
}

export function webGpuAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator && Boolean((navigator as Navigator & { gpu?: unknown }).gpu);
}
