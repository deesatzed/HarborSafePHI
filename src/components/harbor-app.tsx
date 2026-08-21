import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Cpu,
  Download,
  FileUp,
  Loader2,
  Shield,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { detectLocalPhi, mergeDetectorPasses } from "@/lib/phi/detect";
import { buildExport, downloadTextFile } from "@/lib/phi/export";
import { buildSamplePdf, extractPdfText } from "@/lib/phi/extract-pdf";
import { headerScanText, scanWithOpenMed, chunkText } from "@/lib/phi/openmed";
import { redactText, segmentText } from "@/lib/phi/redact";
import { SAMPLE_CHART, SAMPLE_FILE_NAME } from "@/lib/phi/sample-chart";
import {
  CATEGORY_LABEL,
  EMPTY_SEED,
  type DateMode,
  type ExtractedPdf,
  type IdentitySeed,
  type PhiSpan,
} from "@/lib/phi/types";
import {
  OPENROUTER_MODELS,
  readOpenRouterKey,
  readOpenRouterModel,
  summarizeWithOpenRouter,
  writeOpenRouterKey,
  writeOpenRouterModel,
} from "@/lib/openrouter";
import { cn } from "@/lib/utils";

type Stage = "idle" | "working" | "review";
type ReviewTab = "clean" | "original" | "findings";

const DATE_MODES: { id: DateMode; label: string; hint: string }[] = [
  { id: "relative", label: "Relative", hint: "Day 0, Day +N — best for AI" },
  { id: "year", label: "Year only", hint: "Safe Harbor" },
  { id: "keep", label: "Keep dates", hint: "Do not send off-device" },
];

export function HarborApp() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [status, setStatus] = useState("Reading PDF…");
  const [error, setError] = useState<string | null>(null);
  const [seed, setSeed] = useState<IdentitySeed>(EMPTY_SEED);
  const [extracted, setExtracted] = useState<ExtractedPdf | null>(null);
  const [spans, setSpans] = useState<PhiSpan[]>([]);
  const [dateMode, setDateMode] = useState<DateMode>("relative");
  const [tab, setTab] = useState<ReviewTab>("clean");
  const [detectors, setDetectors] = useState<string[]>(["regex", "labels"]);
  const [openmedBusy, setOpenmedBusy] = useState(false);
  const [openmedNote, setOpenmedNote] = useState(
    "OpenMed can run on this device after a one-time model download.",
  );
  const [openmedDevice, setOpenmedDevice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showSeed, setShowSeed] = useState(false);
  const [apiKey, setApiKey] = useState(() => (typeof window === "undefined" ? "" : readOpenRouterKey()));
  const [model, setModel] = useState(() => (typeof window === "undefined" ? OPENROUTER_MODELS[0].id : readOpenRouterModel()));
  const [showSend, setShowSend] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const redaction = useMemo(() => {
    if (!extracted) return null;
    return redactText(extracted.text, spans, dateMode);
  }, [extracted, spans, dateMode]);

  const accepted = spans.filter((span) => span.accepted).length;

  async function ingest(extractedDoc: ExtractedPdf, extraDetectors: string[] = []) {
    setExtracted(extractedDoc);
    const local = detectLocalPhi(extractedDoc.text, seed);
    setSpans(local);
    setDetectors(["regex", "labels", ...extraDetectors, ...(seed.fullName || seed.mrn ? ["known identity"] : [])]);
    setStage("review");
    setTab("clean");
    setSummary(null);
    if (!extractedDoc.hasTextLayer) {
      setError("This PDF has no selectable text. Harbor cannot OCR scans yet — download a text PDF from MyChart, not a photograph.");
    } else {
      setError(null);
    }
  }

  async function onFile(file: File) {
    setError(null);
    setStage("working");
    setStatus("Reading PDF in this browser…");
    try {
      const extractedDoc = await extractPdfText(file);
      setStatus("Running local Safe Harbor detectors…");
      await ingest(extractedDoc);
    } catch (err) {
      setStage("idle");
      setError(err instanceof Error ? err.message : "Could not read that PDF.");
    }
  }

  async function onSample() {
    setError(null);
    setStage("working");
    setStatus("Building a synthetic Epic-style chart…");
    try {
      const file = await buildSamplePdf();
      await onFile(file);
    } catch {
      const extractedDoc: ExtractedPdf = {
        fileName: SAMPLE_FILE_NAME,
        pageCount: 2,
        text: SAMPLE_CHART,
        pages: [
          { pageNumber: 1, text: SAMPLE_CHART },
          { pageNumber: 2, text: SAMPLE_CHART },
        ],
        hasTextLayer: true,
      };
      await ingest(extractedDoc);
    }
  }

  async function runOpenMed(deep: boolean) {
    if (!extracted) return;
    setOpenmedBusy(true);
    setError(null);
    try {
      const windows = deep ? chunkText(extracted.text) : headerScanText(extracted.pages, extracted.text);
      const result = await scanWithOpenMed({
        text: extracted.text,
        windows,
        onProgress: setOpenmedNote,
      });
      setSpans((current) => mergeDetectorPasses(extracted.text, [current, result.spans]));
      setDetectors((current) => (current.includes("openmed") ? current : [...current, "openmed"]));
      setOpenmedDevice(result.device);
      setOpenmedNote(
        `OpenMed (${result.device}) found ${result.spans.length} additional spans.`,
      );
    } catch (err) {
      setOpenmedNote(err instanceof Error ? err.message : "OpenMed failed to start.");
    } finally {
      setOpenmedBusy(false);
    }
  }

  function reset() {
    setStage("idle");
    setExtracted(null);
    setSpans([]);
    setSummary(null);
    setError(null);
    setShowSend(false);
  }

  function exportFiles() {
    if (!extracted) return;
    const payload = buildExport({ extracted, spans, dateMode, detectors });
    const base = extracted.fileName.replace(/\.pdf$/i, "") + "-deidentified";
    downloadTextFile(`${base}.md`, payload.markdown, "text/markdown");
    downloadTextFile(`${base}.json`, JSON.stringify(payload.json, null, 2), "application/json");
  }

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1400);
  }

  async function sendToOpenRouter() {
    if (!redaction) return;
    if (dateMode === "keep") {
      setError("Date mode is “Keep dates.” Switch to Relative or Year before sending anything off-device.");
      return;
    }
    writeOpenRouterKey(apiKey);
    writeOpenRouterModel(model);
    setSummaryBusy(true);
    setError(null);
    try {
      const text = await summarizeWithOpenRouter({
        apiKey,
        model,
        redactedText: redaction.redacted,
      });
      setSummary(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "OpenRouter request failed.");
    } finally {
      setSummaryBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-bg text-ink">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xl">
            <p className="font-serif text-sm font-medium tracking-wide text-accent">Harbor</p>
            <h1 className="mt-1 font-serif text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
              De-identify a chart before any AI sees it.
            </h1>
            <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted sm:text-base">
              Drop a MyChart / Epic PDF. Detection runs in this tab with local rules and optional OpenMed on WebGPU.
              OpenRouter only receives text you review and approve.
            </p>
          </div>
          {stage === "review" ? (
            <Button variant="secondary" onClick={reset}>
              <Trash2 className="size-4" />
              Start over
            </Button>
          ) : null}
        </header>

        <TrustStrip />

        {error ? (
          <div className="flex gap-3 rounded-lg border border-phi/30 bg-phi-soft px-4 py-3 text-sm text-phi">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        {stage !== "review" ? (
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files[0];
                if (file) void onFile(file);
              }}
              className={cn(
                "flex min-h-72 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong bg-paper px-6 text-center shadow-soft transition-colors",
                dragging && "border-accent bg-accent-soft",
              )}
            >
              {stage === "working" ? (
                <>
                  <Loader2 className="size-8 animate-spin text-accent" />
                  <p className="font-medium">{status}</p>
                  <p className="text-sm text-muted">The file is not uploaded.</p>
                </>
              ) : (
                <>
                  <span className="flex size-12 items-center justify-center rounded-md bg-accent-soft text-accent">
                    <FileUp className="size-6" />
                  </span>
                  <p className="font-medium">Drop a MyChart PDF here</p>
                  <p className="max-w-sm text-sm text-muted">
                    Or click to choose a file. Nothing leaves this device until you send a reviewed, redacted payload.
                  </p>
                </>
              )}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onFile(file);
                event.target.value = "";
              }}
            />

            <aside className="flex flex-col gap-3 rounded-xl border border-line bg-paper p-5 shadow-soft">
              <h2 className="font-serif text-lg font-medium">Known identity</h2>
              <p className="text-sm leading-relaxed text-muted">
                Optional, and the most precise layer. Add the patient’s name, MRN, and DOB so Harbor can exact-match
                headers that repeat on every page.
              </p>
              <Button variant="secondary" onClick={() => setShowSeed((value) => !value)}>
                {showSeed ? "Hide fields" : "Add known identifiers"}
              </Button>
              {showSeed ? <SeedForm seed={seed} onChange={setSeed} /> : null}
              <div className="mt-auto flex flex-col gap-2 pt-2">
                <Button variant="primary" onClick={() => void onSample()} disabled={stage === "working"}>
                  Try a synthetic sample chart
                </Button>
                <p className="text-xs leading-relaxed text-subtle">
                  The sample is fake. Do not paste a real record into this chat — drop it only in this page.
                </p>
              </div>
            </aside>
          </section>
        ) : extracted && redaction ? (
          <Review
            extracted={extracted}
            spans={spans}
            setSpans={setSpans}
            dateMode={dateMode}
            setDateMode={setDateMode}
            tab={tab}
            setTab={setTab}
            accepted={accepted}
            redacted={redaction.redacted}
            detectors={detectors}
            openmedBusy={openmedBusy}
            openmedNote={openmedNote}
            openmedDevice={openmedDevice}
            onOpenMed={runOpenMed}
            onExport={exportFiles}
            onCopy={(value) => void copy("clean", value)}
            copied={copied === "clean"}
            showSend={showSend}
            setShowSend={setShowSend}
            apiKey={apiKey}
            setApiKey={setApiKey}
            model={model}
            setModel={setModel}
            summary={summary}
            summaryBusy={summaryBusy}
            onSend={() => void sendToOpenRouter()}
            seed={seed}
            setSeed={setSeed}
            onRescan={() => {
              if (!extracted) return;
              setSpans(detectLocalPhi(extracted.text, seed));
            }}
          />
        ) : null}
      </div>
    </main>
  );
}

function TrustStrip() {
  const items = [
    { icon: Shield, title: "PDF stays here", body: "Read with pdf.js in this tab. No upload." },
    { icon: Cpu, title: "OpenMed on-device", body: "33M clinical PII model. WebGPU, then WASM." },
    { icon: Check, title: "You approve the send", body: "OpenRouter sees only the reviewed clean text." },
  ];
  return (
    <ul className="grid gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <li key={item.title} className="flex gap-3 rounded-lg border border-line bg-paper px-4 py-3">
          <item.icon className="mt-0.5 size-4 shrink-0 text-accent" />
          <div>
            <p className="text-sm font-medium">{item.title}</p>
            <p className="text-xs leading-relaxed text-muted">{item.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function SeedForm({ seed, onChange }: { seed: IdentitySeed; onChange: (seed: IdentitySeed) => void }) {
  const fields: { key: keyof IdentitySeed; label: string }[] = [
    { key: "fullName", label: "Full name" },
    { key: "aliases", label: "Aliases / family names" },
    { key: "dob", label: "DOB" },
    { key: "mrn", label: "MRN" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "address", label: "Address" },
    { key: "zip", label: "ZIP" },
  ];
  return (
    <div className="grid gap-2">
      {fields.map((field) => (
        <label key={field.key} className="grid gap-1 text-xs font-medium text-muted">
          {field.label}
          <input
            value={seed[field.key]}
            onChange={(event) => onChange({ ...seed, [field.key]: event.target.value })}
            className="h-10 rounded-sm border border-line bg-bg px-3 text-sm text-ink outline-none focus:border-accent"
          />
        </label>
      ))}
    </div>
  );
}

function Review(props: {
  extracted: ExtractedPdf;
  spans: PhiSpan[];
  setSpans: (spans: PhiSpan[] | ((current: PhiSpan[]) => PhiSpan[])) => void;
  dateMode: DateMode;
  setDateMode: (mode: DateMode) => void;
  tab: ReviewTab;
  setTab: (tab: ReviewTab) => void;
  accepted: number;
  redacted: string;
  detectors: string[];
  openmedBusy: boolean;
  openmedNote: string;
  openmedDevice: string | null;
  onOpenMed: (deep: boolean) => void;
  onExport: () => void;
  onCopy: (value: string) => void;
  copied: boolean;
  showSend: boolean;
  setShowSend: (value: boolean) => void;
  apiKey: string;
  setApiKey: (value: string) => void;
  model: string;
  setModel: (value: string) => void;
  summary: string | null;
  summaryBusy: boolean;
  onSend: () => void;
  seed: IdentitySeed;
  setSeed: (seed: IdentitySeed) => void;
  onRescan: () => void;
}) {
  const originalSegments = segmentText(props.extracted.text, props.spans);

  return (
    <section className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="flex flex-col gap-4 rounded-xl border border-line bg-paper p-4 shadow-soft lg:p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">Source</p>
          <p className="mt-1 truncate font-medium">{props.extracted.fileName}</p>
          <p className="text-sm text-muted">
            {props.extracted.pageCount} page{props.extracted.pageCount === 1 ? "" : "s"} · {props.accepted} / {props.spans.length} identifiers marked
          </p>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-subtle">Date handling</p>
          <div className="grid grid-cols-3 gap-1 rounded-md bg-mist p-1">
            {DATE_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => props.setDateMode(mode.id)}
                className={cn(
                  "rounded-sm px-2 py-2 text-xs font-medium",
                  props.dateMode === mode.id ? "bg-paper text-ink shadow-soft" : "text-muted",
                )}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {DATE_MODES.find((mode) => mode.id === props.dateMode)?.hint}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Button onClick={() => props.onOpenMed(false)} disabled={props.openmedBusy}>
            {props.openmedBusy ? <Loader2 className="size-4 animate-spin" /> : <Cpu className="size-4" />}
            Scan with OpenMed
          </Button>
          <Button variant="secondary" onClick={() => props.onOpenMed(true)} disabled={props.openmedBusy}>
            Deep scan entire document
          </Button>
          <p className="text-xs leading-relaxed text-muted">{props.openmedNote}</p>
          {props.openmedDevice ? (
            <p className="text-xs text-accent">Runtime: {props.openmedDevice}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Button variant="secondary" onClick={props.onExport}>
            <Download className="size-4" />
            Download JSON + Markdown
          </Button>
          <Button variant="secondary" onClick={() => props.onCopy(props.redacted)}>
            {props.copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {props.copied ? "Copied" : "Copy clean text"}
          </Button>
          <Button variant="ghost" onClick={() => props.setShowSend(!props.showSend)}>
            Summarize with OpenRouter
          </Button>
        </div>

        <details className="rounded-md border border-line bg-bg px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">Rescan with known identity</summary>
          <div className="mt-3">
            <SeedForm seed={props.seed} onChange={props.setSeed} />
            <Button className="mt-3 w-full" variant="secondary" size="sm" onClick={props.onRescan}>
              Rescan locally
            </Button>
          </div>
        </details>
      </aside>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex gap-1 rounded-md bg-mist p-1">
          {(
            [
              ["clean", "Clean report"],
              ["original", "Original (on device)"],
              ["findings", `Findings (${props.spans.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => props.setTab(id)}
              className={cn(
                "h-10 flex-1 rounded-sm px-3 text-sm font-medium",
                props.tab === id ? "bg-paper text-ink shadow-soft" : "text-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {props.tab === "clean" ? (
          <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-paper p-4 font-mono text-xs leading-relaxed text-ink shadow-soft sm:text-sm">
            {props.redacted}
          </pre>
        ) : null}

        {props.tab === "original" ? (
          <div className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-paper p-4 font-mono text-xs leading-relaxed shadow-soft sm:text-sm">
            {originalSegments.map((segment, index) =>
              segment.span ? (
                <button
                  key={segment.span.id + index}
                  type="button"
                  title={`${CATEGORY_LABEL[segment.span.category]} · click to ${segment.span.accepted ? "keep" : "redact"}`}
                  onClick={() =>
                    props.setSpans((current) =>
                      current.map((span) =>
                        span.id === segment.span?.id ? { ...span, accepted: !span.accepted } : span,
                      ),
                    )
                  }
                  className={cn(
                    "rounded-xs px-0.5",
                    segment.span.accepted ? "bg-phi-soft text-phi" : "underline decoration-dotted text-muted",
                  )}
                >
                  {segment.text}
                </button>
              ) : (
                <span key={index}>{segment.text}</span>
              ),
            )}
          </div>
        ) : null}

        {props.tab === "findings" ? (
          <FindingsList spans={props.spans} setSpans={props.setSpans} />
        ) : null}

        {props.showSend ? (
          <div className="rounded-xl border border-line bg-paper p-4 shadow-soft">
            <h2 className="font-serif text-lg font-medium">Send clean text to OpenRouter</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              This is the only network call that includes clinical content. The original PDF is not attached. Your key
              stays in this browser.
            </p>
            <label className="mt-4 grid gap-1 text-xs font-medium text-muted">
              OpenRouter API key
              <input
                type="password"
                value={props.apiKey}
                onChange={(event) => props.setApiKey(event.target.value)}
                className="h-11 rounded-sm border border-line bg-bg px-3 text-sm text-ink outline-none focus:border-accent"
                placeholder="sk-or-…"
              />
            </label>
            <label className="mt-3 grid gap-1 text-xs font-medium text-muted">
              Model
              <select
                value={props.model}
                onChange={(event) => props.setModel(event.target.value)}
                className="h-11 rounded-sm border border-line bg-bg px-3 text-sm text-ink outline-none focus:border-accent"
              >
                {OPENROUTER_MODELS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-3 text-xs text-muted">{props.redacted.length.toLocaleString()} characters will be sent.</p>
            <Button className="mt-4" onClick={props.onSend} disabled={props.summaryBusy || !props.apiKey}>
              {props.summaryBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              Send reviewed text
            </Button>
            {props.summary ? (
              <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-bg p-3 text-sm leading-relaxed">
                {props.summary}
              </pre>
            ) : null}
          </div>
        ) : null}

        <p className="text-xs leading-relaxed text-subtle">
          Detectors: {props.detectors.join(", ")}. Harbor is a de-identification aid, not a HIPAA certification, a
          medical device, or a guarantee of zero residual risk. Review the clean report before it leaves this device.
        </p>
      </div>
    </section>
  );
}

function FindingsList({
  spans,
  setSpans,
}: {
  spans: PhiSpan[];
  setSpans: (spans: PhiSpan[] | ((current: PhiSpan[]) => PhiSpan[])) => void;
}) {
  if (spans.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-paper p-6 text-sm text-muted shadow-soft">
        No identifiers found yet. Add a known name/MRN or run OpenMed.
      </div>
    );
  }
  return (
    <ul className="max-h-[32rem] overflow-auto rounded-xl border border-line bg-paper shadow-soft">
      {spans.map((span) => (
        <li key={span.id} className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
          <div className="min-w-0">
            <p className="truncate font-mono text-sm">{span.text}</p>
            <p className="text-xs text-muted">
              {CATEGORY_LABEL[span.category]} · {span.source}
              {span.label ? ` · ${span.label}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setSpans((current) =>
                current.map((item) => (item.id === span.id ? { ...item, accepted: !item.accepted } : item)),
              )
            }
            className={cn(
              "shrink-0 rounded-sm px-2 py-1 text-xs font-medium",
              span.accepted ? "bg-phi-soft text-phi" : "bg-mist text-muted",
            )}
          >
            {span.accepted ? "Redacting" : "Kept"}
          </button>
        </li>
      ))}
    </ul>
  );
}
