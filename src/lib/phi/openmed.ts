import { normalizeLabel, type CanonicalLabel, type TokenClassificationPipeline, type TransformersRuntime } from "openmed";
import { mergeSpans } from "./merge.ts";
import type { DetectorSource, PhiCategory, PhiSpan } from "./types.ts";

export const OPENMED_MODEL = "OpenMed/OpenMed-PII-ClinicalE5-Small-33M-v1-onnx-android";
const CACHE_KEY = "transformers-cache";

export type OpenMedDevice = "webgpu" | "wasm";

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

type HubProgress = {
  status?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
};

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

export async function isOpenMedCached(): Promise<boolean> {
  if (engine) return true;
  if (typeof caches === "undefined") return false;
  try {
    const cache = await caches.open(CACHE_KEY);
    const keys = await cache.keys();
    return keys.some((request) => request.url.includes("OpenMed-PII-ClinicalE5-Small-33M"));
  } catch {
    return false;
  }
}

async function configureHub(onProgress: (message: string) => void) {
  const transformers = await import("@huggingface/transformers");
  transformers.env.allowRemoteModels = true;
  transformers.env.allowLocalModels = false;
  transformers.env.useBrowserCache = true;
  transformers.env.useWasmCache = true;
  transformers.env.cacheKey = CACHE_KEY;
  const progress = (info: HubProgress) => {
    if (info.status === "progress" && typeof info.progress === "number") {
      const file = info.file ? info.file.split("/").pop() : "model";
      onProgress(`Downloading OpenMed ${file}… ${Math.round(info.progress)}%`);
      return;
    }
    if (info.status === "progress_total" && typeof info.progress === "number") {
      onProgress(`Downloading OpenMed… ${Math.round(info.progress)}%`);
      return;
    }
    if (info.status === "initiate" && info.file) {
      onProgress(`Preparing ${info.file.split("/").pop()}…`);
    }
    if (info.status === "done" && info.file) {
      onProgress(`Cached ${info.file.split("/").pop()}.`);
    }
  };
  return { transformers, progress };
}

export async function loadOpenMed(onProgress?: (message: string) => void): Promise<LoadedEngine> {
  if (engine) {
    onProgress?.(`OpenMed ready from cache (${engine.device}).`);
    return engine;
  }
  if (loading) return loading;

  loading = (async () => {
    const cached = await isOpenMedCached();
    onProgress?.(cached ? "Loading OpenMed from this browser’s cache…" : "OpenMed is not cached yet. Downloading the on-device model…");
    const { transformers, progress } = await configureHub(onProgress ?? (() => undefined));
    const openmed = await import("openmed");

    const tryLoad = async (device: OpenMedDevice, variant: "fp16" | "int8") => {
      onProgress?.(
        device === "webgpu"
          ? cached
            ? "Starting OpenMed on WebGPU…"
            : "Downloading the WebGPU OpenMed weights…"
          : cached
            ? "Starting OpenMed on WASM…"
            : "Downloading the WASM OpenMed weights…",
      );
      const pipeline = await openmed.loadOnnxModel(OPENMED_MODEL, {
        variant,
        device: device === "webgpu" ? "webgpu" : "wasm",
        dtype: variant === "fp16" ? "fp16" : "int8",
        allowRemoteModels: true,
        localFilesOnly: false,
        runtime: {
          pipeline: ((task, model, options) =>
            transformers.pipeline(task, model, options)) as TransformersRuntime["pipeline"],
          env: transformers.env,
        },
        pipelineOptions: {
          progress_callback: progress,
          model_file_name: "model",
          dtype: variant === "fp16" ? "fp16" : "int8",
          subfolder: "",
        },
      });
      return { pipeline, device };
    };

    try {
      engine = await tryLoad("wasm", "int8");
      onProgress?.("OpenMed ready on WASM. Weights stay in this browser.");
      return engine;
    } catch (error) {
      loading = null;
      throw new Error(error instanceof Error ? error.message : "OpenMed failed to load");
    }
  })();

  return loading;
}

function toPhiSpan(args: {
  canonical: CanonicalLabel;
  start: number;
  end: number;
  score: number | null;
  text: string;
  offset: number;
  index: number;
}): PhiSpan | null {
  if (SKIP_LABELS.has(args.canonical)) return null;
  if ((args.score ?? 1) < 0.35) return null;
  const category = LABEL_TO_CATEGORY[args.canonical];
  if (!category) return null;
  const start = args.start + args.offset;
  const end = args.end + args.offset;
  const surface = args.text.slice(start, end);
  if (!surface.trim()) return null;
  if (category === "age") {
    const n = Number.parseInt(surface.replace(/[^\d]/g, ""), 10);
    if (!Number.isNaN(n) && n < 90) return null;
  }
  return {
    id: `om-${args.offset}-${args.index}`,
    start,
    end,
    text: surface,
    category,
    source: "openmed" as DetectorSource,
    confidence: args.score ?? 0.7,
    accepted: true,
    label: args.canonical,
  };
}

type PipelineEntity = {
  entity?: string;
  entity_group?: string;
  word?: string;
  score?: number;
  start?: number;
  end?: number;
};

const EXTRA_LABELS: Record<string, CanonicalLabel> = {
  companyname: "ORGANIZATION",
  hospital: "ORGANIZATION",
  facility: "ORGANIZATION",
  patientname: "PERSON",
  provider: "PERSON",
  physician: "PERSON",
  doctor: "PERSON",
};

function canonicalFromGroup(label: string): CanonicalLabel {
  const cleaned = label.replace(/^[BIES]-/i, "");
  const canonical = normalizeLabel(cleaned);
  if (canonical !== "OTHER") return canonical;
  const key = cleaned.toLowerCase().replace(/[^a-z0-9]/g, "");
  return EXTRA_LABELS[key] ?? "OTHER";
}

function locateSurface(haystack: string, word: string, from: number): { start: number; end: number } | null {
  const needle = word.replace(/\s+/g, " ").trim();
  if (needle.length < 2) return null;
  const idx = haystack.toLowerCase().indexOf(needle.toLowerCase(), from);
  if (idx < 0) return null;
  return { start: idx, end: idx + needle.length };
}

function flattenPipelineOutput(output: unknown): PipelineEntity[] {
  if (Array.isArray(output)) {
    if (output.length === 0) return [];
    if (Array.isArray(output[0])) return (output as PipelineEntity[][]).flat();
    return output as PipelineEntity[];
  }
  if (output && typeof output === "object") {
    const record = output as { entities?: PipelineEntity[] };
    if (Array.isArray(record.entities)) return record.entities;
  }
  return [];
}

function describePipelineOutput(output: unknown): string {
  if (output == null) return "null";
  if (Array.isArray(output)) {
    const first = output[0] as { entity?: string; entity_group?: string; start?: number } | undefined;
    return `array(${output.length}) first=${first ? JSON.stringify(first).slice(0, 180) : "empty"}`;
  }
  if (typeof output === "object") return `object keys=${Object.keys(output as object).join(",")}`;
  return typeof output;
}

export async function scanWithOpenMed(args: {
  text: string;
  windows?: { start: number; text: string }[];
  onProgress?: (message: string) => void;
}): Promise<{ spans: PhiSpan[]; device: OpenMedDevice; debug: string }> {
  const loaded = await loadOpenMed(args.onProgress);
  const windows = args.windows ?? chunkText(args.text);
  const found: PhiSpan[] = [];
  let rawCount = 0;
  let debug = "";
  let i = 0;
  for (const window of windows) {
    i += 1;
    args.onProgress?.(`OpenMed reading window ${i} of ${windows.length}…`);
    const output = await loaded.pipeline(window.text, {
      aggregation_strategy: "simple",
      ignore_labels: ["O"],
    });
    const entities = flattenPipelineOutput(output);
    rawCount += entities.length;
    if (entities.length === 0 && i === 1) {
      const raw = await loaded.pipeline(window.text.slice(0, 240), { ignore_labels: [] });
      debug = describePipelineOutput(raw);
    }
    let cursor = 0;
    entities.forEach((entity, index) => {
      let start = Number(entity.start);
      let end = Number(entity.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        const located = locateSurface(window.text, entity.word ?? "", cursor);
        if (!located) return;
        start = located.start;
        end = located.end;
        cursor = located.end;
      } else {
        cursor = Math.max(cursor, end);
      }
      const mapped = toPhiSpan({
        canonical: canonicalFromGroup(entity.entity_group ?? entity.entity ?? ""),
        start,
        end,
        score: entity.score ?? null,
        text: args.text,
        offset: window.start,
        index: found.length + index,
      });
      if (mapped) found.push(mapped);
    });
  }
  return { spans: mergeSpans(args.text, found), device: loaded.device, debug: `raw entities ${rawCount}` };
}

export function webGpuAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator && Boolean((navigator as Navigator & { gpu?: unknown }).gpu);
}
