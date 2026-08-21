const KEY_STORAGE = "harbor.openrouter.key";
const MODEL_STORAGE = "harbor.openrouter.model";

export const OPENROUTER_MODELS = [
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini" },
  { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "x-ai/grok-4", label: "Grok 4" },
  { id: "qwen/qwen-2.5-72b-instruct", label: "Qwen 2.5 72B" },
] as const;

export function readOpenRouterKey(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(KEY_STORAGE) ?? "";
}

export function writeOpenRouterKey(key: string) {
  localStorage.setItem(KEY_STORAGE, key.trim());
}

export function readOpenRouterModel(): string {
  if (typeof localStorage === "undefined") return OPENROUTER_MODELS[0].id;
  return localStorage.getItem(MODEL_STORAGE) ?? OPENROUTER_MODELS[0].id;
}

export function writeOpenRouterModel(model: string) {
  localStorage.setItem(MODEL_STORAGE, model);
}

const SYSTEM_PROMPT = `You are a clinical summarizer. The input is already de-identified.
Rules:
- Do not invent names, dates, MRNs, phones, addresses, or other identifiers.
- Preserve lab names, values, units, and reference ranges exactly.
- Preserve medication names, doses, and frequencies.
- Keep relative dates (Day 0, Day +N) or years exactly as written.
- Organize as: Problems, Medications, Allergies, Vitals, Labs, Encounters, Plan.
- If something still looks like a leftover identifier, mention it only as a count under "Residual risk" without repeating the identifier.
- Do not add clinical advice. This is a structured extract, not a diagnosis.`;

export async function summarizeWithOpenRouter(args: {
  apiKey: string;
  model: string;
  redactedText: string;
}): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": typeof window === "undefined" ? "https://harbor.local" : window.location.origin,
      "X-Title": "Harbor",
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: 1800,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: args.redactedText.slice(0, 24_000) },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(parseOpenRouterError(res.status, body));
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(json.error?.message || "OpenRouter returned an empty summary.");
  return text;
}

function parseOpenRouterError(status: number, body: string): string {
  if (status === 401) return "OpenRouter rejected the API key.";
  if (status === 402) return "OpenRouter says this key is out of credits.";
  if (status === 429) return "OpenRouter rate-limited the request. Try again in a moment.";
  try {
    const json = JSON.parse(body) as { error?: { message?: string } };
    if (json.error?.message) return json.error.message;
  } catch {
    /* ignore */
  }
  return `OpenRouter error ${status}`;
}
