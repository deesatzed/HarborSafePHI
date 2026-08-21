export type ServerOpenRouter = {
  key: string;
  model: string;
  models: string[];
  configured: boolean;
};

export function parseDotEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const stripped = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = stripped.indexOf("=");
    if (eq <= 0) continue;
    const key = stripped.slice(0, eq).trim();
    if (!key) continue;
    let value = stripped.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function modelsFromEnv(env: Record<string, string | undefined>): string[] {
  const ranked: { n: number; id: string }[] = [];
  for (const [key, value] of Object.entries(env)) {
    const match = key.match(/^OPEN_?ROUTER_MODEL(?:_(\d+))?$/);
    if (!match) continue;
    const id = (value ?? "").trim();
    if (!id) continue;
    ranked.push({ n: match[1] ? Number(match[1]) : 0, id });
  }
  ranked.sort((a, b) => a.n - b.n);
  return [...new Set(ranked.map((item) => item.id))];
}

export function serverOpenRouterFromEnv(
  env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env,
): ServerOpenRouter {
  const key = (env.OPENROUTER_API_KEY || env.OPEN_ROUTER_API_KEY || "").trim();
  const models = modelsFromEnv(env);
  const model = (env.OPENROUTER_MODEL || env.OPEN_ROUTER_MODEL || models[0] || "").trim();
  return {
    key,
    model,
    models: models.length > 0 ? models : model ? [model] : [],
    configured: Boolean(key && model),
  };
}

export type ReportConfig = {
  configured: boolean;
  hasKey: boolean;
  hasModel: boolean;
  model: string | null;
  models: string[];
};

export function reportConfigFromEnv(
  env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env,
): ReportConfig {
  const parsed = serverOpenRouterFromEnv(env);
  return {
    configured: parsed.configured,
    hasKey: Boolean(parsed.key),
    hasModel: Boolean(parsed.model),
    model: parsed.configured ? parsed.model : null,
    models: parsed.configured ? parsed.models : [],
  };
}
