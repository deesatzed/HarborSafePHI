import type { ExtractedDocument, PhiSpan } from "./types.ts";

export class IntakeGeneration {
  private value = 0;

  begin(): number {
    this.value += 1;
    return this.value;
  }

  invalidate(): void {
    this.value += 1;
  }

  isCurrent(token: number): boolean {
    return token === this.value;
  }

  current(): number {
    return this.value;
  }
}

export type IntakeReview = {
  document: ExtractedDocument;
  openMedSpans: PhiSpan[];
  spans: PhiSpan[];
  detectors: string[];
};

export type IntakeCallbacks = {
  onClear: () => void;
  onWorking: () => void;
  onStatus: (message: string) => void;
  onOpenMedNote: (message: string) => void;
  onOpenMedError: (message: string) => void;
  onReview: (result: IntakeReview) => void;
  onReportBusy: (busy: boolean) => void;
  onReport: (report: string) => void;
  onReportError: (message: string) => void;
  onReject: (message: string) => void;
};

export type IntakeOptions = {
  generation: IntakeGeneration;
  loadDocument: () => Promise<ExtractedDocument>;
  isOpenMedCached: () => Promise<boolean>;
  scanOpenMed: (args: {
    text: string;
    onProgress: (message: string) => void;
  }) => Promise<{ spans: PhiSpan[]; device: string }>;
  mergeSpans: (document: ExtractedDocument, openMedSpans: PhiSpan[]) => PhiSpan[];
  createReport?: (document: ExtractedDocument, spans: PhiSpan[], token: number) => Promise<string | null>;
  callbacks: IntakeCallbacks;
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function orchestrateDocumentIntake(options: IntakeOptions): Promise<void> {
  const { callbacks, generation } = options;
  const token = generation.begin();
  callbacks.onClear();
  callbacks.onWorking();

  try {
    const document = await options.loadDocument();
    if (!generation.isCurrent(token)) return;

    const cached = await options.isOpenMedCached();
    if (!generation.isCurrent(token)) return;
    callbacks.onStatus(cached ? "Loading cached OpenMed…" : "Downloading OpenMed into this browser…");

    let openMedSpans: PhiSpan[] = [];
    let detectors = ["regex", "labels"];
    try {
      const result = await options.scanOpenMed({
        text: document.text,
        onProgress: (message) => {
          if (!generation.isCurrent(token)) return;
          callbacks.onStatus(message);
          callbacks.onOpenMedNote(message);
        },
      });
      if (!generation.isCurrent(token)) return;
      openMedSpans = result.spans;
      detectors = ["openmed", "regex", "labels"];
      callbacks.onOpenMedNote(
        `OpenMed (${result.device}) marked ${result.spans.length} spans, then local rules filled gaps.`,
      );
    } catch (error) {
      if (!generation.isCurrent(token)) return;
      const message = errorMessage(error, "OpenMed failed to load.");
      callbacks.onOpenMedNote(message);
      callbacks.onOpenMedError(`OpenMed did not finish: ${message} Local rules still ran.`);
    }

    const spans = options.mergeSpans(document, openMedSpans);
    if (!generation.isCurrent(token)) return;
    callbacks.onReview({ document, openMedSpans, spans, detectors });

    if (!options.createReport) return;
    callbacks.onReportBusy(true);
    try {
      const report = await options.createReport(document, spans, token);
      if (!generation.isCurrent(token)) return;
      if (report) callbacks.onReport(report);
    } catch (error) {
      if (!generation.isCurrent(token)) return;
      callbacks.onReportError(errorMessage(error, "Report failed."));
    } finally {
      if (generation.isCurrent(token)) callbacks.onReportBusy(false);
    }
  } catch (error) {
    if (!generation.isCurrent(token)) return;
    callbacks.onReportBusy(false);
    callbacks.onReject(errorMessage(error, "Could not read that document."));
  }
}
