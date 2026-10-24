// Reads only what the journal needs from a JPEG's EXIF block: when the photo
// was taken (so photos from an outing land on the right day and time) and its
// orientation. GPS is deliberately not read: location is not tracked unless a
// future feature asks you first (docs/PRIVACY.md).

const TAG_ORIENTATION = 0x0112, TAG_EXIF_IFD = 0x8769, TAG_DATETIME_ORIGINAL = 0x9003, TAG_OFFSET_ORIGINAL = 0x9011, TAG_DATETIME = 0x0132;

export function readExif(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let p = 2;
  while (p + 4 < b.length) {
    if (b[p] !== 0xff) return null;
    const marker = b[p + 1];
    const len = (b[p + 2] << 8) | b[p + 3];
    if (marker === 0xe1 && b[p + 4] === 0x45 && b[p + 5] === 0x78 && b[p + 6] === 0x69 && b[p + 7] === 0x66) {
      return parseTiff(b, p + 10, len - 8);
    }
    if (marker === 0xda) return null;
    p += 2 + len;
  }
  return null;
}

function parseTiff(b, start, length) {
  const end = Math.min(b.length, start + length);
  const little = b[start] === 0x49;
  const r16 = (o) => (little ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const r32 = (o) => (little ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);
  const ascii = (o, n) => {
    let s = "";
    for (let i = 0; i < n && o + i < end; i++) { const c = b[o + i]; if (!c) break; s += String.fromCharCode(c); }
    return s;
  };
  const out = {};
  const readIfd = (off) => {
    const at = start + off;
    if (at + 2 > end) return;
    const n = r16(at);
    for (let i = 0; i < n; i++) {
      const e = at + 2 + i * 12;
      if (e + 12 > end) break;
      const tag = r16(e), type = r16(e + 2), count = r32(e + 4);
      const valOff = count > 4 && type === 2 ? start + r32(e + 8) : e + 8;
      if (tag === TAG_ORIENTATION) out.orientation = r16(e + 8);
      else if (tag === TAG_EXIF_IFD) readIfd(r32(e + 8));
      else if (tag === TAG_DATETIME_ORIGINAL && type === 2) out.dateTimeOriginal = ascii(valOff, count);
      else if (tag === TAG_OFFSET_ORIGINAL && type === 2) out.offsetOriginal = ascii(valOff, count);
      else if (tag === TAG_DATETIME && type === 2 && !out.dateTime) out.dateTime = ascii(valOff, count);
    }
  };
  if (r16(start + 2) !== 42) return null;
  readIfd(r32(start + 4));
  return out;
}

/**
 * EXIF "2026:10:20 14:32:10" (+ optional "+07:00") -> ISO string with offset,
 * falling back to the given timezone offset string if EXIF has none.
 */
export function exifTakenIso(exif, fallbackOffset) {
  const raw = exif && (exif.dateTimeOriginal || exif.dateTime);
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(raw || "");
  if (!m || m[1] === "0000") return null;
  const off = /^[+-]\d{2}:\d{2}$/.test(exif.offsetOriginal || "") ? exif.offsetOriginal : fallbackOffset;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${off || ""}`;
}
