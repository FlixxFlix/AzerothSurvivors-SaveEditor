/*
 * RSE1 — the sealed save-export format of Azeroth Survivors (wow.aethus.pl).
 *
 *   "RSE1:" + base64( nonce[16] || ciphertext || tag[20] )
 *   K       = "azeroth-survivors/save/v1/" || 9c4e27d16af013b85de2710ca936c48f
 *   block_i = HMAC-SHA1(K, "ks"  || nonce || u64_le(i))    20-byte keystream blocks, XORed
 *   tag     = HMAC-SHA1(K, "tag" || nonce || ciphertext)
 *
 * Pure JavaScript, synchronous, no dependencies. Works as a classic browser
 * script (global `RSE1`, also from file://) and as a CommonJS module in Node.
 * See docs/FORMAT.md.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RSE1 = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PREFIX = "RSE1:";
  const LABEL = "azeroth-survivors/save/v1/";
  const SECRET = Uint8Array.from([
    0x9c, 0x4e, 0x27, 0xd1, 0x6a, 0xf0, 0x13, 0xb8, 0x5d, 0xe2, 0x71, 0x0c, 0xa9, 0x36, 0xc4, 0x8f,
  ]);
  const NONCE_LEN = 16;
  const TAG_LEN = 20;

  const utf8 = new TextEncoder();
  const fromUtf8 = new TextDecoder("utf-8", { fatal: true });

  function concat(...parts) {
    let n = 0;
    for (const p of parts) n += p.length;
    const out = new Uint8Array(n);
    let i = 0;
    for (const p of parts) { out.set(p, i); i += p.length; }
    return out;
  }

  /** SHA-1 (FIPS 180-4). Returns 20 bytes. */
  function sha1(msg) {
    const ml = msg.length;
    const padLen = ((ml + 9 + 63) >> 6) << 6;
    const buf = new Uint8Array(padLen);
    buf.set(msg);
    buf[ml] = 0x80;
    const dv = new DataView(buf.buffer);
    const bits = ml * 8;
    dv.setUint32(padLen - 8, Math.floor(bits / 0x100000000));
    dv.setUint32(padLen - 4, bits >>> 0);

    let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
    const w = new Uint32Array(80);
    for (let off = 0; off < padLen; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 80; i++) {
        const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
        w[i] = (x << 1) | (x >>> 31);
      }
      let a = h0, b = h1, c = h2, d = h3, e = h4;
      for (let i = 0; i < 80; i++) {
        let f, k;
        if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
        else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
        else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
        else { f = b ^ c ^ d; k = 0xca62c1d6; }
        const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
        e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = t;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0;
      h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
    }
    const out = new Uint8Array(20);
    const ov = new DataView(out.buffer);
    [h0, h1, h2, h3, h4].forEach((h, i) => ov.setUint32(i * 4, h));
    return out;
  }

  /** HMAC-SHA1 (RFC 2104) over the concatenation of `parts`. */
  function hmacSha1(key, ...parts) {
    let k = key.length > 64 ? sha1(key) : key;
    const k0 = new Uint8Array(64);
    k0.set(k);
    const ipad = k0.map((b) => b ^ 0x36);
    const opad = k0.map((b) => b ^ 0x5c);
    return sha1(concat(opad, sha1(concat(ipad, ...parts))));
  }

  const KEY = concat(utf8.encode(LABEL), SECRET);
  const KS = utf8.encode("ks");
  const TAG = utf8.encode("tag");

  function keystreamXor(nonce, data) {
    const out = new Uint8Array(data);
    const ctr = new Uint8Array(8);
    const cv = new DataView(ctr.buffer);
    for (let i = 0, blk = 0; i < out.length; i += 20, blk++) {
      cv.setUint32(0, blk >>> 0, true);
      cv.setUint32(4, Math.floor(blk / 0x100000000), true);
      const ks = hmacSha1(KEY, KS, nonce, ctr);
      for (let j = 0; j < 20 && i + j < out.length; j++) out[i + j] ^= ks[j];
    }
    return out;
  }

  function toBase64(u8) {
    if (typeof Buffer !== "undefined") return Buffer.from(u8).toString("base64");
    let s = "";
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function fromBase64(s) {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s) || s.length % 4 !== 0) throw new Error("bad base64");
    if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(s, "base64"));
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  }
  function equalCT(a, b) {
    if (a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
    return d === 0;
  }

  class SealError extends Error {
    constructor(code, message) { super(message); this.code = code; this.name = "SealError"; }
  }

  /** Decode and verify an export. Returns the plaintext save (UTF-8 text). */
  function unseal(text) {
    const s = String(text).trim();
    if (!s.startsWith(PREFIX)) throw new SealError("prefix", 'The text does not start with "RSE1:". Is this an export from the game?');
    let raw;
    try { raw = fromBase64(s.slice(PREFIX.length).replace(/\s+/g, "")); }
    catch { throw new SealError("base64", 'The part after "RSE1:" is not valid base64.'); }
    if (raw.length < NONCE_LEN + TAG_LEN + 1) throw new SealError("short", "The export is too short.");
    const nonce = raw.subarray(0, NONCE_LEN);
    const ct = raw.subarray(NONCE_LEN, raw.length - TAG_LEN);
    const tag = raw.subarray(raw.length - TAG_LEN);
    if (!equalCT(hmacSha1(KEY, TAG, nonce, ct), tag)) {
      throw new SealError("mac", "The signature does not match. The export is damaged or comes from a different game version.");
    }
    try { return fromUtf8.decode(keystreamXor(nonce, ct)); }
    catch { throw new SealError("utf8", "The decrypted save is not valid UTF-8."); }
  }

  /** Seal a plaintext save. `nonce` (16 bytes) is random unless given. */
  function seal(plain, nonce) {
    if (nonce === undefined) nonce = globalThis.crypto.getRandomValues(new Uint8Array(NONCE_LEN));
    if (nonce.length !== NONCE_LEN) throw new SealError("nonce", "The nonce must be 16 bytes.");
    const ct = keystreamXor(nonce, utf8.encode(plain));
    return PREFIX + toBase64(concat(nonce, ct, hmacSha1(KEY, TAG, nonce, ct)));
  }

  return { seal, unseal, sha1, hmacSha1, SealError, PREFIX, LABEL, SECRET, NONCE_LEN, TAG_LEN };
});
