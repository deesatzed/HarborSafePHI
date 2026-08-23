import assert from "node:assert/strict";
import test from "node:test";
import {
  createOpenMedSession,
  OPENMED_MODEL,
  OPENMED_MODEL_REVISION,
  runOpenMedAttempts,
} from "./openmed.ts";

function fakeEngine(pipeline: () => Promise<never[]> = async () => []) {
  return {
    pipeline,
    device: "wasm" as const,
    variant: "int8" as const,
    model: OPENMED_MODEL,
    revision: OPENMED_MODEL_REVISION,
    normalizeLabel: () => "OTHER" as const,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

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

  assert.deepEqual(messages, [
    "WebGPU OpenMed attempt failed. Trying OpenMed on WASM…",
  ]);
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

test("initialization failure resets loading so the next call retries and succeeds", async () => {
  let initializationCalls = 0;
  const messages: string[] = [];
  const session = createOpenMedSession(async () => {
    initializationCalls += 1;
    if (initializationCalls === 1) throw new Error("transformers import failed");
    return fakeEngine();
  });

  await assert.rejects(
    session.load((message) => messages.push(message)),
    /transformers import failed/,
  );
  const loaded = await session.load((message) => messages.push(message));

  assert.equal(initializationCalls, 2);
  assert.equal(loaded.device, "wasm");
  assert.deepEqual(messages, [
    "OpenMed unavailable. Harbor is continuing in deterministic-only degraded mode.",
  ]);
});

test("pipeline failure downgrades runtime and discards the unusable engine", async () => {
  let initializationCalls = 0;
  const session = createOpenMedSession(async () => {
    initializationCalls += 1;
    return fakeEngine(async () => {
      throw new Error("inference failed");
    });
  });

  await assert.rejects(
    session.runInference(async (loaded) => loaded.pipeline("test")),
    /inference failed/,
  );

  assert.deepEqual(session.getRuntimeState(), {
    status: "degraded",
    device: null,
    variant: null,
    model: OPENMED_MODEL,
    revision: OPENMED_MODEL_REVISION,
  });
  await session.load();
  assert.equal(initializationCalls, 2);
});

test("runtime becomes ready only after inference succeeds", async () => {
  const session = createOpenMedSession(async () => fakeEngine());

  await session.load();
  assert.equal(session.getRuntimeState().status, "degraded");

  await session.runInference(async (loaded) => loaded.pipeline("test"));

  assert.deepEqual(session.getRuntimeState(), {
    status: "ready",
    device: "wasm",
    variant: "int8",
    model: OPENMED_MODEL,
    revision: OPENMED_MODEL_REVISION,
  });
});

test("concurrent callers receive shared initialization progress", async () => {
  let report: ((message: string) => void) | undefined;
  let finishInitialization: (() => void) | undefined;
  const initializationGate = new Promise<void>((resolve) => {
    finishInitialization = resolve;
  });
  const session = createOpenMedSession(async (onProgress) => {
    report = onProgress;
    await initializationGate;
    return fakeEngine();
  });
  const firstMessages: string[] = [];
  const secondMessages: string[] = [];

  const firstLoad = session.load((message) => firstMessages.push(message));
  await Promise.resolve();
  const secondLoad = session.load((message) => secondMessages.push(message));
  report?.("Shared model progress");
  finishInitialization?.();
  await Promise.all([firstLoad, secondLoad]);

  assert.deepEqual(firstMessages, ["Shared model progress"]);
  assert.deepEqual(secondMessages, ["Shared model progress"]);
});

test("stale failure after current success leaves runtime ready", async () => {
  const stale = deferred<void>();
  const current = deferred<void>();
  const staleMessages: string[] = [];
  const session = createOpenMedSession(async () => fakeEngine());
  await session.load();

  const staleRun = session.runInference(
    async () => stale.promise,
    (message) => staleMessages.push(message),
  );
  const staleRejected = assert.rejects(staleRun, /stale failed/);
  const currentRun = session.runInference(async () => current.promise);

  current.resolve();
  await currentRun;
  stale.reject(new Error("stale failed"));
  await staleRejected;

  assert.equal(session.getRuntimeState().status, "ready");
  assert.deepEqual(staleMessages, [
    "OpenMed engine loaded (wasm); starting local scan.",
    "OpenMed unavailable. Harbor is continuing in deterministic-only degraded mode.",
  ]);
});

test("stale success after current failure leaves runtime degraded", async () => {
  const stale = deferred<void>();
  const current = deferred<void>();
  const session = createOpenMedSession(async () => fakeEngine());
  await session.load();

  const staleRun = session.runInference(async () => stale.promise);
  const currentRun = session.runInference(async () => current.promise);
  const currentRejected = assert.rejects(currentRun, /current failed/);

  current.reject(new Error("current failed"));
  await currentRejected;
  stale.resolve();
  await staleRun;

  assert.equal(session.getRuntimeState().status, "degraded");
});

test("stale failure cannot clobber a newer in-flight initialization", async () => {
  const stale = deferred<void>();
  const current = deferred<void>();
  const secondInitialization = deferred<void>();
  let initializationCalls = 0;
  const session = createOpenMedSession(async () => {
    initializationCalls += 1;
    if (initializationCalls === 2) await secondInitialization.promise;
    return fakeEngine();
  });
  await session.load();

  const staleRun = session.runInference(async () => stale.promise);
  const staleRejected = assert.rejects(staleRun, /stale failed/);
  const currentRun = session.runInference(async () => current.promise);
  const currentRejected = assert.rejects(currentRun, /current failed/);

  current.reject(new Error("current failed"));
  await currentRejected;
  const newLoad = session.load();
  await Promise.resolve();
  assert.equal(initializationCalls, 2);

  stale.reject(new Error("stale failed"));
  await staleRejected;
  const overlappingLoad = session.load();
  await Promise.resolve();
  secondInitialization.resolve();
  await Promise.all([newLoad, overlappingLoad]);

  assert.equal(initializationCalls, 2);
});
