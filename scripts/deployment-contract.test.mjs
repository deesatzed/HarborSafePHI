import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the production package starts the Nitro node server", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts.start, "node .output/server/index.mjs");
});

test("the container builds a standalone Nitro node-server artifact", () => {
  assert.equal(existsSync(new URL("../Dockerfile", import.meta.url)), true);
  const dockerfile = read("Dockerfile");
  assert.match(dockerfile, /NITRO_PRESET=node-server/);
  assert.match(dockerfile, /npm run build/);
  assert.match(dockerfile, /CMD \["npm", "run", "start"\]/);
});

test("Fly routes public traffic to Harbor on port 8080", () => {
  assert.equal(existsSync(new URL("../fly.toml", import.meta.url)), true);
  const flyConfig = read("fly.toml");
  assert.match(flyConfig, /app = "harbor-safe-phi"/);
  assert.match(flyConfig, /internal_port = 8080/);
});

test("Vite keeps Vercel as default while allowing the Fly Nitro preset", () => {
  const viteConfig = read("vite.config.ts");
  assert.match(viteConfig, /process\.env\.NITRO_PRESET \?\? "vercel"/);
});
