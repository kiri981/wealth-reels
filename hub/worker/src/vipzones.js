// WC Trading Hub – VIP-Zonen (v3.1, Kevin 17.11.): liest die Beiträge aus der VIP-Gruppe (vom Bot in D1 „vipfeed“ gespeichert)
// und macht daraus einen Zonen-Verlauf: Zone angekündigt → erreicht → Ablehnung → CHoCH/aktiv → Ziel / gebrochen.
// Danach prüft der Hub mit echten Gold-Kursen (5 Min.): Wurde die Zone erreicht? Hielt sie? Wie weit lief der Preis in die erwartete Richtung,
// bevor sie brach? Welche Ziele wurden erreicht? Daraus entsteht eine Trefferquote je Zonenart (OB/FVG, Zeitebene, Kauf/Verkauf).
// Nur Auswertung – kein Handel, keine Anlageberatung.
const NUM = "(\\d{3,5}(?:[.,]\\d{1,2})?)";
const num = (s) => +String(s).replace(",", ".");
const RX = {
  zone: new RegExp(`(short|verkauf|sell|long|kauf|buy)[\\w-]*[- ]?zone[^\\d\\n]{0,40}?${NUM}\\s*[–-]\\s*${NUM}`, "i"),
  tf: /\b(OB|FVG|Orderblock|Order Block|Supply|Demand)\s*(\d+\s?(?:m|h|min|H|M))\b/i,
  tf2: /\b(\d+\s?(?:m|h))\s*(OB|FVG)\b/i,
  targets: /Ziele?\s*:?\s*([\d.,\s·|/]+)/i,
  sl: /SL\s*(über|ueber|unter|above|below)?\s*:?\s*(\d{3,5}(?:[.,]\d+)?)/i,
  next: new RegExp(`(OB|FVG)\\s*(\\d+\\s?[mh])\\s*${NUM}\\s*[–-]\\s*${NUM}`, "gi"),
};
const EV = [
  ["broken", /(gebrochen|ungültig|ungueltig|invalid)/i],
  ["target", /(ziel\s*\d?\s*erreicht|tp\s*\d?\s*(erreicht|hit)|🎯)/i],
  ["active", /(choch[^.\n]{0,40}\b(bestätigt|bestaetigt|ist da|kam|gebildet)\b|setup (ist )?aktiv\b|✅\s*einstieg|einstieg (jetzt|aktiv))/i],
  ["reject", /(ablehnung)/i],
  ["reached", /(zone erreicht)/i],
  ["near", /(nähert sich|naehert sich|erinnerung)/i],
];

async function schema(env) {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_vipzone (id TEXT PRIMARY KEY, t INTEGER, side INTEGER, lo REAL, hi REAL, kind TEXT, tf TEXT, targets TEXT, sl REAL, src INTEGER, events TEXT, ev TEXT, done INTEGER DEFAULT 0)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_vipidea (id INTEGER PRIMARY KEY, t INTEGER, dr INTEGER, lo REAL, hi REAL, sl REAL, tps TEXT, msg_id INTEGER, chat TEXT, events TEXT, ev TEXT, done INTEGER DEFAULT 0, mkt INTEGER DEFAULT 0)"),
  ]);
}
function parseZones(text) {   // alle Zonen in einem Beitrag (Hauptzone + „nächste Zonen“)
  const out = []; const t = text || "";
  const m = t.match(RX.zone);
  if (m) {
    let lo = num(m[2]), hi = num(m[3]); if (lo > hi) [lo, hi] = [hi, lo];
    const side = /short|verkauf|sell/i.test(m[1]) ? -1 : 1;
    const k = t.match(RX.tf) || t.match(RX.tf2); let kind = null, tf = null;
    if (k) { if (/^\d/.test(k[1])) { tf = k[1]; kind = k[2]; } else { kind = k[1]; tf = k[2]; } }
    const tg = t.match(RX.targets); const targets = tg ? (tg[1].match(/\d{3,5}(?:[.,]\d+)?/g) || []).map(num).filter((x) => Math.abs(x - lo) < 300) : [];
    const sl = t.match(RX.sl);
    out.push({ side, lo, hi, kind: kind ? kind.toUpperCase().replace("ORDERBLOCK", "OB").replace("ORDER BLOCK", "OB") : null, tf: tf ? tf.replace(/\s/g, "").toLowerCase() : null, targets, sl: sl ? num(sl[2]) : null, main: true });
  }
  if (/(nächste|naechste|darüber|darunter|frische (supply|demand))/i.test(t)) {
    const side = /supply|darüber|verkauf|short/i.test(t) ? -1 : /demand|darunter|kauf|long/i.test(t) ? 1 : 0;
    for (const x of t.matchAll(RX.next)) {
      let lo = num(x[3]), hi = num(x[4]); if (lo > hi) [lo, hi] = [hi, lo];
      if (out.some((z) => Math.abs(z.lo - lo) < 0.5 && Math.abs(z.hi - hi) < 0.5)) continue;
      if (side) out.push({ side, lo, hi, kind: x[1].toUpperCase(), tf: x[2].replace(/\s/g, "").toLowerCase(), targets: [], sl: null, main: false });
    }
  }
  return out;
}
function zoneOf(text) {   // auf welche Zone bezieht sich ein Status-Beitrag?
  const m = String(text || "").match(new RegExp(`${NUM}\\s*[–-]\\s*${NUM}`)); if (!m) return null;
  let lo = num(m[1]), hi = num(m[2]); if (lo > hi) [lo, hi] = [hi, lo]; return { lo, hi };
}

// v3.1 Papier-Trades je Zone (Kevin 17.11.):
//   A „wie angesagt“: Einstieg erst beim Beitrag „CHoCH/aktiv“ (Schlusskurs der 5-Min.-Kerze danach), SL wie angegeben (sonst 1 $ hinter der Zone),
//     je ein Drittel an Ziel 1/2/3 (ohne Ziele: alles bei 2 R), nach Ziel 1 Stopp auf Einstand; spätestens nach 24 Std. raus.
//   B „mechanisch“: Einstieg sofort bei der ersten Zonenberührung (Zonenrand), SL wie A, ganzes Ziel 1 (ohne Ziele: 1,5 R); 24 Std.
const COST = 0.35;   // Gold: Spread + Schlupf in $
function sim(C, i0, dr, e, sl, tps, parts, maxSec) {
  const R = Math.abs(e - sl); if (!(R > 0)) return null;
  let left = 1, real = 0, stop = sl, hit = 0; const t0 = C[i0].t;
  for (let i = i0 + 1; i < C.length; i++) {
    const k = C[i];
    if ((dr > 0 && k.l <= stop) || (dr < 0 && k.h >= stop)) { real += left * dr * (stop - e) / R; return { r: real - COST / R, why: hit ? "Rest auf Einstand/Stopp" : "SL", tx: k.t, open: false }; }
    while (hit < tps.length && ((dr > 0 && k.h >= tps[hit]) || (dr < 0 && k.l <= tps[hit]))) {
      const part = parts[hit]; real += part * dr * (tps[hit] - e) / R; left -= part; hit++;
      if (hit === 1) stop = e;   // nach Ziel 1: Einstand
      if (left <= 1e-9) return { r: real - COST / R, why: `Ziel ${hit}`, tx: k.t, open: false };
    }
    if (k.t - t0 >= maxSec) { real += left * dr * (k.c - e) / R; return { r: real - COST / R, why: "Zeit (24 Std.)", tx: k.t, open: false }; }
  }
  const last = C[C.length - 1]; return { r: real + left * dr * (last.c - e) / R - COST / R, why: "offen", tx: last.t, open: true };
}
function zoneTrades(z, C) {
  const dr = z.side < 0 ? -1 : 1, near = dr < 0 ? z.lo : z.hi, far = dr < 0 ? z.hi : z.lo;
  const sl = z.sl ?? far - dr * 1, T = (z.targets || []).filter((x) => (x - near) * dr > 0).sort((a, b) => (a - b) * dr);
  const out = {};
  const act = (JSON.parse(z.events || "[]").find((x) => x[0] === "active") || [])[1];
  if (act) {
    const i0 = C.findIndex((k) => k.t >= act);
    if (i0 >= 0) { const e = C[i0].c; const R = Math.abs(e - sl);
      const tps = T.length ? T.slice(0, 3) : [e + dr * 2 * R]; const parts = tps.length === 3 ? [1 / 3, 1 / 3, 1 / 3] : tps.length === 2 ? [0.5, 0.5] : [1];
      const r = (e - sl) * dr > 0 ? sim(C, i0, dr, e, sl, tps, parts, 86400) : null;
      if (r) out.A = { t: C[i0].t, dr, e, sl, tp: tps.at(-1), ...r }; }
  }
  const i1 = C.findIndex((k) => k.t >= z.t && ((dr < 0 && k.h >= near) || (dr > 0 && k.l <= near)));
  if (i1 >= 0 && (near - sl) * dr > 0) {
    const R = Math.abs(near - sl), tp = T.length ? T[0] : near + dr * 1.5 * R;
    const k = C[i1]; let r;
    if ((dr < 0 && k.h >= sl) || (dr > 0 && k.l <= sl)) r = { r: -1 - COST / R, why: "SL (gleiche Kerze)", tx: k.t, open: false };
    else r = sim(C, i1, dr, near, sl, [tp], [1], 86400);
    if (r) out.B = { t: k.t, dr, e: near, sl, tp, ...r };
  }
  return out;
}
export async function vzTradesAll(env) {   // für die Papier-Engine: Trades je Variante
  const Z = (await env.DB.prepare("SELECT ev FROM hub_vipzone WHERE ev IS NOT NULL").all().catch(() => ({ results: [] }))).results || [];
  const out = { A: [], B: [] };
  for (const z of Z) { const e = JSON.parse(z.ev); for (const v of ["A", "B"]) if (e.tr?.[v]) out[v].push(e.tr[v]); }
  for (const v of ["A", "B"]) out[v].sort((a, b) => a.t - b.t);
  out.K = await viTradesAll(env).catch(() => []);   // v3.2 Kevins echte Trade-Ideen
  return out;
}

// Auswertung einer Zone mit 5-Min.-Goldkursen ab Ankündigung (max. 3 Tage)
function evaluate(z, C) {
  const side = z.side, far = side < 0 ? z.hi : z.lo, near = side < 0 ? z.lo : z.hi;
  const bad = z.sl ?? (side < 0 ? z.hi + 2 : z.lo - 2);
  let touched = null, broken = null, mfe = 0, hits = [];
  for (const k of C) {
    if (k.t < z.t) continue;
    if (k.t > z.t + 3 * 86400) break;
    if (touched == null) { if ((side < 0 && k.h >= near) || (side > 0 && k.l <= near)) touched = k.t; else continue; }
    if ((side < 0 && k.c > bad) || (side > 0 && k.c < bad)) { broken = k.t; break; }
    const move = side < 0 ? near - k.l : k.h - near; mfe = Math.max(mfe, move);
    for (const [i, tp] of (z.targets || []).entries()) if (!hits.includes(i) && ((side < 0 && k.l <= tp) || (side > 0 && k.h >= tp))) hits.push(i);
  }
  const res = !touched ? "nicht erreicht" : hits.length ? `Ziel ${Math.max(...hits) + 1} erreicht` : broken ? "gebrochen" : "offen";
  return { touched, broken, mfe: Math.round(mfe * 100) / 100, hits: hits.length, res, held: touched ? (mfe >= 5 ? 1 : 0) : null };
}

export async function vzTick(env, say, kvGet, kvPut) {
  await schema(env);
  const has = await env.DB.prepare("SELECT name FROM sqlite_master WHERE name = 'vipfeed'").first(); if (!has) return "VIP-Zonen: noch keine Beiträge (Bot v3.34)";
  const last = +((await kvGet(env, "vz_last")) || 0);
  const R = (await env.DB.prepare("SELECT id, t, text FROM vipfeed WHERE id > ? AND text IS NOT NULL AND text != '' ORDER BY id LIMIT 200").bind(last).all()).results;
  let nz = 0, ne = 0;
  for (const r of R) {
    for (const z of parseZones(r.text)) {
      const id = `${Math.round(z.lo)}-${Math.round(z.hi)}-${z.side}-${Math.floor(r.t / 86400)}`;
      const ins = await env.DB.prepare("INSERT OR IGNORE INTO hub_vipzone (id, t, side, lo, hi, kind, tf, targets, sl, src, events) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]')")
        .bind(id, r.t, z.side, z.lo, z.hi, z.kind, z.tf, JSON.stringify(z.targets), z.sl, r.id).run();
      if (ins.meta?.changes) nz++;
      else if (z.main && (z.targets.length || z.sl)) await env.DB.prepare("UPDATE hub_vipzone SET targets = ?, sl = COALESCE(?, sl) WHERE id = ?").bind(JSON.stringify(z.targets), z.sl, id).run();
    }
    const ev = EV.find(([, rx]) => rx.test(r.text)); const zr = zoneOf(r.text);
    if (ev && zr) {
      const z = await env.DB.prepare("SELECT id, events FROM hub_vipzone WHERE ABS(lo - ?) < 1 AND ABS(hi - ?) < 1 AND t <= ? ORDER BY t DESC LIMIT 1").bind(zr.lo, zr.hi, r.t + 60).first();
      if (z) { const E = JSON.parse(z.events || "[]"); E.push([ev[0], r.t]); await env.DB.prepare("UPDATE hub_vipzone SET events = ? WHERE id = ?").bind(JSON.stringify(E), z.id).run(); ne++; }
    }
  }
  if (R.length) await kvPut(env, "vz_last", String(R[R.length - 1].id));
  // Auswertung mit Goldkursen
  const Z = (await env.DB.prepare("SELECT * FROM hub_vipzone WHERE done = 0").all()).results;
  if (Z.length) {
    const minT = Math.min(...Z.map((z) => z.t));
    const C = (await env.DB.prepare("SELECT t, o, h, l, c FROM hub_candles WHERE tf = '5m' AND t >= ? ORDER BY t").bind(minT - 600).all()).results;
    const now = Math.floor(Date.now() / 1000);
    for (const z of Z) {
      const e = evaluate({ ...z, targets: JSON.parse(z.targets || "[]") }, C);
      e.tr = zoneTrades({ ...z, targets: JSON.parse(z.targets || "[]") }, C.filter((k) => k.t >= z.t - 300));
      const tradesOpen = Object.values(e.tr || {}).some((x) => x.open);
      const done = !tradesOpen && (e.broken || e.hits >= Math.max(1, JSON.parse(z.targets || "[]").length) || now - z.t > 3 * 86400) ? 1 : 0;
      await env.DB.prepare("UPDATE hub_vipzone SET ev = ?, done = ? WHERE id = ?").bind(JSON.stringify(e), done, z.id).run();
    }
  }
  // Statistik je Zonenart
  const A = (await env.DB.prepare("SELECT side, kind, tf, ev FROM hub_vipzone WHERE ev IS NOT NULL").all()).results;
  const S = {};
  for (const a of A) {
    const e = JSON.parse(a.ev); if (!e.touched) continue;
    const k = `${a.side < 0 ? "Verkauf" : "Kauf"} ${a.kind || "?"} ${a.tf || ""}`.trim(); const s = (S[k] ||= { n: 0, held: 0, tp: 0, broken: 0, mfe: 0 });
    s.n++; s.held += e.held || 0; s.tp += e.hits ? 1 : 0; s.broken += e.broken ? 1 : 0; s.mfe += e.mfe || 0;
  }
  await kvPut(env, "vz_stats", JSON.stringify({ t: Math.floor(Date.now() / 1000), S }));
  // v3.1 Zonen als Filter für die übrigen Gold-Strategien – nur MESSEN (nicht eingreifen): Ø R mit / gegen / ohne aktive Zone in der Nähe
  try {
    const ZZ = (await env.DB.prepare("SELECT t, side, lo, hi, ev FROM hub_vipzone").all()).results.map((z) => ({ ...z, e: z.ev ? JSON.parse(z.ev) : {} }));
    const TR = (await env.DB.prepare("SELECT t.sid, t.t, t.dr, t.e, t.r FROM hub_trades t JOIN hub_strats s ON s.id = t.sid WHERE t.closed = 1 AND COALESCE(t.sym, 'XAUUSD') = 'XAUUSD' AND s.family != 'vipz' AND t.t > ?").bind(Math.floor(Date.now() / 1000) - 90 * 86400).all()).results;
    const F = {};
    for (const x of TR) {
      const act = ZZ.filter((z) => z.t <= x.t && x.t - z.t < 2 * 86400 && !(z.e.broken && z.e.broken <= x.t) && Math.min(Math.abs(x.e - z.lo), Math.abs(x.e - z.hi)) <= 15);
      const k = !act.length ? "ohne Zone" : act.some((z) => z.side === x.dr) && !act.some((z) => z.side !== x.dr) ? "mit Zone (gleiche Richtung)" : act.some((z) => z.side !== x.dr) && !act.some((z) => z.side === x.dr) ? "gegen Zone" : "gemischt";
      const f = (F[k] ||= { n: 0, sum: 0, win: 0 }); f.n++; f.sum += x.r; f.win += x.r > 0 ? 1 : 0;
    }
    await kvPut(env, "vz_filter", JSON.stringify({ t: Math.floor(Date.now() / 1000), F }));
  } catch (e) { console.log("vz_filter", e.message); }
  return `VIP-Zonen: ${R.length} Beiträge, ${nz} neue Zonen, ${ne} Ereignisse, ${Z.length} ausgewertet`;
}

// ---------- v3.2 Kevins echte Trade-Ideen aus der VIP-Gruppe (Kevin 17.11.: „richtige Entry- und SL-Signale, nicht die Setup-Erklärung“) ----------
// Erfasst wird ein Beitrag NUR, wenn ausdrücklich ein Einstieg (Entry/Einstieg/Kauf bei/Verkauf bei) MIT Zahl UND ein SL/Stopp mit Zahl drinsteht.
// Zonen-Beiträge („Achte auf … SL über 3869“) haben keinen Einstieg mit Zahl und bleiben reine Zonen.
// Nur Gold (die VIP-Gruppe ist Gold; anderes Symbol im Text → übersprungen). Einstieg als Bereich → Limit in der Mitte, sonst Marktpreis,
// wenn der Kurs nah ist (≤ 1,5 $), sonst Limit bis 12 Std. Ziele: TP1/TP2/TP3 bzw. „Ziele …“; je Ziel gleicher Anteil, nach Ziel 1 Einstand,
// ohne Ziel 2 R. Spätere Beiträge „schließen/raus/Gewinne mitnehmen“ bzw. „SL auf Einstand/BE“ werden wie von Kevin angesagt umgesetzt. Max. 72 Std.
const PX = "(\\d{3,5}(?:[.,]\\d{1,2})?)";
const IX = {
  entry: new RegExp(`(?:\\bentry\\b|\\beinstieg(?:spreis)?\\b|\\b(?:kauf|kaufe|verkauf|verkaufe|buy|sell)\\s+(?:bei|ab|@)|@)\\s*(?:now|jetzt|sofort)?\\s*[:=@]?\\s*(?:bei|ab|um|zwischen|zone)?\\s*(?:${PX}(?:\\s*(?:[–\\-/]|bis)\\s*${PX})?|(market|markt|sofort|jetzt|now|cmp))`, "i"),
  sl: new RegExp(`\\b(?:sl|stop\\s*loss|stopp?)\\b\\s*(?:über|ueber|unter|bei|@)?\\s*[:=]?\\s*${PX}`, "i"),
  tp: new RegExp(`\\b(?:tp|take\\s*profit|ziel|target)(?:\\s*\\d(?!\\d))?\\s*[:=]?\\s*${PX}`, "gi"),
  head: new RegExp(`\\b(?:gold|xauusd|xau)\\b[^\\d\\n]{0,12}?\\b(buy|sell|long|short|kauf|verkauf)\\b(?:\\s*(?:limit|stop)?\\s*(?:@|bei|ab)?\\s*${PX}(?:\\s*(?:[–-]|bis)\\s*${PX})?|\\s+(jetzt|sofort|now|market|markt|cmp))|\\b(buy|sell|long|short|kauf|verkauf)\\s+(?:gold|xauusd|xau)\\b\\s*(?:@|bei|ab)?\\s*${PX}?(?:\\s*(?:[–-]|bis)\\s*${PX})?\\s*(jetzt|sofort|now|market|markt|cmp)?`, "i"),
  tps: /\bziele\s*:?\s*([\d.,\s·|/]+)/i,
  other: /\b(BTC|ETH|EURUSD|GBPUSD|USDJPY|NAS(?:DAQ|100)?|US30|US500|SPX|DAX|GER40|XAGUSD|SILBER|SILVER|OIL|WTI)\b/i,
  close: /(schließ|schliess|\bclose\b|\bgeschlossen\b|\braus\b|gewinne? mitnehmen|glattstellen|\bexit\b)/i,
  be: /(einstand|break\s*-?\s*even|\bBE\b)/i,
};
function parseIdea(text) {
  const t = String(text || ""); if (IX.other.test(t) && !/(gold|xau)/i.test(t)) return null;
  if (/#[A-Z]{3}\d{6,10}/.test(t) || /S&P|SP500|NASDAQ|DOW|ORB/i.test(t)) return null;   // automatische Bot-Ideen (ORB/TBO mit #ID) und Indizes sind keine Gold-Ideen von Kevin
  const s = t.match(IX.sl); if (!s) return null;
  let e = t.match(IX.entry);
  if (!e) { const h = t.match(IX.head); if (!h) return null;   // Kopfzeile „GOLD SELL 3870–3873“ / „Kauf Gold jetzt“
    if (h[1]) e = [null, h[2], h[3], h[4]]; else e = [null, h[6], h[7], h[8]];
    if (!e[1] && !e[3]) return null; }
  const sl = num(s[1]); let lo = e[1] ? num(e[1]) : null, hi = e[2] ? num(e[2]) : lo; if (lo != null && lo > hi) [lo, hi] = [hi, lo];
  let dr = /\b(sell|short|verkauf|verkaufe|verkaufen)\b/i.test(t) ? -1 : /\b(buy|long|kauf|kaufe|kaufen)\b/i.test(t) ? 1 : 0;
  if (lo != null) { const mid = (lo + hi) / 2; if (!dr) dr = mid > sl ? 1 : -1; if ((mid - sl) * dr <= 0 || Math.abs(mid - sl) > 80 || Math.abs(mid - sl) < 0.3) return null; }
  else if (!dr) return null;
  let tps = [...t.matchAll(IX.tp)].map((m) => num(m[1]));
  const z = t.match(IX.tps); if (!tps.length && z) tps = (z[1].match(/\d{3,5}(?:[.,]\d+)?/g) || []).map(num);
  tps = [...new Set(tps)].filter((x) => Math.abs(x - sl) < 300).sort((a, b) => (a - b) * dr);
  const mkt = lo == null || /\b(now|jetzt|sofort|market|markt|cmp)\b/i.test(t);   // „Gold Sell Now 3870–3873“: sofort zum Marktpreis, Zone nur zur Info
  if (lo == null) { const z2 = t.match(new RegExp(`${PX}\\s*(?:[–\\-/]|bis)\\s*${PX}`)); if (z2) { lo = num(z2[1]); hi = num(z2[2]); if (lo > hi) [lo, hi] = [hi, lo]; if ((lo + hi) / 2 - sl === 0 || ((lo + hi) / 2 - sl) * dr <= 0) { lo = hi = null; } } }
  return { dr, lo, hi, sl, tps, mkt };
}
function ideaTrade(d, C) {   // d: Idee aus hub_vipidea (tps als Array, events als Array)
  const i0 = C.findIndex((k) => k.t >= d.t); if (i0 < 0) return null;
  const dr = d.dr; let ie = -1, e = null;
  if (d.lo == null || d.mkt) { ie = i0; e = C[i0].o; }
  else {
    const mid = (d.lo + d.hi) / 2, p0 = C[i0].o;
    if (Math.abs(p0 - mid) <= 1.5 || (p0 >= d.lo - 0.5 && p0 <= d.hi + 0.5)) { ie = i0; e = p0; }
    else for (let i = i0; i < C.length && C[i].t - d.t <= 12 * 3600; i++) if (C[i].l <= mid && C[i].h >= mid) { ie = i; e = mid; break; }
  }
  if (ie < 0) return C.at(-1).t - d.t > 12 * 3600 ? { none: true, why: "Einstieg nicht erreicht (12 Std.)" } : { wait: true };
  const R = Math.abs(e - d.sl); if (!(R > 0) || (e - d.sl) * dr <= 0) return { none: true, why: "Kurs schon hinter dem SL" };
  const tps = (d.tps || []).filter((x) => (x - e) * dr > 0).slice(0, 3); const T = tps.length ? tps : [e + dr * 2 * R];
  const parts = T.map(() => 1 / T.length);
  let left = 1, real = 0, stop = d.sl, hit = 0; const EVs = d.events || [], noTp = !tps.length;
  // Messung für später (welcher Ausstieg passt zu Kevins Ideen?): größter Vorlauf (MFE) in R vor SL/72 Std. und feste Ausstiege 1/1,5/2/3 R
  let mfe = 0, mae = 0; const alt = {}; const X = [1, 1.5, 2, 3];
  for (let i = ie; i < C.length && C[i].t - C[ie].t <= 72 * 3600; i++) { const k = C[i];
    const adv = (dr > 0 ? k.l - e : e - k.h) / R; mae = Math.min(mae, adv);
    for (const x of X) if (alt[x] == null && (adv <= -1 || (i === ie && false))) alt[x] = -1;
    const fav = (dr > 0 ? k.h - e : e - k.l) / R; if (adv > -1) { mfe = Math.max(mfe, fav); for (const x of X) if (alt[x] == null && fav >= x) alt[x] = x; }
    if (adv <= -1) break; }
  const meas = { mfe: Math.round(mfe * 100) / 100, mae: Math.round(mae * 100) / 100, alt };
  for (let i = ie; i < C.length; i++) {
    const k = C[i];
    if (noTp && stop !== e && ((dr > 0 ? k.h - e : e - k.l) >= R)) stop = e;   // ohne Ziele: ab +1 R Einstand
    for (const [w, te] of EVs) if (te > (C[i - 1]?.t ?? 0) && te <= k.t && te >= C[ie].t) {
      if (w === "close") { real += left * dr * (k.o - e) / R; return { t: C[ie].t, dr, e, sl: d.sl, tp: T.at(-1), r: real - COST / R, why: "von Kevin geschlossen", tx: k.t, open: false, ...meas }; }
      if (w === "be" && (k.o - e) * dr > 0) stop = e;
    }
    if (i > ie || k.t > d.t) {
      if ((dr > 0 && k.l <= stop) || (dr < 0 && k.h >= stop)) { real += left * dr * (stop - e) / R; return { t: C[ie].t, dr, e, sl: d.sl, tp: T.at(-1), r: real - COST / R, why: hit || stop === e ? "Einstand" : "SL", tx: k.t, open: false, ...meas }; }
      while (hit < T.length && ((dr > 0 && k.h >= T[hit]) || (dr < 0 && k.l <= T[hit]))) { real += parts[hit] * dr * (T[hit] - e) / R; left -= parts[hit]; hit++; if (hit === 1) stop = e;
        if (left <= 1e-9) return { t: C[ie].t, dr, e, sl: d.sl, tp: T.at(-1), r: real - COST / R, why: noTp ? "2 R erreicht" : `Ziel ${hit}`, tx: k.t, open: false, ...meas }; }
    }
    if (k.t - C[ie].t >= 72 * 3600) { real += left * dr * (k.c - e) / R; return { t: C[ie].t, dr, e, sl: d.sl, tp: T.at(-1), r: real - COST / R, why: "Zeit (72 Std.)", tx: k.t, open: false, ...meas }; }
  }
  const L = C.at(-1); return { t: C[ie].t, dr, e, sl: d.sl, tp: T.at(-1), r: real + left * dr * (L.c - e) / R - COST / R, why: "offen", tx: L.t, open: true, hit, ...meas };
}
export async function ideaTick(env, say, kvGet, kvPut) {
  await schema(env);
  await env.DB.prepare("ALTER TABLE hub_vipidea ADD COLUMN mkt INTEGER DEFAULT 0").run().catch(() => {});
  const last = +((await kvGet(env, "vi_last")) || 0);
  const R = (await env.DB.prepare("SELECT id, t, chat, msg_id, reply_to, text FROM vipfeed WHERE id > ? AND text IS NOT NULL AND text != '' ORDER BY id LIMIT 200").bind(last).all()).results;
  let n = 0;
  for (const r of R) {
    const d = parseIdea(r.text);
    if (d) {
      const dup = await env.DB.prepare("SELECT id FROM hub_vipidea WHERE dr = ? AND ABS(sl - ?) < 0.3 AND ABS(t - ?) < 3600").bind(d.dr, d.sl, r.t).first();
      if (!dup) {
        await env.DB.prepare("INSERT INTO hub_vipidea (id, t, dr, lo, hi, sl, tps, msg_id, chat, events, mkt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?)").bind(r.id, r.t, d.dr, d.lo, d.hi, d.sl, JSON.stringify(d.tps), r.msg_id, r.chat, d.mkt ? 1 : 0).run(); n++;
        await say(env, `📌 VIP-Trade-Idee erfasst (Papier): Gold ${d.dr > 0 ? "Kauf" : "Verkauf"} ${d.mkt ? "sofort" + (d.lo != null ? " (Zone " + d.lo + "–" + d.hi + ")" : "") : d.lo === d.hi ? d.lo : d.lo + "–" + d.hi}, SL ${d.sl}${d.tps.length ? ", Ziele " + d.tps.join(" · ") : " (ohne Ziel: Einstand ab +1 R, Ziel 2 R, oder bis du „raus“ schreibst)"}. Der Hub wertet sie mit echten Kursen aus.`).catch(() => {});
      }
      continue;
    }
    const w = IX.close.test(r.text) ? "close" : IX.be.test(r.text) && /(sl|stop)/i.test(r.text) ? "be" : null;
    if (w) {   // bezieht sich auf die beantwortete Idee, sonst die jüngste offene der letzten 72 Std.
      const x = (r.reply_to && (await env.DB.prepare("SELECT id, events FROM hub_vipidea WHERE chat = ? AND msg_id = ?").bind(r.chat, r.reply_to).first()))
        || (await env.DB.prepare("SELECT id, events FROM hub_vipidea WHERE done = 0 AND t <= ? AND t > ? ORDER BY t DESC LIMIT 1").bind(r.t, r.t - 72 * 3600).first());
      if (x) { const E = JSON.parse(x.events || "[]"); E.push([w, r.t]); await env.DB.prepare("UPDATE hub_vipidea SET events = ? WHERE id = ?").bind(JSON.stringify(E), x.id).run(); }
    }
  }
  if (R.length) await kvPut(env, "vi_last", String(R[R.length - 1].id));
  const D = (await env.DB.prepare("SELECT * FROM hub_vipidea WHERE done = 0").all()).results; let closed = 0;
  if (D.length) {
    const C = (await env.DB.prepare("SELECT t, o, h, l, c FROM hub_candles WHERE tf = '5m' AND t >= ? ORDER BY t").bind(Math.min(...D.map((d) => d.t)) - 600).all()).results;
    for (const d of D) {
      const tr = ideaTrade({ ...d, tps: JSON.parse(d.tps || "[]"), events: JSON.parse(d.events || "[]") }, C); if (!tr || tr.wait) continue;
      const done = tr.none || !tr.open ? 1 : 0;
      await env.DB.prepare("UPDATE hub_vipidea SET ev = ?, done = ? WHERE id = ?").bind(JSON.stringify(tr), done, d.id).run();
      if (done && !tr.none) { closed++; await say(env, `📒 VIP-Trade-Idee Gold ${tr.dr > 0 ? "Kauf" : "Verkauf"} ab ${tr.e.toFixed(2)}: ${tr.why}, ${tr.r >= 0 ? "+" : ""}${tr.r.toFixed(2)} R (Papier). Lief maximal ${tr.mfe} R in deine Richtung.`).catch(() => {}); }
    }
  }
  return `VIP-Trade-Ideen: ${n} neu, ${D.length} offen geprüft, ${closed} abgeschlossen`;
}
export async function viTradesAll(env) {
  const D = (await env.DB.prepare("SELECT ev FROM hub_vipidea WHERE ev IS NOT NULL").all().catch(() => ({ results: [] }))).results || [];
  return D.map((d) => JSON.parse(d.ev)).filter((x) => x && !x.none && x.t).sort((a, b) => a.t - b.t);
}
export { parseZones, zoneOf, zoneTrades, parseIdea, ideaTrade };
