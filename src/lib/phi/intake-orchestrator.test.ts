import assert from "node:assert/strict";
import test from "node:test";
import {
  IntakeGeneration,
  orchestrateDocumentIntake,
  type IntakeCallbacks,
} from "./intake-orchestrator.ts";
import type { ExtractedDocument, PhiSpan } from "./types.ts";

const readableDocument: ExtractedDocument = {
  kind: "docx",
  fileName: "synthetic.docx",
  pageCount: null,
  text: "Synthetic document text that is long enough for local intake.",
  pages: [{ pageNumber: 1, text: "Synthetic document text that is long enough for local intake." }],
  hasTextLayer: true,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function stateHarness() {
  const state: {
    document: ExtractedDocument | null;
    report: string | null;
    reportBusy: boolean;
    error: string | null;
    reviews: number;
  } = { document: null, report: null, reportBusy: false, error: null, reviews: 0 };
  const callbacks: IntakeCallbacks = {
    onClear: () => {
      state.document = null;
      state.report = null;
      state.reportBusy = false;
      state.error = null;
    },
    onWorking: () => {},
    onStatus: () => {},
    onOpenMedNote: () => {},
    onOpenMedError: (message) => {
      state.error = message;
    },
    onReview: ({ document }) => {
      state.document = document;
      state.reviews += 1;
    },
    onReportBusy: (busy) => {
      state.reportBusy = busy;
    },
    onReport: (report) => {
      state.report = report;
    },
    onReportError: (message) => {
      state.error = message;
    },
    onReject: (message) => {
      state.error = message;
    },
  };
  return { state, callbacks };
}

test("unreadable intake rejects before OpenMed or report calls", async () => {
  const generation = new IntakeGeneration();
  const { state, callbacks } = stateHarness();
  let openMedCalls = 0;
  let reportCalls = 0;

  await orchestrateDocumentIntake({
    generation,
    loadDocument: async () => {
      throw new Error("This document has too little readable text.");
    },
    isOpenMedCached: async () => false,
    scanOpenMed: async () => {
      openMedCalls += 1;
      return { spans: [], device: "wasm" };
    },
    mergeSpans: () => [],
    createReport: async () => {
      reportCalls += 1;
      return "must not run";
    },
    callbacks,
  });

  assert.equal(openMedCalls, 0);
  assert.equal(reportCalls, 0);
  assert.equal(state.document, null);
  assert.equal(state.report, null);
  assert.equal(state.reportBusy, false);
  assert.match(state.error ?? "", /too little readable text/i);
});

test("a newer rejected intake prevents an older OpenMed result from restoring review state", async () => {
  const generation = new IntakeGeneration();
  const { state, callbacks } = stateHarness();
  const scanResult = deferred<{ spans: PhiSpan[]; device: string }>();
  const scanStarted = deferred<void>();
  let reportCalls = 0;

  const older = orchestrateDocumentIntake({
    generation,
    loadDocument: async () => readableDocument,
    isOpenMedCached: async () => false,
    scanOpenMed: async () => {
      scanStarted.resolve();
      return scanResult.promise;
    },
    mergeSpans: () => [],
    createReport: async () => {
      reportCalls += 1;
      return "stale report";
    },
    callbacks,
  });
  await scanStarted.promise;

  const newer = orchestrateDocumentIntake({
    generation,
    loadDocument: async () => {
      throw new Error("new unreadable document");
    },
    isOpenMedCached: async () => false,
    scanOpenMed: async () => ({ spans: [], device: "wasm" }),
    mergeSpans: () => [],
    createReport: async () => "new report",
    callbacks,
  });
  await newer;
  scanResult.resolve({ spans: [], device: "wasm" });
  await older;

  assert.equal(state.document, null);
  assert.equal(state.report, null);
  assert.equal(state.reportBusy, false);
  assert.equal(reportCalls, 0);
  assert.match(state.error ?? "", /new unreadable document/);
});

test("a newer rejected intake prevents an older delayed report from restoring state", async () => {
  const generation = new IntakeGeneration();
  const { state, callbacks } = stateHarness();
  const reportResult = deferred<string | null>();
  const reportStarted = deferred<void>();

  const older = orchestrateDocumentIntake({
    generation,
    loadDocument: async () => readableDocument,
    isOpenMedCached: async () => true,
    scanOpenMed: async () => ({ spans: [], device: "wasm" }),
    mergeSpans: () => [],
    createReport: async () => {
      reportStarted.resolve();
      return reportResult.promise;
    },
    callbacks,
  });
  await reportStarted.promise;
  assert.equal(state.reportBusy, true);

  await orchestrateDocumentIntake({
    generation,
    loadDocument: async () => {
      throw new Error("replacement rejected");
    },
    isOpenMedCached: async () => false,
    scanOpenMed: async () => ({ spans: [], device: "wasm" }),
    mergeSpans: () => [],
    callbacks,
  });
  reportResult.resolve("stale report");
  await older;

  assert.equal(state.document, null);
  assert.equal(state.report, null);
  assert.equal(state.reportBusy, false);
  assert.match(state.error ?? "", /replacement rejected/);
});
