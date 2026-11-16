// WC Trading Hub – Papier-Wallet für Meme-Coins (v2.0)
// Kauft und verkauft SELBSTSTÄNDIG, aber nur simuliert, zu echten Live-Kursen (DexScreener) mit realistischen Kosten:
//   3 % Schlupf+Gebühren beim Kauf, 3 % beim Verkauf. Startkapital 35.000 $ (v3.0: +25.000 $ aufgeladen 17.11.; v2.7: 10.000 $), je Kauf 200 $, höchstens 15 Positionen gleichzeitig;
//   gekauft wird nur, solange freies Papier-Guthaben da ist. Ausstiegsregeln können von der Lernschleife (memelearn.js) ersetzt werden.
// Einstieg: Meme-Radar-Hinweis (Heiß-Wert ≥ 70, Sicherheitscheck nicht 🔴, Liquidität ≥ 20k $) oder Smart-Wallet-Cluster (2+ Wallets kaufen).
// Ausstieg: Hälfte bei +100 % · danach Stop auf Einstand und nachgezogener Stop 40 % unter dem Höchstkurs · Stop −35 % · spätestens nach 24 Std.
//   · Liquidität < 3k $ oder Kurs 30 Min. nicht mehr abrufbar → als Totalverlust gewertet (Rug).
// Kein echtes Geld, kein Wallet-Schlüssel – nur Messung, ob die Regeln Geld verdienen würden.
// v2.8 nach Auswertung der ersten 40 Trades (alle Kursverläufe nachgerechnet): früher raus, enger Stopp, kurz halten.
// Kurs wird jetzt alle ~15 Sek. geprüft (mpFast) + Frühwarnungen: Liquidität fällt, Kurssturz in Minuten, starker Verkaufsdruck → sofort raus.
export const MP = { start: 35000, size: 200, maxOpen: 15, cost: 0.03, tp: 0.3, sl: -0.15, trail: 0.25, maxH: 3,
  fw: { liqDrop: 0.3, liqPx: 0.08, crash: 0.12, crashWin: 180, sellX: 2, sellMin: 30, sellC5: -8 } };
export async function mpRules(env) {   // feste Regeln + ggf. von der Lernschleife übernommene Ausstiegswerte
  try { const r = await env.DB.prepare("SELECT v FROM hub_kv WHERE k = 'meme_exit'").first(); if (r?.v) { const e = JSON.parse(r.v); return { ...MP, tp: e.tp, sl: e.sl, trail: e.trail, maxH: e.maxH, learned: e.t }; } } catch (e) {}
  return { ...MP };
}
const pc = (v) => (v >= 0 ? "+" : "") + Math.round(v * 100) + " %";
const DS = "https://api.dexscreener.com";
const N = (x) => (x == null || x === "" ? null : +x);

export async function mpSchema(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_mpev (id TEXT, pt INTEGER, t INTEGER, ev TEXT, px REAL, note TEXT)").run();   // v2.7 Verlauf je Position: Kauf, Hälfte, Stopp-Anpassung, Verkauf
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_mpos (id TEXT, t INTEGER, chain TEXT, token TEXT, pool TEXT, sym TEXT, src TEXT, px REAL, qty REAL, cost REAL, peak REAL, half INTEGER DEFAULT 0, cash REAL DEFAULT 0, last_px REAL, last_seen INTEGER, t_close INTEGER, px_close REAL, pnl REAL, why TEXT, PRIMARY KEY (id, t))").run();
}
const ev = (env, id, pt, t, e, px, note) => env.DB.prepare("INSERT INTO hub_mpev (id, pt, t, ev, px, note) VALUES (?, ?, ?, ?, ?, ?)").bind(id, pt, t, e, px, String(note || "").slice(0, 500)).run().catch(() => {});
const fmt = (v) => (v == null ? "?" : v >= 1 ? v.toFixed(4) : v.toPrecision(4));
export async function mpOpen(env, say, x) {   // x: {chain, token, pool, sym, px, src}
  if (!x?.token || !x.px) return false;
  await mpSchema(env);
  const id = x.chain + ":" + x.token;
  const open = (await env.DB.prepare("SELECT id FROM hub_mpos WHERE t_close IS NULL").all()).results;
  if (open.length >= MP.maxOpen || open.some((o) => o.id === id)) return false;
  const recent = await env.DB.prepare("SELECT 1 FROM hub_mpos WHERE id = ? AND t > ?").bind(id, Math.floor(Date.now() / 1000) - 3 * 86400).first(); if (recent) return false;
  const bal = await env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN t_close IS NOT NULL THEN pnl END), 0) re, COALESCE(SUM(CASE WHEN t_close IS NULL THEN cost - COALESCE(cash, 0) END), 0) inv FROM hub_mpos").first();
  if (MP.start + (bal?.re || 0) - (bal?.inv || 0) < MP.size) return false;   // kein freies Papier-Guthaben mehr
  const RU = await mpRules(env);
  const now = Math.floor(Date.now() / 1000), buy = x.px * (1 + MP.cost), qty = MP.size / buy;
  await env.DB.prepare("INSERT INTO hub_mpos (id, t, chain, token, pool, sym, src, px, qty, cost, peak, last_px, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, now, x.chain, x.token, x.pool || null, x.sym || null, x.src || "Radar", x.px, qty, MP.size, x.px, x.px, now).run();
  await ev(env, id, now, now, "kauf", x.px, `${MP.size} $ gekauft (inkl. ${Math.round(MP.cost * 100)} % Kosten) · Grund: ${x.src || "Radar"}${x.info ? " · " + x.info : ""} · Regeln: Hälfte bei ${pc(RU.tp)}, Stop ${pc(RU.sl)}, Trailing ${Math.round(RU.trail * 100)} %, max. ${RU.maxH} Std.`);
  await say(env, `🤖 Papier-Wallet kauft ${x.sym} (${x.chain}) für ${MP.size} $ @ ${fmt(x.px)} – Grund: ${x.src}\nRegeln${RU.learned ? " (gelernt)" : ""}: Hälfte bei ${pc(RU.tp)}, Stop ${pc(RU.sl)}, nachgezogener Stop ${Math.round(RU.trail * 100)} %, max. ${RU.maxH} Std. (simuliert, kein echtes Geld)`);
  return true;
}
async function prices(chainTokens) {
  const out = {}; const by = {};
  for (const [c, t] of chainTokens) (by[c] ||= []).push(t);
  for (const [c, L] of Object.entries(by)) for (let i = 0; i < L.length; i += 30) {
    const r = await fetch(`${DS}/tokens/v1/${c}/${L.slice(i, i + 30).join(",")}`, { headers: { "User-Agent": "Mozilla/5.0 wc-hub" } }).catch(() => null);
    const A = r && r.ok ? await r.json().catch(() => []) : [];
    for (const x of Array.isArray(A) ? A : []) { const k = c + ":" + x.baseToken?.address; if (!out[k] || (x.liquidity?.usd || 0) > (out[k].liq || 0)) out[k] = { px: N(x.priceUsd), liq: N(x.liquidity?.usd), c5: N(x.priceChange?.m5), b5: N(x.txns?.m5?.buys), s5: N(x.txns?.m5?.sells) }; }
  }
  return out;
}
export async function mpManage(env, say) {
  await mpSchema(env);
  for (const c of ["liqmax REAL", "hist TEXT", "fwres TEXT"]) await env.DB.prepare("ALTER TABLE hub_mpos ADD COLUMN " + c).run().catch(() => {});
  const P = (await env.DB.prepare("SELECT * FROM hub_mpos WHERE t_close IS NULL").all()).results; if (!P.length) return "Papier-Wallet: keine Positionen";
  const now = Math.floor(Date.now() / 1000); const Q = await prices(P.map((p) => [p.chain, p.token])); const MP = await mpRules(env);
  let closed = 0;
  for (const p of P) {
    const q = Q[p.id]; let px = q?.px ?? null; let why = null, closeAt = null;
    if (px == null) { if (now - (p.last_seen || p.t) > 3 * 3600) { why = "Kurs 3 Std. nicht mehr abrufbar (Rug?)"; closeAt = 0; } else continue; }
    else if (q.liq != null && q.liq < 1000 && px < p.px * 0.5) { why = "Liquidität abgezogen (Rug)"; closeAt = 0; }   // v2.7: nur echte Rugs – beim Pump.fun-Umzug auf PumpSwap ist die alte Liquidität kurz weg, das ist kein Rug
    else if (px <= p.px * 0.1) { why = "Kurs −90 % (Rug)"; closeAt = px; }
    let peak = Math.max(p.peak || p.px, px ?? 0), half = p.half, cash = p.cash || 0, qty = p.qty;
    // Frühwarnungen (v2.8): Kursverlauf der letzten Minuten merken
    const H = JSON.parse(p.hist || "[]").filter((h) => now - h[0] <= 600); if (px != null) H.push([now, px]);
    const liqmax = Math.max(p.liqmax || 0, q?.liq || 0), F = MP.fw;
    if (closeAt == null && px != null) {
      const hi3 = Math.max(...H.filter((h) => now - h[0] <= F.crashWin).map((h) => h[1])), hi2 = Math.max(...H.filter((h) => now - h[0] <= 150).map((h) => h[1]));
      if (q.liq != null && liqmax > 0 && q.liq < liqmax * (1 - F.liqDrop) && px < hi2 * (1 - F.liqPx)) { why = `Frühwarnung: Liquidität −${Math.round((1 - q.liq / liqmax) * 100)} % und Kurs fällt`; closeAt = px; }
      else if (H.length >= 2 && px <= hi3 * (1 - F.crash)) { why = `Frühwarnung: −${Math.round((1 - px / hi3) * 100)} % in ${Math.round(F.crashWin / 60)} Min.`; closeAt = px; }
      else if ((q.s5 || 0) >= F.sellMin && (q.s5 || 0) >= F.sellX * (q.b5 || 0) && (q.c5 ?? 0) <= F.sellC5) { why = `Frühwarnung: Verkaufsdruck (${q.s5} Verkäufe vs. ${q.b5 || 0} Käufe in 5 Min., ${Math.round(q.c5)} %)`; closeAt = px; }
    }
    if (closeAt == null) {
      const ch = px / p.px - 1;
      if (!half && ch >= MP.tp) { cash += (qty / 2) * px * (1 - MP.cost); qty = qty / 2; half = 1; await ev(env, p.id, p.t, now, "haelfte", px, `+${Math.round(ch * 100)} % erreicht → Hälfte verkauft (${((qty) * px * (1 - MP.cost)).toFixed(2)} $ zurück) · Stop jetzt mindestens Einstand, danach ${Math.round(MP.trail * 100)} % unter dem Höchstkurs nachgezogen`); await say(env, `🤖 Papier-Wallet: ${p.sym} +${Math.round(ch * 100)} % – Hälfte verkauft (simuliert)`); }
      const stop = half ? Math.max(p.px, peak * (1 - MP.trail)) : p.px * (1 + MP.sl);
      if (px <= stop) { why = half ? "nachgezogener Stop" : "Stop " + pc(MP.sl); closeAt = px; }
      else if (now - p.t >= MP.maxH * 3600) { why = "Zeit (" + MP.maxH + " Std.)"; closeAt = px; }
    }
    if (closeAt != null) {
      const pnl = cash + qty * closeAt * (1 - MP.cost) - p.cost;
      const u = await env.DB.prepare("UPDATE hub_mpos SET t_close = ?, px_close = ?, pnl = ?, why = ?, qty = ?, cash = ?, half = ?, peak = ?, last_px = ? WHERE id = ? AND t = ? AND t_close IS NULL").bind(now, closeAt, pnl, why, qty, cash, half, peak, px, p.id, p.t).run();
      if (!u.meta?.changes) continue;   // schon von einem parallelen Lauf geschlossen
      await ev(env, p.id, p.t, now, "verkauf", closeAt, `${why} · Ergebnis ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} $ (${pnl >= 0 ? "+" : ""}${Math.round((pnl / p.cost) * 100)} %) · Höchstkurs ${fmt(peak)} (${pc(peak / p.px - 1)}) · Haltedauer ${((now - p.t) / 3600).toFixed(1)} Std.`);
      await say(env, `🤖 Papier-Wallet verkauft ${p.sym}: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} $ (${pnl >= 0 ? "+" : ""}${Math.round((pnl / p.cost) * 100)} %) – ${why} (simuliert)`);
      closed++;
    } else await env.DB.prepare("UPDATE hub_mpos SET qty = ?, cash = ?, half = ?, peak = ?, last_px = ?, last_seen = ?, liqmax = ?, hist = ? WHERE id = ? AND t = ? AND t_close IS NULL").bind(qty, cash, half, peak, px, now, liqmax, JSON.stringify(H.slice(-40)), p.id, p.t).run();
  }
  return `Papier-Wallet: ${P.length} offen, ${closed} geschlossen`;
}
// Schnelle Kursprüfung: ein Lauf pro Minute, darin 4 Prüfungen im Abstand von ~15 Sek. (nur wenn Positionen offen sind)
export async function mpFast(env, say, kvPut) {
  let out = "";
  for (let i = 0; i < 4; i++) {
    const n = await env.DB.prepare("SELECT COUNT(*) n FROM hub_mpos WHERE t_close IS NULL").first().then((r) => r?.n || 0).catch(() => 0);
    if (!n) return "Papier-Wallet schnell: keine offenen Positionen";
    out = await mpManage(env, say);
    await kvPut(env, "mpfast_t", String(Math.floor(Date.now() / 1000)));
    if (i < 3) await new Promise((r) => setTimeout(r, 14000));
  }
  return "Papier-Wallet schnell: " + out;
}
// Frühwarnungen nachträglich prüfen: War der schnelle Verkauf richtig? (Kurs 30/60 Min. danach, aus den Radar-Schnappschüssen)
export async function fwCheck(env) {
  const now = Math.floor(Date.now() / 1000);
  const R = (await env.DB.prepare("SELECT id, t, t_close, px_close FROM hub_mpos WHERE why LIKE 'Frühwarnung%' AND fwres IS NULL AND t_close < ?").bind(now - 3700).all().catch(() => ({ results: [] }))).results;
  for (const r of R) {
    const S = (await env.DB.prepare("SELECT t, px FROM hub_meme_snap WHERE id = ? AND t > ? AND t <= ? AND px > 0 ORDER BY t").bind(r.id, r.t_close, r.t_close + 3900).all()).results;
    const at = (d) => { const s = S.filter((x) => x.t <= r.t_close + d).pop(); return s ? s.px : null; };
    const p30 = at(1800), p60 = at(3600), mx = S.length ? Math.max(...S.map((x) => x.px)) : null;
    const res = p60 == null ? "kein Kurs" : p60 < r.px_close ? "richtig" : mx > r.px_close * 1.2 ? "zu früh" : "neutral";
    await env.DB.prepare("UPDATE hub_mpos SET fwres = ? WHERE id = ? AND t = ?").bind(JSON.stringify({ res, p30, p60, mx }), r.id, r.t).run();
  }
  const A = (await env.DB.prepare("SELECT fwres FROM hub_mpos WHERE fwres IS NOT NULL").all().catch(() => ({ results: [] }))).results.map((x) => JSON.parse(x.fwres).res);
  return { n: A.length, richtig: A.filter((x) => x === "richtig").length, zufrueh: A.filter((x) => x === "zu früh").length, neutral: A.filter((x) => x === "neutral").length };
}
export async function mpData(env) {
  await mpSchema(env);
  const A = (await env.DB.prepare("SELECT * FROM hub_mpos ORDER BY t DESC LIMIT 200").all()).results;
  const closed = A.filter((p) => p.t_close), open = A.filter((p) => !p.t_close);
  const realized = closed.reduce((a, p) => a + p.pnl, 0);
  const openVal = open.reduce((a, p) => a + (p.cash || 0) + p.qty * (p.last_px || p.px) * (1 - MP.cost), 0), openCost = open.reduce((a, p) => a + p.cost, 0);
  return { rules: await mpRules(env), open, closed, realized, openVal, openCost, equity: MP.start + realized + openVal - openCost, wins: closed.filter((p) => p.pnl > 0).length };
}
