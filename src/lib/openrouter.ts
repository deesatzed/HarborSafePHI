const KEY_STORAGE = "harbor.openrouter.key";
const MODEL_STORAGE = "harbor.openrouter.model";

export type OpenRouterModel = {
  id: string;
  name: string;
};

export function readOpenRouterKey(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(KEY_STORAGE) ?? "";
}

export function writeOpenRouterKey(key: string) {
  localStorage.setItem(KEY_STORAGE, key.trim());
}

export function readOpenRouterModel(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(MODEL_STORAGE) ?? "";
}

export function writeOpenRouterModel(model: string) {
  localStorage.setItem(MODEL_STORAGE, model.trim());
}

export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  const res = await fetch("https://openrouter.ai/api/v1/models");
  if (!res.ok) {
    throw new Error(`OpenRouter model catalog returned ${res.status}. Paste a model id.`);
  }
  const json = (await res.json()) as {
    data?: {
      id: string;
      name?: string;
      architecture?: { modality?: string; input_modalities?: string[] };
    }[];
  };
  const models = (json.data ?? [])
    .filter((model) => {
      const inputs = model.architecture?.input_modalities ?? [];
      if (inputs.length > 0) return inputs.includes("text");
      return (model.architecture?.modality ?? "text").includes("text");
    })
    .map((model) => ({ id: model.id, name: model.name ?? model.id }))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (models.length === 0) {
    throw new Error("OpenRouter returned no text models. Paste a model id.");
  }
  return models;
}

export const SYSTEM_PROMPT = `The supplied report is a de-identified Epic/MyChart export. Keep tokens such as [NAME], [ADDRESS], [DOB], [PHONE], [ORG], and [ID] as tokens. Do not reconstruct identity. "Active Problems" may be empty even when notes, results, and medication lists document treated conditions; prefer those over an empty problem list. If the source uses relative dates (Day 0, Day +N) or year-only dates, keep those tokens exactly.

Convert the supplied report into a 1–2 page, clinician-ready document titled **Portable Clinical Health Summary** (target 700–1,100 words). This is chart synthesis only: use the report, not external knowledge. Do not add citations, guidelines, diagnoses, recommendations, or generic warnings.

Accuracy: never invent, guess, reconstruct redacted data, or identify the patient, clinicians, institution, or location. Distinguish confirmed diagnoses, suspected conditions, symptoms, abnormal findings, and resolved/remote history. Do not turn a rule-out into a diagnosis. Separate active problems from stale problem-list entries; consolidate duplicates and copied-forward text. Preserve important dates, doses, routes, frequencies, values, units, findings, procedures, and plans. Call a result abnormal only if flagged, outside a supplied range, or clinician-interpreted as abnormal. Call a trend only with ≥2 comparable dated results. Do not resolve conflicts silently; name them. Do not assume a medication is active or an allergy/history is absent when unclear. Label cautious synthesis “Record suggests…” or “Record does not establish whether…”. If information is missing, say so. Return no reasoning.

Begin with:

**Record coverage:** earliest–latest date, if known
**Source:** report-labeled source; otherwise “Custom”
**Limitation:** Based only on supplied records; verify against the complete record.

Use these sections; omit any with no meaningful content:

1. **Clinical Snapshot** — 4–6 high-value bullets: current picture, active problems, recent consequential events/therapies, key unresolved issue.
2. **Active Conditions** — by importance; status/evidence, treatment, change, follow-up.
3. **Relevant Medical/Surgical History** — only what affects current care, risk, surveillance, or interpretation.
4. **Medications and Allergies** — compact table: Medication | Dose/route | Frequency | Indication | Status/uncertainty. Note duplicates, inconsistent instructions, and unclear status. Separate allergy, intolerance/adverse effect, other allergy, and undocumented reaction.
5. **Key Findings and Trends** — meaningful labs, imaging, pathology, cardiac testing, procedures, and screening; include dates/values/units when important. Avoid routine normal results unless clarifying.
6. **Recent Timeline** — prioritize the last 6–24 months: **Date:** event, findings, treatment, outcome/follow-up.
7. **Current Plan and Follow-Up** — documented tests, referrals, monitoring, surveillance, reassessment, or preventive care only.
8. **Verification/Clarification Needed** — conflicts, unclear medication/allergy status, missing or pending results, unresolved abnormality, or material information gaps; neutral language.
9. **Questions for Next Clinician Visit** — 3–7 specific questions derived only from unresolved record issues.

Write in concise bullets/short paragraphs, plain but medically precise language, expanding uncommon abbreviations once. Exclude billing, scheduling, administrative material, and generic education unless clinically important. Shorten rather than pad limited records; prioritize current-care information in extensive records. Silently verify every statement against the report before responding. Return only the summary.`;

export const REPORT_USER_PREFIX =
  "Convert the de-identified report below into the Portable Clinical Health Summary (sections 1–9, about 700–1,100 words). Use the dates in the source. Prefer visit notes and results over an empty problem list. Return only the completed summary. Do not leave the answer empty.\n\n";

export type OpenRouterChatJson = {
  choices?: {
    finish_reason?: string | null;
    native_finish_reason?: string | null;
    text?: string;
    message?: {
      content?: string | Array<{ type?: string; text?: string; content?: string }>;
      reasoning?: string;
      reasoning_content?: string;
      refusal?: string | null;
    };
  }[];
  error?: { message?: string };
};

function flattenContent(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object") {
        const rec = part as { text?: string; content?: string };
        return rec.text || rec.content || "";
      }
      return "";
    })
    .join("\n")
    .trim();
}

export function extractOpenRouterText(json: OpenRouterChatJson): { text: string; detail: string } {
  const choice = json.choices?.[0];
  const message = choice?.message;
  const fromContent = flattenContent(message?.content);
  if (fromContent) return { text: fromContent, detail: "content" };
  if (choice?.text?.trim()) return { text: choice.text.trim(), detail: "text" };
  const finish = choice?.finish_reason || choice?.native_finish_reason || "unknown";
  if (message?.refusal) return { text: "", detail: `OpenRouter refused: ${message.refusal}` };
  if (json.error?.message) return { text: "", detail: json.error.message };
  const hadReasoning = Boolean((message?.reasoning || message?.reasoning_content || "").trim());
  if (hadReasoning) {
    return {
      text: "",
      detail: `OpenRouter returned no report text (finish_reason=${finish}; the model only emitted reasoning). Try again or pick a non-reasoning model id.`,
    };
  }
  return { text: "", detail: `OpenRouter returned no report text (finish_reason=${finish}).` };
}

export async function summarizeWithOpenRouter(args: {
  apiKey: string;
  model: string;
  redactedText: string;
}): Promise<string> {
  const model = args.model.trim();
  if (!model) throw new Error("Choose an OpenRouter model id before sending.");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": typeof window === "undefined" ? "https://harbor.local" : window.location.origin,
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
          content:
            REPORT_USER_PREFIX + args.redactedText,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(parseOpenRouterError(res.status, body));
  }

  const json = (await res.json()) as OpenRouterChatJson;
  const extracted = extractOpenRouterText(json);
  if (!extracted.text) throw new Error(extracted.detail);
  return extracted.text;
}

export function parseOpenRouterError(status: number, body: string): string {
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
