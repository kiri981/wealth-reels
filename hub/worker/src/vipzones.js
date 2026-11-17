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
  ["active", /(choch.*(bestätigt|bestaetigt|da|kam)|setup aktiv|aktives setup ist|einstieg)/i],
  ["reject", /(ablehnung)/i],
  ["reached", /(zone erreicht)/i],
  ["near", /(nähert sich|naehert sich|erinnerung)/i],
];

async function schema(env) {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_vipzone (id TEXT PRIMARY KEY, t INTEGER, side INTEGER, lo REAL, hi REAL, kind TEXT, tf TEXT, targets TEXT, sl REAL, src INTEGER, events TEXT, ev TEXT, done INTEGER DEFAULT 0)"),
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
      const done = e.broken || e.hits >= Math.max(1, JSON.parse(z.targets || "[]").length) || now - z.t > 3 * 86400 ? 1 : 0;
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
  return `VIP-Zonen: ${R.length} Beiträge, ${nz} neue Zonen, ${ne} Ereignisse, ${Z.length} ausgewertet`;
}
export { parseZones, zoneOf };
