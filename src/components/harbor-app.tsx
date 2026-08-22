import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Cpu, FileUp, Loader2, Shield, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DateModePicker,
  ExtractorCompare,
  FindingsList,
  ModeToggle,
  ReportPanel,
  SeedForm,
} from "@/components/harbor-panels";
import { RedactDoc } from "@/components/redact-doc";
import { detectLocalPhi, supplementWithLocalPhi } from "@/lib/phi/detect";
import { buildExport, downloadTextFile } from "@/lib/phi/export";
import { extractDocumentText } from "@/lib/phi/extract-document";
import { buildSamplePdf } from "@/lib/phi/extract-pdf";
import { prepareModelInput } from "@/lib/phi/packet";
import { formatExtractorCompare } from "@/lib/phi/pdf-text";
import { isOpenMedCached, scanWithOpenMed } from "@/lib/phi/openmed";
import { redactText } from "@/lib/phi/redact";
import { SAMPLE_CHART, SAMPLE_FILE_NAME } from "@/lib/phi/sample-chart";
import {
  EMPTY_SEED,
  type DateMode,
  type ExtractedDocument,
  type IdentitySeed,
  type PhiSpan,
} from "@/lib/phi/types";
import {
  fetchOpenRouterModels,
  readOpenRouterKey,
  readOpenRouterModel,
  summarizeWithOpenRouter,
  writeOpenRouterKey,
  writeOpenRouterModel,
  type OpenRouterModel,
} from "@/lib/openrouter";
import type { ReportConfig } from "@/lib/openrouter-env";
import { generateServerReport, getReportConfig } from "@/lib/report";
import { cn } from "@/lib/utils";

type Stage = "idle" | "working" | "review";
type HarborMode = "simple" | "complex";

function readMode(): HarborMode {
  if (typeof window === "undefined") return "simple";
  return localStorage.getItem("harbor.mode") === "complex" ? "complex" : "simple";
}

export function HarborApp() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<HarborMode>(readMode);
  const [stage, setStage] = useState<Stage>("idle");
  const [status, setStatus] = useState("Reading document…");
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedDocument | null>(null);
  const [spans, setSpans] = useState<PhiSpan[]>([]);
  const [openMedSpans, setOpenMedSpans] = useState<PhiSpan[]>([]);
  const [detectors, setDetectors] = useState<string[]>([]);
  const [openmedNote, setOpenmedNote] = useState("");
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [docView, setDocView] = useState<"redacted" | "original">("redacted");
  const [seed, setSeed] = useState<IdentitySeed>(EMPTY_SEED);
  const [dateMode, setDateMode] = useState<DateMode>("relative");
  const [config, setConfig] = useState<ReportConfig | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState(() => (typeof window === "undefined" ? "" : readOpenRouterKey()));
  const [model, setModel] = useState(() => (typeof window === "undefined" ? "" : readOpenRouterModel()));
  const [catalog, setCatalog] = useState<OpenRouterModel[]>([]);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const autoReportFor = useRef<string | null>(null);

  const redacted = extracted ? redactText(extracted.text, spans, dateMode).redacted : "";
  const accepted = spans.filter((span) => span.accepted).length;
  const showKeyFields = mode === "complex" && !config?.configured;

  useEffect(() => {
    let cancelled = false;
    void getReportConfig().then((value) => {
      if (cancelled) return;
      setConfig(value);
      if (value.configured && value.model) {
        setModel((current) => (value.models.includes(current) ? current : value.model as string));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!showKeyFields) return;
    let cancelled = false;
    setCatalogBusy(true);
    setCatalogError(null);
    void fetchOpenRouterModels()
      .then((models) => {
        if (!cancelled) setCatalog(models);
      })
      .catch((err: unknown) => {
        if (!cancelled) setCatalogError(err instanceof Error ? err.message : "Could not load models.");
      })
      .finally(() => {
        if (!cancelled) setCatalogBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showKeyFields]);

  const reportFingerprint = useMemo(() => `${dateMode}:${redacted.length}:${accepted}`, [dateMode, redacted, accepted]);

  function clearDerivedState() {
    setExtracted(null);
    setSpans([]);
    setOpenMedSpans([]);
    setDetectors([]);
    setOpenmedNote("");
    setReport(null);
    setReportError(null);
    setCopied(null);
    autoReportFor.current = null;
  }

  async function runPipeline(extractedDoc: ExtractedDocument) {
    setExtracted(extractedDoc);
    setCopied(null);
    setDocView("redacted");
    setReport(null);
    setReportError(null);
    autoReportFor.current = null;
    const cached = await isOpenMedCached();
    setStatus(cached ? "Loading cached OpenMed…" : "Downloading OpenMed into this browser…");
    let nextOpenMed: PhiSpan[] = [];
    let used = ["regex", "labels"];
    try {
      const result = await scanWithOpenMed({
        text: extractedDoc.text,
        onProgress: (message) => {
          setStatus(message);
          setOpenmedNote(message);
        },
      });
      nextOpenMed = result.spans;
      used = ["openmed", "regex", "labels"];
      setOpenmedNote(
        `OpenMed (${result.device}) marked ${result.spans.length} spans, then local rules filled gaps.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "OpenMed failed to load.";
      setOpenmedNote(message);
      setError(`OpenMed did not finish: ${message} Local rules still ran.`);
    }
    const merged =
      nextOpenMed.length > 0
        ? supplementWithLocalPhi(extractedDoc.text, nextOpenMed, seed)
        : detectLocalPhi(extractedDoc.text, seed);
    setOpenMedSpans(nextOpenMed);
    setSpans(merged);
    setDetectors(used);
    setStage("review");
    if (!extractedDoc.hasTextLayer) {
      setError("This document has too little readable text. Harbor cannot OCR scans yet — use a text PDF or DOCX, not a photograph.");
    } else if (nextOpenMed.length > 0) {
      setError(null);
    }
    if (mode === "simple") {
      void createReport(true, extractedDoc, merged);
    }
  }

  async function onFile(file: File) {
    clearDerivedState();
    setError(null);
    setStage("working");
    setStatus("Reading document in this browser…");
    try {
      const extractedDoc = await extractDocumentText(file);
      await runPipeline(extractedDoc);
    } catch (err) {
      setStage("idle");
      setError(err instanceof Error ? err.message : "Could not read that document.");
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
      await runPipeline({
        kind: "pdf",
        fileName: SAMPLE_FILE_NAME,
        pageCount: 2,
        text: SAMPLE_CHART,
        pages: [
          { pageNumber: 1, text: SAMPLE_CHART },
          { pageNumber: 2, text: SAMPLE_CHART },
        ],
        hasTextLayer: true,
        extractor: "layout",
      });
    }
  }

  function reset() {
    setStage("idle");
    clearDerivedState();
    setError(null);
  }

  function exportFiles() {
    if (!extracted) return;
    const payload = buildExport({ extracted, spans, dateMode, detectors, report });
    const base = extracted.fileName.replace(/\.(pdf|docx)$/i, "") + "-deidentified";
    downloadTextFile(`${base}.md`, payload.markdown, "text/markdown");
    downloadTextFile(`${base}.json`, JSON.stringify(payload.json, null, 2), "application/json");
  }

  function downloadExtractorCompare() {
    if (!extracted?.extractors?.length) return;
    const base = extracted.fileName.replace(/\.pdf$/i, "") + "-extractors";
    downloadTextFile(`${base}.txt`, formatExtractorCompare(extracted.extractors), "text/plain");
  }

  async function copy(label: "report" | "clean", value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1400);
  }

  async function createReport(
    automatic = false,
    doc = extracted,
    nextSpans = spans,
  ) {
    if (!doc) return;
    if (automatic && autoReportFor.current === reportFingerprint) return;
    const text = prepareModelInput(redactText(doc.text, nextSpans, "keep").redacted);
    setReportBusy(true);
    setReportError(null);
    try {
      const serverResult = await generateServerReport({
        data: {
          redactedText: text,
          model: config?.configured
            ? config.models.includes(model)
              ? model
              : (config.model ?? "")
            : "",
        },
      });
      if (serverResult.ok) {
        setReport(serverResult.text);
        autoReportFor.current = reportFingerprint;
        return;
      }
      const missingSecrets = /OPENROUTER_API_KEY and OPENROUTER_MODEL/.test(serverResult.error);
      if (automatic && missingSecrets) return;
      if (!missingSecrets) throw new Error(serverResult.error);
      if (!apiKey.trim() || !model.trim()) {
        throw new Error(
          "Set OPENROUTER_API_KEY and OPENROUTER_MODEL on the server (including Fly secrets), or paste a key and model in Complex.",
        );
      }
      writeOpenRouterKey(apiKey);
      writeOpenRouterModel(model);
      const textOut = await summarizeWithOpenRouter({
        apiKey,
        model,
        redactedText: text,
      });
      setReport(textOut);
      autoReportFor.current = reportFingerprint;
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Report failed.");
    } finally {
      setReportBusy(false);
    }
  }

  function changeMode(next: HarborMode) {
    setMode(next);
    localStorage.setItem("harbor.mode", next);
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
              {mode === "simple"
                ? "Drop a PDF or DOCX, fix the highlights, and Harbor writes the report. Download it or copy it."
                : "Full controls: known identity, date handling, findings, and OpenRouter when no server secret is set."}
            </p>
          </div>
          <div className="flex w-full max-w-xs flex-col gap-2 sm:w-56">
            <ModeToggle mode={mode} onChange={changeMode} />
            {stage === "review" ? (
              <Button variant="secondary" onClick={reset}>
                <Trash2 className="size-4" />
                Start over
              </Button>
            ) : null}
          </div>
        </header>

        {mode === "simple" ? (
          <ul className="grid gap-3 sm:grid-cols-3">
            {[
              { icon: Shield, title: "1. Add a file", body: "PDF or DOCX stays in this tab." },
              { icon: Cpu, title: "2. Check highlights", body: "OpenMed first, then you edit." },
              { icon: Check, title: "3. Report", body: "Download or copy when it lands." },
            ].map((item) => (
              <li key={item.title} className="flex gap-3 rounded-lg border border-line bg-paper px-4 py-3">
                <item.icon className="mt-0.5 size-4 shrink-0 text-accent" />
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs leading-relaxed text-muted">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-3">
            {[
              { icon: Shield, title: "File stays here", body: "PDF or DOCX stays in this tab." },
              { icon: Cpu, title: "OpenMed first", body: "Cached on this device after one download." },
              { icon: Check, title: "You control send", body: "Server secret or a key you paste." },
            ].map((item) => (
              <li key={item.title} className="flex gap-3 rounded-lg border border-line bg-paper px-4 py-3">
                <item.icon className="mt-0.5 size-4 shrink-0 text-accent" />
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs leading-relaxed text-muted">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {error ? (
          <div className="flex gap-3 rounded-lg border border-phi/30 bg-phi-soft px-4 py-3 text-sm text-phi">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        {stage !== "review" ? (
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
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
                  <p className="font-medium" data-testid="status">
                    {status}
                  </p>
                  <p className="max-w-sm text-sm text-muted">
                    The chart never leaves this device. The OpenMed download is cached after the first time.
                  </p>
                </>
              ) : (
                <>
                  <span className="flex size-12 items-center justify-center rounded-md bg-accent-soft text-accent">
                    <FileUp className="size-6" />
                  </span>
                  <p className="font-medium">Drop a MyChart PDF or DOCX here</p>
                  <p className="max-w-sm text-sm text-muted">OpenMed starts as soon as the file is in this tab.</p>
                </>
              )}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onFile(file);
                event.target.value = "";
              }}
            />
            <aside className="flex flex-col justify-between gap-3 rounded-xl border border-line bg-paper p-5 shadow-soft">
              <div>
                <h2 className="font-serif text-lg font-medium">No chart handy?</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  The sample is synthetic. Use it to confirm the flow, then drop a real text PDF or DOCX from MyChart.
                </p>
              </div>
              <Button
                variant="primary"
                data-testid="try-sample"
                onClick={() => void onSample()}
                disabled={stage === "working"}
              >
                Try a synthetic sample
              </Button>
            </aside>
          </section>
        ) : extracted ? (
          <section className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <aside className="flex min-w-0 flex-col gap-4 overflow-x-hidden rounded-xl border border-line bg-paper p-4 shadow-soft lg:p-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-subtle">Source</p>
                <p className="mt-1 truncate font-medium">{extracted.fileName}</p>
                <p className="text-sm text-muted">
                  {extracted.pageCount === null
                    ? "Page count unavailable"
                    : `${extracted.pageCount} page${extracted.pageCount === 1 ? "" : "s"}`} · {accepted} redactions
                </p>
              </div>
              <p className="text-xs leading-relaxed text-muted">{openmedNote}</p>
              {mode === "complex" ? (
                <>
                  <DateModePicker dateMode={dateMode} onChange={setDateMode} />
                  <details className="rounded-md border border-line bg-bg px-3 py-2">
                    <summary className="cursor-pointer text-sm font-medium">Known identity</summary>
                    <div className="mt-3">
                      <SeedForm seed={seed} onChange={setSeed} />
                      <Button
                        className="mt-3 w-full"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          if (!extracted) return;
                          setSpans(supplementWithLocalPhi(extracted.text, openMedSpans, seed));
                        }}
                      >
                        Rescan with identity
                      </Button>
                    </div>
                  </details>
                  <details className="rounded-md border border-line bg-bg px-3 py-2">
                    <summary className="cursor-pointer text-sm font-medium">Findings ({spans.length})</summary>
                    <div className="mt-3">
                      <FindingsList spans={spans} setSpans={setSpans} />
                    </div>
                  </details>
                  {extracted.extractors?.length ? (
                    <ExtractorCompare rows={extracted.extractors} onDownload={downloadExtractorCompare} />
                  ) : null}
                </>
              ) : null}
              <ReportPanel
                config={config}
                mode={mode}
                report={report}
                reportBusy={reportBusy}
                reportError={reportError}
                copied={copied}
                onCreate={() => void createReport(false)}
                onCopyReport={() => {
                  if (report) void copy("report", report);
                }}
                onCopyClean={() => void copy("clean", redacted)}
                onDownload={exportFiles}
                showKeyFields={showKeyFields}
                apiKey={apiKey}
                setApiKey={setApiKey}
                model={model}
                setModel={setModel}
                catalog={catalog}
                catalogBusy={catalogBusy}
                catalogError={catalogError}
              />
            </aside>
            <div className="min-w-0">
              <div className="mb-3 grid grid-cols-2 gap-1 rounded-md bg-mist p-1">
                <button
                  type="button"
                  onClick={() => setDocView("redacted")}
                  className={cn(
                    "h-11 rounded-sm px-3 text-sm font-medium",
                    docView === "redacted" ? "bg-paper text-ink shadow-soft" : "text-muted",
                  )}
                >
                  Redacted
                </button>
                <button
                  type="button"
                  onClick={() => setDocView("original")}
                  className={cn(
                    "h-11 rounded-sm px-3 text-sm font-medium",
                    docView === "original" ? "bg-paper text-ink shadow-soft" : "text-muted",
                  )}
                >
                  Original (edit)
                </button>
              </div>
              {docView === "redacted" ? (
                <pre
                  data-testid="redacted"
                  className="max-h-[36rem] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-paper p-4 font-mono text-xs leading-relaxed text-ink shadow-soft sm:text-sm"
                >
                  {redacted}
                </pre>
              ) : (
                <RedactDoc text={extracted.text} spans={spans} onChange={setSpans} />
              )}
              <p className="mt-3 text-xs leading-relaxed text-subtle">
                Detectors: {detectors.join(", ") || "none"}. Harbor is a de-identification aid, not a HIPAA
                certification. The report is built from the Redacted tab, not the original.
              </p>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
