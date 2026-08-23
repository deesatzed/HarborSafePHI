#!/usr/bin/env node
import JSZip from "jszip";
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:8081/";
const timeout = 45_000;
const fileName = "synthetic-intake.docx";
const marker = "Synthetic browser document contains enough neutral words for local intake proof and review.";
const unreadableFileName = "synthetic-unreadable.docx";

async function syntheticDocx(text = marker) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.folder("_rels").file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.folder("word").file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

function networkAudit(page, sensitiveValues) {
  const appOrigin = new URL(url).origin;
  const state = { enabled: false, modelRequests: 0, summaryRequests: 0, sameOriginMutations: 0, sensitiveEgress: 0 };
  page.on("request", (request) => {
    if (!state.enabled) return;
    const requestUrl = request.url();
    const method = request.method();
    const body = request.postDataBuffer();
    if (/huggingface\.co|cdn-lfs|hf\.co/.test(requestUrl)) state.modelRequests += 1;
    if (method === "POST" && requestUrl.includes("/api/v1/chat/completions")) state.summaryRequests += 1;
    if (new URL(requestUrl).origin === appOrigin && !["GET", "HEAD", "OPTIONS"].includes(method)) {
      state.sameOriginMutations += 1;
    }
    if (new URL(requestUrl).origin !== appOrigin && body) {
      const bodyText = body.toString("utf8");
      const hasZipSignature = body.includes(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
      if (hasZipSignature || sensitiveValues.some((value) => bodyText.includes(value))) state.sensitiveEgress += 1;
    }
  });
  return state;
}

async function waitForAudit(predicate, label) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}.`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

let browser;
let releaseModelRequest = () => {};
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  const errors = [];
  const audit = networkAudit(page, [fileName, marker]);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const modelRequestGate = new Promise((resolve) => {
    releaseModelRequest = resolve;
  });
  await page.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    if (/huggingface\.co|cdn-lfs|hf\.co/.test(requestUrl)) {
      await modelRequestGate;
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout });
  await page.locator('[data-testid="harbor-hydrated"]').waitFor({ state: "visible", timeout });
  audit.enabled = true;
  await page.locator('[data-testid="document-input"]').setInputFiles({
    name: fileName,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: await syntheticDocx(),
  });
  await waitForAudit(() => audit.modelRequests > 0, "the local model request");
  await page.getByRole("button", { name: "complex", exact: true }).click();
  releaseModelRequest();
  await page.getByText(fileName, { exact: true }).waitFor({ state: "visible", timeout });
  await page.locator('[data-testid="redacted"]').getByText(marker, { exact: false }).waitFor({ state: "visible", timeout });
  if (audit.summaryRequests || audit.sameOriginMutations || audit.sensitiveEgress) {
    throw new Error(`valid DOCX crossed a report/egress boundary: ${JSON.stringify(audit)}`);
  }
  const unexpectedErrors = errors.filter(
    (message) => !/Failed to load resource|ERR_BLOCKED_BY_CLIENT/.test(message),
  );
  if (unexpectedErrors.length > 0) throw new Error(`browser errors: ${unexpectedErrors.join(" | ")}`);

  const unreadablePage = await browser.newPage();
  const unreadableErrors = [];
  const unreadableAudit = networkAudit(unreadablePage, [unreadableFileName, "short"]);
  unreadablePage.on("console", (message) => {
    if (message.type() === "error") unreadableErrors.push(message.text());
  });
  unreadablePage.on("pageerror", (error) => unreadableErrors.push(error.message));
  await unreadablePage.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    if (/huggingface\.co|cdn-lfs|hf\.co/.test(requestUrl)) return route.abort("blockedbyclient");
    return route.continue();
  });
  await unreadablePage.goto(url, { waitUntil: "domcontentloaded", timeout });
  await unreadablePage.locator('[data-testid="harbor-hydrated"]').waitFor({ state: "visible", timeout });
  await unreadablePage.getByRole("button", { name: "complex", exact: true }).click();
  unreadableAudit.enabled = true;
  await unreadablePage.locator('[data-testid="document-input"]').setInputFiles({
    name: unreadableFileName,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: await syntheticDocx("short"),
  });
  await unreadablePage.getByText(/too little readable text/i).waitFor({ state: "visible", timeout });
  if (
    unreadableAudit.modelRequests ||
    unreadableAudit.summaryRequests ||
    unreadableAudit.sameOriginMutations ||
    unreadableAudit.sensitiveEgress
  ) {
    throw new Error(`unreadable DOCX crossed a model/report/egress boundary: ${JSON.stringify(unreadableAudit)}`);
  }
  const unexpectedUnreadableErrors = unreadableErrors.filter(
    (message) => !/Failed to load resource|ERR_BLOCKED_BY_CLIENT/.test(message),
  );
  if (unexpectedUnreadableErrors.length > 0) {
    throw new Error(`unreadable browser errors: ${unexpectedUnreadableErrors.join(" | ")}`);
  }
  console.log(JSON.stringify({ ok: true, fileName, markerVisible: true, audit, unreadableAudit }, null, 2));
} catch (error) {
  releaseModelRequest();
  console.error(JSON.stringify({ ok: false, error: String(error?.message ?? error) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser?.close();
}
