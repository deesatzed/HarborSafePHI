import assert from "node:assert/strict";
import test from "node:test";
import { extractOpenRouterText, SYSTEM_PROMPT } from "./openrouter.ts";

test("reads string content", () => {
  const got = extractOpenRouterText({
    choices: [{ message: { content: "  Problems: diabetes  " }, finish_reason: "stop" }],
  });
  assert.equal(got.text, "Problems: diabetes");
});

test("joins array content parts", () => {
  const got = extractOpenRouterText({
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: [
            { type: "text", text: "Problems:" },
            { type: "text", text: "diabetes" },
          ],
        },
      },
    ],
  });
  assert.match(got.text, /Problems:/);
  assert.match(got.text, /diabetes/);
});

test("summary prompt is the portable clinical summary with visit questions", () => {
  assert.match(SYSTEM_PROMPT, /Portable Clinical Health Summary/);
  assert.match(SYSTEM_PROMPT, /Verification\/Clarification Needed/);
  assert.match(SYSTEM_PROMPT, /Questions for Next Clinician Visit/);
  assert.match(SYSTEM_PROMPT, /3–7 specific questions/);
  assert.match(SYSTEM_PROMPT, /Record suggests/);
  assert.doesNotMatch(SYSTEM_PROMPT, /Do not add a section of questions for the next clinician visit/);
});

test("empty content with reasoning explains the failure", () => {
  const got = extractOpenRouterText({
    choices: [
      {
        finish_reason: "length",
        message: { content: "", reasoning: "thinking about labs" },
      },
    ],
  });
  assert.equal(got.text, "");
  assert.match(got.detail, /reasoning/);
  assert.match(got.detail, /length/);
});
