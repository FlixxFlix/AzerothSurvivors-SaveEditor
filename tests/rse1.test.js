"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const RSE1 = require("../src/rse1.js");
const S = require("../src/save.js");
const Catalog = require("../src/catalog.js");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const hex = (u8) => Buffer.from(u8).toString("hex");

test("SHA-1 matches node:crypto for lengths 0..300", () => {
  for (let n = 0; n <= 300; n++) {
    const msg = crypto.randomBytes(n);
    assert.equal(hex(RSE1.sha1(new Uint8Array(msg))), crypto.createHash("sha1").update(msg).digest("hex"), `length ${n}`);
  }
});

test("HMAC-SHA1 matches node:crypto, including keys longer than one block", () => {
  for (const klen of [0, 1, 20, 42, 64, 65, 200]) {
    const key = crypto.randomBytes(klen), a = crypto.randomBytes(7), b = crypto.randomBytes(130);
    const want = crypto.createHmac("sha1", key).update(a).update(b).digest("hex");
    assert.equal(hex(RSE1.hmacSha1(new Uint8Array(key), new Uint8Array(a), new Uint8Array(b))), want, `key length ${klen}`);
  }
});

test("JavaScript reproduces the Python known-answer vectors", () => {
  const { vectors } = JSON.parse(read("tests/vectors.json"));
  assert.ok(vectors.length >= 5);
  for (const v of vectors) {
    const nonce = Uint8Array.from(Buffer.from(v.nonce, "hex"));
    assert.equal(RSE1.seal(v.plain, nonce), v.export, `seal: ${v.name}`);
    assert.equal(RSE1.unseal(v.export), v.plain, `unseal: ${v.name}`);
  }
});

test("src/example.js holds the same export as examples/example-save.txt", () => {
  const sandbox = { window: {} };
  vm.runInNewContext(read("src/example.js"), sandbox);
  assert.equal(sandbox.window.EXAMPLE_SAVE, read("examples/example-save.txt").trim());
  assert.equal(RSE1.unseal(sandbox.window.EXAMPLE_SAVE), read("examples/example-save.plain.txt"));
});

test("a random nonce gives a different export with the same content", () => {
  const plain = read("examples/example-save.plain.txt");
  const a = RSE1.seal(plain), b = RSE1.seal(plain);
  assert.notEqual(a, b);
  assert.equal(RSE1.unseal(a), plain);
  assert.equal(RSE1.unseal(b), plain);
});

test("tampering and malformed input are rejected with a reason", () => {
  const good = read("examples/example-save.txt").trim();
  const raw = Buffer.from(good.slice(5), "base64");
  for (const at of [0, 20, raw.length - 1]) {
    const bad = Buffer.from(raw); bad[at] ^= 1;
    assert.throws(() => RSE1.unseal("RSE1:" + bad.toString("base64")), (e) => e.code === "mac", `flip at ${at}`);
  }
  assert.throws(() => RSE1.unseal(good.slice(5)), (e) => e.code === "prefix");
  assert.throws(() => RSE1.unseal("RSE1:not*base64"), (e) => e.code === "base64");
  assert.throws(() => RSE1.unseal("RSE1:AAAA"), (e) => e.code === "short");
  assert.equal(RSE1.unseal("  " + good.slice(0, 40) + "\n" + good.slice(40) + "\n"), read("examples/example-save.plain.txt"));
});

test("save model keeps unknown lines and their order", () => {
  const plain = read("examples/example-save.plain.txt");
  assert.equal(S.serialize(S.parse(plain)), plain);
  assert.equal(S.serialize(S.parse(plain.replace(/\n/g, "\r\n"))), plain);
});

test("save model edits per-class and account records", () => {
  const lines = S.parse(read("examples/example-save.plain.txt"));
  S.setCls(lines, "marks", 8, "9000");
  S.setCls(lines, "marks", 3, "40");
  S.setCls(lines, "hbeat", 1, "");
  S.setAcc(lines, "stat", "kills=1");
  assert.equal(S.getCls(lines, "marks", 8), "9000");
  assert.equal(lines[lines.indexOf("marks|1|28") + 1], "marks|3|40", "new record follows its siblings");
  assert.equal(S.findCls(lines, "hbeat", 1), -1, "an empty value does not add a record");
  assert.equal(S.getAcc(lines, "stat"), "kills=1");
  const m = S.kv("a:1,b:2,legendary:cleave:4", ":");
  assert.deepEqual([...m], [["a", "1"], ["b", "2"], ["legendary:cleave", "4"]]);
  assert.equal(S.unkv(m, ":"), "a:1,b:2,legendary:cleave:4");
});

test("item ids follow class * 1000 + piece * 100 + rarity * 10", () => {
  assert.equal(S.itemId(1, 8, 2), 101820);
  assert.deepEqual(S.itemParts(108840), { cls: 8, piece: 8, rarity: 4 });
  for (const c of Catalog.CLASSES) {
    const ps = Catalog.pieces(c);
    assert.equal(ps.length, 8 + c.weapons.length);
    for (const p of ps) assert.equal(p.names.length, 5, `${c.key} piece ${p.piece}`);
  }
});

test("line diff reports only changed lines", () => {
  const d = S.diff(["a", "b", "c"], ["a", "B", "c", "d"]).filter(([t]) => t !== "=");
  assert.deepEqual(d, [["+", "B"], ["-", "b"], ["+", "d"]]);
});
