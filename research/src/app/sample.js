// Fictional sample data for trying the app. Every record is marked
// source.system = "sample" and tagged #sample, and can be removed in one tap.
// It is deliberately ordinary — not modelled on anyone's real life.

import { makeEntry, makeDay, makeClaim, makeProposal, makeQuestion, makeEvent } from "../core/model.js";
import { addDays } from "../core/dates.js";
import { mediaPath } from "../core/format.js";

const SAMPLE = { system: "sample" };

async function paint(colors, sun) {
  const w = 800, h = 600;
  const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, h);
  colors.forEach((col, i) => grad.addColorStop(i / (colors.length - 1), col));
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.fillStyle = sun;
  g.beginPath(); g.arc(w * 0.68, h * 0.38, 70, 0, Math.PI * 2); g.fill();
  g.fillStyle = "rgba(20,20,30,0.55)";
  g.beginPath(); g.moveTo(0, h); g.lineTo(0, h * 0.72); g.lineTo(w * 0.3, h * 0.55); g.lineTo(w * 0.55, h * 0.7); g.lineTo(w * 0.8, h * 0.5); g.lineTo(w, h * 0.66); g.lineTo(w, h); g.fill();
  const blob = c.convertToBlob ? await c.convertToBlob({ type: "image/jpeg", quality: 0.8 }) : await new Promise((r) => c.toBlob(r, "image/jpeg", 0.8));
  return blob;
}

export async function addSampleData(ctx) {
  const t = ctx.today();
  const tz = ctx.tz();
  const d = (n) => addDays(t, -n);
  const at = (n, hm) => `${d(n)}T${hm}:00${ctx.now().slice(19)}`;
  const E = (n, hm, fields) => makeEntry({ day: d(n), created: at(n, hm), source: SAMPLE, ...fields, tags: [...new Set(["sample", ...(fields.tags || [])])] }, { tz });

  const photos = [];
  try {
    const shots = [[["#f6c27a", "#e9806e", "#5b4a7a"], "#fff2c9", "Ridge at sunrise"], [["#9fd3e6", "#5f9fb8", "#2f4f6b"], "#ffffff", "Harbour, late afternoon"], [["#cfe3b4", "#8fb37a", "#41603f"], "#fff8d8", ""]];
    for (const [i, [cols, sun, cap]] of shots.entries()) {
      const id = `m-sample-${i + 1}`;
      const day = d(i === 2 ? 3 : 6);
      const path = mediaPath(day, id, "jpg");
      const thumb = mediaPath(day, id, "jpg", { thumb: true });
      const blob = await paint(cols, sun);
      await ctx.store.putBlob(path, blob, { mime: "image/jpeg" });
      await ctx.store.putBlob(thumb, blob, { mime: "image/jpeg" });
      photos.push({ id, type: "photo", mime: "image/jpeg", path, thumb, caption: cap || undefined, width: 800, height: 600, bytes: blob.size });
    }
  } catch { /* no canvas: sample without photos */ }

  const entries = [
    E(13, "08:10", { body: "First proper walk in weeks. The air smelled like cut grass and somebody's toast. I think I'd forgotten how much a slow morning resets me. #walking" }),
    E(12, "21:40", { body: "Long day at work. The meeting ran over and I said yes to something I probably should have thought about first. Not sure why I do that. #work" }),
    E(11, "19:05", { body: "Cooked the soup Mai taught me. It was too salty and I loved it anyway. Called her afterwards and we laughed about the salt for ten minutes. #cooking #friends" }),
    E(10, "22:15", { body: "Tired. Didn't do much. That's allowed." }),
    E(9, "07:30", { kind: "voice", body: "Walking to the station. I keep noticing that I plan everything so I can stop thinking about logistics and just wander. Maybe that's the point of all the lists.", media: [], transcript: { engine: "webspeech", language: "en", raw: "um walking to the station and I I keep noticing that I plan everything so I can stop thinking about logistics and just uh wander maybe that's the point of all the lists", status: "approved", approved: "cleaned", cleaned_by: "rules" }, tags: ["walking"] }),
    E(8, "20:20", { body: "Work again. Too many fields in the new tracking sheet made me stop filling it in. Structure helps me until it starts asking for more than it gives. #work" }),
    E(6, "06:50", { kind: "photo", body: "Up early for the ridge. Worth every step.", media: photos.slice(0, 2), tags: ["walking", "outside"] }),
    E(5, "18:30", { body: "Dinner with friends. Someone asked what I'm actually trying to get better at this year and I didn't have an answer. Interesting. #friends" }),
    E(4, "23:10", { body: "Couldn't sleep. Kept replaying the conversation from work. I think I was frustrated, but I'm not entirely sure why. #work" }),
    E(3, "12:00", { kind: "photo", body: "", media: photos.slice(2) }),
    E(2, "09:15", { kind: "conversation", title: "Talking through the work week", body: "I said yes to the project because I didn't want to disappoint anyone. Looking back, I'm not sure it was the right call, but I'm curious what saying no would have felt like.", conversation: { turns: [
      { role: "ai", text: "What's on your mind?" },
      { role: "self", text: "I said yes to the project because I didn't want to disappoint anyone." },
      { role: "ai", text: "That sounds like it's been sitting with you. How does it look now, a few days later?" },
      { role: "self", text: "I'm not sure it was the right call, but I'm curious what saying no would have felt like." },
    ], model: "claude-opus-5-5", drafted_by: "ai:claude-opus-5-5" }, tags: ["work"] }),
    E(1, "17:45", { body: "Rain all afternoon. Read on the floor by the window. Felt peaceful in a way I can't quite explain. #reading" }),
    E(7, "15:00", { kind: "document", privacy: "normal", body: "I like the idea of noticing when I say yes before I've decided. Not sure yet.", document: { title: "Session notes (sample)", author: "A. Coach", author_role: "coach", date: d(7), source: "email (fictional)", text: "We talked about how quickly you agree to new commitments. One thing to try: before saying yes, notice whether you've actually decided, or are avoiding the discomfort of a pause. No need to change anything yet — just notice.", ai_allowed: true } }),
  ];
  for (const e of entries) await ctx.store.put(e, { keepUpdated: true });

  const ratings = [[13, 7, "The slow walk", ""], [12, 4, "", "The meeting that ran over"], [11, 8, "Laughing with Mai about the salt", ""], [10, 5, "", ""], [9, 6, "", ""], [8, 4, "", "Filling in that sheet"], [6, 9, "The ridge at sunrise", "The last climb"], [5, 7, "Dinner", ""], [4, 3, "", "Couldn't sleep"], [3, 7, "", ""], [2, 6, "", ""], [1, 8, "Reading by the window", ""]];
  const emo = { 13: ["calm"], 12: ["tired", "frustrated"], 11: ["joyful", "connected"], 6: ["energised", "grateful"], 4: ["restless", "conflicted"], 1: ["peaceful"] };
  for (const [n, r, best, hard] of ratings) {
    if (ctx.store.get(d(n))) continue;
    await ctx.store.put(makeDay(d(n), { rating: r, rating_scale: 10, best: best || undefined, hardest: hard || undefined, emotions: emo[n], source: SAMPLE }), { keepUpdated: true });
  }

  const e = (i) => entries[i].id;
  const now = ctx.now();
  await ctx.store.put(makeClaim({ section: "orientation", statement: "I'm trying to understand which kinds of structure help me, and which wear me down.", origin: "self", confidence: "moderate", source: SAMPLE }, { now }));
  await ctx.store.put(makeClaim({
    section: "ideas", statement: "You seem to value systems that reduce friction while preserving room to wander.", origin: "ai-accepted", confidence: "tentative",
    evidence: [{ entry: e(4), quote: "I plan everything so I can stop thinking about logistics", stance: "supports" }, { entry: e(5), quote: "Structure helps me until it starts asking for more than it gives", stance: "supports" }],
    alternatives: ["Both entries were written during a busy work stretch, which may have made logistics feel heavier than usual."],
    expects: "Tools you keep using will be the low-upkeep ones.", would_change_if: "You start enjoying an elaborate system for its own sake.",
    history: [{ at: now, action: "proposed", by: "claude-code", statement: "You seem to value systems that reduce friction while preserving room to wander." }, { at: now, action: "accepted", by: "self", statement: "You seem to value systems that reduce friction while preserving room to wander." }],
    source: SAMPLE,
  }, { now }));
  await ctx.store.put(makeProposal({
    op: "add-question", author: "claude-code", predicted_acceptance: 0.6,
    payload: { text: "You've mentioned saying yes before deciding a few times, but haven't explored it much. Is it something you want to return to, or leave alone for now?", kind: "gap", topic: "work" },
    rationale: "Three entries and a document touch on agreeing quickly; none explore it directly.",
    evidence: [{ entry: e(1), quote: "I said yes to something I probably should have thought about first", stance: "supports" }, { entry: e(10), quote: "I didn't want to disappoint anyone", stance: "supports" }],
    alternatives: ["It may simply have been a busy fortnight with more requests than usual."],
    coverage: { from: d(13), to: t, entries: 13, note: "Two weeks of entries — enough to ask, not to conclude." },
    source: SAMPLE,
  }, { now }));
  await ctx.store.put(makeProposal({
    op: "add-claim", author: "claude-code", predicted_acceptance: 0.35,
    payload: { section: "emotional", statement: "Unstructured time outside seems to restore you more reliably than rest indoors.", confidence: "tentative", expects: "Higher-rated days will more often include #walking or #outside.", would_change_if: "Rest days indoors start rating as well as outdoor ones." },
    rationale: "Highest-rated days include the ridge walk and the morning walk; one indoor day (reading) is also high, which complicates it.",
    evidence: [{ entry: e(6), quote: "Worth every step", stance: "supports" }, { entry: e(11), quote: "Felt peaceful in a way I can't quite explain", stance: "complicates" }, { entry: e(0), quote: "walking always fixes everything", stance: "supports" }],
    alternatives: ["Good weather may explain both the walks and the good moods.", "Two weeks is too short to separate any of these."],
    coverage: { from: d(13), to: t, entries: 13, note: "Short window; one quote is deliberately unverifiable to show the check." },
    source: SAMPLE,
  }, { now }));
  await ctx.store.put(makeQuestion({ text: "What would saying no have felt like?", origin: "self", kind: "custom", source: SAMPLE, evidence: [{ entry: e(10) }] }, { now }));
  await ctx.store.put(makeQuestion({ text: "Which forms of structure help you flourish, and which gradually become burdensome?", origin: "ai", kind: "tension", source: SAMPLE }, { now }));
  await ctx.store.put(makeQuestion({ text: "What would it look like to notice a yes before it happens, as the coach suggested?", origin: "document", kind: "document", sensitivity: "high", source: { ...SAMPLE, entry: e(12) }, evidence: [{ entry: e(12) }] }, { now }));
  await ctx.store.putMany([
    makeEvent({ id: "v-sample-1", day: d(5), title: "Dinner at Linh's", start: `${d(5)}T18:30:00${now.slice(19)}`, end: `${d(5)}T21:30:00${now.slice(19)}`, calendar: "Sample", source: { ...SAMPLE, uid: "s1" } }),
    makeEvent({ id: "v-sample-2", day: d(12), title: "Quarterly planning", start: `${d(12)}T13:00:00${now.slice(19)}`, end: `${d(12)}T17:30:00${now.slice(19)}`, calendar: "Sample", source: { ...SAMPLE, uid: "s2" } }),
  ]);
  const chapters = ctx.chapters().filter((c) => c.id !== "ch-sample");
  await ctx.saveChapters([...chapters, { id: "ch-sample", name: "Sample: a walking fortnight", from: d(13), to: t, sample: true }]);
  return entries.length;
}

export async function removeSampleData(ctx) {
  let n = 0;
  for (const r of [...ctx.store.records.values()]) {
    if (r.deleted) continue;
    const view = ctx.store.get(r.id) || r;
    if (view.source?.system === "sample") { await ctx.store.remove(r.id); n++; }
  }
  for (const p of [...ctx.store.blobMeta.keys()]) if (p.includes("m-sample-")) await ctx.store.removeBlob(p);
  await ctx.saveChapters(ctx.chapters().filter((c) => !c.sample));
  return n;
}
