// WC Trading Hub – Papier-Wallet für Meme-Coins (v2.0)
// Kauft und verkauft SELBSTSTÄNDIG, aber nur simuliert, zu echten Live-Kursen (DexScreener) mit realistischen Kosten:
//   3 % Schlupf+Gebühren beim Kauf, 3 % beim Verkauf. Startkapital 10.000 $ (v2.7, vorher 1.000 $), je Kauf 200 $, höchstens 15 Positionen gleichzeitig;
//   gekauft wird nur, solange freies Papier-Guthaben da ist. Ausstiegsregeln können von der Lernschleife (memelearn.js) ersetzt werden.
// Einstieg: Meme-Radar-Hinweis (Heiß-Wert ≥ 70, Sicherheitscheck nicht 🔴, Liquidität ≥ 20k $) oder Smart-Wallet-Cluster (2+ Wallets kaufen).
// Ausstieg: Hälfte bei +100 % · danach Stop auf Einstand und nachgezogener Stop 40 % unter dem Höchstkurs · Stop −35 % · spätestens nach 24 Std.
//   · Liquidität < 3k $ oder Kurs 30 Min. nicht mehr abrufbar → als Totalverlust gewertet (Rug).
// Kein echtes Geld, kein Wallet-Schlüssel – nur Messung, ob die Regeln Geld verdienen würden.
export const MP = { start: 10000, size: 200, maxOpen: 15, cost: 0.03, tp: 1.0, sl: -0.35, trail: 0.4, maxH: 24 };
export async function mpRules(env) {   // feste Regeln + ggf. von der Lernschleife übernommene Ausstiegswerte
  try { const r = await env.DB.prepare("SELECT v FROM hub_kv WHERE k = 'meme_exit'").first(); if (r?.v) { const e = JSON.parse(r.v); return { ...MP, tp: e.tp, sl: e.sl, trail: e.trail, maxH: e.maxH, learned: e.t }; } } catch (e) {}
  return { ...MP };
}
const pc = (v) => (v >= 0 ? "+" : "") + Math.round(v * 100) + " %";
const DS = "https://api.dexscreener.com";
const N = (x) => (x == null || x === "" ? null : +x);

export async function mpSchema(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_mpos (id TEXT, t INTEGER, chain TEXT, token TEXT, pool TEXT, sym TEXT, src TEXT, px REAL, qty REAL, cost REAL, peak REAL, half INTEGER DEFAULT 0, cash REAL DEFAULT 0, last_px REAL, last_seen INTEGER, t_close INTEGER, px_close REAL, pnl REAL, why TEXT, PRIMARY KEY (id, t))").run();
}
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
  await say(env, `🤖 Papier-Wallet kauft ${x.sym} (${x.chain}) für ${MP.size} $ @ ${fmt(x.px)} – Grund: ${x.src}\nRegeln${RU.learned ? " (gelernt)" : ""}: Hälfte bei ${pc(RU.tp)}, Stop ${pc(RU.sl)}, nachgezogener Stop ${Math.round(RU.trail * 100)} %, max. ${RU.maxH} Std. (simuliert, kein echtes Geld)`);
  return true;
}
async function prices(chainTokens) {
  const out = {}; const by = {};
  for (const [c, t] of chainTokens) (by[c] ||= []).push(t);
  for (const [c, L] of Object.entries(by)) for (let i = 0; i < L.length; i += 30) {
    const r = await fetch(`${DS}/tokens/v1/${c}/${L.slice(i, i + 30).join(",")}`, { headers: { "User-Agent": "Mozilla/5.0 wc-hub" } }).catch(() => null);
    const A = r && r.ok ? await r.json().catch(() => []) : [];
    for (const x of Array.isArray(A) ? A : []) { const k = c + ":" + x.baseToken?.address; if (!out[k] || (x.liquidity?.usd || 0) > (out[k].liq || 0)) out[k] = { px: N(x.priceUsd), liq: N(x.liquidity?.usd) }; }
  }
  return out;
}
export async function mpManage(env, say) {
  await mpSchema(env);
  const P = (await env.DB.prepare("SELECT * FROM hub_mpos WHERE t_close IS NULL").all()).results; if (!P.length) return "Papier-Wallet: keine Positionen";
  const now = Math.floor(Date.now() / 1000); const Q = await prices(P.map((p) => [p.chain, p.token])); const MP = await mpRules(env);
  let closed = 0;
  for (const p of P) {
    const q = Q[p.id]; let px = q?.px ?? null; let why = null, closeAt = null;
    if (px == null) { if (now - (p.last_seen || p.t) > 1800) { why = "Kurs nicht mehr abrufbar (Rug?)"; closeAt = 0; } else continue; }
    else if ((q.liq ?? 0) < 3000) { why = "Liquidität abgezogen (Rug)"; closeAt = 0; }
    let peak = Math.max(p.peak || p.px, px ?? 0), half = p.half, cash = p.cash || 0, qty = p.qty;
    if (closeAt == null) {
      const ch = px / p.px - 1;
      if (!half && ch >= MP.tp) { cash += (qty / 2) * px * (1 - MP.cost); qty = qty / 2; half = 1; await say(env, `🤖 Papier-Wallet: ${p.sym} +${Math.round(ch * 100)} % – Hälfte verkauft (simuliert)`); }
      const stop = half ? Math.max(p.px, peak * (1 - MP.trail)) : p.px * (1 + MP.sl);
      if (px <= stop) { why = half ? "nachgezogener Stop" : "Stop " + pc(MP.sl); closeAt = px; }
      else if (now - p.t >= MP.maxH * 3600) { why = "Zeit (" + MP.maxH + " Std.)"; closeAt = px; }
    }
    if (closeAt != null) {
      const pnl = cash + qty * closeAt * (1 - MP.cost) - p.cost;
      await env.DB.prepare("UPDATE hub_mpos SET t_close = ?, px_close = ?, pnl = ?, why = ?, qty = ?, cash = ?, half = ?, peak = ?, last_px = ? WHERE id = ? AND t = ?").bind(now, closeAt, pnl, why, qty, cash, half, peak, px, p.id, p.t).run();
      await say(env, `🤖 Papier-Wallet verkauft ${p.sym}: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} $ (${pnl >= 0 ? "+" : ""}${Math.round((pnl / p.cost) * 100)} %) – ${why} (simuliert)`);
      closed++;
    } else await env.DB.prepare("UPDATE hub_mpos SET qty = ?, cash = ?, half = ?, peak = ?, last_px = ?, last_seen = ? WHERE id = ? AND t = ?").bind(qty, cash, half, peak, px, now, p.id, p.t).run();
  }
  return `Papier-Wallet: ${P.length} offen, ${closed} geschlossen`;
}
export async function mpData(env) {
  await mpSchema(env);
  const A = (await env.DB.prepare("SELECT * FROM hub_mpos ORDER BY t DESC LIMIT 200").all()).results;
  const closed = A.filter((p) => p.t_close), open = A.filter((p) => !p.t_close);
  const realized = closed.reduce((a, p) => a + p.pnl, 0);
  const openVal = open.reduce((a, p) => a + (p.cash || 0) + p.qty * (p.last_px || p.px) * (1 - MP.cost), 0), openCost = open.reduce((a, p) => a + p.cost, 0);
  return { rules: await mpRules(env), open, closed, realized, openVal, openCost, equity: MP.start + realized + openVal - openCost, wins: closed.filter((p) => p.pnl > 0).length };
}
