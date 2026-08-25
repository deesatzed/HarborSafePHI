import type { CanonicalLabel, TokenClassificationPipeline, TransformersRuntime } from "openmed";
import { mergeSpans } from "./merge.ts";
import type { DetectorSource, PhiCategory, PhiSpan } from "./types.ts";

export const OPENMED_MODEL = "OpenMed/OpenMed-PII-ClinicalE5-Small-33M-v1-onnx-android";
export const OPENMED_MODEL_REVISION = "79f7db205869b1be4be23ac4f42aa95bdedc5aee";
export const OPENMED_RUNTIME_VERSION = "2.1.0";
export const DETERMINISTIC_RULESET_VERSION = "harbor-rules-v1";
const CACHE_KEY = "transformers-cache";
const DEGRADED_MESSAGE =
  "OpenMed unavailable. Harbor is continuing in deterministic-only degraded mode.";

export type OpenMedDevice = "webgpu" | "wasm";

export type OpenMedAttempt = {
  device: OpenMedDevice;
  variant: "fp16" | "int8";
};

export type OpenMedRuntimeState = {
  status: "ready" | "degraded";
  device: OpenMedDevice | null;
  variant: OpenMedAttempt["variant"] | null;
  model: string;
  revision: string;
};

export type OpenMedEngine = {
  pipeline: TokenClassificationPipeline;
  device: OpenMedDevice;
  variant: OpenMedAttempt["variant"];
  model: string;
  revision: string;
  normalizeLabel: (label: string) => CanonicalLabel;
};

export type OpenMedInitializer = (
  onProgress: (message: string) => void,
  preferredDevice?: OpenMedDevice,
) => Promise<OpenMedEngine>;

export function openMedLoaderOptions(
  attempt: OpenMedAttempt,
  progress: (info: HubProgress) => void,
) {
  return {
    variant: attempt.variant,
    dtype: attempt.variant,
    device: attempt.device,
    pipelineOptions: {
      progress_callback: progress,
      model_file_name: "model",
      subfolder: "",
    },
  };
}

export function openMedAttempts(hasWebGpu: boolean): OpenMedAttempt[] {
  return hasWebGpu
    ? [
        { device: "webgpu", variant: "fp16" },
        { device: "wasm", variant: "int8" },
      ]
    : [{ device: "wasm", variant: "int8" }];
}

export async function runOpenMedAttempts<T>(
  hasWebGpu: boolean,
  loadAttempt: (attempt: OpenMedAttempt) => Promise<T>,
  onProgress?: (message: string) => void,
): Promise<T> {
  const attempts = openMedAttempts(hasWebGpu);
  let finalFailure: unknown;

  for (const [index, attempt] of attempts.entries()) {
    try {
      return await loadAttempt(attempt);
    } catch (error) {
      finalFailure = error;
      if (index < attempts.length - 1) {
        onProgress?.("WebGPU OpenMed attempt failed. Trying OpenMed on WASM…");
      } else {
        onProgress?.(DEGRADED_MESSAGE);
      }
    }
  }

  throw finalFailure;
}

function degradedRuntime(): OpenMedRuntimeState {
  return {
    status: "degraded",
    device: null,
    variant: null,
    model: OPENMED_MODEL,
    revision: OPENMED_MODEL_REVISION,
  };
}

function notify(
  listener: ((message: string) => void) | undefined,
  message: string,
): void {
  try {
    listener?.(message);
  } catch {
    // Progress reporting must not change local redaction behavior.
  }
}

export function createOpenMedSession(initialize: OpenMedInitializer) {
  let engine: OpenMedEngine | null = null;
  let loading: Promise<OpenMedEngine> | null = null;
  let runtime = degradedRuntime();
  let inferenceGeneration = 0;
  const progressSubscribers = new Set<(message: string) => void>();

  const broadcast = (message: string) => {
    for (const subscriber of progressSubscribers) notify(subscriber, message);
  };

  const load = async (
    onProgress?: (message: string) => void,
    preferredDevice?: OpenMedDevice,
  ): Promise<OpenMedEngine> => {
    if (engine) {
      notify(
        onProgress,
        `OpenMed engine loaded (${engine.device}); starting local scan.`,
      );
      return engine;
    }

    if (onProgress) progressSubscribers.add(onProgress);
    if (!loading) {
      let degradedMessageSent = false;
      const report = (message: string) => {
        if (message === DEGRADED_MESSAGE) degradedMessageSent = true;
        broadcast(message);
      };

      loading = (async () => {
        try {
          const loaded = await initialize(report, preferredDevice);
          engine = loaded;
          return loaded;
        } catch (error) {
          engine = null;
          runtime = degradedRuntime();
          if (!degradedMessageSent) report(DEGRADED_MESSAGE);
          throw error instanceof Error ? error : new Error("OpenMed failed to load");
        } finally {
          loading = null;
        }
      })();
    }

    const activeLoad = loading;
    try {
      return await activeLoad;
    } finally {
      if (onProgress) progressSubscribers.delete(onProgress);
    }
  };

  const runInference = async <T>(
    operation: (loaded: OpenMedEngine) => Promise<T>,
    onProgress?: (message: string) => void,
  ): Promise<T> => {
    const generation = ++inferenceGeneration;
    const loaded = await load(onProgress);
    const execute = async (active: OpenMedEngine): Promise<T> => {
      const result = await operation(active);
      if (generation === inferenceGeneration && engine === active) {
        runtime = {
          status: "ready",
          device: active.device,
          variant: active.variant,
          model: active.model,
          revision: active.revision,
        };
      }
      notify(
        onProgress,
        `OpenMed scan complete on ${active.device === "webgpu" ? "WebGPU" : "WASM"}.`,
      );
      return result;
    };

    try {
      return await execute(loaded);
    } catch (error) {
      if (loaded.device === "webgpu" && generation === inferenceGeneration) {
        if (engine === loaded) engine = null;
        runtime = degradedRuntime();
        notify(onProgress, "WebGPU inference failed. Trying OpenMed on WASM…");
        try {
          const fallback = await load(onProgress, "wasm");
          if (fallback.device !== "wasm") {
            throw new Error("OpenMed WASM fallback did not select the WASM device.");
          }
          return await execute(fallback);
        } catch (fallbackError) {
          if (generation === inferenceGeneration) {
            if (engine?.device === "wasm") engine = null;
            runtime = degradedRuntime();
          }
          notify(onProgress, DEGRADED_MESSAGE);
          throw fallbackError instanceof Error ? fallbackError : new Error("OpenMed WASM inference failed");
        }
      }
      if (generation === inferenceGeneration) {
        if (engine === loaded) engine = null;
        runtime = degradedRuntime();
      }
      notify(onProgress, DEGRADED_MESSAGE);
      throw error instanceof Error ? error : new Error("OpenMed inference failed");
    }
  };

  return {
    load,
    runInference,
    getRuntimeState: (): OpenMedRuntimeState => ({ ...runtime }),
  };
}

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

async function initializeOpenMed(
  onProgress: (message: string) => void,
  preferredDevice?: OpenMedDevice,
): Promise<OpenMedEngine> {
  const cached = await isOpenMedCached();
  onProgress(
    cached
      ? "OpenMed cache data found. Loading the pinned on-device model…"
      : "OpenMed cache data not found. Downloading the pinned on-device model…",
  );
  const { transformers, progress } = await configureHub(onProgress);
  const openmed = await import("openmed");

  const tryLoad = async (attempt: OpenMedAttempt): Promise<OpenMedEngine> => {
    onProgress(
      attempt.device === "webgpu"
        ? cached
          ? "Starting OpenMed on WebGPU from available cache data…"
          : "Downloading the WebGPU OpenMed weights…"
        : cached
          ? "Starting OpenMed on WASM from available cache data…"
          : "Downloading the WASM OpenMed weights…",
    );
    const pipeline = await openmed.loadOnnxModel(OPENMED_MODEL, {
      ...openMedLoaderOptions(attempt, progress),
      revision: OPENMED_MODEL_REVISION,
      allowRemoteModels: true,
      localFilesOnly: false,
      runtime: {
        pipeline: ((task, model, options) =>
          transformers.pipeline(task, model, options)) as TransformersRuntime["pipeline"],
        env: transformers.env,
      },
    });
    return {
      pipeline,
      device: attempt.device,
      variant: attempt.variant,
      model: OPENMED_MODEL,
      revision: OPENMED_MODEL_REVISION,
      normalizeLabel: openmed.normalizeLabel,
    };
  };

  const loaded = await runOpenMedAttempts(
    preferredDevice === "wasm" ? false : webGpuAvailable(),
    tryLoad,
    onProgress,
  );
  onProgress(
    `OpenMed loaded on ${loaded.device === "webgpu" ? "WebGPU" : "WASM"}. Weights stay in this browser.`,
  );
  return loaded;
}

const productionOpenMedSession = createOpenMedSession(initializeOpenMed);

export function loadOpenMed(
  onProgress?: (message: string) => void,
): Promise<OpenMedEngine> {
  return productionOpenMedSession.load(onProgress);
}

export function getOpenMedRuntimeState(): OpenMedRuntimeState {
  return productionOpenMedSession.getRuntimeState();
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

function canonicalFromGroup(
  label: string,
  normalizeLabel: (value: string) => CanonicalLabel,
): CanonicalLabel {
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

export async function scanWithOpenMed(args: {
  text: string;
  windows?: { start: number; text: string }[];
  onProgress?: (message: string) => void;
}): Promise<{ spans: PhiSpan[]; device: OpenMedDevice; debug: string }> {
  return productionOpenMedSession.runInference(async (loaded) => {
    const windows = args.windows ?? chunkText(args.text);
    const found: PhiSpan[] = [];
    let rawCount = 0;
    let i = 0;
    for (const window of windows) {
      i += 1;
      notify(args.onProgress, `OpenMed reading window ${i} of ${windows.length}…`);
      const output = await loaded.pipeline(window.text, {
        aggregation_strategy: "simple",
        ignore_labels: ["O"],
      });
      const entities = flattenPipelineOutput(output);
      rawCount += entities.length;
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
          canonical: canonicalFromGroup(
            entity.entity_group ?? entity.entity ?? "",
            loaded.normalizeLabel,
          ),
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
    return {
      spans: mergeSpans(args.text, found),
      device: loaded.device,
      debug: `raw entities ${rawCount}`,
    };
  }, args.onProgress);
}

export function webGpuAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator && Boolean((navigator as Navigator & { gpu?: unknown }).gpu);
}
