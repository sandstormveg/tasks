// The in-app AI assistant: the official Anthropic SDK, called straight from
// the browser with your own API key (no server in between, no subscription
// beyond your own usage). Loaded lazily — the SDK never loads unless you use
// an AI feature.
//
// What it is used for, and nothing else:
//   cleanupTranscript   tidy speech without changing meaning (checked after)
//   chat                the reflective companion in "Talk it through"
//   draftEntry          turn your side of a conversation into an entry draft
//   readDocument        a clearly-labelled reading of an imported document
//   proposeUpdates      meta-record proposals (evidence-checked after)
//
// Every call goes through the privacy gate first (src/core/context.js).

import { CLEANUP_SYSTEM, COMPANION_SYSTEM, DRAFT_SYSTEM, DOCUMENT_SYSTEM, STEWARD_SYSTEM } from "./prompts.js";
import { SECTION_IDS, QUESTION_KINDS } from "../core/model.js";

export const MODELS = {
  "claude-opus-5-5": { label: "Claude Opus 5.5", note: "Most thoughtful. Default." },
  "claude-sonnet-5-5": { label: "Claude Sonnet 5.5", note: "Faster and cheaper; still very capable." },
  "claude-haiku-5-5": { label: "Claude Haiku 5.5", note: "Cheapest; fine for transcript cleanup." },
};

let sdkPromise;
function loadSdk() {
  if (!sdkPromise) sdkPromise = import("../../vendor/anthropic-sdk.js").then((m) => m.default);
  return sdkPromise;
}

function textOf(message) {
  return (message.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
}

export class AiError extends Error {}

export async function createAssistant(ctx) {
  const key = ctx.secrets().anthropicKey;
  if (!key) throw new AiError("Add your Anthropic API key in Settings → AI to use this.");
  const Anthropic = await loadSdk();
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2 });
  const model = ctx.settings().ai.model || "claude-opus-5-5";

  // Server-side refusal fallback (Claude API): if the model's safety
  // classifiers decline, the API re-runs on Anthropic's recommended fallback.
  // Not offered for Haiku.
  const fallback = model === "claude-haiku-5-5" ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };

  function explain(err) {
    if (err instanceof Anthropic.AuthenticationError) return new AiError("Anthropic rejected the API key. Check it in Settings → AI.");
    if (err instanceof Anthropic.PermissionDeniedError) return new AiError("This API key isn't allowed to use that model.");
    if (err instanceof Anthropic.RateLimitError) return new AiError("Rate limited by the Anthropic API — try again in a minute.");
    if (err instanceof Anthropic.BadRequestError) return new AiError(`The AI request was rejected: ${err.message}`);
    if (err instanceof Anthropic.APIConnectionError) return new AiError("Couldn't reach the AI service — you may be offline.");
    if (err instanceof Anthropic.APIError) return new AiError(`AI service error (${err.status}): ${err.message}`);
    return err instanceof Error ? err : new AiError(String(err));
  }

  function checkStop(message) {
    if (message.stop_reason === "refusal") throw new AiError("The AI declined this request. Nothing was changed.");
  }

  async function json(system, userContent, schema, { effort = "medium", maxTokens = 32000 } = {}) {
    try {
      const stream = client.beta.messages.stream({
        model, max_tokens: maxTokens, system,
        messages: [{ role: "user", content: userContent }],
        output_config: { effort, format: { type: "json_schema", schema } },
        ...fallback,
      });
      const msg = await stream.finalMessage();
      checkStop(msg);
      if (msg.stop_reason === "max_tokens") throw new AiError("The AI's answer was cut off. Try a shorter time range.");
      return { data: JSON.parse(textOf(msg)), model: msg.model, usage: msg.usage };
    } catch (err) { throw explain(err); }
  }

  return {
    model,

    async cleanupTranscript(raw, { language } = {}) {
      try {
        const msg = await client.beta.messages.create({
          model, max_tokens: 8000, system: CLEANUP_SYSTEM,
          messages: [{ role: "user", content: `<transcript language="${language || "auto"}">\n${raw}\n</transcript>` }],
          output_config: { effort: "low" },
          ...fallback,
        });
        checkStop(msg);
        return textOf(msg).trim();
      } catch (err) { throw explain(err); }
    },

    /** Stream a companion reply. messages: [{role: "user"|"assistant", content}] */
    async chat(messages, { context = "", onText } = {}) {
      try {
        const system = context ? `${COMPANION_SYSTEM}\n\nContext the user chose to share (from their journal):\n${context}` : COMPANION_SYSTEM;
        const stream = client.beta.messages.stream({
          model, max_tokens: 8000, system, messages,
          output_config: { effort: "low" },
          ...fallback,
        });
        if (onText) stream.on("text", (_delta, snapshot) => onText(snapshot));
        const msg = await stream.finalMessage();
        checkStop(msg);
        return textOf(msg).trim();
      } catch (err) { throw explain(err); }
    },

    async draftEntry(turns) {
      const transcript = turns.map((t) => `<${t.role === "self" ? "user" : "assistant"}>${t.text}</${t.role === "self" ? "user" : "assistant"}>`).join("\n");
      const { data } = await json(DRAFT_SYSTEM, `Conversation:\n${transcript}\n\nWrite the entry.`, {
        type: "object", additionalProperties: false, required: ["entry_text", "title"],
        properties: { entry_text: { type: "string" }, title: { type: "string", description: "A short title in the user's words, or empty" } },
      }, { effort: "medium", maxTokens: 16000 });
      return data;
    },

    async readDocument({ title, author, role, date, text, pdfBase64, imageBase64, imageMime }) {
      const content = [];
      if (pdfBase64) content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } });
      if (imageBase64) content.push({ type: "image", source: { type: "base64", media_type: imageMime || "image/jpeg", data: imageBase64 } });
      content.push({ type: "text", text: `Document: ${title || "(untitled)"}${author ? `\nWritten by: ${author}${role ? ` (${role})` : ""}` : ""}${date ? `\nDated: ${date}` : ""}${text ? `\n\nText:\n${text}` : ""}\n\nRead it as instructed.` });
      const { data, model: used } = await json(DOCUMENT_SYSTEM, content, {
        type: "object", additionalProperties: false, required: ["what_the_author_wrote", "possible_themes", "questions_to_consider", "exercises_mentioned"],
        properties: {
          what_the_author_wrote: { type: "string", description: "Faithful, attributed summary" },
          possible_themes: { type: "array", items: { type: "string" }, description: "Tentative themes — your hypotheses" },
          questions_to_consider: { type: "array", items: { type: "string" } },
          exercises_mentioned: { type: "array", items: { type: "string" }, description: "Exercises or suggestions the author made, attributed, not turned into tasks" },
        },
      }, { effort: "high" });
      return { ...data, model: used };
    },

    async proposeUpdates(contextText, { max = 5 } = {}) {
      const schema = {
        type: "object", additionalProperties: false, required: ["coverage_note", "proposals"],
        properties: {
          coverage_note: { type: "string", description: "One sentence on what this evidence can and can't support" },
          proposals: {
            type: "array",
            items: {
              type: "object", additionalProperties: false,
              required: ["op", "target", "section", "statement", "question_text", "question_kind", "confidence", "rationale", "evidence", "alternatives", "expects", "would_change_if", "predicted_acceptance", "topic", "sensitivity"],
              properties: {
                op: { type: "string", enum: ["add-claim", "revise-claim", "retire-claim", "add-question", "link-entries"] },
                target: { type: "string", description: "Existing claim id for revise/retire; empty otherwise" },
                section: { type: "string", enum: [...SECTION_IDS, ""] },
                statement: { type: "string", description: "The claim (add/revise), empty for questions and links" },
                question_text: { type: "string", description: "For add-question; empty otherwise" },
                question_kind: { type: "string", enum: [...Object.keys(QUESTION_KINDS), ""] },
                confidence: { type: "string", enum: ["tentative", "moderate", "strong"] },
                rationale: { type: "string" },
                evidence: {
                  type: "array",
                  items: { type: "object", additionalProperties: false, required: ["entry", "quote", "stance"], properties: { entry: { type: "string" }, quote: { type: "string" }, stance: { type: "string", enum: ["supports", "complicates", "contradicts"] } } },
                },
                alternatives: { type: "array", items: { type: "string" } },
                expects: { type: "string" },
                would_change_if: { type: "string" },
                predicted_acceptance: { type: "number" },
                topic: { type: "string", description: "One or two words naming the topic, for muting" },
                sensitivity: { type: "string", enum: ["low", "medium", "high"] },
              },
            },
          },
        },
      };
      const { data, model: used } = await json(STEWARD_SYSTEM, `${contextText}\n\nPropose at most ${max} updates.`, schema, { effort: "high" });
      return { ...data, model: used };
    },
  };
}
