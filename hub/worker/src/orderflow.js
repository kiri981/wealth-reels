// WC Trading Hub – Orderflow (v3.4, Kevin 17.11.: „für alle Bereiche, am besten alles kostenlos“)
// Wer drückt gerade? Aggressive Käufe (zum Marktpreis gekauft) minus aggressive Verkäufe = Delta; aufsummiert = CVD.
// Dazu Orderbuch-Ungleichgewicht (Kauf- vs. Verkaufsorders nahe am Kurs) und große Einzelorders.
// Quellen (alle kostenlos, ohne Schlüssel):
//  • Krypto (BTC, ETH, SOL, XRP, DOGE, BNB): Binance-Futures – 5-Min.-Kerzen mit Taker-Kaufvolumen, Orderbuch, letzte Trades
//  • Gold: Binance-Futures XAUUSDT (falls nicht verfügbar: PAXG, tokenisiertes Gold) + Hyperliquid xyz:GOLD (Orderbuch + Trades)
//  • Silber: Binance-Futures XAGUSDT + Hyperliquid xyz:SILVER
//  • S&P 500, Nasdaq 100: Hyperliquid xyz:SP500 / xyz:XYZ100 – Orderbuch gut, Trades nur als Stichprobe (die Schnittstelle liefert je Abruf die letzten 10)
//  • Devisen: es gibt kein kostenloses echtes Orderflow (dezentraler Markt) → nicht enthalten
// Gold-CFD beim Broker hat nur Tick-Volumen; Binance/Hyperliquid zeigen, wie Krypto-Händler Gold handeln – Annäherung, nicht CME.
// Erst MESSEN: Liefen unsere Trades besser, wenn das Delta der letzten Stunde in Trade-Richtung zeigte? (kv 'of_filter')
// Nur Auswertung, kein Handel, keine Anlageberatung.
const FAPI = "https://fapi.binance.com", SAPI = "https://api.binance.com", HL = "https://api.hyperliquid.xyz/info";
const UA = { "User-Agent": "Mozilla/5.0 wc-hub" };
const j = (u) => fetch(u, { headers: UA }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const hl = (b) => fetch(HL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
// Hub-Symbol → Quelle
export const OF = {
  BTCUSD: { bn: "BTCUSDT" }, ETHUSD: { bn: "ETHUSDT" }, SOLUSD: { bn: "SOLUSDT" }, XRPUSD: { bn: "XRPUSDT" }, DOGEUSD: { bn: "DOGEUSDT" }, BNBUSD: { bn: "BNBUSDT" },
  XAUUSD: { bn: "XAUUSDT", spot: "PAXGUSDT", hl: "xyz:GOLD" },
  XAGUSD: { bn: "XAGUSDT", hl: "xyz:SILVER" }, SP500: { hl: "xyz:SP500" }, NAS100: { hl: "xyz:XYZ100" },
};
const BIG = { BTCUSD: 500000, ETHUSD: 300000, XAUUSD: 100000 };   // „große Order“ ab … $ (sonst 100.000 $)

async function schema(env) {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_oflow (sym TEXT, src TEXT, t INTEGER, px REAL, buy REAL, sell REAL, delta REAL, imb REAL, bigb REAL, bigs REAL, PRIMARY KEY (sym, src, t))"),
  ]);
}
const b5 = (ms) => Math.floor(ms / 300000) * 300;

// Binance: 5-Min.-Kerzen (Feld 9 = Taker-Kaufvolumen in Basis, 10 = in USDT) → Kauf/Verkauf in $; gleich ~40 Std. Historie
async function bnKlines(base, sym) {
  const k = await j(`${base}${base === FAPI ? "/fapi/v1" : "/api/v3"}/klines?symbol=${sym}&interval=5m&limit=500`);
  if (!Array.isArray(k) || !k.length) return null;
  return k.slice(0, -1).map((x) => { const q = +x[7], tb = +x[10]; return { t: Math.floor(x[0] / 1000), px: +x[4], buy: tb, sell: q - tb, delta: 2 * tb - q }; });   // letzte (offene) Kerze weglassen
}
async function bnBook(base, sym) {
  const d = await j(`${base}${base === FAPI ? "/fapi/v1" : "/api/v3"}/depth?symbol=${sym}&limit=${base === FAPI ? 500 : 1000}`);
  if (!d?.bids?.length) return null;
  const mid = (+d.bids[0][0] + +d.asks[0][0]) / 2, lo = mid * 0.995, hi = mid * 1.005;
  const b = d.bids.filter((x) => +x[0] >= lo).reduce((a, x) => a + x[0] * x[1], 0), s = d.asks.filter((x) => +x[0] <= hi).reduce((a, x) => a + x[0] * x[1], 0);
  return b + s ? (b - s) / (b + s) : null;   // +1 = nur Kaufaufträge, −1 = nur Verkaufsaufträge (±0,5 % um den Kurs)
}
async function bnBig(base, sym, min) {
  const a = await j(`${base}${base === FAPI ? "/fapi/v1" : "/api/v3"}/aggTrades?symbol=${sym}&limit=1000`);
  if (!Array.isArray(a)) return null;
  const since = Date.now() - 300000; let bigb = 0, bigs = 0;
  for (const x of a) { if (x.T < since) continue; const v = x.p * x.q; if (v < min) continue; if (x.m) bigs += v; else bigb += v; }   // m = Käufer war Maker → aggressiver Verkauf
  return { bigb, bigs };
}
// Hyperliquid: letzte Trades (Seite B = aggressiver Kauf, A = aggressiver Verkauf) + Orderbuch
async function hlFlow(coin, min) {
  const [tr, bk] = await Promise.all([hl({ type: "recentTrades", coin }), hl({ type: "l2Book", coin })]);
  const out = {};
  if (Array.isArray(tr)) for (const x of tr) { const t = b5(x.time), v = +x.px * +x.sz, o = (out[t] ||= { t, px: +x.px, buy: 0, sell: 0, bigb: 0, bigs: 0 });
    if (x.side === "B") { o.buy += v; if (v >= min) o.bigb += v; } else { o.sell += v; if (v >= min) o.bigs += v; } o.px = +x.px; }
  let imb = null;
  if (bk?.levels?.[0]?.length) { const [B, A] = bk.levels; const mid = (+B[0].px + +A[0].px) / 2;
    const b = B.filter((x) => +x.px >= mid * 0.995).reduce((a, x) => a + x.px * x.sz, 0), s = A.filter((x) => +x.px <= mid * 1.005).reduce((a, x) => a + x.px * x.sz, 0); imb = b + s ? (b - s) / (b + s) : null; }
  return { rows: Object.values(out).map((o) => ({ ...o, delta: o.buy - o.sell })), imb };
}

const up = (env, sym, src, r, imb) => env.DB.prepare("INSERT INTO hub_oflow (sym, src, t, px, buy, sell, delta, imb, bigb, bigs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(sym, src, t) DO UPDATE SET px = excluded.px, buy = excluded.buy, sell = excluded.sell, delta = excluded.delta, imb = COALESCE(excluded.imb, imb), bigb = MAX(COALESCE(bigb, 0), COALESCE(excluded.bigb, 0)), bigs = MAX(COALESCE(bigs, 0), COALESCE(excluded.bigs, 0))")
  .bind(sym, src, r.t, r.px ?? null, r.buy, r.sell, r.delta, imb ?? null, r.bigb ?? null, r.bigs ?? null);

export async function ofTick(env, say, kvGet, kvPut) {
  await schema(env);
  const log = [], now = Math.floor(Date.now() / 1000), cur = b5(Date.now()) - 300;   // zuletzt abgeschlossene 5-Min.-Kerze
  const first = !(await kvGet(env, "of_init"));
  for (const [sym, s] of Object.entries(OF)) {
    const min = BIG[sym] || 100000;
    try {
      if (s.bn) {   // Binance-Futures, für Gold notfalls PAXG (Spot)
        let base = FAPI, bs = s.bn, K = await bnKlines(FAPI, s.bn);
        if (!K && s.spot) { base = SAPI; bs = s.spot; K = await bnKlines(SAPI, s.spot); }
        if (K) {
          const [imb, big] = await Promise.all([bnBook(base, bs), bnBig(base, bs, min)]);
          const rows = first ? K : K.slice(-3), st = [];
          for (const r of rows) st.push(up(env, sym, "bn:" + bs, { ...r, ...(r.t === cur ? big || {} : {}) }, r.t === cur ? imb : null));
          for (let i = 0; i < st.length; i += 100) await env.DB.batch(st.slice(i, i + 100)); log.push(`${sym} ${bs}:${rows.length}`);
        } else log.push(`${sym} Binance –`);
      }
      if (s.hl) {
        const F = await hlFlow(s.hl, min);
        const st = F.rows.filter((r) => r.t <= cur + 300).map((r) => up(env, sym, "hl:" + s.hl, r, r.t === Math.max(...F.rows.map((x) => x.t)) ? F.imb : null));
        if (st.length) await env.DB.batch(st); log.push(`${sym} ${s.hl}:${st.length}`);
      }
    } catch (e) { log.push(`${sym} Fehler ${e.message}`); }
  }
  if (first) await kvPut(env, "of_init", String(now));
  await env.DB.prepare("DELETE FROM hub_oflow WHERE t < ?").bind(now - 60 * 86400).run();

  // Lage je Markt: Delta 1 Std./4 Std., Kursänderung, Divergenz, Orderbuch, große Orders (für AURUM/Briefing)
  const S = {};
  for (const sym of Object.keys(OF)) {
    const R = (await env.DB.prepare("SELECT src, t, px, delta, imb, bigb, bigs, buy, sell FROM hub_oflow WHERE sym = ? AND t > ? ORDER BY t").bind(sym, now - 4 * 3600 - 600).all()).results;
    if (!R.length) continue;
    const bySrc = {}; for (const r of R) (bySrc[r.src] ||= []).push(r);
    S[sym] = {};
    for (const [src, L] of Object.entries(bySrc)) {
      const h1 = L.filter((r) => r.t > now - 3600 - 300), vol = (A) => A.reduce((a, r) => a + r.buy + r.sell, 0);
      const d1 = h1.reduce((a, r) => a + r.delta, 0), d4 = L.reduce((a, r) => a + r.delta, 0);
      const p0 = h1[0]?.px, p1 = L[L.length - 1].px, chg = p0 && p1 ? p1 / p0 - 1 : null;
      const rel = vol(h1) ? d1 / vol(h1) : null;   // Delta im Verhältnis zum Volumen (−1 … +1)
      const div = chg != null && rel != null && Math.abs(rel) > 0.05 && Math.sign(chg) !== Math.sign(rel) && Math.abs(chg) > 0.001 ? (chg > 0 ? "Preis steigt, Käufer fehlen" : "Preis fällt, Verkäufer fehlen") : null;
      const imb = [...L].reverse().find((r) => r.imb != null)?.imb ?? null;
      S[sym][src] = { d1: Math.round(d1), d4: Math.round(d4), rel: rel != null ? +rel.toFixed(3) : null, chg: chg != null ? +(chg * 100).toFixed(2) : null, div, imb: imb != null ? +imb.toFixed(2) : null,
        bigb: Math.round(h1.reduce((a, r) => a + (r.bigb || 0), 0)), bigs: Math.round(h1.reduce((a, r) => a + (r.bigs || 0), 0)), n: L.length };
    }
  }
  await kvPut(env, "of_now", JSON.stringify({ t: now, S }));

  // Messung (stündlich): Ø R unserer geschlossenen Papier-Trades mit / gegen / ohne Orderflow (Delta der Stunde VOR dem Einstieg)
  if (new Date().getUTCMinutes() < 5) {
    try {
      const TR = (await env.DB.prepare("SELECT t.t, t.dr, t.r, COALESCE(t.sym, 'XAUUSD') sym FROM hub_trades t WHERE t.closed = 1 AND t.t > ?").bind(now - 60 * 86400).all()).results;
      const F = {}, BY = {};
      for (const x of TR) if (OF[x.sym]) (BY[x.sym] ||= []).push(x);
      for (const [sym, L] of Object.entries(BY)) {
        // je Markt EINE Quelle (Binance bevorzugt), damit nichts doppelt zählt
        const src = (await env.DB.prepare("SELECT src FROM hub_oflow WHERE sym = ? GROUP BY src ORDER BY (src LIKE 'bn:%') DESC, COUNT(*) DESC LIMIT 1").bind(sym).first())?.src; if (!src) continue;
        const R = (await env.DB.prepare("SELECT t, delta, buy + sell v FROM hub_oflow WHERE sym = ? AND src = ? AND t > ? ORDER BY t").bind(sym, src, now - 61 * 86400).all()).results;
        if (!R.length) continue;
        for (const x of L) {
          let d = 0, v = 0; for (const r of R) { if (r.t > x.t - 300) break; if (r.t >= x.t - 3600) { d += r.delta; v += r.v; } }
          if (!v) continue; const rel = d / v;
          const k = Math.abs(rel) < 0.03 ? "neutral" : Math.sign(rel) === x.dr ? "mit Orderflow" : "gegen Orderflow";
          const f = (F[k] ||= { n: 0, sum: 0, win: 0 }); f.n++; f.sum += x.r; f.win += x.r > 0 ? 1 : 0;
        }
      }
      await kvPut(env, "of_filter", JSON.stringify({ t: now, F }));
    } catch (e) { log.push("Messung " + e.message); }
  }

  // Morgens 8:30 (Bukarest) eine kurze Lage
  const d = new Date(), loc = (d.getUTCHours() + 2) % 24, day = d.toISOString().slice(0, 10);
  if (loc === 8 && d.getUTCMinutes() >= 30 && (await kvGet(env, "of_day")) !== day) {
    await kvPut(env, "of_day", day);
    const NM = { XAUUSD: "Gold", XAGUSD: "Silber", BTCUSD: "Bitcoin", ETHUSD: "Ethereum", SOLUSD: "Solana", SP500: "S&P 500", NAS100: "Nasdaq 100" };
    const lines = Object.entries(NM).filter(([k]) => S[k]).map(([k, n]) => { const v = Object.values(S[k]).sort((a, b) => b.n - a.n)[0]; if (!v || v.rel == null) return null;
      const dir = v.rel > 0.05 ? "Käufer drücken 🟢" : v.rel < -0.05 ? "Verkäufer drücken 🔴" : "ausgeglichen ⚪";
      return `• ${n}: ${dir} (Delta 1 Std. ${v.rel > 0 ? "+" : ""}${Math.round(v.rel * 100)} %)${v.imb != null ? `, Orderbuch ${v.imb > 0.1 ? "kauflastig" : v.imb < -0.1 ? "verkaufslastig" : "ausgeglichen"}` : ""}${v.div ? ` ⚠️ ${v.div}` : ""}`; }).filter(Boolean);
    let ff = ""; try { const F = JSON.parse((await kvGet(env, "of_filter")) || "{}").F || {}; const a = F["mit Orderflow"], g = F["gegen Orderflow"];
      if (a?.n >= 10 && g?.n >= 10) ff = `\nUnsere Trades mit Orderflow: Ø ${(a.sum / a.n).toFixed(2)} R (${a.n}) · gegen: Ø ${(g.sum / g.n).toFixed(2)} R (${g.n})`; } catch (e) {}
    if (lines.length) await say(env, `🌊 Orderflow-Lage (wer drückt gerade?)\n${lines.join("\n")}${ff}\nNur Beobachtung, keine Anlageberatung.`).catch(() => {});
  }
  return "Orderflow: " + log.join(" · ");
}
