#!/usr/bin/env node
import JSZip from "jszip";
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:8081/";
const timeout = 45_000;
const fileName = "synthetic-intake.docx";
const marker = "Synthetic browser document contains enough neutral words for local intake proof and review.";

async function syntheticDocx() {
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
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${marker}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  const errors = [];
  let openRouterRequests = 0;
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/v1/chat/completions")) {
      openRouterRequests += 1;
    }
  });
  await page.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    if (/huggingface\.co|cdn-lfs|hf\.co/.test(requestUrl)) return route.abort("blockedbyclient");
    return route.continue();
  });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout });
  await page.locator('[data-testid="harbor-hydrated"]').waitFor({ state: "visible", timeout });
  await page.getByRole("button", { name: "complex", exact: true }).click();
  await page.locator('[data-testid="document-input"]').setInputFiles({
    name: fileName,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: await syntheticDocx(),
  });
  await page.getByText(fileName, { exact: true }).waitFor({ state: "visible", timeout });
  await page.locator('[data-testid="redacted"]').getByText(marker, { exact: false }).waitFor({ state: "visible", timeout });
  if (openRouterRequests !== 0) throw new Error(`unexpected OpenRouter requests: ${openRouterRequests}`);
  const unexpectedErrors = errors.filter(
    (message) => !/Failed to load resource|ERR_BLOCKED_BY_CLIENT/.test(message),
  );
  if (unexpectedErrors.length > 0) throw new Error(`browser errors: ${unexpectedErrors.join(" | ")}`);
  console.log(JSON.stringify({ ok: true, fileName, markerVisible: true, openRouterRequests }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: String(error?.message ?? error) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser?.close();
}
