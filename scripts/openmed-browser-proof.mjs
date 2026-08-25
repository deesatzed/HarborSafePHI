#!/usr/bin/env node
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";

const url = process.argv[2] ?? "http://127.0.0.1:8081/";
const timeout = Number(process.env.HARBOR_OPENMED_TIMEOUT_MS ?? 180_000);
const sensitiveValues = [
  "TESTPATIENT",
  "15938472",
  "jane.q.testpatient@example.com",
  "555-0142",
  "123-45-6789",
  "XGJ849201",
  "88201934",
  "4401922",
  "1000 Harbor Lane",
  "Jane Q Testpatient",
  "Robert Testpatient",
];
const sourceFileName = "Sampletown_MyChart_Care_Summary.pdf";
const modelPattern = /huggingface\.co|cdn-lfs|hf\.co/i;

function createAudit(page) {
  const audit = {
    modelRequests: 0,
    externalRequests: 0,
    sensitiveEgress: 0,
    sameOriginMutations: 0,
    requestUrls: [],
  };
  const appOrigin = new URL(url).origin;
  page.on("request", (request) => {
    const requestUrl = request.url();
    const method = request.method();
    if (modelPattern.test(requestUrl)) {
      audit.modelRequests += 1;
      audit.requestUrls.push(requestUrl.replace(/([?&]token=)[^&]+/i, "$1<redacted>"));
    }
    if (new URL(requestUrl).origin !== appOrigin) {
      audit.externalRequests += 1;
      const body = request.postDataBuffer();
      if (body && sensitiveValues.some((value) => body.toString("utf8").includes(value))) {
        audit.sensitiveEgress += 1;
      }
    }
    if (
      new URL(requestUrl).origin === appOrigin &&
      method === "POST" &&
      !requestUrl.includes("/api/auth/")
    ) {
      audit.sameOriginMutations += 1;
    }
  });
  return audit;
}

let browser;
let page;
let audit;
let errors = [];
try {
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-webgpu"],
  });
  page = await browser.newPage();
  errors = [];
  audit = createAudit(page);
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource|ERR_BLOCKED_BY_CLIENT/.test(message.text())) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(url, { waitUntil: "domcontentloaded", timeout });
  await page.locator('[data-testid="harbor-hydrated"]').waitFor({ state: "visible", timeout });
  await page.locator('[data-testid="try-sample"]').click();
  await page.locator('[data-testid="redacted"]').waitFor({ state: "visible", timeout });

  const note = page.getByText(/OpenMed \((webgpu|wasm)\) marked [0-9]+ spans/i).first();
  await note.waitFor({ state: "visible", timeout });
  const noteText = await note.innerText();
  const match = noteText.match(/OpenMed \((webgpu|wasm)\) marked (\d+) spans/i);
  if (!match) throw new Error(`Could not parse OpenMed completion note: ${noteText}`);
  const device = match[1].toLowerCase();
  const spanCount = Number(match[2]);
  if (spanCount < 1) throw new Error(`OpenMed completed but returned no candidate spans: ${noteText}`);
  if (audit.modelRequests < 1) throw new Error("No model download request was observed.");
  if (audit.sensitiveEgress > 0) throw new Error(`Synthetic source text left the app: ${JSON.stringify(audit)}`);
  if (errors.length > 0) throw new Error(`Browser errors: ${errors.join(" | ")}`);
  const reviewBodyText = await page.locator("body").innerText();
  const containsReview = reviewBodyText.includes("Approve redactions");

  await page.locator('[data-testid="approve-redactions"]').click();
  await page.getByTestId("review-status").filter({ hasText: "Approved for this exact redacted text" }).waitFor({
    state: "visible",
    timeout,
  });
  const downloadsDone = new Promise((resolve, reject) => {
    const downloads = [];
    const timer = setTimeout(() => {
      page.off("download", onDownload);
      reject(new Error(`Expected two artifact downloads, saw ${downloads.length}.`));
    }, timeout);
    function onDownload(download) {
      downloads.push(download);
      if (downloads.length === 2) {
        clearTimeout(timer);
        page.off("download", onDownload);
        resolve(downloads);
      }
    }
    page.on("download", onDownload);
  });
  await page.locator('[data-testid="download-artifact"]').click();
  const downloads = await downloadsDone;
  const downloadRecords = [];
  for (const download of downloads) {
    const path = await download.path();
    const contents = path ? await readFile(path, "utf8") : "";
    const fileName = download.suggestedFilename();
    if (!/^artifact-[a-z0-9-]+\.(md|json)$/.test(fileName)) {
      throw new Error(`Unsafe artifact filename: ${fileName}`);
    }
    if (fileName.includes(sourceFileName) || contents.includes(sourceFileName)) {
      throw new Error(`Source filename crossed the artifact boundary: ${fileName}`);
    }
    const leaked = sensitiveValues.find((value) => contents.includes(value));
    if (leaked) throw new Error(`Seeded PHI crossed the artifact boundary: ${leaked}`);
    downloadRecords.push({ fileName, characterCount: contents.length });
  }

  const bodyText = await page.locator("body").innerText();
  const result = {
    ok: true,
    url,
    device,
    spanCount,
    note: noteText,
    modelRequests: audit.modelRequests,
    externalRequests: audit.externalRequests,
    sensitiveEgress: audit.sensitiveEgress,
    sameOriginMutations: audit.sameOriginMutations,
    modelRequestUrls: audit.requestUrls,
    containsReview,
    syntheticSourceVisibleOnlyAsRedacted: !bodyText.includes("15938472"),
    downloads: downloadRecords,
  };
  if (!result.containsReview || !result.syntheticSourceVisibleOnlyAsRedacted) {
    throw new Error(`Review/source assertions failed: ${JSON.stringify(result)}`);
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const status = await page?.locator('[data-testid="status"]').innerText().catch(() => "") ?? "";
  const bodyText = await page?.locator("body").innerText().catch(() => "") ?? "";
  const openmedLines = bodyText
    .split("\\n")
    .filter((line) => /OpenMed|WASM|WebGPU|Downloading|Preparing|Cached|failed|error/i.test(line))
    .slice(-12);
  console.error(
    JSON.stringify(
      {
        ok: false,
        url,
        error: String(error?.message ?? error),
        status,
        openmedLines,
        audit,
        errors,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
}
