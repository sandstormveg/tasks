// Sealing: client-side encryption for the most private material (e.g. therapy
// notes). A sealed record is encrypted with a key derived from your passphrase
// before it is written to this device's storage or synced, so neither GitHub,
// a steward session, nor anyone holding the repo can read it.
//
// AES-GCM-256, key from PBKDF2-SHA-256 (600k iterations, random 16-byte salt).
// Each item gets a fresh 12-byte IV. There is no recovery: lose the passphrase
// and sealed items stay sealed. The UI says so plainly before you set one.

const ITERATIONS = 600_000;
const VERIFIER_TEXT = "living-journal:sealing-verifier:v1";

export function toBase64(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(str) {
  const s = atob(String(str).replace(/\s+/g, ""));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const subtle = () => globalThis.crypto.subtle;

export async function deriveKey(passphrase, saltB64, iterations = ITERATIONS) {
  const base = await subtle().importKey("raw", new TextEncoder().encode(passphrase.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: fromBase64(saltB64), iterations },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

export async function sealBytes(key, bytes) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv }, key, bytes));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv, 0);
  out.set(ct, 12);
  return out;
}

export async function openBytes(key, sealed) {
  const b = sealed instanceof Uint8Array ? sealed : new Uint8Array(sealed);
  return new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: b.subarray(0, 12) }, key, b.subarray(12)));
}

export async function sealJson(key, value) {
  const bytes = await sealBytes(key, new TextEncoder().encode(JSON.stringify(value)));
  return { alg: "AES-GCM-256", kdf: "PBKDF2-SHA256", data: toBase64(bytes) };
}

export async function openJson(key, sealed) {
  const bytes = await openBytes(key, fromBase64(sealed.data));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Create a new sealing configuration (store this; it holds no secret). */
export async function createSealing(passphrase, { iterations = ITERATIONS } = {}) {
  if (!passphrase || passphrase.length < 8) throw new Error("Use a passphrase of at least 8 characters.");
  const salt = toBase64(globalThis.crypto.getRandomValues(new Uint8Array(16)));
  const key = await deriveKey(passphrase, salt, iterations);
  const verifier = await sealJson(key, VERIFIER_TEXT);
  return { config: { version: 1, salt, iterations, verifier }, key };
}

/** Unlock with a passphrase; throws "Wrong passphrase" if it doesn't verify. */
export async function unlockSealing(passphrase, config) {
  const key = await deriveKey(passphrase, config.salt, config.iterations || ITERATIONS);
  try {
    const v = await openJson(key, config.verifier);
    if (v !== VERIFIER_TEXT) throw new Error("bad verifier");
  } catch {
    throw new Error("Wrong passphrase");
  }
  return key;
}

// Fields of an entry that stay visible on a sealed record (enough to place it
// on a timeline and sync it). Everything else is inside the ciphertext.
export const SEALED_VISIBLE_FIELDS = ["id", "type", "kind", "day", "created", "updated", "tz", "author", "privacy", "sealed"];

/** Entry -> sealed entry (body, tags, media metadata, transcript… encrypted). */
export async function sealRecord(key, rec) {
  const visible = {};
  const secret = {};
  for (const [k, v] of Object.entries(rec)) {
    if (k.startsWith("_")) continue;
    if (SEALED_VISIBLE_FIELDS.includes(k)) visible[k] = v;
    else secret[k] = v;
  }
  return { ...visible, privacy: "sealed", sealed: await sealJson(key, secret), _local: rec._local, _sync: rec._sync };
}

/** Sealed entry -> plaintext entry (in memory only). */
export async function openRecord(key, rec) {
  if (!rec.sealed) return rec;
  const secret = await openJson(key, rec.sealed);
  const out = { ...rec, ...secret, privacy: "sealed" };
  delete out.sealed;
  return out;
}
