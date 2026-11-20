// WC Trading Hub – Früh-Scalper (v3.7, Kevin 18.11.: „Mindestalter 8 Minuten wie bei einem anderen Trader – früh rein, nicht den halben Anstieg verpassen“)
// Eigenes Papier-Konto (5.000 $, 100 $ je Trade, max. 30 Trades/Tag, max. 6 offen), läuft JEDE MINUTE.
// Kandidaten: Solana-Coins 8–45 Min. alt, Liquidität ≥ 10.000 $, Volumen ≥ 15.000 $, Marktwert ≥ 20.000 $ (wie Kevins Filter, nur jünger),
//   in den letzten 5 Min. mehr Käufe als Verkäufe und Kurs im Plus, Volumen passt zum Marktwert (keine Scheintrades),
//   Sicherheitscheck nicht „gefährlich“, kein Trittbrettfahrer, Verteilung (Top-10 ≤ 35 %, Top-1 ≤ 12 %), kein Sniper-Bündel / Serien-Entwickler.
// Ausstiege: −25 % Stopp · bei +50 % die Hälfte raus, Rest mit 30 % Abstand vom Höchststand nachgezogen · nach 45 Min. raus, wenn nicht ≥ +20 % ·
//   spätestens nach 6 Std. raus · Liquidität < 2.000 $ = Rug (alles weg). Kosten 3 % je Seite (Gebühren + Schlupf bei jungen Coins).
// Nur Papier, keine Anlageberatung.
import { prices, holders, plausible } from "./runner.js";
import { copycat, devBundle } from "./memeguard.js";
export const SC = { stopNew: true /* v3.10 (Kevin 21.11.): keine neuen Einstiege mehr – ersetzt durch Wallet-Copy */, start: 5000, size: 100, perDay: 30, maxOpen: 6, cost: 0.03, minAgeMin: 8, maxAgeMin: 45, liq: 10000, vol: 15000, mc: 20000,
  sl: -0.25, tp1: 0.5, trail: 0.3, slowMin: 45, slowGain: 0.2, maxH: 6, liqDead: 2000, top10: 0.35, top1: 0.12 };
async function schema(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_scpos (id TEXT PRIMARY KEY, t INTEGER, token TEXT, sym TEXT, px REAL, qty REAL, cost REAL, peak REAL, half INTEGER DEFAULT 0, cash REAL DEFAULT 0, last_px REAL, last_seen INTEGER, t_close INTEGER, px_close REAL, pnl REAL, why TEXT, f TEXT)").run();
}
export async function scalpTick(env, say, kvGet, kvPut) {
  await schema(env);
  const now = Math.floor(Date.now() / 1000), day = Math.floor(now / 86400) * 86400, log = [];
  // 1) offene Positionen führen
  const P = (await env.DB.prepare("SELECT * FROM hub_scpos WHERE t_close IS NULL").all()).results;
  if (P.length) {
    const Q = await prices(P.map((p) => p.token));
    for (const p of P) {
      const q = Q[p.token]; let why = null, at = null;
      if (!q?.px) { if (now - (p.last_seen || p.t) > 1800) { why = "kein Kurs seit 30 Min."; at = 0; } }
      else if (!plausible(p, q)) { await env.DB.prepare("UPDATE hub_scpos SET last_seen = ? WHERE id = ?").bind(now, p.id).run(); continue; }
      else {
        const peak = Math.max(p.peak, q.px), g = q.px / p.px - 1, age = (now - p.t) / 60;
        await env.DB.prepare("UPDATE hub_scpos SET last_px = ?, last_seen = ?, peak = ? WHERE id = ?").bind(q.px, now, peak, p.id).run();
        if ((q.liq || 0) < SC.liqDead) { why = "Rug (Liquidität weg)"; at = 0; }
        else if (g <= SC.sl) { why = "Stopp −25 %"; at = q.px; }
        else if (!p.half && g >= SC.tp1) { const sell = p.qty / 2, cash = sell * q.px * (1 - SC.cost);
          await env.DB.prepare("UPDATE hub_scpos SET half = 1, qty = ?, cash = ? WHERE id = ?").bind(p.qty - sell, cash, p.id).run(); }
        else if (p.half && q.px <= peak * (1 - SC.trail)) { why = `nachgezogen (Hoch ${(peak / p.px).toFixed(1)}×)`; at = q.px; }
        else if (!p.half && age >= SC.slowMin && g < SC.slowGain) { why = "zu langsam (45 Min.)"; at = q.px; }
        else if (age >= SC.maxH * 60) { why = "Zeit (6 Std.)"; at = q.px; }
        if (peak >= p.px * 5 && p.peak < p.px * 5) await say(env, `⚡ Früh-Scalper ${p.sym}: 5× seit Einstieg (Papier).`).catch(() => {});
      }
      if (why) { const cur = await env.DB.prepare("SELECT qty, cash FROM hub_scpos WHERE id = ?").bind(p.id).first();
        const pnl = (cur.cash || 0) + cur.qty * at * (1 - SC.cost) - p.cost;
        await env.DB.prepare("UPDATE hub_scpos SET t_close = ?, px_close = ?, pnl = ?, why = ? WHERE id = ? AND t_close IS NULL").bind(now, at, pnl, why, p.id).run(); log.push(`${p.sym} zu (${why}, ${pnl >= 0 ? "+" : ""}${pnl.toFixed(0)} $)`); }
    }
  }
  // 2) neue Einstiege
  const bal = await env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN t_close IS NOT NULL THEN pnl END), 0) re, COALESCE(SUM(CASE WHEN t_close IS NULL THEN cost - COALESCE(cash, 0) END), 0) inv, SUM(t > ?) today, SUM(t_close IS NULL) open FROM hub_scpos").bind(day).first();
  let free = SC.start + (bal?.re || 0) - (bal?.inv || 0), today = bal?.today || 0, open = bal?.open || 0;
  if (!SC.stopNew && today < SC.perDay && open < SC.maxOpen && free >= SC.size) {
    const C = (await env.DB.prepare(`SELECT m.id, m.token, m.sym, m.name, m.created, m.risk FROM hub_meme m LEFT JOIN hub_scpos s ON s.id = m.id
      WHERE m.chain = 'solana' AND s.id IS NULL AND m.last_t > ? AND m.created BETWEEN ? AND ? AND COALESCE(m.risk, '') NOT LIKE '%"danger"%' AND COALESCE(m.risk, '') NOT LIKE '%scalp_bad%'
      ORDER BY m.score DESC LIMIT 15`).bind(now - 600, now - SC.maxAgeMin * 60, now - SC.minAgeMin * 60).all()).results;
    if (C.length) {
      const Q = await prices(C.map((c) => c.token)); let deep = 0;
      for (const c of C) {
        if (today >= SC.perDay || open >= SC.maxOpen || free < SC.size || deep >= 2) break;
        const q = Q[c.token]; if (!q?.px) continue;
        // Pump.fun-Coins (Adresse endet auf „pump“) haben keine Mint-/Freeze-Rechte – andere nur mit erledigtem Sicherheitscheck
        if (!/pump$/.test(c.token) && !/"level":"(ok|warn)"/.test(c.risk || "")) continue;
        const bad = async (why) => { await env.DB.prepare("UPDATE hub_meme SET risk = json_set(COALESCE(risk, '{}'), '$.scalp_bad', ?) WHERE id = ?").bind(why, c.id).run().catch(() => {}); log.push(`${c.sym}: ${why}`); };
        if ((q.liq || 0) < SC.liq || (q.mc || 0) < SC.mc || (q.v24 || 0) < SC.vol) continue;   // (noch) zu klein – später nochmal ansehen
        if (!(q.b5 > q.s5) || !((q.c5 || 0) > 0)) continue;                                     // gerade kein Kaufdruck – später nochmal
        const vm = q.v24 / q.mc, lm = q.liq / q.mc, mpt = q.tx24 ? q.mc / q.tx24 : 1e9;
        if (vm < 0.5 || lm < 0.05 || lm > 1.5 || mpt > 2000) { await bad(`unplausibel (Vol/MC ${vm.toFixed(2)}, Liq/MC ${lm.toFixed(2)})`); continue; }
        const cc = await copycat(env, { id: c.id, token: c.token, sym: c.sym, name: c.name, created: c.created, mc: q.mc }).catch(() => null); if (cc) { await bad(cc); continue; }
        deep++;
        let h = null; try { h = env.HELIUS_KEY ? await holders(env, c.token) : null; } catch (e) { log.push("Halter " + e.message); }
        if (!h || h.top10 > SC.top10 || h.top1 > SC.top1) { await bad(h ? `Top10 ${Math.round(h.top10 * 100)} %, größte ${Math.round(h.top1 * 100)} %` : "keine Halterdaten"); continue; }
        let d = null; try { d = await devBundle(env, c.token); } catch (e) { log.push("Entwickler " + e.message); }
        if (d?.bad) { await bad(d.bad); continue; }
        const buy = q.px * (1 + SC.cost), qty = SC.size / buy;
        const f = JSON.stringify({ age_min: Math.round((now - c.created) / 60), mc: q.mc, liq: q.liq, v24: q.v24, c5: q.c5, c1h: q.c1h, b5: q.b5, s5: q.s5, top10: h.top10, top1: h.top1, bundle: d?.bundle ?? null, dev_n: d?.hist?.n ?? null });
        const ins = await env.DB.prepare("INSERT OR IGNORE INTO hub_scpos (id, t, token, sym, px, qty, cost, peak, last_px, last_seen, f) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(c.id, now, c.token, c.sym, q.px, qty, SC.size, q.px, q.px, now, f).run();
        if (ins.meta?.changes) { today++; open++; free -= SC.size; log.push(`${c.sym} gekauft (${Math.round((now - c.created) / 60)} Min. alt, Marktwert ${Math.round(q.mc / 1000)}k $)`); }
      }
    }
  }
  // Tagesbilanz 22 Uhr (Bukarest)
  const dd = new Date(), loc = (dd.getUTCHours() + 2) % 24, dk = dd.toISOString().slice(0, 10);
  if (loc === 22 && (await kvGet(env, "sc_day")) !== dk) {
    await kvPut(env, "sc_day", dk);
    const S = await env.DB.prepare("SELECT COUNT(*) n, SUM(pnl > 0) w, SUM(pnl) p, MAX(pnl) best FROM hub_scpos WHERE t_close IS NOT NULL AND t > ?").bind(now - 86400).first();
    const A = await env.DB.prepare("SELECT COUNT(*) n, SUM(pnl) p FROM hub_scpos WHERE t_close IS NOT NULL").first();
    if (S?.n) await say(env, `⚡ Früh-Scalper (ab 8 Min., Papier): heute ${S.n} Trades, ${S.w || 0} im Plus, ${(S.p || 0) >= 0 ? "+" : ""}${(S.p || 0).toFixed(0)} $ (bester +${(S.best || 0).toFixed(0)} $).\nGesamt: ${A.n} Trades, ${(A.p || 0) >= 0 ? "+" : ""}${(A.p || 0).toFixed(0)} $ auf 5.000 $ Startkapital.\nNur Papier, keine Anlageberatung.`).catch(() => {});
  }
  return "Scalper: " + (log.join(" · ") || "nichts");
}
