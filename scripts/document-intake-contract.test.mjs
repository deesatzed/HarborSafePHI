import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Harbor accepts PDF and DOCX through a local document extractor", () => {
  const app = read("src/components/harbor-app.tsx");
  const extractor = read("src/lib/phi/extract-document.ts");
  const types = read("src/lib/phi/types.ts");
  const pkg = JSON.parse(read("package.json"));

  assert.equal(existsSync(new URL("../src/lib/phi/extract-document.ts", import.meta.url)), true);
  assert.match(app, /accept="[^"]*\.docx/);
  assert.match(app, /extractDocumentText/);
  assert.match(app, /Drop a MyChart PDF or DOCX here/);
  assert.match(app, /PDF or DOCX stays in this tab/);
  assert.match(app, /type ExtractedDocument/);
  assert.match(app, /setExtracted\(null\)/);
  assert.match(app, /setSpans\(\[\]\)/);
  assert.match(app, /setReport\(null\)/);
  assert.match(extractor, /import\("mammoth"\)/);
  assert.doesNotMatch(extractor, /mammoth\/mammoth\.browser/);
  assert.match(extractor, /MAX_DOCUMENT_BYTES/);
  assert.match(extractor, /MIN_DOCUMENT_TEXT_CHARACTERS/);
  assert.match(types, /export type ExtractedDocument/);
  assert.match(types, /kind: "pdf" \| "docx"/);
  assert.match(types, /pageCount: number \| null/);
  assert.equal(typeof pkg.dependencies.mammoth, "string");
});
