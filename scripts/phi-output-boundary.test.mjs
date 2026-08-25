import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("H-005 removes raw extractor downloads and source-derived artifact names", () => {
  const app = read("src/components/harbor-app.tsx");
  const panels = read("src/components/harbor-panels.tsx");
  const exportSource = read("src/lib/phi/export.ts");
  const extractorPanel = panels.slice(0, panels.indexOf("export function ReportPanel"));

  assert.doesNotMatch(app, /downloadExtractorCompare|formatExtractorCompare/);
  assert.doesNotMatch(extractorPanel, /Download four original extracts|onDownload/);
  assert.match(app, /payload\.artifactId/);
  assert.doesNotMatch(app, /fileName\.replace/);
  assert.doesNotMatch(exportSource, /fileName: args\.extracted\.fileName/);
  assert.doesNotMatch(exportSource, /Source file:/);
});

test("H-005 does not persist browser API keys", () => {
  const app = read("src/components/harbor-app.tsx");
  const openrouter = read("src/lib/openrouter.ts");

  assert.doesNotMatch(app, /writeOpenRouterKey|readOpenRouterKey/);
  assert.doesNotMatch(openrouter, /openrouter\.key|localStorage.*key|writeOpenRouterKey/);
});
