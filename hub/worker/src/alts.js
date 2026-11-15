// WC Trading Hub – Altcoin-Scanner + Marktbreite (v2.0)
// · Alle 15 Min.: CoinGecko /global → Gesamt-Marktkapitalisierung, BTC-Dominanz, ETH-Dominanz, TOTAL2 (ohne BTC), TOTAL3 (ohne BTC+ETH), Stablecoin-Anteil → hub_mkt
// · Stündlich: Top 100 nach Marktkapitalisierung (ohne Stablecoins/Wrapped/Börsen-Token), Kerzen (Tag + 4 Std.), Open Interest und Funding der
//   Perps über Coinalyze → Marktstruktur (Hochs/Tiefs, Bruch), Kompression, Abstand zum Ausbruchslevel, Volumen, relative Stärke gegen BTC
//   → Szenario (Ausbruch long / Bruch nach unten / Retest) mit Level, Stop, Ziel und Punktzahl → hub_alts
// · Bestätigte Ausbrüche werden gemerkt und 1/3/7 Tage später ehrlich ausgewertet (hub_altsig) – so sieht man, ob der Scanner etwas taugt.
// Nur Beobachtung und Bildung – der Hub kauft nichts.

const CG = "https://api.coingecko.com/api/v3";
const UA = { "User-Agent": "Mozilla/5.0 wc-hub", Accept: "application/json" };
const SKIP = /^(usdt|usdc|usds|dai|usde|usd1|pyusd|rlusd|usdg|usdy|usyc|eursafo|buidl|usdf|bfusd|usdgo|ousd|gho|ustb|jaaa|usd0|eurc|tusd|usdd|fdusd|frax|lusd|crvusd|susde|susds|u|m|figr_heloc|wbt|wbtc|weth|steth|wsteth|weeth|reth|cbbtc|cbeth|jitosol|msol|bnsol|lbtc|solvbtc|leo|okb|kcs|gt|bgb|htx|cro|xaut|paxg|bdx|cc)$/i;
const N = (x) => (x == null || x === "" ? null : +x);

export async function altSchema(env) {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_mkt (t INTEGER PRIMARY KEY, total REAL, btcd REAL, ethd REAL, total2 REAL, total3 REAL, stabled REAL, vol REAL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_alts (sym TEXT PRIMARY KEY, name TEXT, rank INTEGER, mcap REAL, px REAL, t INTEGER, score REAL, scen TEXT, data TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_apos (sym TEXT, t INTEGER, dir INTEGER, e REAL, sl0 REAL, sl REAL, tgt REAL, atr REAL, peak REAL, half INTEGER DEFAULT 0, part REAL DEFAULT 0, last_t INTEGER, last_px REAL, t_close INTEGER, px_close REAL, r REAL, why TEXT, score REAL, scen TEXT, PRIMARY KEY (sym, t))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_altsig (sym TEXT, t INTEGER, scen TEXT, px REAL, lvl REAL, stop REAL, tgt REAL, score REAL, px1d REAL, px3d REAL, px7d REAL, hit TEXT, PRIMARY KEY (sym, t))"),
  ]);
}

// ---------------------------------------------------------------- Marktbreite (CoinGecko global)
export async function mktTick(env, kvGet, kvPut) {
  await altSchema(env);
  const now = Math.floor(Date.now() / 1000); const slot = Math.floor(now / 900) * 900;
  if ((await kvGet(env, "mkt_slot")) === String(slot)) return "";
  let tot = null, btcd = null, ethd = null, stab = null, vol = null, src = "";
  try {   // 1) CoinGecko
    const r = await fetch(`${CG}/global`, { headers: UA });
    if (r.ok) { const g = (await r.json()).data || {}; const p = g.market_cap_percentage || {}; tot = N(g.total_market_cap?.usd); btcd = N(p.btc); ethd = N(p.eth); vol = N(g.total_volume?.usd); stab = ["usdt", "usdc", "usds", "dai", "usde"].reduce((a, k) => a + (N(p[k]) || 0), 0); src = "CoinGecko"; }
    else src = "CoinGecko " + r.status;
  } catch (e) { src = "CoinGecko " + e.message; }
  if (!tot || btcd == null) {   // 2) Ausweichquelle CoinLore (kein Schlüssel)
    const r = await fetch("https://api.coinlore.net/api/global/", { headers: UA });
    if (r.ok) { const g = (await r.json())[0] || {}; tot = N(g.total_mcap); btcd = N(g.btc_d); ethd = N(g.eth_d); vol = N(g.total_volume); src += " → CoinLore"; }
    else src += " → CoinLore " + r.status;
  }
  if (!tot || btcd == null) { await kvPut(env, "log_mkt", new Date().toISOString() + " Fehler: " + src); return "Marktbreite: keine Daten (" + src + ")"; }
  await env.DB.prepare("INSERT OR REPLACE INTO hub_mkt (t, total, btcd, ethd, total2, total3, stabled, vol) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(slot, tot, btcd, ethd, tot * (1 - btcd / 100), tot * (1 - (btcd + (ethd || 0)) / 100), stab, vol).run();
  await kvPut(env, "log_mkt", new Date().toISOString() + " ok " + src);
  await kvPut(env, "mkt_slot", String(slot));
  return `Marktbreite: BTC.D ${btcd.toFixed(2)} %`;
}

// ---------------------------------------------------------------- Kennzahlen je Coin (rein, Python-Spiegel in hub/alts.py)
const sma = (a, n, i) => { if (i < n - 1) return null; let s = 0; for (let k = i - n + 1; k <= i; k++) s += a[k]; return s / n; };
function atrArr(C, n = 14) { const out = []; for (let i = 0; i < C.length; i++) { const pc = i ? C[i - 1].c : C[i].c; const tr = Math.max(C[i].h - C[i].l, Math.abs(C[i].h - pc), Math.abs(C[i].l - pc)); out.push(i < n ? (i ? (out[i - 1] * i + tr) / (i + 1) : tr) : out[i - 1] + (tr - out[i - 1]) / n); } return out; }
// Umkehrpunkte (Fraktal: k Kerzen links und rechts) → Marktstruktur
export function swings(C, k = 2) {
  const hi = [], lo = [];
  for (let i = k; i < C.length - k; i++) {
    let H = true, L = true;
    for (let j = 1; j <= k; j++) { if (C[i].h <= C[i - j].h || C[i].h < C[i + j].h) H = false; if (C[i].l >= C[i - j].l || C[i].l > C[i + j].l) L = false; }
    if (H) hi.push([i, C[i].h]); if (L) lo.push([i, C[i].l]);
  }
  return { hi, lo };
}
export function structure(C) {   // "bull" (höhere Hochs + höhere Tiefs), "bear", "range"; plus letzter Bruch (BOS) und Charakterwechsel (CHoCH)
  const { hi, lo } = swings(C, 2); if (hi.length < 2 || lo.length < 2) return { trend: "range" };
  const [h1, h2] = hi.slice(-2), [l1, l2] = lo.slice(-2); const last = C[C.length - 1].c;
  let trend = h2[1] > h1[1] && l2[1] > l1[1] ? "bull" : h2[1] < h1[1] && l2[1] < l1[1] ? "bear" : "range";
  const bosUp = last > h2[1], bosDn = last < l2[1];
  const choch = (trend === "bear" && bosUp) ? "up" : (trend === "bull" && bosDn) ? "down" : null;
  return { trend, lastHigh: h2[1], lastLow: l2[1], bosUp, bosDn, choch };
}
export function candle(C) {   // Kerzenformation der letzten abgeschlossenen Kerze
  const n = C.length; if (n < 3) return null; const a = C[n - 2], b = C[n - 1]; const body = Math.abs(b.c - b.o), rng = b.h - b.l || 1e-12;
  const up = b.c > b.o, lw = Math.min(b.o, b.c) - b.l, uw = b.h - Math.max(b.o, b.c);
  if (up && a.c < a.o && b.c >= a.o && b.o <= a.c) return "bullisches Engulfing";
  if (!up && a.c > a.o && b.c <= a.o && b.o >= a.c) return "bärisches Engulfing";
  if (lw > 2 * body && lw > 0.55 * rng) return "Hammer / Pin-Bar unten";
  if (uw > 2 * body && uw > 0.55 * rng) return "Shooting Star / Pin-Bar oben";
  if (b.h <= a.h && b.l >= a.l) return "Inside Bar";
  if (body > 0.8 * rng) return up ? "starke grüne Kerze" : "starke rote Kerze";
  return null;
}
export function scan(D, H4, btcD, ctx = {}) {
  // D: Tageskerzen {t,o,h,l,c,v} aufsteigend (≥ 60), H4: 4-Std.-Kerzen, btcD: Tageskerzen BTC; ctx: {oi7, fr}
  const n = D.length; if (n < 60) return null;
  const c = D.map((x) => x.c), A = atrArr(D, 14), i = n - 1, last = c[i], atr = A[i];
  const hh20 = Math.max(...D.slice(n - 21, n - 1).map((x) => x.h)), ll20 = Math.min(...D.slice(n - 21, n - 1).map((x) => x.l));
  const hh55 = Math.max(...D.slice(Math.max(0, n - 56), n - 1).map((x) => x.h)), ll55 = Math.min(...D.slice(Math.max(0, n - 56), n - 1).map((x) => x.l));
  const s50 = sma(c, 50, i), s200 = n >= 200 ? sma(c, 200, i) : null;
  const rng20 = (hh20 - ll20) / atr;                                            // Breite der Spanne in ATR: klein = Kompression
  const atrRel = atr / (A.slice(Math.max(0, n - 100)).reduce((a, b) => a + b, 0) / Math.min(100, n));   // < 1: ruhiger als üblich
  const vol20 = D.slice(n - 21, n - 1).reduce((a, x) => a + (x.v || 0), 0) / 20, vx = vol20 > 0 ? (D[i].v || 0) / vol20 : null;
  const ret = (k) => (n > k ? c[i] / c[i - k] - 1 : null);
  const bret = (k) => (btcD && btcD.length > k ? btcD[btcD.length - 1].c / btcD[btcD.length - 1 - k].c - 1 : null);
  const rs7 = ret(7) != null && bret(7) != null ? ret(7) - bret(7) : null, rs30 = ret(30) != null && bret(30) != null ? ret(30) - bret(30) : null;
  const st4 = H4 && H4.length > 30 ? structure(H4) : { trend: "range" }, stD = structure(D);
  const cdl = candle(H4 && H4.length > 3 ? H4 : D);
  const dUp = (hh20 - last) / atr, dDn = (last - ll20) / atr;             // Abstand zum Level in ATR (negativ = schon drüber)
  // Szenario
  let scen = null, lvl = null, stop = null, tgt = null, s = 0; const why = [];
  const cl = (v, a, b) => Math.max(0, Math.min(1, (v - a) / (b - a)));
  const longBias = (s50 && last > s50 ? 1 : 0) + (s200 && last > s200 ? 1 : 0) + (stD.trend === "bull" ? 1 : 0) + (st4.trend === "bull" ? 1 : 0) + ((rs30 ?? 0) > 0 ? 1 : 0);
  const shortBias = (s50 && last < s50 ? 1 : 0) + (s200 && last < s200 ? 1 : 0) + (stD.trend === "bear" ? 1 : 0) + (st4.trend === "bear" ? 1 : 0) + ((rs30 ?? 0) < 0 ? 1 : 0);
  const brokeUp = D.slice(n - 4, n).some((x, k) => x.c > Math.max(...D.slice(n - 24 + k, n - 4 + k).map((y) => y.h)));
  // v2.6 strenger: klare Richtung (≥ 3 von 5 Trendmerkmalen), nah am Level, und entweder Kompression (vor dem Ausbruch) oder Volumen (Ausbruch läuft), nicht schon weit gelaufen
  const comp = rng20 < 7 || atrRel < 0.85, volOk = (vx ?? 0) >= 1.3;
  const okL = longBias >= 3 && longBias > shortBias && (rs30 ?? 0) > 0.08 && (rs7 ?? 0) > 0 && (dUp >= 0 ? dUp <= 1 && comp : dUp >= -1.2 && volOk);
  const brokeDn = D.slice(n - 4, n).some((x, k) => x.c < Math.min(...D.slice(n - 24 + k, n - 4 + k).map((y) => y.l)));
  const okS = shortBias >= 3 && shortBias > longBias && (rs30 ?? 0) < -0.08 && (rs7 ?? 0) < 0 && (dDn >= 0 ? dDn <= 1 && comp : dDn >= -1.2 && volOk);
  if (okL) {
    scen = dUp < 0 ? (brokeUp && last < hh20 + 0.5 * atr ? "Retest nach Ausbruch" : "Ausbruch läuft") : "vor Ausbruch (long)";
    lvl = hh20; stop = Math.max(ll20, hh20 - 1.5 * atr); { const R = hh20 - stop; tgt = hh20 + Math.max(1.5 * R, Math.min(hh20 - ll20, 3 * R)); }   // Ziel: gemessene Bewegung der Spanne, 1,5R bis 3R
    s = 25 * cl(1.5 - Math.max(dUp, 0), 0, 1.5) + 20 * cl(3.5 - Math.min(atrRel, 3.5), 2, 3) + 10 * cl(10 - Math.min(rng20, 10), 3, 7) + 15 * (longBias / 5) + 10 * cl(vx ?? 1, 1, 2.5) + 10 * cl(rs30 ?? 0, 0, 0.3) + 10 * cl(ctx.oi7 ?? 0, 0, 0.25);
  } else if (okS) {
    scen = dDn < 0 ? "Bruch nach unten läuft" : "vor Bruch (short)";
    lvl = ll20; stop = Math.min(hh20, ll20 + 1.5 * atr); { const R = stop - ll20; tgt = ll20 - Math.max(1.5 * R, Math.min(hh20 - ll20, 3 * R)); }
    s = 25 * cl(1.5 - Math.max(dDn, 0), 0, 1.5) + 20 * cl(3.5 - Math.min(atrRel, 3.5), 2, 3) + 10 * cl(10 - Math.min(rng20, 10), 3, 7) + 15 * (shortBias / 5) + 10 * cl(vx ?? 1, 1, 2.5) + 10 * cl(-(rs30 ?? 0), 0, 0.3) + 10 * cl(ctx.oi7 ?? 0, 0, 0.25);
  }
  if (scen && s < 50) { scen = null; lvl = stop = tgt = null; }   // v2.6: schwache Szenarien nicht anzeigen
  if ((ctx.fr ?? 0) > 0.05 && scen && !/short|unten/.test(scen)) { s *= 0.8; why.push("Funding hoch (viele Longs)"); }
  if (rng20 < 5) why.push("enge Spanne (" + rng20.toFixed(1) + " ATR)"); if (atrRel < 0.8) why.push("Volatilität gedrückt");
  if ((vx ?? 0) > 1.8) why.push("Volumen " + vx.toFixed(1) + "× Schnitt"); if ((rs30 ?? 0) > 0.1) why.push("stärker als BTC (30T)"); if ((rs30 ?? 0) < -0.1) why.push("schwächer als BTC (30T)");
  if (st4.choch) why.push("4h-Charakterwechsel " + (st4.choch === "up" ? "nach oben" : "nach unten")); else if (st4.bosUp) why.push("4h-Bruch über letztes Hoch"); else if (st4.bosDn) why.push("4h-Bruch unter letztes Tief");
  if ((ctx.oi7 ?? 0) > 0.15) why.push("Open Interest +" + Math.round(ctx.oi7 * 100) + " % (7T)");
  if (cdl) why.push(cdl);
  return { px: last, atr, hh20, ll20, hh55, ll55, s50, s200, rng20, atrRel, vx, r1: ret(1), r7: ret(7), r30: ret(30), rs7, rs30, trendD: stD.trend, trend4: st4.trend, choch4: st4.choch, bos4: st4.bosUp ? "up" : st4.bosDn ? "down" : null,
    cdl, scen, lvl, stop, tgt, rr: scen && lvl && stop && tgt ? Math.abs(tgt - lvl) / Math.abs(lvl - stop) : null, score: Math.round(s), why, oi7: ctx.oi7 ?? null, fr: ctx.fr ?? null };
}

// ---------------------------------------------------------------- Altcoin-Papierdepot (v2.3): jeder bestätigte Ausbruch wird simuliert gehandelt
// Einstieg zum aktuellen Kurs · Stop = Stop-Zone des Szenarios (1R) · Ziel-Zone: Hälfte verkaufen · ab +1R Stop auf Einstand ·
// ab +2R nachgezogener Stop 1×Tages-ATR unter dem Höchstkurs (bzw. über dem Tiefstkurs bei Short) · spätestens nach 14 Tagen raus.
// Kosten 0,12 % je Trade. Geprüft wird mit 4-Std.-Kerzen (Hoch/Tief), also auch Bewegungen zwischen zwei Läufen.
export const AP = { maxOpen: 8, cost: 0.0012, beR: 1, trailR: 2, trailAtr: 1, maxDays: 14 };
async function apOpen(env, say, x, s, now) {
  const open = (await env.DB.prepare("SELECT sym FROM hub_apos WHERE t_close IS NULL").all()).results;
  if (open.length >= AP.maxOpen || open.some((o) => o.sym === x.sym)) return false;
  const dir = /short|unten/.test(s.scen) ? -1 : 1, e = x.px ?? s.px;
  if (!e || !s.stop || (dir > 0 ? e <= s.stop : e >= s.stop)) return false;
  await env.DB.prepare("INSERT OR IGNORE INTO hub_apos (sym, t, dir, e, sl0, sl, tgt, atr, peak, last_t, last_px, score, scen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(x.sym, now, dir, e, s.stop, s.stop, s.tgt, s.atr, e, now, e, s.score, s.scen).run();
  return true;
}
export async function apManage(env, say, H4by, pxBy, now) {
  const P = (await env.DB.prepare("SELECT * FROM hub_apos WHERE t_close IS NULL").all()).results; let closed = 0;
  const d = (v) => (v == null ? "?" : v >= 100 ? v.toFixed(2) : v >= 1 ? v.toFixed(3) : v.toPrecision(4));
  for (const p of P) {
    const R = Math.abs(p.e - p.sl0), dr = p.dir; if (!R) continue;
    const bars = (H4by[p.sym] || []).filter((k) => k.t >= p.last_t - 14400 && k.t + 14400 > p.last_t);   // 4-Std.-Kerzen seit der letzten Prüfung
    let sl = p.sl, peak = p.peak, half = p.half, part = p.part || 0, exit = null, why = null, lastPx = pxBy[p.sym] ?? p.last_px;
    for (const k of bars) {
      if (dr > 0 ? k.l <= sl : k.h >= sl) { exit = sl; why = sl === p.sl0 ? "Stop" : (dr > 0 ? sl >= p.e : sl <= p.e) ? (sl === p.e ? "Einstand-Stop" : "nachgezogener Stop") : "Stop"; break; }
      peak = dr > 0 ? Math.max(peak, k.h) : Math.min(peak, k.l);
      if (!half && p.tgt && (dr > 0 ? k.h >= p.tgt : k.l <= p.tgt)) { half = 1; part = 0.5 * Math.abs(p.tgt - p.e) / R; await say(env, `🪙 Altcoin-Papier: ${p.sym} hat die Ziel-Zone ${d(p.tgt)} erreicht – Hälfte verkauft (+${(Math.abs(p.tgt - p.e) / R).toFixed(1)}R), Rest läuft mit nachgezogenem Stop (simuliert)`); }
      const runR = dr * (peak - p.e) / R;
      if (runR >= AP.beR) sl = dr > 0 ? Math.max(sl, p.e) : Math.min(sl, p.e);
      if (runR >= AP.trailR) sl = dr > 0 ? Math.max(sl, peak - AP.trailAtr * p.atr) : Math.min(sl, peak + AP.trailAtr * p.atr);
    }
    if (exit == null && now - p.t >= AP.maxDays * 86400 && lastPx) { exit = lastPx; why = "Zeit (14 Tage)"; }
    if (exit != null) {
      const rest = half ? 0.5 : 1, r = part + rest * dr * (exit - p.e) / R - (AP.cost * p.e) / R;
      await env.DB.prepare("UPDATE hub_apos SET t_close = ?, px_close = ?, r = ?, why = ?, sl = ?, peak = ?, half = ?, part = ?, last_t = ?, last_px = ? WHERE sym = ? AND t = ?").bind(now, exit, r, why, sl, peak, half, part, now, lastPx, p.sym, p.t).run();
      await say(env, `🪙 Altcoin-Papier: ${p.sym} ${dr > 0 ? "Long" : "Short"} beendet – ${why} @ ${d(exit)} · Ergebnis ${r >= 0 ? "+" : ""}${r.toFixed(2)}R (${r >= 0 ? "+" : ""}${((r * R) / p.e * 100).toFixed(1)} %) (simuliert)`);
      closed++;
    } else await env.DB.prepare("UPDATE hub_apos SET sl = ?, peak = ?, half = ?, part = ?, last_t = ?, last_px = ? WHERE sym = ? AND t = ?").bind(sl, peak, half, part, now, lastPx, p.sym, p.t).run();
  }
  return `Altcoin-Papier: ${P.length} offen, ${closed} beendet`;
}

// ---------------------------------------------------------------- Stündlicher Scan
async function cz(env, path, q, tries = 4) {   // Coinalyze: max. 40 Abfragen/Min. – bei 429 warten (Retry-After) und wiederholen
  for (let k = 0; ; k++) {
    const r = await fetch(`https://api.coinalyze.net/v1/${path}?${new URLSearchParams(q)}`, { headers: { api_key: env.COINALYZE_KEY } });
    if (r.ok) return r.json();
    if (r.status === 429 && k < tries - 1) { await new Promise((ok) => setTimeout(ok, Math.min(20000, (+(r.headers.get("retry-after") || 0) * 1000) || 4000 * (k + 1)))); continue; }
    throw new Error(`Coinalyze ${path} ${r.status}`);
  }
}
export async function czMap(env, kvGet, kvPut) {   // Basis-Symbol → bestes USDT-Perp (bevorzugt Binance „.A“), täglich neu
  const day = new Date().toISOString().slice(0, 10); const c = await kvGet(env, "czmap_" + day); if (c) return JSON.parse(c);
  const L = await cz(env, "future-markets", {}); const m = {};
  for (const x of L) { if (!x.is_perpetual) continue; const b = String(x.base_asset).toUpperCase(); const sc = /USDT_PERP\.A$/.test(x.symbol) ? 3 : /USDT_PERP/.test(x.symbol) ? 2 : /USD_PERP/.test(x.symbol) ? 1 : 0; if (sc && (!m[b] || sc > m[b][1])) m[b] = [x.symbol, sc]; }
  const out = Object.fromEntries(Object.entries(m).map(([b, [s]]) => [b, s]));
  await kvPut(env, "czmap_" + day, JSON.stringify(out)); return out;
}
export async function hist(env, path, syms, interval, from, to, extra = {}) {
  const out = {};
  for (let i = 0; i < syms.length; i += 20) {
    const L = await cz(env, path, { symbols: syms.slice(i, i + 20).join(","), interval, from, to, ...extra }).catch((e) => { hist.err = (hist.err || 0) + 1; hist.last = e.message; return []; });
    for (const x of L) out[x.symbol] = x.history || [];
  }
  return out;
}
export async function altTick(env, say, kvGet, kvPut, force) {
  if (!env.COINALYZE_KEY) return "Altcoins: kein COINALYZE_KEY";
  await altSchema(env);
  const now = Math.floor(Date.now() / 1000); const hr = Math.floor(now / 3600);
  if (!force && (await kvGet(env, "alt_hr")) === String(hr)) return "";
  await kvPut(env, "alt_hr", String(hr));
  let raw = null, msrc = "";
  try { const r = await fetch(`${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=120&page=1`, { headers: UA }); if (r.ok) { raw = await r.json(); msrc = "CoinGecko"; } else msrc = "CoinGecko " + r.status; } catch (e) { msrc = "CoinGecko " + e.message; }
  if (!Array.isArray(raw) || !raw.length) {   // Ausweichquelle CoinLore
    const r = await fetch("https://api.coinlore.net/api/tickers/?start=0&limit=120", { headers: UA });
    if (!r.ok) { await kvPut(env, "log_alt", new Date().toISOString() + " Fehler: " + msrc + " → CoinLore " + r.status); return "Altcoins: keine Coin-Liste"; }
    raw = ((await r.json()).data || []).map((x) => ({ symbol: String(x.symbol).toLowerCase(), name: x.name, market_cap_rank: +x.rank, market_cap: N(x.market_cap_usd), current_price: N(x.price_usd), price_change_percentage_24h: N(x.percent_change_24h) }));
    msrc += " → CoinLore";
  }
  const M = raw.filter((x) => !SKIP.test(x.symbol) && !(Math.abs((x.current_price || 0) - 1) < 0.03 && Math.abs(x.price_change_percentage_24h || 0) < 0.6)).slice(0, 100);
  const map = await czMap(env, kvGet, kvPut);
  const coins = M.map((x) => ({ sym: x.symbol.toUpperCase(), name: x.name, rank: x.market_cap_rank, mcap: x.market_cap, px: x.current_price, cz: map[x.symbol.toUpperCase()] })).filter((x) => x.cz);
  if (!coins.find((x) => x.sym === "BTC") && map.BTC) coins.unshift({ sym: "BTC", name: "Bitcoin", rank: 1, cz: map.BTC });
  const syms = coins.map((x) => x.cz); hist.err = 0;
  const Dd = await hist(env, "ohlcv-history", syms, "daily", now - 230 * 86400, now);
  const H4 = await hist(env, "ohlcv-history", syms, "4hour", now - 40 * 86400, now);
  const OI = await hist(env, "open-interest-history", syms, "daily", now - 9 * 86400, now, { convert_to_usd: "true" });
  const FR = await hist(env, "funding-rate-history", syms, "daily", now - 3 * 86400, now);
  const toC = (L, drop) => (L || []).map((h) => ({ t: h.t, o: h.o, h: h.h, l: h.l, c: h.c, v: h.v })).filter((x) => x.c != null).filter((x) => !drop || x.t + drop <= now + 60);
  const btcD = toC(Dd[map.BTC], 86400);
  const st = []; const res = [];
  for (const x of coins) {
    const D = toC(Dd[x.cz], 86400), h4 = toC(H4[x.cz], 14400); if (D.length < 60) continue;   // nur abgeschlossene Kerzen
    const oi = OI[x.cz] || [], fr = FR[x.cz] || [];
    const oi7 = oi.length > 6 && oi[0].c ? oi[oi.length - 1].c / oi[0].c - 1 : null, f = fr.length ? fr[fr.length - 1].c : null;
    const s = scan(D, h4, btcD, { oi7, fr: f }); if (!s) continue;
    s.livePx = x.px ?? null;
    res.push({ x, s, D, ctx: { oi7, fr: f } });
    st.push(env.DB.prepare("INSERT OR REPLACE INTO hub_alts (sym, name, rank, mcap, px, t, score, scen, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(x.sym, x.name, x.rank, x.mcap ?? null, x.px ?? s.px, now, s.score, s.scen, JSON.stringify(s)));
  }
  for (let i = 0; i < st.length; i += 90) await env.DB.batch(st.slice(i, i + 90));

  // Bestätigte Ausbrüche (Tagesschluss über/unter dem 20-Tage-Level, Punktzahl ≥ 60) merken + melden (max. 3 je Stunde, je Coin max. 1 pro 5 Tage)
  let sent = 0, paused = 0;
  const AM = await kvGet(env, "alt_model").then((v) => (v ? JSON.parse(v) : null)).catch(() => null);   // v2.8: gelernt (altlearn.js) – je Richtung an/aus, Mindestpunktzahl, Ziel in R
  for (const { x, s, D, ctx } of res.sort((a, b) => b.s.score - a.s.score)) {
    if (!s.scen || !/läuft/.test(s.scen)) continue;
    const dn = /short|unten/.test(s.scen) ? "short" : "long", G = AM?.dirs?.[dn];
    if (G) {
      if (!G.on) { paused++; continue; }   // diese Richtung hat im Nachtest nicht bestanden
      const sD = scan(D, null, btcD, ctx); if (!sD || sD.score < G.minScore) continue;   // gleiche Tages-Punktzahl wie im Nachtest
      const e0 = x.px ?? s.px, R0 = Math.abs(e0 - s.stop); if (R0 > 0) { s.tgt = e0 + (dn === "long" ? 1 : -1) * G.k * R0; s.rr = G.k; s.why.unshift(`gelernt: ab ${G.minScore} Pkt., Ziel ${G.k}R`); }
    } else if (s.score < 60) continue;
    const prev = await env.DB.prepare("SELECT t FROM hub_altsig WHERE sym = ? AND t > ?").bind(x.sym, now - 5 * 86400).first(); if (prev) continue;
    await env.DB.prepare("INSERT OR IGNORE INTO hub_altsig (sym, t, scen, px, lvl, stop, tgt, score) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(x.sym, now, s.scen, x.px ?? s.px, s.lvl, s.stop, s.tgt, s.score).run();
    const opened = await apOpen(env, say, x, s, now).catch(() => false);
    if (sent < 3) {
      const d = (v) => (v == null ? "?" : v >= 100 ? v.toFixed(2) : v >= 1 ? v.toFixed(3) : v.toPrecision(4));
      await say(env, `🪙 Altcoin-Scanner: ${x.sym} (Rang ${x.rank}) – ${s.scen}\nPunktzahl ${s.score}/100 · Kurs ${d(x.px ?? s.px)} · Level ${d(s.lvl)} · Stop-Zone ${d(s.stop)} · Ziel-Zone ${d(s.tgt)} (CRV ${s.rr ? s.rr.toFixed(1) : "?"})\n` +
        `Gründe: ${s.why.slice(0, 5).join(", ") || "–"}\nTrend Tag ${s.trendD} · 4h ${s.trend4} · 30T ggü. BTC ${s.rs30 != null ? (s.rs30 * 100).toFixed(1) + " %" : "?"}${opened ? `\n📒 Auf Papier eröffnet (Perp): Stop-Zone = 1R (${(Math.abs(s.lvl - s.stop) / (x.px ?? s.px) * 100).toFixed(1)} % Abstand → bei 1 % Kontorisiko Hebel ${(0.01 / (Math.abs((x.px ?? s.px) - s.stop) / (x.px ?? s.px))).toFixed(1)}×), Hälfte in der Ziel-Zone, ab +1R Einstand, ab +2R nachgezogener Stop.` : ""}\nNur Szenario zur eigenen Prüfung, keine Anlageberatung.`);
      sent++;
    }
  }
  // Papierdepot führen (4-Std.-Kerzen aller gescannten Coins)
  let apMsg = "";
  try { const H4by = {}, pxBy = {}; for (const x of coins) { H4by[x.sym] = toC(H4[x.cz]); pxBy[x.sym] = x.px; } apMsg = await apManage(env, say, H4by, pxBy, now); } catch (e) { apMsg = "Altcoin-Papier-Fehler " + e.message; }
  // Nachverfolgung: Kurs nach 1/3/7 Tagen und ob Ziel oder Stop zuerst erreicht wurde (grob über Tageskerzen)
  const due = (await env.DB.prepare("SELECT * FROM hub_altsig WHERE px7d IS NULL AND t < ?").bind(now - 86400).all()).results;
  for (const g of due) {
    const x = coins.find((c) => c.sym === g.sym); if (!x) continue; const D = toC(Dd[x.cz]); const px = x.px; const dt = now - g.t; const up = !/short|unten/.test(g.scen);
    const after = D.filter((k) => k.t >= g.t - 86400);
    let hit = g.hit; if (!hit) for (const k of after) { const sl = up ? k.l <= g.stop : k.h >= g.stop, tp = up ? k.h >= g.tgt : k.l <= g.tgt; if (sl) { hit = "Stop"; break; } if (tp) { hit = "Ziel"; break; } }
    const col = dt >= 7 * 86400 ? "px7d" : dt >= 3 * 86400 && g.px3d == null ? "px3d" : g.px1d == null ? "px1d" : null;
    if (col || hit !== g.hit) await env.DB.prepare(`UPDATE hub_altsig SET ${col || "hit"} = ?, hit = ? WHERE sym = ? AND t = ?`).bind(col ? px : hit, hit || null, g.sym, g.t).run();
  }
  const msg = `Altcoins (${msrc}${hist.err ? ", " + hist.err + " Coinalyze-Abrufe fehlgeschlagen: " + hist.last : ""}): ${coins.length} mit Perp, ${res.length} gescannt, ${res.filter((r) => r.s.scen).length} mit Szenario, ${sent} Hinweise${paused ? `, ${paused} pausiert (gelernt)` : ""} · ${apMsg}`;
  await kvPut(env, "log_alt", new Date().toISOString() + " " + msg);
  return msg;
}

// ---------------------------------------------------------------- Seite /alts
export async function altPage(env) {
  await altSchema(env);
  const A = (await env.DB.prepare("SELECT * FROM hub_alts ORDER BY score DESC").all()).results.map((r) => ({ ...r, d: JSON.parse(r.data || "{}"), data: undefined }));
  const M = (await env.DB.prepare("SELECT * FROM hub_mkt ORDER BY t DESC LIMIT 700").all()).results.reverse();
  const S = (await env.DB.prepare("SELECT * FROM hub_altsig ORDER BY t DESC LIMIT 100").all()).results;
  const P = (await env.DB.prepare("SELECT * FROM hub_apos ORDER BY t DESC LIMIT 200").all()).results;
  const DATA = JSON.stringify({ A, M, S, P }).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Altcoin-Scanner</title>
<style>:root{--bg:#070b10;--card:#0d141d;--line:#1d2b3b;--tx:#e6eef6;--mut:#8697aa;--gold:#e8b54a;--cy:#3fd2ff;--g:#36d399;--r:#ff5d73}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;padding:16px;max-width:1400px;margin:auto}
h1{font-size:21px;margin:0}h1 b{color:var(--gold)}.sub{color:var(--mut);font-size:12.5px;margin:4px 0 14px}.warn{background:#1d150b;border:1px solid #5a3a12;border-radius:10px;padding:9px 12px;font-size:12.5px;color:#f1c98a;margin-bottom:14px}
.kp{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:14px}.k{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px}.k b{display:block;font-size:19px;font-variant-numeric:tabular-nums}.k span{color:var(--mut);font-size:11.5px}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}.tabs button{background:var(--card);color:var(--tx);border:1px solid var(--line);border-radius:999px;padding:7px 12px;font:inherit;font-size:13px;cursor:pointer}.tabs button.on{background:var(--gold);color:#111;border-color:var(--gold);font-weight:700}
.w{overflow-x:auto;border:1px solid var(--line);border-radius:12px}table{border-collapse:collapse;width:100%;min-width:1100px}th,td{padding:7px 9px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}th{color:var(--mut);font-size:12px;background:var(--card);position:sticky;top:0}td:nth-child(-n+3),th:nth-child(-n+3){text-align:left}
.pos{color:var(--g)}.neg{color:var(--r)}.sc{display:inline-block;min-width:32px;text-align:center;border-radius:6px;padding:2px 6px;font-weight:700;color:#111}.why{white-space:normal;text-align:left!important;color:var(--mut);font-size:12px;min-width:260px}
svg{display:block;width:100%;height:60px}.foot{color:var(--mut);font-size:12px;margin-top:12px}a{color:var(--gold)}</style></head><body>
<h1>🪙 Altcoin-<b>Scanner</b></h1><div class="sub" id="sub"></div>
<div class="warn">Szenarien zur eigenen Prüfung, keine Anlageberatung. Ausbrüche scheitern oft (Fehlausbruch). Level, Stop- und Ziel-Zone sind rechnerisch aus den Tageskerzen abgeleitet. Die Statistik unten zeigt ehrlich, wie gemeldete Ausbrüche ausgingen.</div>
<div class="kp" id="kp"></div><div class="k" style="margin-bottom:14px"><span>BTC-Dominanz (blau) und TOTAL3 (gold) – seit Aufzeichnungsbeginn</span><div id="ch"></div></div>
<div class="tabs" id="tabs"></div><div class="w"><table><thead id="th"></thead><tbody id="tb"></tbody></table></div>
<div class="foot">Datenquellen: CoinGecko (Top 100, Marktbreite), Coinalyze (Perp-Kerzen, Open Interest, Funding). Scan stündlich. Rang = Marktkapitalisierung.</div>
<script>const D=${DATA};const $=(i)=>document.getElementById(i);const esc=(s)=>String(s??"").replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const pc=(v)=>v==null?"–":'<span class="'+(v>=0?"pos":"neg")+'">'+(v>=0?"+":"")+(v*100).toFixed(1)+"%</span>";const px=(v)=>v==null?"–":v>=100?v.toFixed(2):v>=1?v.toFixed(3):v.toPrecision(4);
const big=(v)=>v==null?"–":v>=1e12?(v/1e12).toFixed(2)+" Bio $":(v/1e9).toFixed(1)+" Mrd $";const M=D.M,L=M[M.length-1];
const back=(h)=>M.find(x=>x.t>=(L?L.t:0)-h*3600)||M[0];
if(L){const b=back(24);$("kp").innerHTML=[["BTC-Dominanz",L.btcd.toFixed(2)+" %",L.btcd-b.btcd,"Pp"],["ETH-Dominanz",(L.ethd||0).toFixed(2)+" %",(L.ethd||0)-(b.ethd||0),"Pp"],["Gesamt",big(L.total),L.total/b.total-1,"%"],["TOTAL2 (ohne BTC)",big(L.total2),L.total2/b.total2-1,"%"],["TOTAL3 (Altcoins)",big(L.total3),L.total3/b.total3-1,"%"],["Stablecoin-Anteil",(L.stabled||0).toFixed(2)+" %",(L.stabled||0)-(b.stabled||0),"Pp"]].map(([a,v,c,u])=>'<div class="k"><b>'+v+'</b><span>'+a+' · 24h '+(u==="%"?pc(c):'<span class="'+(c>=0?"pos":"neg")+'">'+(c>=0?"+":"")+c.toFixed(2)+" Pp</span>")+'</span></div>').join("")}
if(M.length>2){const W=600,H=60,line=(k,col)=>{const v=M.map(x=>x[k]);const mn=Math.min(...v),mx=Math.max(...v);return '<path fill="none" stroke="'+col+'" stroke-width="1.6" vector-effect="non-scaling-stroke" d="'+v.map((y,i)=>(i?"L":"M")+(i*W/(v.length-1)).toFixed(1)+" "+(H-4-(y-mn)/(mx-mn||1)*(H-8)).toFixed(1)).join(" ")+'"/>'};$("ch").innerHTML='<svg viewBox="0 0 600 60" preserveAspectRatio="none">'+line("btcd","#3fd2ff")+line("total3","#e8b54a")+'</svg>'}else $("ch").innerHTML='<div class="foot">Die Aufzeichnung startet gerade – der Verlauf füllt sich alle 15 Minuten.</div>';
$("sub").textContent=D.A.length?("Stand "+new Date(Math.max(...D.A.map(a=>a.t))*1000).toLocaleString("de-DE")+" · "+D.A.length+" Coins gescannt"):"Der erste Scan läuft zur nächsten vollen Stunde.";
const TABS=[["long","🚀 Ausbruch long",x=>x.d.scen&&!/short|unten/.test(x.d.scen)],["short","📉 Bruch nach unten",x=>x.d.scen&&/short|unten/.test(x.d.scen)],["rs","💪 Stärker als BTC",x=>(x.d.rs30??-9)>0],["all","Alle Top 100",()=>true],["sig","📋 Ergebnis-Statistik"],["pap","📒 Papier-Depot"]];
let tab="long";function render(){ $("tabs").innerHTML=TABS.map(t=>'<button class="'+(t[0]===tab?"on":"")+'" data-t="'+t[0]+'">'+t[1]+'</button>').join("");document.querySelectorAll("#tabs button").forEach(b=>b.onclick=()=>{tab=b.dataset.t;render()});
 if(tab==="pap"){const P=D.P,C=P.filter(p=>p.t_close),O=P.filter(p=>!p.t_close),sum=C.reduce((a,p)=>a+p.r,0),w=C.filter(p=>p.r>0).length;
  $("th").innerHTML="<tr><th colspan=10 style='text-align:left;font-size:13px;color:var(--tx)'>Abgeschlossen "+C.length+" · Summe <span class='"+(sum>=0?"pos":"neg")+"'>"+(sum>=0?"+":"")+sum.toFixed(2)+"R</span> · Ø "+(C.length?(sum/C.length).toFixed(2):"–")+"R · Treffer "+(C.length?Math.round(w/C.length*100):0)+" % · offen "+O.length+"/8 <span style='color:var(--mut)'>· Regeln: Stop-Zone = 1R, Hälfte in der Ziel-Zone, ab +1R Einstand, ab +2R nachgezogener Stop (1×ATR), max. 14 Tage · simuliert</span></th></tr><tr><th>Coin</th><th>Richtung</th><th>Eröffnet</th><th>Einstieg</th><th>Stop aktuell</th><th>Ziel-Zone</th><th>Kurs / Ausstieg</th><th>Ergebnis</th><th>Status</th><th>Punkte</th><th>Hebel bei 1 % Risiko</th></tr>";
  $("tb").innerHTML=[...O,...C].map(p=>{const R=Math.abs(p.e-p.sl0),cur=p.t_close?p.px_close:p.last_px,u=p.t_close?p.r:(R?((p.part||0)+(p.half?.5:1)*p.dir*(cur-p.e)/R):0);return "<tr><td><b>"+esc(p.sym)+"</b></td><td>"+(p.dir>0?"Long":"Short")+"</td><td>"+new Date(p.t*1000).toLocaleString("de-DE",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})+"</td><td>"+px(p.e)+"</td><td>"+px(p.sl)+(p.t_close?"":(p.dir>0?p.sl>=p.e:p.sl<=p.e)?" 🔒":"")+"</td><td>"+px(p.tgt)+(p.half?" ✓":"")+"</td><td>"+px(cur)+"</td><td><span class='"+(u>=0?"pos":"neg")+"'>"+(u>=0?"+":"")+u.toFixed(2)+"R</span></td><td>"+(p.t_close?esc(p.why):"offen"+(p.half?" (Hälfte verkauft)":""))+"</td><td>"+Math.round(p.score||0)+"</td><td>"+(R?(0.01/(R/p.e)).toFixed(1)+"×":"–")+"</td></tr>"}).join("")||"<tr><td colspan=11>Noch keine Papier-Trades. Der erste kommt mit dem nächsten bestätigten Ausbruch.</td></tr>";return}
 if(tab==="sig"){const S=D.S,done=S.filter(s=>s.hit);$("th").innerHTML="<tr><th>Coin</th><th>Szenario</th><th>Zeit</th><th>Punkte</th><th>Einstieg</th><th>nach 1T</th><th>nach 3T</th><th>nach 7T</th><th>zuerst erreicht</th></tr>";
  const ch=(a,b,up)=>a&&b?(up?1:-1)*(b/a-1):null;$("tb").innerHTML=(done.length?'<tr><td colspan=9 style="text-align:left;color:var(--mut)">Ausgewertet: '+done.length+' · Ziel zuerst: '+done.filter(s=>s.hit==="Ziel").length+' · Stop zuerst: '+done.filter(s=>s.hit==="Stop").length+'</td></tr>':"")+S.map(s=>{const up=!/short|unten/.test(s.scen);return "<tr><td><b>"+esc(s.sym)+"</b></td><td>"+esc(s.scen)+"</td><td>"+new Date(s.t*1000).toLocaleString("de-DE",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})+"</td><td>"+s.score+"</td><td>"+px(s.px)+"</td><td>"+pc(ch(s.px,s.px1d,up))+"</td><td>"+pc(ch(s.px,s.px3d,up))+"</td><td>"+pc(ch(s.px,s.px7d,up))+"</td><td>"+esc(s.hit||"offen")+"</td></tr>"}).join("")||"<tr><td colspan=9>Noch keine gemeldeten Ausbrüche.</td></tr>";return}
 const T=TABS.find(t=>t[0]===tab);const L=D.A.filter(T[2]).sort((a,b)=>tab==="rs"?(b.d.rs30-a.d.rs30):tab==="all"?(a.rank-b.rank):(b.score-a.score));
 $("th").innerHTML="<tr><th>#</th><th>Coin</th><th>Szenario</th><th>Punkte</th><th>Kurs</th><th>Level</th><th>Stop-Zone</th><th>Ziel-Zone</th><th>CRV</th><th>24h</th><th>7T</th><th>30T vs BTC</th><th>Trend T/4h</th><th>Gründe</th></tr>";
 $("tb").innerHTML=L.map(x=>{const d=x.d,s=x.score;return "<tr><td>"+x.rank+"</td><td><b>"+esc(x.sym)+"</b> <span style='color:var(--mut);font-size:11.5px'>"+esc(x.name)+"</span></td><td>"+esc(d.scen||"–")+"</td><td><span class=sc style='background:"+(s>=70?"#36d399":s>=50?"#f5c451":"#5b6b7c")+"'>"+s+"</span></td><td>"+px(x.px)+"</td><td>"+px(d.lvl)+"</td><td>"+px(d.stop)+"</td><td>"+px(d.tgt)+"</td><td>"+(d.rr?d.rr.toFixed(1):"–")+"</td><td>"+pc(d.r1)+"</td><td>"+pc(d.r7)+"</td><td>"+pc(d.rs30)+"</td><td>"+esc(d.trendD)+" / "+esc(d.trend4)+"</td><td class=why>"+esc((d.why||[]).join(" · "))+"</td></tr>"}).join("")||"<tr><td colspan=14>Keine Coins in dieser Liste.</td></tr>"}
render();</script></body></html>`;
}
