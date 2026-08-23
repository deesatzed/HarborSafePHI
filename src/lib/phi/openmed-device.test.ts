import assert from "node:assert/strict";
import test from "node:test";
import { runOpenMedAttempts } from "./openmed.ts";

test("WebGPU success does not try WASM", async () => {
  const seen: unknown[] = [];
  const result = await runOpenMedAttempts(true, async (attempt) => {
    seen.push(attempt);
    return { engine: {}, attempt };
  });

  assert.deepEqual(seen, [{ device: "webgpu", variant: "fp16" }]);
  assert.equal(result.attempt.device, "webgpu");
});

test("WebGPU failure falls back to WASM int8", async () => {
  const seen: unknown[] = [];
  const result = await runOpenMedAttempts(true, async (attempt) => {
    seen.push(attempt);
    if (attempt.device === "webgpu") throw new Error("unsupported");
    return { engine: {}, attempt };
  });

  assert.deepEqual(seen, [
    { device: "webgpu", variant: "fp16" },
    { device: "wasm", variant: "int8" },
  ]);
  assert.equal(result.attempt.variant, "int8");
});

test("no WebGPU tries WASM only", async () => {
  const seen: unknown[] = [];
  const result = await runOpenMedAttempts(false, async (attempt) => {
    seen.push(attempt);
    return { engine: {}, attempt };
  });

  assert.deepEqual(seen, [{ device: "wasm", variant: "int8" }]);
  assert.equal(result.attempt.device, "wasm");
});

test("both failures reject with the final failure", async () => {
  const finalFailure = new Error("WASM cannot load");

  await assert.rejects(
    runOpenMedAttempts(true, async (attempt) => {
      if (attempt.device === "wasm") throw finalFailure;
      throw new Error("WebGPU cannot load");
    }),
    (error) => error === finalFailure,
  );
});

test("progress announces fallback only while another attempt remains", async () => {
  const messages: string[] = [];

  await runOpenMedAttempts(
    true,
    async (attempt) => {
      if (attempt.device === "webgpu") throw new Error("unsupported");
      return { engine: {}, attempt };
    },
    (message) => messages.push(message),
  );

  assert.deepEqual(messages, ["WebGPU unavailable. Trying OpenMed on WASM…"]);
});

test("final failure announces deterministic-only degraded mode", async () => {
  const messages: string[] = [];

  await assert.rejects(
    runOpenMedAttempts(
      false,
      async () => {
        throw new Error("cannot load");
      },
      (message) => messages.push(message),
    ),
    /cannot load/,
  );

  assert.deepEqual(messages, [
    "OpenMed unavailable. Harbor is continuing in deterministic-only degraded mode.",
  ]);
});
