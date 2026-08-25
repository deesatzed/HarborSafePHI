import { useEffect, useRef, useState } from "react";
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
import { IntakeGeneration, orchestrateDocumentIntake } from "@/lib/phi/intake-orchestrator";
import { canonicalizePayload } from "@/lib/phi/packet";
import { isOpenMedCached, scanWithOpenMed } from "@/lib/phi/openmed";
import { redactText } from "@/lib/phi/redact";
import {
  approveReview,
  reviewFingerprint,
  reviewIsCurrent,
  sha256Hex,
  type ReviewApproval,
  type ReviewedRepresentation,
} from "@/lib/phi/review";
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
  readOpenRouterModel,
  summarizeWithOpenRouter,
  writeOpenRouterModel,
  type OpenRouterModel,
} from "@/lib/openrouter";
import type { ReportConfig } from "@/lib/openrouter-env";
import { generateServerReport, getReportConfig } from "@/lib/report";
import { cn } from "@/lib/utils";

type Stage = "idle" | "working" | "review";
type HarborMode = "simple" | "complex";

type ReviewSnapshot = {
  extracted: ExtractedDocument | null;
  spans: PhiSpan[];
  dateMode: DateMode;
  redacted: string;
};

function sameReviewSnapshot(left: ReviewSnapshot, right: ReviewSnapshot): boolean {
  return (
    left.extracted === right.extracted &&
    left.spans === right.spans &&
    left.dateMode === right.dateMode &&
    left.redacted === right.redacted
  );
}

async function reviewedRepresentation(
  snapshot: ReviewSnapshot,
): Promise<ReviewedRepresentation | null> {
  const document = snapshot.extracted;
  if (!document) return null;
  return {
    sourceTextSha256: await sha256Hex(document.text),
    dateMode: snapshot.dateMode,
    redactedText: canonicalizePayload(snapshot.redacted).text,
    findings: snapshot.spans,
  };
}

type SummaryIdentity = { requestId: number; reviewSha256: string };

function readMode(): HarborMode {
  if (typeof window === "undefined") return "simple";
  return localStorage.getItem("harbor.mode") === "complex" ? "complex" : "simple";
}

export function HarborApp() {
  const inputRef = useRef<HTMLInputElement>(null);
  const intakeGeneration = useRef(new IntakeGeneration());
  const [hydrated, setHydrated] = useState(false);
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
  const [approval, setApproval] = useState<ReviewApproval | null>(null);
  const [approvedReviewKey, setApprovedReviewKey] = useState<string | null>(null);
  const [reviewKey, setReviewKey] = useState<string | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(() => (typeof window === "undefined" ? "" : readOpenRouterModel()));
  const [catalog, setCatalog] = useState<OpenRouterModel[]>([]);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const rawRedacted = extracted ? redactText(extracted.text, spans, dateMode).redacted : "";
  const canonicalPayload = canonicalizePayload(rawRedacted);
  const redacted = canonicalPayload.text;
  const accepted = spans.filter((span) => span.accepted).length;
  const showKeyFields = mode === "complex" && !config?.configured;
  const approvalRef = useRef<ReviewApproval | null>(null);
  const approvedReviewKeyRef = useRef<string | null>(null);
  const reviewKeyRef = useRef<string | null>(null);
  const reviewComputationId = useRef(0);
  const approvalRequestId = useRef(0);
  const summaryRequestId = useRef(0);
  const currentReview = useRef<ReviewSnapshot>({ extracted, spans, dateMode, redacted });
  currentReview.current = { extracted, spans, dateMode, redacted };
  const reviewApproved = Boolean(
    approval &&
      reviewKey &&
      approvedReviewKey === reviewKey &&
      approval.reviewSha256 === reviewKey,
  );

  useEffect(() => {
    setHydrated(true);
  }, []);

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

  useEffect(() => {
    const snapshot = currentReview.current;
    const computationId = ++reviewComputationId.current;
    ++summaryRequestId.current;
    approvalRef.current = null;
    approvedReviewKeyRef.current = null;
    reviewKeyRef.current = null;
    setApproval(null);
    setApprovedReviewKey(null);
    setReviewKey(null);
    setApprovalBusy(false);
    setReport(null);
    setReportBusy(false);
    setReportError(null);
    setCopied(null);
    if (!snapshot.extracted) return;

    void (async () => {
      const nextReview = await reviewedRepresentation(snapshot);
      if (
        !nextReview ||
        computationId !== reviewComputationId.current ||
        !sameReviewSnapshot(snapshot, currentReview.current)
      ) {
        return;
      }
      const nextReviewKey = await reviewFingerprint(nextReview);
      if (
        computationId !== reviewComputationId.current ||
        !sameReviewSnapshot(snapshot, currentReview.current)
      ) {
        return;
      }
      reviewKeyRef.current = nextReviewKey;
      setReviewKey(nextReviewKey);
    })();
  }, [dateMode, extracted, redacted, spans]);

  function invalidateReview() {
    ++reviewComputationId.current;
    ++approvalRequestId.current;
    ++summaryRequestId.current;
    approvalRef.current = null;
    approvedReviewKeyRef.current = null;
    reviewKeyRef.current = null;
    setApproval(null);
    setApprovedReviewKey(null);
    setReviewKey(null);
    setApprovalBusy(false);
    setReport(null);
    setReportBusy(false);
    setReportError(null);
    setCopied(null);
  }

  function setReviewedSpans(
    next: PhiSpan[] | ((current: PhiSpan[]) => PhiSpan[]),
  ) {
    invalidateReview();
    setSpans(next);
  }

  function setReviewedDateMode(next: DateMode) {
    if (next === dateMode) return;
    invalidateReview();
    setDateMode(next);
  }

  function summaryIsCurrent(identity: SummaryIdentity, token: number): boolean {
    return (
      intakeGeneration.current.isCurrent(token) &&
      summaryRequestId.current === identity.requestId &&
      approvalRef.current?.reviewSha256 === identity.reviewSha256 &&
      approvedReviewKeyRef.current === identity.reviewSha256 &&
      reviewKeyRef.current === identity.reviewSha256
    );
  }

  async function requireCurrentApproval(message: string): Promise<{
    approval: ReviewApproval;
    input: ReviewedRepresentation;
    snapshot: ReviewSnapshot;
  } | null> {
    const snapshot = currentReview.current;
    const computationId = reviewComputationId.current;
    const currentApproval = approvalRef.current;
    const currentKey = reviewKeyRef.current;
    if (
      !snapshot.extracted ||
      !currentApproval ||
      !currentKey ||
      approvedReviewKeyRef.current !== currentKey ||
      currentApproval.reviewSha256 !== currentKey
    ) {
      setReportError(message);
      return null;
    }

    const input = await reviewedRepresentation(snapshot);
    if (
      !input ||
      computationId !== reviewComputationId.current ||
      !sameReviewSnapshot(snapshot, currentReview.current) ||
      approvalRef.current !== currentApproval ||
      reviewKeyRef.current !== currentKey
    ) {
      setReportError(message);
      return null;
    }
    const isCurrent = await reviewIsCurrent(currentApproval, input);
    if (
      !isCurrent ||
      computationId !== reviewComputationId.current ||
      !sameReviewSnapshot(snapshot, currentReview.current) ||
      approvalRef.current !== currentApproval ||
      approvedReviewKeyRef.current !== currentKey ||
      reviewKeyRef.current !== currentKey
    ) {
      setReportError(message);
      return null;
    }
    return { approval: currentApproval, input, snapshot };
  }

  async function approveCurrentReview() {
    const snapshot = currentReview.current;
    const expectedKey = reviewKeyRef.current;
    const computationId = reviewComputationId.current;
    const requestId = ++approvalRequestId.current;
    if (!snapshot.extracted || !expectedKey) {
      setReportError("Wait for Harbor to finish preparing the redaction review.");
      return;
    }
    setApprovalBusy(true);
    setReportError(null);
    try {
      const input = await reviewedRepresentation(snapshot);
      if (
        !input ||
        requestId !== approvalRequestId.current ||
        computationId !== reviewComputationId.current ||
        !sameReviewSnapshot(snapshot, currentReview.current) ||
        reviewKeyRef.current !== expectedKey
      ) {
        return;
      }
      const nextApproval = await approveReview(input);
      if (
        requestId !== approvalRequestId.current ||
        computationId !== reviewComputationId.current ||
        !sameReviewSnapshot(snapshot, currentReview.current) ||
        reviewKeyRef.current !== expectedKey ||
        nextApproval.reviewSha256 !== expectedKey
      ) {
        return;
      }
      approvalRef.current = nextApproval;
      approvedReviewKeyRef.current = expectedKey;
      setApproval(nextApproval);
      setApprovedReviewKey(expectedKey);
    } catch (err) {
      if (requestId === approvalRequestId.current) {
        setReportError(err instanceof Error ? err.message : "Could not approve this review.");
      }
    } finally {
      if (requestId === approvalRequestId.current) setApprovalBusy(false);
    }
  }

  function clearDerivedState() {
    invalidateReview();
    setExtracted(null);
    setSpans([]);
    setOpenMedSpans([]);
    setDetectors([]);
    setOpenmedNote("");
  }

  async function requestReportText(
    input: ReviewedRepresentation,
    approval: ReviewApproval,
    token: number,
    identity: SummaryIdentity,
  ): Promise<string | null> {
    const serverResult = await generateServerReport({
      data: {
        redactedText: input.redactedText,
        redactedSha256: approval.redactedSha256,
        dateMode: input.dateMode,
        model: config?.configured
          ? config.models.includes(model)
            ? model
            : (config.model ?? "")
          : "",
      },
    });
    if (!summaryIsCurrent(identity, token)) return null;
    if (serverResult.ok) return serverResult.text;

    const missingSecrets = /OPENROUTER_API_KEY and OPENROUTER_MODEL/.test(serverResult.error);
    if (!missingSecrets) throw new Error(serverResult.error);
    if (!apiKey.trim() || !model.trim()) {
      throw new Error(
        "Set OPENROUTER_API_KEY and OPENROUTER_MODEL on the server (including Fly secrets), or paste a key and model in Complex.",
      );
    }
    writeOpenRouterModel(model);
    const textOut = await summarizeWithOpenRouter({
      apiKey,
      model,
      redactedText: input.redactedText,
    });
    if (!summaryIsCurrent(identity, token)) return null;
    return textOut;
  }

  async function startIntake(
    loadDocument: () => Promise<ExtractedDocument>,
    initialStatus: string,
  ) {
    await orchestrateDocumentIntake({
      generation: intakeGeneration.current,
      loadDocument,
      isOpenMedCached,
      scanOpenMed: scanWithOpenMed,
      mergeSpans: (document, nextOpenMed) =>
        nextOpenMed.length > 0
          ? supplementWithLocalPhi(document.text, nextOpenMed, seed)
          : detectLocalPhi(document.text, seed),
      callbacks: {
        onClear: clearDerivedState,
        onWorking: () => {
          setError(null);
          setStage("working");
          setStatus(initialStatus);
        },
        onStatus: setStatus,
        onOpenMedNote: setOpenmedNote,
        onOpenMedError: setError,
        onReview: ({ document, openMedSpans: nextOpenMed, spans: merged, detectors: used }) => {
          setExtracted(document);
          setOpenMedSpans(nextOpenMed);
          setSpans(merged);
          setDetectors(used);
          setDocView("redacted");
          setStage("review");
          if (document.warnings?.length) {
            setError(`Document extraction warning: ${document.warnings.join(" ")} Review the extract carefully.`);
          } else if (nextOpenMed.length > 0) {
            setError(null);
          }
        },
        onReportBusy: setReportBusy,
        onReport: setReport,
        onReportError: setReportError,
        onReject: (message) => {
          setStage("idle");
          setError(message);
        },
      },
    });
  }

  async function onFile(file: File) {
    await startIntake(
      () => extractDocumentText(file),
      "Reading document in this browser…",
    );
  }

  async function onSample() {
    await startIntake(async () => {
      try {
        const file = await buildSamplePdf();
        return await extractDocumentText(file);
      } catch {
        return {
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
        };
      }
    }, "Building a synthetic Epic-style chart…");
  }

  function reset() {
    intakeGeneration.current.invalidate();
    setStage("idle");
    clearDerivedState();
    setError(null);
  }

  async function exportFiles() {
    const context = await requireCurrentApproval(
      "Review and approve the redactions before downloading the artifact.",
    );
    if (!context?.snapshot.extracted) return;
    const payload = buildExport({
      extracted: context.snapshot.extracted,
      spans: context.snapshot.spans,
      dateMode: context.snapshot.dateMode,
      detectors,
      redactedText: context.input.redactedText,
      report,
    });
    const base = payload.artifactId;
    downloadTextFile(`${base}.md`, payload.markdown, "text/markdown");
    downloadTextFile(`${base}.json`, JSON.stringify(payload.json, null, 2), "application/json");
  }

  async function copy(label: "report" | "clean", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1400);
      return true;
    } catch {
      setReportError("Harbor could not copy that text. It remains available in the approved view.");
      return false;
    }
  }

  async function createReport() {
    const context = await requireCurrentApproval(
      "Review and approve the redactions before creating a summary.",
    );
    if (!context) return;
    const token = intakeGeneration.current.current();
    const identity = {
      requestId: ++summaryRequestId.current,
      reviewSha256: context.approval.reviewSha256,
    };
    setReportBusy(true);
    setReportError(null);
    try {
      const textOut = await requestReportText(
        context.input,
        context.approval,
        token,
        identity,
      );
      if (!summaryIsCurrent(identity, token)) return;
      if (!textOut) return;
      setReport(textOut);
    } catch (err) {
      if (!summaryIsCurrent(identity, token)) return;
      setReportError(err instanceof Error ? err.message : "Report failed.");
    } finally {
      if (summaryIsCurrent(identity, token)) setReportBusy(false);
    }
  }

  async function copyApproved(label: "report" | "clean", value: string) {
    const context = await requireCurrentApproval(
      `Review and approve the redactions before copying ${label === "clean" ? "clean text" : "the summary"}.`,
    );
    if (!context) return;
    const reviewSha256 = context.approval.reviewSha256;
    const copiedSuccessfully = await copy(label, value);
    if (!copiedSuccessfully) return;
    if (
      approvalRef.current?.reviewSha256 !== reviewSha256 ||
      approvedReviewKeyRef.current !== reviewSha256 ||
      reviewKeyRef.current !== reviewSha256
    ) {
      setCopied(null);
    }
  }

  function changeMode(next: HarborMode) {
    setMode(next);
    localStorage.setItem("harbor.mode", next);
  }

  return (
    <main
      className="min-h-dvh bg-bg text-ink"
      data-testid={hydrated ? "harbor-hydrated" : undefined}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xl">
            <p className="font-serif text-sm font-medium tracking-wide text-accent">Harbor</p>
            <h1 className="mt-1 font-serif text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
              De-identify a chart before any AI sees it.
            </h1>
            <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted sm:text-base">
              {mode === "simple"
                ? "Add a PDF or DOCX, review the highlights, approve the redactions, then optionally create a summary or download."
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
          <ul className="grid gap-3 sm:grid-cols-4">
            {[
              { icon: Shield, title: "1. Add a file", body: "PDF or DOCX stays in this tab." },
              { icon: Cpu, title: "2. Check highlights", body: "OpenMed first, then you edit." },
              { icon: Check, title: "3. Approve", body: "Approve this exact redacted view." },
              { icon: Check, title: "4. Optional", body: "Create a summary or download." },
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
              data-testid="document-input"
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
                  <DateModePicker dateMode={dateMode} onChange={setReviewedDateMode} />
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
                          setReviewedSpans(supplementWithLocalPhi(extracted.text, openMedSpans, seed));
                        }}
                      >
                        Rescan with identity
                      </Button>
                    </div>
                  </details>
                  <details className="rounded-md border border-line bg-bg px-3 py-2">
                    <summary className="cursor-pointer text-sm font-medium">Findings ({spans.length})</summary>
                    <div className="mt-3">
                      <FindingsList spans={spans} setSpans={setReviewedSpans} />
                    </div>
                  </details>
                  {extracted.extractors?.length ? (
                    <ExtractorCompare rows={extracted.extractors} />
                  ) : null}
                </>
              ) : null}
              <ReportPanel
                config={config}
                mode={mode}
                dateMode={dateMode}
                reviewApproved={reviewApproved}
                approvalBusy={approvalBusy}
                report={report}
                reportBusy={reportBusy}
                reportError={reportError}
                payloadCharacterCount={canonicalPayload.characterCount}
                payloadSourceCharacterCount={canonicalPayload.sourceCharacterCount}
                payloadTruncated={canonicalPayload.truncated}
                copied={copied}
                onApprove={() => void approveCurrentReview()}
                onCreate={() => void createReport()}
                onCopyReport={() => {
                  if (report) void copyApproved("report", report);
                }}
                onCopyClean={() => void copyApproved("clean", redacted)}
                onDownload={() => void exportFiles()}
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
                <RedactDoc text={extracted.text} spans={spans} onChange={setReviewedSpans} />
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
