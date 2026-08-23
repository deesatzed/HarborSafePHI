import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/lib/phi/openmed.ts", import.meta.url), "utf8");

test("OpenMed stays lazy-loaded and uses the pinned WebGPU/WASM attempt runner", () => {
  assert.match(
    source,
    /runOpenMedAttempts\(\s*webGpuAvailable\(\),/,
  );
  assert.match(source, /OPENMED_MODEL_REVISION\s*=\s*"[0-9a-f]{40}"/);
  assert.match(source, /revision:\s*OPENMED_MODEL_REVISION/);
  assert.match(source, /device:\s*"webgpu"/);
  assert.match(source, /device:\s*"wasm"/);
  assert.doesNotMatch(source, /import\s*\{\s*normalizeLabel/);
  assert.doesNotMatch(source, /model_file_name\s*:/);
  assert.doesNotMatch(source, /dtype\s*:/);
  assert.match(source, /await import\("openmed"\)/);
});
