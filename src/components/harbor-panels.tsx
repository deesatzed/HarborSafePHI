import { Check, Copy, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CATEGORY_LABEL,
  type DateMode,
  type ExtractorSnapshot,
  type IdentitySeed,
  type PhiSpan,
} from "@/lib/phi/types";
import { cn } from "@/lib/utils";
import type { OpenRouterModel } from "@/lib/openrouter";
import type { ReportConfig } from "@/lib/openrouter-env";
import { describeOpenRouterDateDisclosure } from "@/lib/phi/review";

export const DATE_MODES: { id: DateMode; label: string; hint: string }[] = [
  { id: "relative", label: "Relative", hint: "Day 0, Day +N" },
  { id: "year", label: "Year only", hint: "Safe Harbor year" },
  { id: "keep", label: "Keep dates", hint: "Leave dates in the extract. Reports already keep clinical dates." },
];

export function ModeToggle({
  mode,
  onChange,
}: {
  mode: "simple" | "complex";
  onChange: (mode: "simple" | "complex") => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-md bg-mist p-1">
      {(["simple", "complex"] as const).map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            "h-11 rounded-sm px-3 text-sm font-medium capitalize",
            mode === id ? "bg-paper text-ink shadow-soft" : "text-muted",
          )}
        >
          {id}
        </button>
      ))}
    </div>
  );
}

export function SeedForm({ seed, onChange }: { seed: IdentitySeed; onChange: (seed: IdentitySeed) => void }) {
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

export function DateModePicker({
  dateMode,
  onChange,
}: {
  dateMode: DateMode;
  onChange: (mode: DateMode) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-subtle">Date handling</p>
      <div className="grid grid-cols-3 gap-1 rounded-md bg-mist p-1">
        {DATE_MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => onChange(mode.id)}
            className={cn(
              "min-h-11 rounded-sm px-2 py-2 text-xs font-medium",
              dateMode === mode.id ? "bg-paper text-ink shadow-soft" : "text-muted",
            )}
          >
            {mode.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        {DATE_MODES.find((mode) => mode.id === dateMode)?.hint}
      </p>
    </div>
  );
}

export function FindingsList({
  spans,
  setSpans,
}: {
  spans: PhiSpan[];
  setSpans: (spans: PhiSpan[] | ((current: PhiSpan[]) => PhiSpan[])) => void;
}) {
  if (spans.length === 0) {
    return <p className="text-sm text-muted">No identifiers yet.</p>;
  }
  return (
    <ul className="max-h-64 overflow-auto rounded-md border border-line">
      {spans.map((span) => (
        <li key={span.id} className="flex items-start justify-between gap-3 border-b border-line px-3 py-2 last:border-b-0">
          <div className="min-w-0">
            <p className="truncate font-mono text-xs">{span.text}</p>
            <p className="text-[11px] text-muted">
              {CATEGORY_LABEL[span.category]} · {span.source}
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
              "h-9 shrink-0 rounded-sm px-2 text-xs font-medium",
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

export function ExtractorCompare({
  rows,
  onDownload,
}: {
  rows: ExtractorSnapshot[];
  onDownload: () => void;
}) {
  if (rows.length === 0) return null;
  const used = rows.find((row) => row.id === "layout");
  return (
    <details className="rounded-md border border-line bg-bg px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium">PDF text methods</summary>
      <div className="mt-3 grid gap-3">
        <p className="text-xs leading-relaxed text-muted">
          Harbor reads the PDF with pdf.js in this tab, then assembles glyphs four ways. unpdf and pdf-parse wrap
          the same engine — they are not a second parser. Cloud extractors are omitted because they would send the
          chart off this device.
        </p>
        {used ? (
          <p className="text-xs leading-relaxed text-muted">
            Redaction and the report use <span className="font-medium text-ink">Layout</span> ({used.chars} chars,{" "}
            {used.lines} lines).
          </p>
        ) : null}
        <ul className="grid gap-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className={cn(
                "rounded-sm border border-line px-3 py-2",
                row.id === "layout" ? "bg-mist" : "bg-paper",
              )}
            >
              <p className="text-sm font-medium text-ink">{row.label}</p>
              <p className="mt-1 font-mono text-xs leading-relaxed text-muted">
                {row.chars} chars · {row.lines} lines · aA {row.camelGlue} · a1 {row.letterDigitGlue}
              </p>
            </li>
          ))}
        </ul>
        <p className="text-xs leading-relaxed text-muted">
          aA glue counts lowercase-then-uppercase joins (OftenWordGlue). a1 glue counts letter-digit joins. Lower
          is usually cleaner; lab tokens like HbA1c still increment both. The download is the original PDF text, not
          the redacted view.
        </p>
        <Button variant="secondary" size="sm" onClick={onDownload}>
          <Download className="size-4" />
          Download four original extracts
        </Button>
      </div>
    </details>
  );
}

export function ReportPanel({
  config,
  mode,
  dateMode,
  reviewApproved,
  approvalBusy,
  report,
  reportBusy,
  reportError,
  copied,
  onApprove,
  onCreate,
  onCopyReport,
  onCopyClean,
  onDownload,
  showKeyFields,
  apiKey,
  setApiKey,
  model,
  setModel,
  catalog,
  catalogBusy,
  catalogError,
}: {
  config: ReportConfig | null;
  mode: "simple" | "complex";
  dateMode: DateMode;
  reviewApproved: boolean;
  approvalBusy: boolean;
  report: string | null;
  reportBusy: boolean;
  reportError: string | null;
  copied: string | null;
  onApprove: () => void;
  onCreate: () => void;
  onCopyReport: () => void;
  onCopyClean: () => void;
  onDownload: () => void;
  showKeyFields: boolean;
  apiKey: string;
  setApiKey: (value: string) => void;
  model: string;
  setModel: (value: string) => void;
  catalog: OpenRouterModel[];
  catalogBusy: boolean;
  catalogError: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      {config?.configured ? (
        <div className="grid gap-2">
          <p className="text-xs leading-relaxed text-muted">
            Summary uses {config.models.includes(model) ? model : config.model} from `.env` / Fly. The key stays on
            the server. Names stay redacted. There is no 24k-character cutoff.
          </p>
          {config.models.length > 1 ? (
            <label className="grid gap-1 text-xs font-medium text-muted">
              Configured models
              <select
                data-testid="report-model"
                value={config.models.includes(model) ? model : config.model ?? ""}
                onChange={(event) => setModel(event.target.value)}
                className="h-11 w-full min-w-0 rounded-sm border border-line bg-bg px-3 text-sm text-ink outline-none focus:border-accent"
              >
                {config.models.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : mode === "simple" ? (
        <p className="text-xs leading-relaxed text-muted">
          Creating a summary requires OPENROUTER_API_KEY and OPENROUTER_MODEL or OPENROUTER_MODEL_1 in `.env` or Fly
          secrets. Review and approve the redacted text first. Switch to Complex to paste a key for this browser only.
        </p>
      ) : null}

      <p data-testid="summary-date-disclosure" className="text-xs leading-relaxed text-muted">
        {describeOpenRouterDateDisclosure(dateMode)}
      </p>

      {showKeyFields ? (
        <div className="grid gap-2">
          <label className="grid gap-1 text-xs font-medium text-muted">
            OpenRouter API key
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              className="h-11 w-full min-w-0 rounded-sm border border-line bg-bg px-3 text-sm text-ink outline-none focus:border-accent"
              autoComplete="off"
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted">
            OpenRouter model id
            <input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="h-11 w-full min-w-0 rounded-sm border border-line bg-bg px-3 text-sm text-ink outline-none focus:border-accent"
              placeholder="provider/model-id"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          {catalog.length > 0 ? (
            <label className="grid gap-1 text-xs font-medium text-muted">
              Live catalog
              <select
                value={catalog.some((item) => item.id === model) ? model : ""}
                onChange={(event) => {
                  if (event.target.value) setModel(event.target.value);
                }}
                className="h-11 w-full min-w-0 rounded-sm border border-line bg-bg px-3 text-sm text-ink outline-none focus:border-accent"
              >
                <option value="">Choose from OpenRouter…</option>
                {catalog.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.id})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {catalogBusy ? <p className="text-xs text-muted">Loading live OpenRouter models…</p> : null}
          {catalogError ? <p className="text-xs text-phi">{catalogError}</p> : null}
        </div>
      ) : null}

      <div
        data-testid="review-status"
        className={cn(
          "rounded-sm border px-3 py-2 text-xs leading-relaxed",
          reviewApproved
            ? "border-accent/30 bg-accent-soft text-accent"
            : "border-line bg-bg text-muted",
        )}
      >
        {reviewApproved
          ? "Approved for this exact redacted text, finding set, and date policy."
          : "Not approved. Review the redacted view before summary, copy, or download."}
      </div>
      <Button
        data-testid="approve-redactions"
        variant="secondary"
        onClick={onApprove}
        disabled={approvalBusy || reviewApproved}
      >
        {approvalBusy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        {reviewApproved ? "Redactions approved" : "Approve redactions"}
      </Button>

      <Button data-testid="create-summary" onClick={onCreate} disabled={reportBusy || !reviewApproved}>
        {reportBusy ? <Loader2 className="size-4 animate-spin" /> : null}
        {report ? "Update summary" : "Create summary"}
      </Button>
      {reportError ? <p className="text-xs leading-relaxed text-phi">{reportError}</p> : null}
      {report ? (
        <pre
          data-testid="report"
          className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-bg p-3 text-xs leading-relaxed"
        >
          {report}
        </pre>
      ) : null}
      <Button data-testid="download-artifact" variant="secondary" onClick={onDownload} disabled={!reviewApproved}>
        <Download className="size-4" />
        Download
      </Button>
      <Button variant="secondary" onClick={onCopyReport} disabled={!report || !reviewApproved}>
        {copied === "report" ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied === "report" ? "Copied summary" : "Copy summary"}
      </Button>
      <Button variant="ghost" onClick={onCopyClean} disabled={!reviewApproved}>
        {copied === "clean" ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied === "clean" ? "Copied clean text" : "Copy clean text"}
      </Button>
    </div>
  );
}
