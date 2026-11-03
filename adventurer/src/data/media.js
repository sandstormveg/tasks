// Photo proof: pick or take a photo, shrink it to a 1280px JPEG on the device,
// and upload it to quests/media/ of the private repo. Needs a connection — the
// quest isn't stamped until the photo has actually landed.

import { QuestRemote } from "./github.js";
import { toast } from "../ui/dom.js";

function pick() {
  return new Promise((resolve) => {
    const i = Object.assign(document.createElement("input"), { type: "file", accept: "image/*" });
    i.setAttribute("capture", "environment");
    i.addEventListener("change", () => resolve(i.files?.[0] || null));
    i.click();
  });
}

async function shrink(file, max = 1280) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = Object.assign(document.createElement("canvas"), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, "image/jpeg", 0.82)); // re-encoding also drops the photo's location metadata
}

export async function uploadPhoto(ctx, questId) {
  const { token } = ctx.token();
  if (!token || !navigator.onLine) { toast("Photo proof needs sync set up and a connection.", { error: true }); return null; }
  const file = await pick();
  if (!file) return null;
  const blob = await shrink(file);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const s = ctx.settings();
  const remote = new QuestRemote({ token, owner: s.owner, repo: s.repo, folder: s.folder });
  await remote.checkPrivate();
  const rel = `media/${questId}-${Date.now().toString(36)}.jpg`;
  await remote.writeBytes(rel, bytes, { message: `Adventurer: photo proof for ${questId}` });
  return `${s.folder}/${rel}`;
}
