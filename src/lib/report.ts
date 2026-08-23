import { createServerFn } from "@tanstack/react-start";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { parseDotEnv, reportConfigFromEnv, serverOpenRouterFromEnv } from "@/lib/openrouter-env";
import {
  extractOpenRouterText,
  parseOpenRouterError,
  REPORT_USER_PREFIX,
  SYSTEM_PROMPT,
  type OpenRouterChatJson,
} from "@/lib/openrouter";
import { prepareModelInput } from "@/lib/phi/packet";
import {
  validateApprovedReportInput,
  type ApprovedReportInput,
} from "@/lib/phi/review";

function envForReport(): Record<string, string | undefined> {
  let fromFiles: Record<string, string> = {};
  const cwd = process.cwd();
  for (const name of [".env", ".env.local"]) {
    try {
      fromFiles = { ...fromFiles, ...parseDotEnv(readFileSync(join(cwd, name), "utf8")) };
    } catch {
      /* missing is fine */
    }
  }
  return { ...fromFiles, ...process.env };
}

export const getReportConfig = createServerFn({ method: "GET" }).handler(async () => {
  return reportConfigFromEnv(envForReport());
});

export const generateServerReport = createServerFn({ method: "POST" })
  .validator((input: ApprovedReportInput) => {
    if (
      !input ||
      typeof input.redactedText !== "string" ||
      typeof input.redactedSha256 !== "string"
    ) {
      throw new Error("Missing de-identified text.");
    }
    return {
      redactedText: input.redactedText,
      redactedSha256: input.redactedSha256,
      dateMode: input.dateMode,
      model: typeof input.model === "string" ? input.model : "",
    };
  })
  .handler(async ({ data }) => {
    const approvedInput = await validateApprovedReportInput(data);
    const parsed = serverOpenRouterFromEnv(envForReport());
    if (!parsed.configured) {
      return {
        ok: false as const,
        error:
          "OPENROUTER_API_KEY and OPENROUTER_MODEL (or OPENROUTER_MODEL_1) are not both set in .env / Fly secrets.",
      };
    }
    const requested = approvedInput.model?.trim() ?? "";
    const model =
      requested && parsed.models.includes(requested) ? requested : parsed.model;
    const redactedText = approvedInput.redactedText.trim();
    if (redactedText.length < 20) {
      return { ok: false as const, error: "The de-identified text is too short to report." };
    }
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${parsed.key}`,
        "Content-Type": "application/json",
        "X-Title": "Harbor",
      },
      body: JSON.stringify({
        model,
        max_tokens: 16384,
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: REPORT_USER_PREFIX + prepareModelInput(redactedText),
          },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false as const, error: parseOpenRouterError(res.status, body) };
    }
    const json = (await res.json()) as OpenRouterChatJson;
    const extracted = extractOpenRouterText(json);
    if (!extracted.text) {
      return { ok: false as const, error: extracted.detail };
    }
    return { ok: true as const, text: extracted.text, model };
  });
