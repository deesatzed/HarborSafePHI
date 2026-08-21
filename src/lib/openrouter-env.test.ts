import assert from "node:assert/strict";
import test from "node:test";
import { parseDotEnv, reportConfigFromEnv, serverOpenRouterFromEnv } from "./openrouter-env.ts";

test("configured only when both key and model are present", () => {
  assert.equal(serverOpenRouterFromEnv({}).configured, false);
  assert.equal(serverOpenRouterFromEnv({ OPENROUTER_API_KEY: "sk-or-1" }).configured, false);
  assert.equal(serverOpenRouterFromEnv({ OPENROUTER_MODEL: "x-ai/grok-4" }).configured, false);
  const both = serverOpenRouterFromEnv({
    OPENROUTER_API_KEY: "sk-or-1",
    OPENROUTER_MODEL: "x-ai/grok-4",
  });
  assert.equal(both.configured, true);
  assert.equal(both.model, "x-ai/grok-4");
});

test("OPENROUTER_MODEL_1 is enough for Simple when OPENROUTER_MODEL is absent", () => {
  const parsed = serverOpenRouterFromEnv({
    OPENROUTER_API_KEY: "sk-or-1",
    OPENROUTER_MODEL_1: "google/gemini-3.7-flash",
    OPENROUTER_MODEL_2: "deepseek/deepseek-v4-pro-0813",
  });
  assert.equal(parsed.configured, true);
  assert.equal(parsed.model, "google/gemini-3.7-flash");
  assert.deepEqual(parsed.models, ["google/gemini-3.7-flash", "deepseek/deepseek-v4-pro-0813"]);
});

test("accepts OPEN_ROUTER_* aliases used on some Fly apps", () => {
  const parsed = serverOpenRouterFromEnv({
    OPEN_ROUTER_API_KEY: " sk-or-2 ",
    OPEN_ROUTER_MODEL: " anthropic/claude-sonnet-4 ",
  });
  assert.equal(parsed.configured, true);
  assert.equal(parsed.key, "sk-or-2");
  assert.equal(parsed.model, "anthropic/claude-sonnet-4");
});

test("report config never includes the key", () => {
  const config = reportConfigFromEnv({
    OPENROUTER_API_KEY: "sk-or-secret",
    OPENROUTER_MODEL_1: "google/gemini-3.7-flash",
  });
  assert.equal(config.configured, true);
  assert.equal(config.model, "google/gemini-3.7-flash");
  assert.equal(JSON.stringify(config).includes("sk-or-secret"), false);
});

test("partial env does not expose a model as ready", () => {
  const config = reportConfigFromEnv({
    OPENROUTER_MODEL: "x-ai/grok-4",
  });
  assert.equal(config.configured, false);
  assert.equal(config.model, null);
  assert.equal(config.hasModel, true);
  assert.equal(config.hasKey, false);
});

test("parseDotEnv strips quotes and skips comments", () => {
  const parsed = parseDotEnv(`
# comment
OPENROUTER_API_KEY="sk-or-quoted"
export OPENROUTER_MODEL_1=google/gemini-3.7-flash
`);
  assert.equal(parsed.OPENROUTER_API_KEY, "sk-or-quoted");
  assert.equal(parsed.OPENROUTER_MODEL_1, "google/gemini-3.7-flash");
});
