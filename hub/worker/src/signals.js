// WC Trading Hub – Fremd-Ideen (v2.6)
// Liest öffentliche Telegram-Kanäle über die Web-Vorschau t.me/s/<kanal> (kein Bot, kein Login nötig),
// erkennt Trade-Ideen (Coin, Richtung, Einstieg, Ziele, Stopp) und schreibt sie auf PAPIER mit – mit echten Börsenkursen.
// Ziel: ehrliche Trefferquote je Gruppe, weil jeder Beitrag in dem Moment gespeichert wird, in dem er erscheint
// (später gelöschte Verlierer bleiben in der Statistik). Inhalte nur für Kevin – nicht an Partner/Community weiterleiten.
// Regeln (für alle Gruppen gleich): 50 % bei Ziel 1 + Stopp auf Einstand, 25 % bei Ziel 2 + Stopp auf Ziel 1, Rest bei Ziel 3.
// Liegen in einer Kerze Stopp und Ziel, zählt der Stopp (vorsichtig). Kosten 0,1 % pro Trade. Ohne Stopp kein R → nicht gewertet.

export const SRC = [
  { id: "bk", ch: "binancekillers_freesignal", name: "Binance Killers" },
  { id: "cx", ch: "ChainXl", name: "ChainX" },
];
const SP = { cost: 0.001, waitH: 48, maxDays: 21, perRun: 14, backPages: 4 };
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", Accept: "text/html,application/json" };
const d = (x) => (x == null ? "–" : x >= 100 ? x.toFixed(2) : x >= 1 ? x.toFixed(4) : x.toPrecision(4));

export async function sigSchema(env) {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_sig_post (src TEXT, pid INTEGER, t INTEGER, txt TEXT, kind TEXT, PRIMARY KEY (src, pid))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_spos (src TEXT, pid INTEGER, ref TEXT, sym TEXT, dir INTEGER, mkt INTEGER, lo REAL, hi REAL, tps TEXT, sl0 REAL, sl REAL, lev TEXT, t INTEGER, live INTEGER, status TEXT, e REAL, t_open INTEGER, last_t INTEGER, filled REAL DEFAULT 0, part REAL DEFAULT 0, hits INTEGER DEFAULT 0, tries INTEGER DEFAULT 0, ex TEXT, t_close INTEGER, px_close REAL, r REAL, pct REAL, why TEXT, PRIMARY KEY (src, pid))"),
  ]);
}

// ---------------------------------------------------------------- Telegram-Vorschau lesen
const ent = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
export function tgParse(html, ch) {
  const out = [];
  for (const blk of html.split('class="tgme_widget_message_wrap').slice(1)) {
    const id = blk.match(/data-post="([^"\/]+)\/(\d+)"/); if (!id) continue;
    const tm = blk.match(/<time[^>]*datetime="([^"]+)"/);
    const tx = blk.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const txt = tx ? ent(tx[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).trim() : "";
    out.push({ pid: +id[2], t: tm ? Math.floor(Date.parse(tm[1]) / 1000) : null, txt });
  }
  return out;
}
async function tgFetch(ch, before) {
  const r = await fetch(`https://t.me/s/${ch}${before ? "?before=" + before : ""}`, { headers: UA });
  if (!r.ok) throw new Error(`t.me/${ch} ${r.status}`);
  return tgParse(await r.text(), ch);
}

// ---------------------------------------------------------------- Beitrag → Trade-Idee
const NUM = /\d+(?:\.\d+)?/g;
function nums(s) {
  s = s.replace(/(\d),(\d{3})(?!\d)/g, "$1$2").replace(/(\d),(\d)/g, "$1.$2")
    .replace(/\b(?:tp|target|ziel|take[\s-]?profit)\s*\d{1,2}\s*[:).\-=]?/gi, " ")   // „TP1:“ → keine Zahl 1
    .replace(/(^|\s)\d{1,2}\s*[).]\s/g, " ")                                          // „1) “
    .replace(/\(?[+-]?\d+(?:\.\d+)?\s*%\)?/g, " ")                                    // Prozente
    .replace(/\b\d+\s*-\s*\d+\s*x\b|\b\d+(?:\.\d+)?\s*x\b/gi, " ");                    // Hebel
  return (s.match(NUM) || []).map(Number).filter((x) => x > 0);
}
export function parseIdea(txt) {
  const T = txt.replace(/[–—−]/g, "-").replace(/[ ]/g, " ");
  const cm = T.match(/[$#]?\b([A-Z0-9]{2,15})\s*\/\s*USDT\b/i) || T.match(/\bCOIN\s*:\s*[$#]?([A-Z0-9]{2,15})\b/i) || T.match(/\$([A-Z][A-Z0-9]{1,14})\b/);
  if (!cm) return null;
  const sym = cm[1].toUpperCase();
  const dm = T.match(/\b(long|short)\b/i) || T.match(/direction\s*:\s*(buy|sell)\b/i);
  if (!dm) return null;
  const dir = /long|buy/i.test(dm[1]) ? 1 : -1;
  const LAB = [["e", /\b(?:entry|entries|entry zone|buy zone|einstieg)\b/gi], ["t", /\b(?:targets?|take[\s-]?profits?|tp\d?)\b/gi], ["s", /\b(?:stop[\s-]?loss|stoploss|stop|sl)\b/gi]];
  const hits = [];
  for (const [k, re] of LAB) for (const m of T.matchAll(re)) hits.push({ k, i: m.index, end: m.index + m[0].length });
  hits.sort((a, b) => a.i - b.i);
  const sec = {};
  for (let i = 0; i < hits.length; i++) { const h = hits[i]; if (sec[h.k] != null && h.k !== "t") continue; const part = T.slice(h.end, i + 1 < hits.length ? hits[i + 1].i : h.end + 300); sec[h.k] = sec[h.k] != null ? sec[h.k] + "\n" + part : part; }   // mehrere „TP1/TP2…“-Zeilen zusammenführen
  if (sec.s == null || sec.t == null) return { sym, dir, bad: "kein Stopp oder keine Ziele" };
  const mkt = sec.e != null ? /market|cmp|now|current/i.test(sec.e.split("\n").slice(0, 2).join(" ")) : /entry\s*:\s*market/i.test(T);
  const en = sec.e != null && !mkt ? nums(sec.e.split("\n").slice(0, 3).join(" ")).slice(0, 2) : [];
  const sl = nums(sec.s.split("\n")[0] + " " + (sec.s.split("\n")[1] || ""))[0];
  let tps = nums(sec.t);
  if (!sl || (!mkt && !en.length) || !tps.length) return { sym, dir, bad: "Zahlen unvollständig" };
  const lo = en.length ? Math.min(...en) : null, hi = en.length ? Math.max(...en) : null, ref = en.length ? (lo + hi) / 2 : null;
  tps = [...new Set(tps)].filter((x) => (ref == null ? (dir > 0 ? x > sl : x < sl) : dir > 0 ? x > ref : x < ref) && x / (ref || sl) < 20 && x / (ref || sl) > 0.05).sort((a, b) => dir * (a - b));
  if (!tps.length) return { sym, dir, bad: "Ziele passen nicht zur Richtung" };
  if (ref != null && (dir > 0 ? !(sl < lo) : !(sl > hi))) return { sym, dir, bad: "Stopp liegt auf der falschen Seite" };
  if (ref == null && (dir > 0 ? !(sl < tps[0]) : !(sl > tps[0]))) return { sym, dir, bad: "Stopp/Ziel widersprüchlich" };
  const idm = T.match(/(?:signal\s*id|id)\s*:?\s*#?(\d{2,7})/i);
  const lev = (T.match(/\(?\s*(\d+\s*-\s*\d+\s*x|\d+\s*x)\s*\)?/i) || [])[1] || "";
  return { sym, dir, mkt: mkt ? 1 : 0, lo, hi, tps: tps.slice(0, 10), sl, ref: idm ? idm[1] : null, lev: lev.replace(/\s/g, "") };
}

// ---------------------------------------------------------------- Kurse (Perpetual-Futures, 5-Min.- bzw. 1-Std.-Kerzen)
async function klines(sym, fromMs, iv) {   // → { ex, C: [{t,o,h,l,c}] aufsteigend, nur abgeschlossene Kerzen }
  const ms = iv === "1h" ? 3600e3 : 300e3, now = Date.now(), errs = [];
  const done = (ex, C) => ({ ex, C: C.filter((k) => k.t >= fromMs - ms && k.t + ms <= now).sort((a, b) => a.t - b.t) });
  const SK = (klines.skip ||= new Set());   // Börse, die von Cloudflare aus gesperrt ist (z. B. 451/403), im selben Lauf nicht nochmal fragen
  if (!SK.has("Binance")) try {
    const r = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}USDT&interval=${iv}&startTime=${fromMs}&limit=1000`, { headers: UA });
    if (r.ok) return done("Binance", (await r.json()).map((k) => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4] })));
    errs.push("Binance " + r.status); if (r.status === 451 || r.status === 403) SK.add("Binance");
  } catch (e) { errs.push("Binance " + e.message); }
  if (!SK.has("Bybit")) try {
    const r = await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${sym}USDT&interval=${iv === "1h" ? 60 : 5}&start=${fromMs}&limit=1000`, { headers: UA });
    if (r.ok) { const J = await r.json(); if (J.retCode === 0 && J.result?.list?.length) return done("Bybit", J.result.list.map((k) => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4] }))); errs.push("Bybit " + (J.retMsg || "leer")); }
    else { errs.push("Bybit " + r.status); if (r.status === 451 || r.status === 403) SK.add("Bybit"); }
  } catch (e) { errs.push("Bybit " + e.message); }
  try {   // OKX: höchstens 100 Kerzen je Abruf – ab Startzeit vorwärts über „before“
    const r = await fetch(`https://www.okx.com/api/v5/market/history-candles?instId=${sym}-USDT-SWAP&bar=${iv === "1h" ? "1H" : "5m"}&before=${fromMs - 1}&limit=100`, { headers: UA });
    if (r.ok) { const J = await r.json(); if (J.data?.length) return done("OKX", J.data.map((k) => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4] }))); errs.push("OKX leer"); }
    else errs.push("OKX " + r.status);
  } catch (e) { errs.push("OKX " + e.message); }
  throw new Error(errs.join(", "));
}

// ---------------------------------------------------------------- Papier-Verwaltung einer Idee
const PLAN = (n) => (n >= 3 ? [0.5, 0.25, 0.25] : n === 2 ? [0.5, 0.5] : [1]);
export function step(p, C, nowS) {   // verarbeitet Kerzen der Reihe nach; verändert p; gibt Text bei Abschluss zurück
  const tps = JSON.parse(p.tps), plan = PLAN(tps.length), dir = p.dir;
  for (const k of C) {
    const ts = Math.floor(k.t / 1000);
    if (p.status === "wait") {
      if (ts - p.t > SP.waitH * 3600) { p.status = "expired"; p.why = "Einstieg nie erreicht (48 Std.)"; p.t_close = ts; return null; }
      let fill = null;
      if (p.mkt) fill = k.o;
      else if (dir > 0 ? k.l <= p.hi : k.h >= p.lo) fill = dir > 0 ? Math.min(k.o, p.hi) : Math.max(k.o, p.lo);
      if (fill == null) { if (dir > 0 ? k.h >= tps[0] : k.l <= tps[0]) { p.status = "missed"; p.why = "Ziel 1 vor dem Einstieg erreicht – verpasst"; p.t_close = ts; return null; } p.last_t = k.t; continue; }
      if (dir > 0 ? fill <= p.sl : fill >= p.sl) { p.status = "missed"; p.why = "Kurs schon unter/über dem Stopp"; p.t_close = ts; return null; }
      Object.assign(p, { status: "open", e: fill, t_open: ts });
      if (dir > 0 ? k.l <= p.sl : k.h >= p.sl) return close(p, p.sl, ts, "Stopp in der Einstiegskerze");
      p.last_t = k.t; continue;
    }
    if (p.status !== "open") return null;
    const R = Math.abs(p.e - p.sl0);
    if (dir > 0 ? k.l <= p.sl : k.h >= p.sl) return close(p, p.sl, ts, p.hits ? `Stopp nach Ziel ${p.hits} (${p.hits === 1 ? "Einstand" : "Ziel " + (p.hits - 1)})` : "Stopp");
    while (p.hits < plan.length && (dir > 0 ? k.h >= tps[p.hits] : k.l <= tps[p.hits])) {
      const w = plan[p.hits], px = tps[p.hits];
      p.part += w * dir * (px - p.e) / R; p.filled += w; p.hits++;
      if (p.filled >= 0.999) return close(p, px, ts, `alle Ziele (${p.hits}) erreicht`);
      p.sl = p.hits === 1 ? p.e : tps[p.hits - 2];
    }
    p.last_t = k.t;
    if (ts - p.t_open > SP.maxDays * 86400) return close(p, k.c, ts, `Zeitlimit ${SP.maxDays} Tage`);
  }
  return null;
}
function close(p, px, ts, why) {
  const R = Math.abs(p.e - p.sl0), rest = 1 - p.filled;
  p.r = p.part + rest * p.dir * (px - p.e) / R - (SP.cost * p.e) / R;
  p.pct = (p.r * R / p.e) * 100;   // ohne Hebel
  Object.assign(p, { status: "closed", t_close: ts, px_close: px, why, filled: 1 });
  return p;
}

// ---------------------------------------------------------------- Lauf (alle 5 Minuten)
export async function sigTick(env, say, kvGet, kvPut) {
  await sigSchema(env);
  const log = [], nowS = Math.floor(Date.now() / 1000);
  for (const S of SRC) {
    try {
      const known = (await env.DB.prepare("SELECT MAX(pid) m, COUNT(*) n FROM hub_sig_post WHERE src = ?").bind(S.id).first()) || {};
      let posts = await tgFetch(S.ch);
      const first = !known.n;
      if (first) {   // erster Lauf: einige Seiten zurück, damit gleich eine Statistik entsteht (mit Kursverlauf ab dem Zeitpunkt des Beitrags)
        let b = Math.min(...posts.map((x) => x.pid));
        for (let i = 0; i < SP.backPages && isFinite(b); i++) { const P = await tgFetch(S.ch, b).catch(() => []); if (!P.length) break; posts = [...P, ...posts]; b = Math.min(...P.map((x) => x.pid)); }
      }
      const fresh = posts.filter((x) => x.pid > (known.m || 0) && x.t);
      let ideas = 0, bad = 0;
      for (const x of fresh.sort((a, b) => a.pid - b.pid)) {
        const I = x.txt ? parseIdea(x.txt) : null;
        const kind = !I ? "other" : I.bad ? "bad" : "idea";
        await env.DB.prepare("INSERT OR IGNORE INTO hub_sig_post (src, pid, t, txt, kind) VALUES (?, ?, ?, ?, ?)").bind(S.id, x.pid, x.t, (x.txt || "").slice(0, 1500), kind + (I?.bad ? ": " + I.bad : "")).run();
        if (kind !== "idea") { if (kind === "bad") bad++; continue; }
        if (I.ref && (await env.DB.prepare("SELECT 1 FROM hub_spos WHERE src = ? AND ref = ?").bind(S.id, I.ref).first())) continue;   // Nachtrag zur selben Idee
        const live = first ? 0 : 1;
        await env.DB.prepare("INSERT OR IGNORE INTO hub_spos (src, pid, ref, sym, dir, mkt, lo, hi, tps, sl0, sl, lev, t, live, status, last_t) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'wait', ?)")
          .bind(S.id, x.pid, I.ref, I.sym, I.dir, I.mkt, I.lo, I.hi, JSON.stringify(I.tps), I.sl, I.sl, I.lev, x.t, live, x.t * 1000).run();
        ideas++;
        if (live) await say(env, `📥 Fremd-Idee ${S.name}: ${I.sym} ${I.dir > 0 ? "Long" : "Short"}${I.lev ? " (" + I.lev + ")" : ""}\nEinstieg ${I.mkt ? "sofort (Markt)" : d(I.lo) + (I.hi !== I.lo ? " – " + d(I.hi) : "")} · Ziele ${I.tps.slice(0, 3).map(d).join(" / ")}${I.tps.length > 3 ? " …" : ""} · Stopp ${d(I.sl)}\nWird auf Papier mitgeschrieben (nur für dich – nicht weiterleiten, keine Anlageberatung).`);
      }
      log.push(`${S.name}: ${fresh.length} neu, ${ideas} Ideen${bad ? ", " + bad + " unvollständig" : ""}`);
    } catch (e) { log.push(`${S.name}: ${e.message}`); }
  }
  // offene/wartende Ideen mit Kursen fortschreiben
  klines.skip = new Set();
  const P = (await env.DB.prepare("SELECT * FROM hub_spos WHERE status IN ('wait','open') ORDER BY last_t ASC LIMIT ?").bind(SP.perRun).all()).results;
  let closed = 0, nod = 0;
  for (const p of P) {
    const behind = Date.now() - p.last_t, iv = behind > 2 * 86400e3 ? "1h" : "5m";
    let K;
    try { K = await klines(p.sym, p.last_t, iv); }
    catch (e) {
      p.tries++; if (p.tries >= 6) { p.status = "nodata"; p.why = "keine Futures-Kurse gefunden (" + e.message.slice(0, 80) + ")"; p.t_close = nowS; }
      await env.DB.prepare("UPDATE hub_spos SET tries = ?, status = ?, why = ?, t_close = ? WHERE src = ? AND pid = ?").bind(p.tries, p.status, p.why || null, p.t_close || null, p.src, p.pid).run(); nod++; continue;
    }
    p.ex = K.ex;
    const before = p.status, res = step(p, K.C, nowS);
    await env.DB.prepare("UPDATE hub_spos SET status=?, e=?, t_open=?, last_t=?, filled=?, part=?, hits=?, sl=?, ex=?, t_close=?, px_close=?, r=?, pct=?, why=?, tries=0 WHERE src=? AND pid=?")
      .bind(p.status, p.e, p.t_open, p.last_t, p.filled, p.part, p.hits, p.sl, p.ex, p.t_close, p.px_close, p.r, p.pct, p.why, p.src, p.pid).run();
    const nm = (SRC.find((s) => s.id === p.src) || {}).name || p.src;
    if (p.live && before === "wait" && p.status === "open" && !res) await say(env, `📥 ${nm}: ${p.sym} ${p.dir > 0 ? "Long" : "Short"} auf Papier eröffnet @ ${d(p.e)} (${p.ex})`);
    if (res) { closed++; if (p.live) await say(env, `📥 ${nm}: ${p.sym} ${p.dir > 0 ? "Long" : "Short"} beendet – ${p.why} · ${p.r >= 0 ? "+" : ""}${p.r.toFixed(2)}R (${p.pct >= 0 ? "+" : ""}${p.pct.toFixed(1)} % ohne Hebel) (Papier)`); }
  }
  const msg = log.join(" | ") + ` | Papier: ${P.length} geprüft, ${closed} beendet${nod ? ", " + nod + " ohne Kurs" : ""}`;
  try { await kvPut(env, "log_sig", new Date().toISOString() + " " + msg.slice(0, 900)); } catch (e) {}
  return msg;
}

// ---------------------------------------------------------------- Auswertung + Seite
export async function sigData(env) {
  await sigSchema(env);
  const A = (await env.DB.prepare("SELECT * FROM hub_spos ORDER BY t DESC LIMIT 400").all()).results;
  const pc = (await env.DB.prepare("SELECT src, kind, COUNT(*) n FROM hub_sig_post GROUP BY src, kind").all()).results;
  const stats = SRC.map((S) => {
    const L = A.filter((p) => p.src === S.id), C = L.filter((p) => p.status === "closed");
    const W = C.filter((p) => p.r > 0), gw = W.reduce((s, p) => s + p.r, 0), gl = -C.filter((p) => p.r <= 0).reduce((s, p) => s + p.r, 0);
    const posts = pc.filter((x) => x.src === S.id).reduce((s, x) => s + x.n, 0);
    return { id: S.id, name: S.name, ch: S.ch, posts, ideas: L.length, open: L.filter((p) => p.status === "open").length, wait: L.filter((p) => p.status === "wait").length,
      missed: L.filter((p) => p.status === "missed" || p.status === "expired").length, nodata: L.filter((p) => p.status === "nodata").length,
      closed: C.length, win: C.length ? W.length / C.length : null, sumR: C.reduce((s, p) => s + p.r, 0), avgR: C.length ? C.reduce((s, p) => s + p.r, 0) / C.length : null,
      pf: gl > 0 ? gw / gl : null, tp1: C.length ? C.filter((p) => p.hits >= 1).length / C.length : null, liveClosed: C.filter((p) => p.live).length };
  });
  return { stats, rows: A.slice(0, 150), log: await env.DB.prepare("SELECT v FROM hub_kv WHERE k = 'log_sig'").first().then((r) => r?.v || "").catch(() => "") };
}
export async function sigPage(env) {
  const D = await sigData(env);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const f = (x, n = 2) => (x == null ? "–" : (x >= 0 ? "+" : "") + x.toFixed(n));
  const pct = (x) => (x == null ? "–" : Math.round(x * 100) + " %");
  const st = { wait: "wartet auf Einstieg", open: "offen", closed: "beendet", missed: "verpasst", expired: "verfallen", nodata: "kein Kurs" };
  const dt = (t) => (t ? new Date(t * 1000).toLocaleString("de-DE", { timeZone: "Europe/Bucharest", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "–");
  return `<!doctype html><html lang=de><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Fremd-Ideen · WC Hub</title><style>
:root{--bg:#0b0b0d;--card:#141418;--line:#26262c;--tx:#e8e8ea;--mu:#9a9aa3;--au:#e8b54a;--up:#3ecf8e;--dn:#ff6b6b}
body{margin:0;background:var(--bg);color:var(--tx);font:14px/1.45 system-ui,sans-serif;padding:16px;max-width:1200px;margin:auto}
h1{font-size:20px;color:var(--au);margin:4px 0 4px}.mu{color:var(--mu);font-size:12.5px}
.g{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin:14px 0}.c{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}
.c h2{margin:0 0 8px;font-size:16px}.k{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}.k div{background:#0f0f12;border-radius:8px;padding:8px}.k b{display:block;font-size:17px}.k span{font-size:11.5px;color:var(--mu)}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}th{color:var(--mu);font-weight:500}td:nth-child(-n+4),th:nth-child(-n+4){text-align:left}
.pos{color:var(--up)}.neg{color:var(--dn)}a{color:var(--au)}</style></head><body>
<h1>📥 Fremd-Ideen · Papier-Prüfung</h1>
<div class=mu>Liest die öffentlichen Kanäle alle 5 Minuten und handelt jede erkannte Idee auf Papier mit echten Futures-Kursen – nach festen, gleichen Regeln: 50 % bei Ziel 1 und Stopp auf Einstand, 25 % bei Ziel 2, Rest bei Ziel 3. Ergebnis in R (1R = Abstand Einstieg–Stopp), Prozent ohne Hebel. Nur für dich – nicht weiterleiten. Keine Anlageberatung.</div>
<div class=g>${D.stats.map((s) => `<div class=c><h2>${esc(s.name)} <a class=mu href="https://t.me/s/${esc(s.ch)}" target=_blank rel=noopener>t.me/${esc(s.ch)}</a></h2>
<div class=k><div><b>${s.closed}</b><span>beendet (${s.liveClosed} live)</span></div><div><b>${pct(s.win)}</b><span>im Plus</span></div><div><b class="${(s.avgR || 0) >= 0 ? "pos" : "neg"}">${f(s.avgR)}R</b><span>Ø je Idee</span></div>
<div><b class="${s.sumR >= 0 ? "pos" : "neg"}">${f(s.sumR, 1)}R</b><span>Summe</span></div><div><b>${s.pf == null ? "–" : s.pf.toFixed(2)}</b><span>Gewinnfaktor</span></div><div><b>${pct(s.tp1)}</b><span>Ziel 1 erreicht</span></div></div>
<div class=mu style="margin-top:8px">${s.posts} Beiträge gelesen · ${s.ideas} Ideen · ${s.open} offen · ${s.wait} warten · ${s.missed} verpasst/verfallen${s.nodata ? " · " + s.nodata + " ohne Kurs" : ""}</div></div>`).join("")}</div>
<div class="c tw"><table><thead><tr><th>Beitrag</th><th>Gruppe</th><th>Coin</th><th>Status</th><th>Einstieg</th><th>Stopp</th><th>Ziele erreicht</th><th>Ergebnis</th><th>% o. Hebel</th></tr></thead><tbody>
${D.rows.map((p) => `<tr><td>${dt(p.t)}</td><td>${esc((SRC.find((s) => s.id === p.src) || {}).name)}${p.live ? "" : ' <span class=mu title="vor dem Start eingelesen – Verlierer könnten gelöscht worden sein">(rückwirkend)</span>'}</td><td><a href="https://t.me/${esc((SRC.find((s) => s.id === p.src) || {}).ch)}/${p.pid}" target=_blank rel=noopener>${esc(p.sym)}</a> ${p.dir > 0 ? "Long" : "Short"}</td><td title="${esc(p.why || "")}">${esc(st[p.status] || p.status)}${p.why && p.status !== "open" ? " · " + esc(p.why) : ""}</td><td>${p.e != null ? d(p.e) : p.mkt ? "Markt" : d(p.lo) + "–" + d(p.hi)}</td><td>${d(p.sl0)}</td><td>${p.hits}/${Math.min(3, JSON.parse(p.tps).length)}</td><td class="${(p.r || 0) >= 0 ? "pos" : "neg"}">${p.r == null ? (p.status === "open" ? f(p.part) + "R real." : "–") : f(p.r) + "R"}</td><td>${p.pct == null ? "–" : f(p.pct, 1) + " %"}</td></tr>`).join("") || "<tr><td colspan=9>Noch nichts eingelesen.</td></tr>"}
</tbody></table></div><p class=mu>Letzter Lauf: ${esc(D.log)}</p></body></html>`;
}
