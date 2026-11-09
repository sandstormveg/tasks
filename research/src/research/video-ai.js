// Every video AI action re-reads the source and passes its transcript through the privacy gate.
import { createAssistant } from "../ai/assistant.js";
import { buildVideoContext } from "../core/context.js";

function sourceAndTranscript(ctx, id) {
  const source = ctx.store.get(id);
  const gated = buildVideoContext(source);
  if (!gated.included) {
    throw new Error(gated.reason === "transcript" ? "Paste the transcript to analyse" : "AI is not allowed to read this source");
  }
  return source;
}

export async function summarizeVideo(ctx, id, { depth, style } = {}) {
  const source = sourceAndTranscript(ctx, id);
  const ai = await createAssistant(ctx);
  return ai.summarizeVideo(source, { depth, style });
}

export async function chatAboutVideo(ctx, id, messages, { onText } = {}) {
  const source = sourceAndTranscript(ctx, id);
  const ai = await createAssistant(ctx);
  return ai.chatAboutVideo(source, messages, { onText });
}
