/* Editor UI. Depends on the globals RSE1, SaveModel, Catalog and EXAMPLE_SAVE. */
(function () {
  "use strict";
  const { CLASSES, RARITY, HEROIC, ZONES, STATS, PERKS, pieces, byId } = Catalog;
  const S = SaveModel;

  /* Records with their own controls. Everything else is offered as a raw field. */
  const CLASS_COVERED = new Set(["equip", "marks", "beat", "hbeat"]);
  const ACCOUNT_COVERED = new Set(["items", "stars", "stat", "perk"]);

  let orig = [];      // lines as loaded
  let lines = [];     // lines as edited
  let cur = 1;        // selected class id
  let sealed = "";    // last sealed export
  let source = "";    // where the loaded save came from

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const nf = new Intl.NumberFormat("en-US");

  /* ---------- load ---------- */
  function load(text, origin, isExample) {
    const plain = RSE1.unseal(text);
    orig = S.parse(plain);
    lines = orig.slice();
    source = origin;
    const pick = Number((S.getAcc(lines, "pick") || "").split("|")[0]);
    const first = CLASSES.find((c) => S.findCls(lines, "hero", c.id) >= 0);
    cur = byId(pick) ? pick : (first || CLASSES[0]).id;
    $("status").className = "status";
    $("status").textContent = `${origin} · signature valid · ${orig.length} lines`;
    $("example-note").hidden = !isExample;
    clearOutput();
    renderAll(true);
  }
  function showLoadError(msg) { $("load-err").textContent = msg || ""; $("load-err").hidden = !msg; }
  function tryLoad(text, origin) {
    try { load(text, origin, false); showLoadError(""); $("load-text").value = ""; return true; }
    catch (err) { showLoadError(err.message); return false; }
  }

  /* ---------- accessors ---------- */
  const owned = () => new Set((S.getAcc(lines, "items") || "").split(",").filter(Boolean).map(Number));
  const setOwned = (set) => S.setAcc(lines, "items", [...set].sort((a, b) => a - b).join(","));
  const equipOf = (cls) => S.kv(S.getCls(lines, "equip", cls), ":");
  const writeEquip = (cls, m) =>
    S.setCls(lines, "equip", cls, [...m].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(","));
  const starsMap = () => S.kv(S.getAcc(lines, "stars"), ":");
  const beatOf = (cls) => new Set((S.getCls(lines, "beat", cls) || "").split(",").filter(Boolean));
  const hbeatOf = (cls) => S.kv(S.getCls(lines, "hbeat", cls), ":");
  function writeBeat(cls, set) {
    const known = ZONES.map(([k]) => k);
    S.setCls(lines, "beat", cls, known.filter((k) => set.has(k)).concat([...set].filter((k) => !known.includes(k))).join(","));
  }
  function equipped(cls, piece) {
    for (const [slot, id] of equipOf(cls)) {
      const p = S.itemParts(Number(id));
      if (p.cls === cls && p.piece === piece) return { slot: Number(slot), id: Number(id), rarity: p.rarity };
    }
    return null;
  }
  const hasHero = (cls) => S.findCls(lines, "hero", cls) >= 0;

  /* ---------- render ---------- */
  function renderAll(withRaw) {
    renderRoster(); renderSheet(); renderAccount(); renderDiff();
    if (withRaw) $("raw-text").value = S.serialize(lines);
  }

  function renderRoster() {
    $("roster").innerHTML = CLASSES.map((c) => {
      const marks = Number(S.getCls(lines, "marks", c.id) || 0);
      const worn = equipOf(c.id).size;
      const top = Math.max(0, ...[...hbeatOf(c.id).values()].map(Number));
      const sub = hasHero(c.id) ? `${worn} worn${top ? ` · Heroic ${HEROIC[top] || top}` : ""}` : "no hero yet";
      return `<button type="button" class="hero-btn${hasHero(c.id) ? "" : " locked"}" style="--cls:${c.color}"
        data-cls="${c.id}" aria-pressed="${c.id === cur}">
        <span class="sw"></span><span class="nm">${c.name}</span><span class="mk">${nf.format(marks)}</span>
        <span class="sub">${sub}</span></button>`;
    }).join("");
  }

  function gearRow(c, p, stars) {
    const eq = equipped(c.id, p.piece);
    const r = eq ? eq.rarity : -1;
    const st = eq ? Number(stars.get(String(eq.id)) || 0) : 0;
    const flag = p.inferred ? ` <abbr title="Slot number derived, not yet seen in a real save">*</abbr>` : "";
    return `<div class="gear-row${eq ? "" : " empty"}">
      <span class="slot">${p.label}${flag}</span>
      <span class="name${eq ? " q" + r : ""}">${eq ? esc(p.names[r] || "Unknown piece") + `<small class="mono">${eq.id} · slot ${eq.slot}</small>` : "Empty"}</span>
      <select id="g-${c.id}-${p.piece}" data-act="gear" data-piece="${p.piece}" data-slot="${eq ? eq.slot : p.slot}" aria-label="${p.label} rarity">
        <option value="-1"${r < 0 ? " selected" : ""}>Empty</option>
        ${RARITY.map((n, i) => `<option value="${i}"${i === r ? " selected" : ""}>${n}</option>`).join("")}
      </select>
      <select id="s-${c.id}-${p.piece}" data-act="star" data-id="${eq ? eq.id : ""}" aria-label="${p.label} stars"${eq ? "" : " disabled"}>
        ${[0, 1, 2, 3, 4, 5].map((n) => `<option value="${n}"${n === st ? " selected" : ""}>${n ? "★".repeat(n) : "No stars"}</option>`).join("")}
      </select></div>`;
  }

  function rawFields(entries, prefix) {
    return entries.map(({ tag, rest, idx }) =>
      `<label for="${prefix}-${tag}-${idx}"><span>${esc(tag)}</span>
        <input type="text" id="${prefix}-${tag}-${idx}" data-act="${prefix}" data-tag="${esc(tag)}" value="${esc(rest)}" spellcheck="false"></label>`).join("");
  }

  function renderSheet() {
    const c = byId(cur);
    const ps = pieces(c), own = owned(), stars = starsMap(), beat = beatOf(c.id), hb = hbeatOf(c.id);
    const marks = S.getCls(lines, "marks", c.id) || "0";

    const coll = ps.map((p) => {
      const eq = equipped(c.id, p.piece);
      return `<tr><td>${p.label}</td>${RARITY.map((_, r) => {
        const id = S.itemId(c.id, p.piece, r), worn = eq && eq.id === id;
        return `<td><input type="checkbox" id="c-${id}" data-act="own" data-id="${id}"${own.has(id) ? " checked" : ""}${worn ? ' disabled title="Worn"' : ""} aria-label="${p.label} ${RARITY[r]}"></td>`;
      }).join("")}</tr>`;
    }).join("");

    const zones = ZONES.map(([k, name]) => `<tr><td>${name}</td>
      <td><input type="checkbox" id="b-${c.id}-${k}" data-act="beat" data-zone="${k}"${beat.has(k) ? " checked" : ""} aria-label="${name} beaten on normal"></td>
      <td><select id="h-${c.id}-${k}" data-act="hbeat" data-zone="${k}" aria-label="${name} heroic level">
        ${HEROIC.map((n, i) => `<option value="${i}"${Number(hb.get(k) || 0) === i ? " selected" : ""}>${n}</option>`).join("")}</select></td></tr>`).join("");

    const extra = [];
    lines.forEach((l, idx) => {
      const m = l.match(/^(\w+)\|(\d+)(\||$)/);
      if (m && Number(m[2]) === c.id && !CLASS_COVERED.has(m[1])) extra.push({ tag: m[1], rest: l.slice(m[1].length + m[2].length + 2), idx });
    });

    $("sheet").style.setProperty("--cls", c.color);
    $("sheet").innerHTML = `
      <div class="sheet-head">
        <h2><i></i>${c.name}${hasHero(c.id) ? "" : ' <span class="note">· no hero yet</span>'}</h2>
        <label class="marks" for="marks-${c.id}"><span class="eyebrow">Marks</span>
          <input type="number" id="marks-${c.id}" data-act="marks" min="0" step="1" value="${esc(marks)}"></label>
      </div>
      <section class="panel"><header><h3>Equipment</h3><span class="note">Choose a rarity to wear that piece, then its stars</span></header>
        <div class="gear">${ps.map((p) => gearRow(c, p, stars)).join("")}</div>
        ${ps.some((p) => p.inferred) ? '<p class="note">* Slot number derived from the game\'s slot list, not yet seen in a real save.</p>' : ""}
      </section>
      <section class="panel"><header><h3>Collection</h3>
        <div class="row"><button class="btn small" type="button" data-act="own-all">Own every piece</button>
        <button class="btn small" type="button" data-act="own-worn">Keep only worn</button></div></header>
        <div class="scroll"><table><thead><tr><th>Piece</th>${RARITY.map((n, i) => `<th class="q${i}">${n}</th>`).join("")}</tr></thead><tbody>${coll}</tbody></table></div>
      </section>
      <section class="panel"><header><h3>Zones</h3><span class="note">Setting a heroic level also marks the zone as beaten</span></header>
        <div class="scroll"><table class="zones"><thead><tr><th>Zone</th><th>Normal</th><th>Heroic</th></tr></thead><tbody>${zones}</tbody></table></div>
      </section>
      ${extra.length ? `<section class="panel"><header><h3>Other ${c.name} lines</h3><span class="note">Raw values</span></header>
        <div class="lines">${rawFields(extra, "xc")}</div></section>` : ""}`;
  }

  function renderAccount() {
    const st = S.kv(S.getAcc(lines, "stat"), "=");
    $("stat-fields").innerHTML = [...st].map(([k, v]) => `<label for="stat-${esc(k)}">${STATS[k] || esc(k)}
      <input type="number" id="stat-${esc(k)}" data-act="stat" data-key="${esc(k)}" min="0" value="${esc(v)}"></label>`).join("");
    const pk = S.kv(S.getAcc(lines, "perk"), ":");
    $("perk-fields").innerHTML = [...pk].map(([k, v]) => `<label for="perk-${esc(k)}">${PERKS[k] || esc(k)}
      <input type="number" id="perk-${esc(k)}" data-act="perk" data-key="${esc(k)}" min="0" value="${esc(v)}"></label>`).join("")
      || '<p class="note">No perks in this save.</p>';
    const extra = [];
    lines.forEach((l, idx) => {
      const m = l.match(/^(\w+)\|/);
      if (m && !/^\w+\|\d+(\||$)/.test(l) && !ACCOUNT_COVERED.has(m[1])) extra.push({ tag: m[1], rest: l.slice(m[1].length + 1), idx });
    });
    $("acc-lines").innerHTML = rawFields(extra, "xa");
  }

  function renderDiff() {
    const d = S.diff(orig, lines).filter(([t]) => t !== "=");
    const n = d.filter(([t]) => t === "+").length || d.length;
    $("diff").innerHTML = d.map(([t, l]) => `<div class="${t === "+" ? "a" : "d"}">${t === "+" ? "+ " : "− "}${esc(l)}</div>`).join("");
    const label = d.length ? `<b>${n}</b> changed line${n === 1 ? "" : "s"}` : "No changes";
    $("bar-count").innerHTML = label;
    $("diff-note").innerHTML = d.length ? label : "Nothing changed yet";
  }

  /* ---------- edits ---------- */
  const int = (v) => String(Math.max(0, Math.floor(Number(v) || 0)));
  function commit() { clearOutput(); renderAll(true); }
  function clearOutput() {
    sealed = "";
    $("out-text").value = "";
    $("copy-btn").disabled = true;
    $("save-btn").disabled = true;
    $("toast").textContent = "";
  }

  document.addEventListener("click", (e) => {
    const hero = e.target.closest(".hero-btn");
    if (hero) { cur = Number(hero.dataset.cls); renderRoster(); renderSheet(); return; }
    const act = e.target.dataset && e.target.dataset.act;
    if (act === "own-all") {
      const s = owned();
      pieces(byId(cur)).forEach((p) => RARITY.forEach((_, r) => s.add(S.itemId(cur, p.piece, r))));
      setOwned(s); commit();
    } else if (act === "own-worn") {
      const s = new Set([...owned()].filter((id) => S.itemParts(id).cls !== cur));
      equipOf(cur).forEach((id) => s.add(Number(id)));
      setOwned(s); commit();
    }
  });

  document.addEventListener("change", (e) => {
    const t = e.target, act = t.dataset && t.dataset.act;
    if (!act) return;
    switch (act) {
      case "marks": S.setCls(lines, "marks", cur, int(t.value)); break;
      case "gear": {
        const piece = Number(t.dataset.piece), r = Number(t.value), m = equipOf(cur);
        for (const [k, id] of [...m]) if (S.itemParts(Number(id)).piece === piece) m.delete(k);
        if (r >= 0) {
          const id = S.itemId(cur, piece, r);
          m.set(t.dataset.slot, String(id));
          const s = owned(); s.add(id); setOwned(s);
        }
        writeEquip(cur, m);
        break;
      }
      case "star": {
        if (!t.dataset.id) return;
        const m = starsMap(), v = Number(t.value);
        if (v) m.set(t.dataset.id, String(v)); else m.delete(t.dataset.id);
        S.setAcc(lines, "stars", S.unkv(m, ":"));
        break;
      }
      case "own": {
        const s = owned(), id = Number(t.dataset.id);
        if (t.checked) s.add(id); else s.delete(id);
        setOwned(s);
        break;
      }
      case "beat": {
        const s = beatOf(cur), z = t.dataset.zone;
        if (t.checked) s.add(z);
        else {
          s.delete(z);
          const h = hbeatOf(cur);
          if (h.delete(z)) S.setCls(lines, "hbeat", cur, S.unkv(h, ":"));
        }
        writeBeat(cur, s);
        break;
      }
      case "hbeat": {
        const h = hbeatOf(cur), z = t.dataset.zone, v = Number(t.value);
        if (v) h.set(z, String(v)); else h.delete(z);
        S.setCls(lines, "hbeat", cur, S.unkv(h, ":"));
        if (v) { const s = beatOf(cur); if (!s.has(z)) { s.add(z); writeBeat(cur, s); } }
        break;
      }
      case "stat": {
        const m = S.kv(S.getAcc(lines, "stat"), "=");
        m.set(t.dataset.key, int(t.value));
        S.setAcc(lines, "stat", S.unkv(m, "="));
        break;
      }
      case "perk": {
        const m = S.kv(S.getAcc(lines, "perk"), ":");
        m.set(t.dataset.key, int(t.value));
        S.setAcc(lines, "perk", S.unkv(m, ":"));
        break;
      }
      case "xc": S.setCls(lines, t.dataset.tag, cur, t.value.replace(/[\r\n]+/g, " ")); break;
      case "xa": S.setAcc(lines, t.dataset.tag, t.value.replace(/[\r\n]+/g, " ")); break;
      default: return;
    }
    commit();
  });

  let rawTimer;
  $("raw-text").addEventListener("input", () => {
    clearTimeout(rawTimer);
    rawTimer = setTimeout(() => { lines = S.parse($("raw-text").value); clearOutput(); renderAll(false); }, 300);
  });

  /* ---------- loading UI ---------- */
  $("load-btn").addEventListener("click", () => tryLoad($("load-text").value, "Pasted export"));
  $("load-text").addEventListener("paste", () => setTimeout(() => {
    if ($("load-text").value.trim().startsWith("RSE1:")) tryLoad($("load-text").value, "Pasted export");
  }, 0));
  async function loadFile(f) { if (f) tryLoad(await f.text(), f.name); }
  $("load-file").addEventListener("change", async (e) => { await loadFile(e.target.files && e.target.files[0]); e.target.value = ""; });
  $("example-btn").addEventListener("click", () => { load(EXAMPLE_SAVE, "Example save", true); showLoadError(""); });
  $("reset-btn").addEventListener("click", () => { lines = orig.slice(); commit(); });

  let dragDepth = 0;
  document.addEventListener("dragenter", (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { dragDepth++; document.body.classList.add("dragging"); } });
  document.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove("dragging"); } });
  document.addEventListener("dragover", (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) e.preventDefault(); });
  document.addEventListener("drop", (e) => {
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault(); dragDepth = 0; document.body.classList.remove("dragging");
    loadFile(e.dataTransfer.files[0]);
  });

  /* ---------- seal & export ---------- */
  function doSeal() {
    const plain = S.serialize(lines);
    sealed = RSE1.seal(plain);
    const ok = RSE1.unseal(sealed) === plain;
    $("out-text").value = sealed;
    $("copy-btn").disabled = !ok;
    $("save-btn").disabled = !ok;
    $("toast").textContent = ok ? "Sealed and verified." : "Verification failed. Do not import this export.";
  }
  const stamp = () => {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  };
  $("seal-btn").addEventListener("click", doSeal);
  $("bar-seal").addEventListener("click", () => {
    doSeal();
    $("export").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  });
  $("bar-raw").addEventListener("click", () => { $("raw-panel").open = true; $("raw-panel").scrollIntoView({ block: "start" }); });
  $("copy-btn").addEventListener("click", () => {
    navigator.clipboard.writeText(sealed).then(
      () => { $("toast").textContent = "Copied to the clipboard."; },
      () => { const ta = $("out-text"); ta.focus(); ta.select(); $("toast").textContent = "Text selected. Press Ctrl+C to copy."; });
  });
  $("save-btn").addEventListener("click", () => {
    if (!sealed) return;
    const url = URL.createObjectURL(new Blob([sealed], { type: "application/octet-stream" }));
    const a = document.createElement("a");
    a.href = url; a.download = `AzerothSurvivors ${stamp()} edited.sav`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    $("toast").textContent = "Saved. In the game: Options → Saves → pick the file.";
  });
  window.addEventListener("beforeunload", (e) => {
    if (S.diff(orig, lines).some(([t]) => t !== "=")) { e.preventDefault(); e.returnValue = ""; }
  });

  load(EXAMPLE_SAVE, "Example save", true);
})();
