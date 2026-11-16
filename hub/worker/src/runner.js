// WC Trading Hub – Langläufer-Papier-Wallet (v3.0, Solana-Meme-Coins) – NUR SIMULIERT, kein echtes Geld, kein Schlüssel.
// Idee (Kevin, 17.11.): Viele Meme-Coins machen ihr Vielfaches erst nach Tagen/Wochen → keine feste Haltedauer.
//   Einstieg (Kevin 17.11.): Solana, Liquidität ≥ 10k $, Volumen 24 Std. ≥ 15k $, Marktwert ≥ 20k $, Alter 20 Min. – 6 Std., Sicherheitscheck nicht 🔴,
//     + Axiom-ähnliche Halter-Prüfung über Helius: Top-10-Wallets (ohne Pools/Bonding-Kurve) ≤ 30 % des Angebots, größte einzelne Wallet ≤ 10 %.
//     + Plausibilität: Volumen 24 Std. ≥ 1 × Marktwert, Liquidität 3–150 % des Marktwerts, Marktwert je Trade ≤ 2.000 $ (gegen aufgeblasene Marktwerte).
//     Socials werden mitgeschrieben (eigene Daten: mit Socials 3× so oft 5-fach) – Auswertung nach den ersten Wochen.
//   Einsatz 50 $ je Coin, Startkapital 5.000 $, höchstens 25 neue Käufe pro Tag.
//   Ausstieg: bei 2× wird der Einsatz herausgenommen (Hälfte verkauft) → Rest läuft „kostenlos“ weiter, OHNE Zeitlimit.
//     Rest wird erst verkauft, wenn er ≥ 5× war und danach 60 % vom Höchststand fällt, oder wenn der Coin tot ist
//     (Kurs ≤ 5 % vom Einstieg, Liquidität < 1.000 $ oder 24 Std. kein Kurs → Totalverlust).
// Zusätzlich: Langzeit-Messung (hub_meme_long) – täglich Marktwert aller gesehenen Solana-Coins für 30 Tage,
//   damit wir lernen, was spätere 10×–1000×-Coins am ersten Tag von den anderen unterschied.
const DS = "https://api.dexscreener.com";
const N = (x) => (x == null || x === "" ? null : +x);
export const RN = { start: 5000, size: 50, perDay: 25, cost: 0.03, x2: 2, runAfter: 5, trail: 0.6, dead: 0.05, liqDead: 1000, maxAgeH: 6, minAgeMin: 20, minLiq: 10000, minVol: 15000, minMc: 20000, top10: 0.30, top1: 0.10, checksPerRun: 5, minVolMc: 1.0, liqMc: [0.03, 1.5], maxMcPerTx: 2000 };

async function schema(env) {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_rpos (id TEXT PRIMARY KEY, t INTEGER, token TEXT, sym TEXT, px REAL, qty REAL, cost REAL, peak REAL, half INTEGER DEFAULT 0, cash REAL DEFAULT 0, last_px REAL, last_liq REAL, last_seen INTEGER, t_close INTEGER, px_close REAL, pnl REAL, why TEXT, f TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_meme_long (id TEXT, day INTEGER, mc REAL, liq REAL, PRIMARY KEY (id, day))"),
  ]);
}
async function prices(tokens) {
  const out = {};
  for (let i = 0; i < tokens.length; i += 30) {
    const r = await fetch(`${DS}/tokens/v1/solana/${tokens.slice(i, i + 30).join(",")}`, { headers: { "User-Agent": "Mozilla/5.0 wc-hub" } }).catch(() => null);
    const A = r && r.ok ? await r.json().catch(() => []) : [];
    for (const x of Array.isArray(A) ? A : []) { const k = x.baseToken?.address; if (!out[k] || (N(x.liquidity?.usd) || 0) > (out[k].liq || 0)) out[k] = { px: N(x.priceUsd), liq: N(x.liquidity?.usd), mc: N(x.marketCap) || N(x.fdv), v24: N(x.volume?.h24), tx24: (x.txns?.h24?.buys || 0) + (x.txns?.h24?.sells || 0), soc: (x.info?.socials || []).length + (x.info?.websites || []).length, created: x.pairCreatedAt ? x.pairCreatedAt / 1000 : null }; }
  }
  return out;
}
async function rpc(env, body) {
  const r = await fetch(`https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_KEY}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("Helius " + r.status); return r.json();
}
const SYS = "11111111111111111111111111111111";
// Axiom-ähnlich: Anteil der 10 größten ECHTEN Wallets (Pools, Bonding-Kurven und andere Programm-Konten werden herausgerechnet)
export async function holders(env, mint) {
  const [a, b] = await rpc(env, [{ jsonrpc: "2.0", id: 0, method: "getTokenLargestAccounts", params: [mint] }, { jsonrpc: "2.0", id: 1, method: "getTokenSupply", params: [mint] }]);
  const L = a?.result?.value || [], sup = N(b?.result?.value?.uiAmount); if (!L.length || !sup) return null;
  const acc = await rpc(env, { jsonrpc: "2.0", id: 2, method: "getMultipleAccounts", params: [L.map((x) => x.address), { encoding: "jsonParsed" }] });
  const own = (acc?.result?.value || []).map((v) => v?.data?.parsed?.info?.owner || null);
  const uniq = [...new Set(own.filter(Boolean))];
  const prog = await rpc(env, { jsonrpc: "2.0", id: 3, method: "getMultipleAccounts", params: [uniq, { encoding: "base64", dataSlice: { offset: 0, length: 0 } }] });
  const kind = Object.fromEntries(uniq.map((o, i) => [o, prog?.result?.value?.[i]?.owner || SYS]));   // Wallet = gehört dem System-Programm; sonst Programm-Konto (Pool o. Ä.)
  const per = {}; L.forEach((x, i) => { const o = own[i]; if (!o || kind[o] !== SYS) return; per[o] = (per[o] || 0) + (N(x.uiAmount) || 0); });
  const top = Object.values(per).sort((p, q) => q - p);
  return { top10: top.slice(0, 10).reduce((s2, v) => s2 + v, 0) / sup, top1: (top[0] || 0) / sup, pools: Object.keys(kind).filter((o) => kind[o] !== SYS).length };
}
const usd = (v) => (v == null ? "?" : v >= 1e6 ? (v / 1e6).toFixed(1) + " Mio. $" : v >= 1e3 ? Math.round(v / 1e3) + "k $" : Math.round(v) + " $");

export async function runnerTick(env, say) {
  await schema(env);
  const now = Math.floor(Date.now() / 1000), day = Math.floor(now / 86400); const log = [];
  // 1) neue Käufe
  const bal = await env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN t_close IS NOT NULL THEN pnl END), 0) re, COALESCE(SUM(CASE WHEN t_close IS NULL THEN cost - COALESCE(cash, 0) END), 0) inv, SUM(CASE WHEN t > ? THEN 1 ELSE 0 END) today FROM hub_rpos").bind(day * 86400).first();
  let free = RN.start + (bal?.re || 0) - (bal?.inv || 0), today = bal?.today || 0;
  const C = (await env.DB.prepare(`SELECT m.id, m.token, m.sym, f.f FROM hub_meme m LEFT JOIN hub_meme_feat f ON f.id = m.id AND f.kind = 'seen' LEFT JOIN hub_rpos r ON r.id = m.id
    WHERE m.chain = 'solana' AND r.id IS NULL AND m.last_t > ? AND m.created BETWEEN ? AND ? AND COALESCE(m.risk, '') NOT LIKE '%"danger"%'
      AND json_extract(m.data, '$.liq') >= ? AND json_extract(m.data, '$.mc') >= ? AND COALESCE(json_extract(m.data, '$.v24'), json_extract(m.data, '$.v6h'), 0) >= ?
      AND COALESCE(m.risk, '') NOT LIKE '%holders_bad%' ORDER BY m.score DESC LIMIT 20`)
    .bind(now - 900, now - RN.maxAgeH * 3600, now - RN.minAgeMin * 60, RN.minLiq, RN.minMc, RN.minVol).all()).results;
  if (C.length && today < RN.perDay && free >= RN.size) {
    const Q = await prices(C.map((c) => c.token)); let checks = 0;
    for (const c of C) {
      if (today >= RN.perDay || free < RN.size || checks >= RN.checksPerRun) break;
      const q = Q[c.token]; if (!q?.px || (q.liq || 0) < RN.minLiq || (q.mc || 0) < RN.minMc || (q.v24 || 0) < RN.minVol) continue;
      // Plausibilität (Muster „Scam vs. Gem“): Volumen muss zum Marktwert passen, Liquidität nicht unplausibel, Marktwert nicht durch wenige Trades aufgeblasen
      const vm = q.v24 / q.mc, lm = q.liq / q.mc, mpt = q.tx24 ? q.mc / q.tx24 : 1e9;
      if (vm < RN.minVolMc || lm < RN.liqMc[0] || lm > RN.liqMc[1] || mpt > RN.maxMcPerTx) { log.push(`${c.sym} unplausibel (Vol/MC ${vm.toFixed(2)}, Liq/MC ${lm.toFixed(2)}, MC/Trade ${Math.round(mpt)} $)`); continue; }
      let h = null; checks++;
      try { h = env.HELIUS_KEY ? await holders(env, c.token) : null; } catch (e) { log.push("Halter-Fehler " + e.message); }
      if (!h || h.top10 > RN.top10 || h.top1 > RN.top1) {
        await env.DB.prepare("UPDATE hub_meme SET risk = json_set(COALESCE(risk, '{}'), '$.holders_bad', ?) WHERE id = ?").bind(h ? `Top10 ${Math.round(h.top10 * 100)} %, größte ${Math.round(h.top1 * 100)} %` : "keine Halterdaten", c.id).run().catch(() => {});
        log.push(`${c.sym} abgelehnt (${h ? "Top10 " + Math.round(h.top10 * 100) + " %" : "keine Halterdaten"})`); continue;
      }
      const qty = RN.size / (q.px * (1 + RN.cost));
      const f = JSON.stringify({ ...(c.f ? JSON.parse(c.f) : {}), top10: h.top10, top1: h.top1, soc_now: q.soc, mc_in: q.mc, liq_in: q.liq, v24_in: q.v24, tx24_in: q.tx24, volmc: vm, liqmc: lm });
      await env.DB.prepare("INSERT OR IGNORE INTO hub_rpos (id, t, token, sym, px, qty, cost, peak, last_px, last_liq, last_seen, f) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(c.id, now, c.token, c.sym, q.px, qty, RN.size, q.px, q.px, q.liq, now, f).run();
      today++; free -= RN.size; log.push(`Kauf ${c.sym} (Top10 ${Math.round(h.top10 * 100)} %)`);
    }
  }
  // 2) offene Positionen führen
  const P = (await env.DB.prepare("SELECT * FROM hub_rpos WHERE t_close IS NULL").all()).results;
  if (P.length) {
    const Q = await prices(P.map((p) => p.token));
    for (const p of P) {
      const q = Q[p.token]; let why = null, at = null;
      if (!q?.px) { if (now - (p.last_seen || p.t) > 86400) { why = "kein Kurs seit 24 Std. (tot)"; at = 0; } }
      else {
        const peak = Math.max(p.peak, q.px);
        await env.DB.prepare("UPDATE hub_rpos SET last_px = ?, last_liq = ?, last_seen = ?, peak = ? WHERE id = ?").bind(q.px, q.liq, now, peak, p.id).run();
        if ((q.liq || 0) < RN.liqDead) { why = "Liquidität < 1.000 $ (Rug/tot)"; at = 0; }
        else if (q.px <= p.px * RN.dead) { why = "Kurs ≤ 5 % vom Einstieg (tot)"; at = q.px; }
        else if (!p.half && q.px >= p.px * RN.x2) {
          const sell = p.qty / 2, cash = sell * q.px * (1 - RN.cost);
          await env.DB.prepare("UPDATE hub_rpos SET half = 1, qty = ?, cash = ? WHERE id = ?").bind(p.qty - sell, cash, p.id).run();
          await say(env, `🌙 Langläufer ${p.sym}: 2× erreicht – Einsatz zurück (${usd(cash)}), Rest läuft ohne Zeitlimit weiter (Papier).`);
        }
        else if (peak >= p.px * RN.runAfter && q.px <= peak * (1 - RN.trail)) { why = `nach ${(peak / p.px).toFixed(1)}× Höchststand 60 % gefallen`; at = q.px; }
        if (peak >= p.px * 10 && p.peak < p.px * 10) await say(env, `🚀 Langläufer ${p.sym}: 10× seit Einstieg (Papier, Marktwert ${usd(q.mc)}).`);
      }
      if (why) {
        const cur = (await env.DB.prepare("SELECT qty, cash FROM hub_rpos WHERE id = ?").bind(p.id).first());
        const pnl = (cur.cash || 0) + cur.qty * at * (1 - RN.cost) - p.cost;
        await env.DB.prepare("UPDATE hub_rpos SET t_close = ?, px_close = ?, pnl = ?, why = ? WHERE id = ? AND t_close IS NULL").bind(now, at, pnl, why, p.id).run();
      }
    }
  }
  // 3) Langzeit-Messung (einmal pro Stunde, ältester Stand zuerst, max. 300 Coins je Lauf)
  if (new Date().getUTCMinutes() < 5) {
    const L = (await env.DB.prepare(`SELECT m.id, m.token FROM hub_meme m LEFT JOIN hub_meme_long l ON l.id = m.id AND l.day = ? WHERE m.chain = 'solana' AND m.first_seen > ? AND l.id IS NULL
      AND (m.first_mc IS NULL OR m.first_mc > 0) LIMIT 300`).bind(day, now - 30 * 86400).all()).results;
    if (L.length) {
      const Q = await prices(L.map((x) => x.token));
      const st = L.map((x) => env.DB.prepare("INSERT OR IGNORE INTO hub_meme_long (id, day, mc, liq) VALUES (?, ?, ?, ?)").bind(x.id, day, Q[x.token]?.mc ?? 0, Q[x.token]?.liq ?? 0));
      for (let i = 0; i < st.length; i += 90) await env.DB.batch(st.slice(i, i + 90));
      log.push(`Langzeit ${L.length}`);
    }
  }
  return `Langläufer: ${P.length} offen · ${log.join(", ") || "nichts Neues"}`;
}

export async function runnerData(env) {
  await schema(env);
  return {
    rules: RN,
    pos: (await env.DB.prepare("SELECT id, t, sym, px, cost, peak, half, cash, last_px, qty, t_close, pnl, why FROM hub_rpos ORDER BY t DESC LIMIT 200").all()).results,
  };
}
