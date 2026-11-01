/*
 * Line model for a decrypted Azeroth Survivors save.
 *
 * A save is UTF-8 text, one record per line, fields separated by "|".
 * Per-class records carry the class id as their second field
 * ("marks|1|1255"); account records do not ("stat|kills=…").
 * Lines the editor does not understand are kept verbatim and in order.
 * See docs/FORMAT.md.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SaveModel = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const parse = (text) => text.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  const serialize = (lines) => lines.join("\n") + "\n";

  /* per-class records: "tag|cls|rest" */
  const findCls = (lines, tag, cls) =>
    lines.findIndex((l) => l.startsWith(`${tag}|${cls}|`) || l === `${tag}|${cls}`);
  const getCls = (lines, tag, cls) => {
    const i = findCls(lines, tag, cls);
    return i < 0 ? null : lines[i].slice(tag.length + String(cls).length + 2);
  };
  function insertAfterLast(lines, tag, line) {
    let last = -1;
    lines.forEach((l, i) => { if (l.startsWith(tag + "|")) last = i; });
    if (last >= 0) lines.splice(last + 1, 0, line);
    else lines.push(line);
  }
  /** Set a per-class record. An empty `rest` on a missing record adds nothing. */
  function setCls(lines, tag, cls, rest) {
    const i = findCls(lines, tag, cls);
    if (i >= 0) lines[i] = `${tag}|${cls}|${rest}`;
    else if (rest !== "") insertAfterLast(lines, tag, `${tag}|${cls}|${rest}`);
  }

  /* account records: "tag|rest" */
  const findAcc = (lines, tag) => lines.findIndex((l) => l.startsWith(tag + "|"));
  const getAcc = (lines, tag) => {
    const i = findAcc(lines, tag);
    return i < 0 ? null : lines[i].slice(tag.length + 1);
  };
  function setAcc(lines, tag, rest) {
    const i = findAcc(lines, tag);
    if (i >= 0) lines[i] = `${tag}|${rest}`;
    else if (rest !== "") lines.push(`${tag}|${rest}`);
  }

  /** "a:1,b:2" -> Map (insertion order kept). The last `sep` splits key and value. */
  function kv(s, sep) {
    const m = new Map();
    if (!s) return m;
    for (const p of s.split(",")) {
      if (!p) continue;
      const j = p.lastIndexOf(sep);
      if (j < 0) m.set(p, "");
      else m.set(p.slice(0, j), p.slice(j + 1));
    }
    return m;
  }
  const unkv = (m, sep) => [...m].map(([k, v]) => k + sep + v).join(",");

  /** Item ids: 100000 + class*1000 + piece*100 + rarity*10. Pieces 0–7 armor, 8–9 weapons. */
  const itemId = (cls, piece, rarity) => 100000 + cls * 1000 + piece * 100 + rarity * 10;
  const itemParts = (id) => ({
    cls: Math.floor((id - 100000) / 1000),
    piece: Math.floor((id % 1000) / 100),
    rarity: Math.floor((id % 100) / 10),
  });

  /** Line diff (LCS). Returns [["=", line] | ["+", line] | ["-", line]]. */
  function diff(a, b) {
    const n = a.length, m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out = [];
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[i] === b[j]) { out.push(["=", a[i]]); i++; j++; }
      else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) out.push(["+", b[j++]]);
      else out.push(["-", a[i++]]);
    }
    return out;
  }

  return { parse, serialize, findCls, getCls, setCls, findAcc, getAcc, setAcc, kv, unkv, itemId, itemParts, diff };
});
