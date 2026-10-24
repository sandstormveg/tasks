// Minimal ZIP reader and writer with no dependencies.
//
// Reader: random access via a byte source, so a large Notion export is read
// entry by entry instead of being loaded whole. Handles deflate (via the
// platform's DecompressionStream), stored entries, UTF-8 names and ZIP64.
// Writer: stored (or deflated) entries with CRC-32, for full journal exports.

const SIG_EOCD = 0x06054b50, SIG_EOCD64 = 0x06064b50, SIG_LOC64 = 0x07064b50, SIG_CEN = 0x02014b50, SIG_LOC = 0x04034b50;

/** Byte source over a Blob/File or a Uint8Array. */
export function byteSource(input) {
  if (input instanceof Uint8Array) {
    return { size: input.length, read: async (o, n) => input.subarray(o, o + n) };
  }
  if (input && typeof input.slice === "function" && typeof input.size === "number") {
    return { size: input.size, read: async (o, n) => new Uint8Array(await input.slice(o, o + n).arrayBuffer()) };
  }
  throw new Error("zip: unsupported input");
}

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const u64 = (b, o) => u32(b, o) + u32(b, o + 4) * 2 ** 32;

async function inflateRaw(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function deflateRaw(bytes) {
  const cs = new CompressionStream("deflate-raw");
  const stream = new Blob([bytes]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const utf8 = new TextDecoder("utf-8");

/** Open a zip. Returns {entries, read(entry) -> Uint8Array, readText(entry)}. */
export async function openZip(input) {
  const src = byteSource(input);
  const tailLen = Math.min(src.size, 65557 + 22);
  const tail = await src.read(src.size - tailLen, tailLen);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (u32(tail, i) === SIG_EOCD) { eocd = i; break; }
  if (eocd < 0) throw new Error("Not a zip file (no end-of-central-directory record)");
  let count = u16(tail, eocd + 10);
  let cdSize = u32(tail, eocd + 12);
  let cdOffset = u32(tail, eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    const locAt = eocd - 20;
    if (locAt >= 0 && u32(tail, locAt) === SIG_LOC64) {
      const z64Off = u64(tail, locAt + 8);
      const z = await src.read(z64Off, 56);
      if (u32(z, 0) !== SIG_EOCD64) throw new Error("Corrupt ZIP64 record");
      count = u64(z, 32); cdSize = u64(z, 40); cdOffset = u64(z, 48);
    }
  }
  const cd = await src.read(cdOffset, cdSize);
  const entries = [];
  let p = 0;
  for (let n = 0; n < count && p + 46 <= cd.length; n++) {
    if (u32(cd, p) !== SIG_CEN) throw new Error("Corrupt central directory");
    const flags = u16(cd, p + 8);
    const method = u16(cd, p + 10);
    const crc = u32(cd, p + 16);
    let compressedSize = u32(cd, p + 20);
    let size = u32(cd, p + 24);
    const nameLen = u16(cd, p + 28), extraLen = u16(cd, p + 30), commentLen = u16(cd, p + 32);
    let offset = u32(cd, p + 42);
    const nameBytes = cd.subarray(p + 46, p + 46 + nameLen);
    const name = utf8.decode(nameBytes);
    let e = p + 46 + nameLen;
    const extraEnd = e + extraLen;
    while (e + 4 <= extraEnd) {
      const id = u16(cd, e), len = u16(cd, e + 2);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === 0xffffffff) { size = u64(cd, q); q += 8; }
        if (compressedSize === 0xffffffff) { compressedSize = u64(cd, q); q += 8; }
        if (offset === 0xffffffff) { offset = u64(cd, q); q += 8; }
      }
      e += 4 + len;
    }
    entries.push({ name, method, crc, compressedSize, size, offset, flags, dir: name.endsWith("/") });
    p = extraEnd + commentLen;
  }

  async function read(entry) {
    const h = await src.read(entry.offset, 30);
    if (u32(h, 0) !== SIG_LOC) throw new Error(`Corrupt local header for ${entry.name}`);
    const start = entry.offset + 30 + u16(h, 26) + u16(h, 28);
    const data = await src.read(start, entry.compressedSize);
    if (entry.method === 0) return data;
    if (entry.method === 8) return inflateRaw(data);
    throw new Error(`Unsupported compression method ${entry.method} for ${entry.name}`);
  }
  return { entries, read, readText: async (entry) => utf8.decode(await read(entry)) };
}

// ---------- writer ----------

let CRC_TABLE;
export function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d) {
  return {
    time: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff,
    date: (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff,
  };
}

/** Streaming-friendly zip builder: add files, then finish() -> array of byte parts. */
export function createZip() {
  const parts = [];
  const central = [];
  let offset = 0;
  const enc = new TextEncoder();
  return {
    async add(name, data, { compress = false, date = new Date() } = {}) {
      const bytes = typeof data === "string" ? enc.encode(data) : data;
      const nameBytes = enc.encode(name);
      const crc = crc32(bytes);
      let body = bytes, method = 0;
      if (compress && bytes.length > 256) {
        const d = await deflateRaw(bytes);
        if (d.length < bytes.length) { body = d; method = 8; }
      }
      if (offset + body.length + 30 + nameBytes.length > 0xfffffff0) throw new Error("Export larger than 4 GB — export text only, or in parts");
      const { time, date: dd } = dosTime(date);
      const h = new Uint8Array(30 + nameBytes.length);
      const v = new DataView(h.buffer);
      v.setUint32(0, SIG_LOC, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, method, true);
      v.setUint16(10, time, true); v.setUint16(12, dd, true); v.setUint32(14, crc, true);
      v.setUint32(18, body.length, true); v.setUint32(22, bytes.length, true); v.setUint16(26, nameBytes.length, true); v.setUint16(28, 0, true);
      h.set(nameBytes, 30);
      parts.push(h, body);
      central.push({ nameBytes, crc, method, csize: body.length, size: bytes.length, offset, time, date: dd });
      offset += h.length + body.length;
    },
    finish() {
      const cdStart = offset;
      let cdLen = 0;
      for (const c of central) {
        const r = new Uint8Array(46 + c.nameBytes.length);
        const v = new DataView(r.buffer);
        v.setUint32(0, SIG_CEN, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(8, 0x0800, true);
        v.setUint16(10, c.method, true); v.setUint16(12, c.time, true); v.setUint16(14, c.date, true); v.setUint32(16, c.crc, true);
        v.setUint32(20, c.csize, true); v.setUint32(24, c.size, true); v.setUint16(28, c.nameBytes.length, true);
        v.setUint32(42, c.offset, true);
        r.set(c.nameBytes, 46);
        parts.push(r);
        cdLen += r.length;
      }
      const e = new Uint8Array(22);
      const v = new DataView(e.buffer);
      v.setUint32(0, SIG_EOCD, true); v.setUint16(8, central.length, true); v.setUint16(10, central.length, true);
      v.setUint32(12, cdLen, true); v.setUint32(16, cdStart, true);
      parts.push(e);
      return parts;
    },
  };
}

export function concatBytes(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
