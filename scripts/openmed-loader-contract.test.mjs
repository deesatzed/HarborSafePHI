import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/lib/phi/openmed.ts", import.meta.url), "utf8");
const packageLock = JSON.parse(
  readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
);

test("OpenMed stays lazy-loaded and uses the pinned WebGPU/WASM attempt runner", () => {
  assert.match(
    source,
    /runOpenMedAttempts\(\s*preferredDevice === "wasm"\s*\?\s*false\s*:\s*webGpuAvailable\(\),/,
  );
  assert.match(source, /OPENMED_MODEL_REVISION\s*=\s*"[0-9a-f]{40}"/);
  assert.match(source, /revision:\s*OPENMED_MODEL_REVISION/);
  assert.match(source, /device:\s*"webgpu"/);
  assert.match(source, /device:\s*"wasm"/);
  assert.match(source, /productionOpenMedSession\.runInference/);
  assert.doesNotMatch(source, /import\s*\{\s*normalizeLabel/);
  assert.match(source, /model_file_name:\s*"model"/);
  assert.match(source, /dtype:\s*attempt\.variant/);
  assert.match(source, /await import\("openmed"\)/);
});

test("OpenMed runtime provenance matches the installed package", () => {
  const declaredVersion = source.match(
    /OPENMED_RUNTIME_VERSION\s*=\s*"([^"]+)"/,
  )?.[1];
  assert.equal(
    declaredVersion,
    packageLock.packages["node_modules/openmed"].version,
  );
});
