import { rpc } from "./helius.js";
import { chase, copycat, devBundle } from "./memeguard.js";
// WC Trading Hub – Langläufer-Papier-Wallet (v3.0, Solana-Meme-Coins) – NUR SIMULIERT, kein echtes Geld, kein Schlüssel.
// Idee (Kevin, 17.11.): Viele Meme-Coins machen ihr Vielfaches erst nach Tagen/Wochen → keine feste Haltedauer.
//   Einstieg (Kevin 17.11.): Solana, Liquidität ≥ 10k $, Volumen 24 Std. ≥ 15k $, Marktwert ≥ 20k $, Alter 20 Min. – 6 Std., Sicherheitscheck nicht 🔴,
//     + Axiom-ähnliche Halter-Prüfung über Helius: Top-10-Wallets (ohne Pools/Bonding-Kurve) ≤ 30 % des Angebots, größte einzelne Wallet ≤ 10 %.
//     + Plausibilität: Volumen 24 Std. ≥ 1 × Marktwert, Liquidität 3–150 % des Marktwerts, Marktwert je Trade ≤ 2.000 $ (gegen aufgeblasene Marktwerte).
//     + Insider/Bundler: ≥ 3 Top-Halter mit demselben SOL-Geldgeber oder ≥ 5 frische Wegwerf-Wallets (< 15 Transaktionen) unter den Top 10 → abgelehnt.
//     Socials werden mitgeschrieben (eigene Daten: mit Socials 3× so oft 5-fach) – Auswertung nach den ersten Wochen.
//   Einsatz 50 $ je Coin, Startkapital 5.000 $, höchstens 25 neue Käufe pro Tag.
//   Ausstieg: bei 2× wird der Einsatz herausgenommen (Hälfte verkauft) → Rest läuft „kostenlos“ weiter, OHNE Zeitlimit.
//     Rest wird erst verkauft, wenn er ≥ 5× war und danach 60 % vom Höchststand fällt, oder wenn der Coin tot ist
//     (Kurs ≤ 5 % vom Einstieg, Liquidität < 1.000 $ oder 24 Std. kein Kurs → Totalverlust).
// Zusätzlich: Langzeit-Messung (hub_meme_long) – täglich Marktwert aller gesehenen Solana-Coins für 30 Tage,
//   damit wir lernen, was spätere 10×–1000×-Coins am ersten Tag von den anderen unterschied.
import { tagNarr } from "./narrative.js";
const DS = "https://api.dexscreener.com";
const N = (x) => (x == null || x === "" ? null : +x);
export const RN = { stopNew: true /* v3.10 (Kevin 21.11.): keine neuen Käufe mehr, offene laufen aus */, start: 5000, size: 50, perDay: 25, cost: 0.03, x2: 2, runAfter: 5, trail: 0.6, dead: 0.05, liqDead: 1000, maxAgeH: 6, minAgeMin: 20, minLiq: 10000, minVol: 15000, minMc: 20000, top10: 0.30, top1: 0.10, checksPerRun: 3, maxCluster: 3, maxFresh: 5, minVolMc: 1.0, liqMc: [0.03, 1.5], maxMcPerTx: 2000 };

async function schema(env) {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_rpos (id TEXT PRIMARY KEY, t INTEGER, token TEXT, sym TEXT, px REAL, qty REAL, cost REAL, peak REAL, half INTEGER DEFAULT 0, cash REAL DEFAULT 0, last_px REAL, last_liq REAL, last_seen INTEGER, t_close INTEGER, px_close REAL, pnl REAL, why TEXT, f TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_meme_long (id TEXT, day INTEGER, mc REAL, liq REAL, PRIMARY KEY (id, day))"),
  ]);
}
// v3.2 (17.11.): Ein Kurssprung zählt nur, wenn echter Handel dahintersteht. Sonst Datenfehler (Schein-Pool: Marktwert 32 Mio., Liquidität 23 Mio., 100 $ Volumen/Std.)
export function plausible(p, q) {
  if (q.mc && q.liq && q.liq > q.mc * 1.2) return false;
  const ref = p.last_px || p.px;
  if (q.px > ref * 3 && !((q.v1h || 0) >= (q.mc || 0) * 0.02 && (q.v1h || 0) >= 5000)) return false;
  return true;
}
export async function prices(tokens) {
  const out = {};
  for (let i = 0; i < tokens.length; i += 30) {
    const r = await fetch(`${DS}/tokens/v1/solana/${tokens.slice(i, i + 30).join(",")}`, { headers: { "User-Agent": "Mozilla/5.0 wc-hub" } }).catch(() => null);
    const A = r && r.ok ? await r.json().catch(() => []) : [];
    for (const x of Array.isArray(A) ? A : []) { const k = x.baseToken?.address; if (!out[k] || (N(x.volume?.h24) || 0) > (out[k].v24 || 0)) out[k] = { px: N(x.priceUsd), b5: x.txns?.m5?.buys || 0, s5: x.txns?.m5?.sells || 0, c5: N(x.priceChange?.m5), c1h: N(x.priceChange?.h1), v5: N(x.volume?.m5), pool: x.pairAddress, liq: N(x.liquidity?.usd), mc: N(x.marketCap) || N(x.fdv), v1h: N(x.volume?.h1), v24: N(x.volume?.h24), tx24: (x.txns?.h24?.buys || 0) + (x.txns?.h24?.sells || 0), soc: (x.info?.socials || []).length + (x.info?.websites || []).length, created: x.pairCreatedAt ? x.pairCreatedAt / 1000 : null }; }
  }
  return out;
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
  const wallets = Object.entries(per).sort((p, q) => q[1] - p[1]).slice(0, 10).map(([w]) => w);
  return { top10: top.slice(0, 10).reduce((s2, v) => s2 + v, 0) / sup, top1: (top[0] || 0) / sup, pools: Object.keys(kind).filter((o) => kind[o] !== SYS).length, wallets };
}
// Insider-/Bundler-Prüfung (wie Axiom „Insiders/Bundlers“): Wer hat die Top-Halter mit SOL versorgt? Wie frisch sind sie?
//   ≥ 3 Top-Halter mit DEMSELBEN Geldgeber → eine Person/Gruppe (Insider-Cluster). ≥ 5 Top-10-Wallets mit < 15 Transaktionen → Wegwerf-/Bundle-Wallets.
export async function insiders(env, wallets) {
  if (!wallets?.length) return null;
  const S = await rpc(env, wallets.map((w, i) => ({ jsonrpc: "2.0", id: i, method: "getSignaturesForAddress", params: [w, { limit: 1000 }] })));
  const info = wallets.map((w, i) => { const L = (Array.isArray(S) ? S.find((x) => x.id === i)?.result : null) || []; return { w, n: L.length, oldest: L.length && L.length < 1000 ? L[L.length - 1].signature : null }; });
  const fresh = info.filter((x) => x.n > 0 && x.n < 15).length;
  const ask = info.filter((x) => x.oldest);
  const T = ask.length ? await rpc(env, ask.map((x, i) => ({ jsonrpc: "2.0", id: i, method: "getTransaction", params: [x.oldest, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }] }))) : [];
  const fund = {};
  for (const r of Array.isArray(T) ? T : []) {
    const x = ask[r.id], tx = r.result; if (!tx) continue;
    const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === "string" ? k : k.pubkey)), pre = tx.meta?.preBalances || [], post = tx.meta?.postBalances || [];
    let best = null, drop = 0; keys.forEach((k, i) => { const d = (pre[i] || 0) - (post[i] || 0); if (k !== x.w && d > drop) { drop = d; best = k; } });
    if (best) (fund[best] ||= []).push(x.w);
  }
  let cl = Object.entries(fund).sort((a, b) => b[1].length - a[1].length)[0];
  if (cl && cl[1].length >= 3) {   // Börsen-Auszahlungs-Wallets (sehr viele Transaktionen in kurzer Zeit) sind kein Insider-Cluster
    const f = await rpc(env, { jsonrpc: "2.0", id: 9, method: "getSignaturesForAddress", params: [cl[0], { limit: 1000 }] }); const L = f?.result || [];
    if (L.length >= 1000 && L[0].blockTime - L[L.length - 1].blockTime < 6 * 3600) cl = null;
  }
  return { fresh, cluster: cl ? cl[1].length : 0, funder: cl ? cl[0] : null, checked: info.length };
}
const usd = (v) => (v == null ? "?" : v >= 1e6 ? (v / 1e6).toFixed(1) + " Mio. $" : v >= 1e3 ? Math.round(v / 1e3) + "k $" : Math.round(v) + " $");

export async function runnerTick(env, say) {
  await schema(env);
  const now = Math.floor(Date.now() / 1000), day = Math.floor(now / 86400); const log = [];
  // 1) neue Käufe
  const bal = await env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN t_close IS NOT NULL THEN pnl END), 0) re, COALESCE(SUM(CASE WHEN t_close IS NULL THEN cost - COALESCE(cash, 0) END), 0) inv, SUM(CASE WHEN t > ? THEN 1 ELSE 0 END) today FROM hub_rpos").bind(day * 86400).first();
  let free = RN.start + (bal?.re || 0) - (bal?.inv || 0), today = bal?.today || 0;
  const C = (await env.DB.prepare(`SELECT m.id, m.token, m.sym, m.name, m.created, m.data, f.f FROM hub_meme m LEFT JOIN hub_meme_feat f ON f.id = m.id AND f.kind = 'seen' LEFT JOIN hub_rpos r ON r.id = m.id
    WHERE m.chain = 'solana' AND r.id IS NULL AND m.last_t > ? AND m.created BETWEEN ? AND ? AND COALESCE(m.risk, '') NOT LIKE '%"danger"%'
      AND json_extract(m.data, '$.liq') >= ? AND json_extract(m.data, '$.mc') >= ? AND COALESCE(json_extract(m.data, '$.v24'), json_extract(m.data, '$.v6h'), 0) >= ?
      AND COALESCE(m.risk, '') NOT LIKE '%holders_bad%' ORDER BY m.score DESC LIMIT 20`)
    .bind(now - 900, now - RN.maxAgeH * 3600, now - RN.minAgeMin * 60, RN.minLiq, RN.minMc, RN.minVol).all()).results;
  if (!RN.stopNew && C.length && today < RN.perDay && free >= RN.size) {
    const Q = await prices(C.map((c) => c.token)); let checks = 0;
    for (const c of C) {
      if (today >= RN.perDay || free < RN.size || checks >= RN.checksPerRun) break;
      const q = Q[c.token]; if (!q?.px || (q.liq || 0) < RN.minLiq || (q.mc || 0) < RN.minMc || (q.v24 || 0) < RN.minVol) continue;
      // Plausibilität (Muster „Scam vs. Gem“): Volumen muss zum Marktwert passen, Liquidität nicht unplausibel, Marktwert nicht durch wenige Trades aufgeblasen
      const vm = q.v24 / q.mc, lm = q.liq / q.mc, mpt = q.tx24 ? q.mc / q.tx24 : 1e9;
      if (vm < RN.minVolMc || lm < RN.liqMc[0] || lm > RN.liqMc[1] || mpt > RN.maxMcPerTx) { log.push(`${c.sym} unplausibel (Vol/MC ${vm.toFixed(2)}, Liq/MC ${lm.toFixed(2)}, MC/Trade ${Math.round(mpt)} $)`); continue; }
      { let d = {}; try { d = JSON.parse(c.data || "{}"); } catch (e) {}
        const g = chase(d) || (await copycat(env, { id: c.id, token: c.token, sym: c.sym, name: c.name, created: c.created, mc: q.mc }).catch(() => null));
        if (g) { await env.DB.prepare("UPDATE hub_meme SET risk = json_set(COALESCE(risk, '{}'), '$.holders_bad', ?) WHERE id = ?").bind(g, c.id).run().catch(() => {}); log.push(`${c.sym} abgelehnt (${g})`); continue; } }   // v3.7
      let h = null; checks++;
      try { h = env.HELIUS_KEY ? await holders(env, c.token) : null; } catch (e) { log.push("Halter-Fehler " + e.message); }
      let ins = null;
      if (h && h.top10 <= RN.top10 && h.top1 <= RN.top1) { try { ins = await insiders(env, h.wallets); } catch (e) { log.push("Insider-Fehler " + e.message); } }
      if (ins && (ins.cluster >= RN.maxCluster || ins.fresh >= RN.maxFresh)) {
        const why = ins.cluster >= RN.maxCluster ? `Insider-Cluster: ${ins.cluster} Top-Halter vom selben Geldgeber` : `${ins.fresh} von ${ins.checked} Top-Haltern sind frische Wegwerf-Wallets`;
        await env.DB.prepare("UPDATE hub_meme SET risk = json_set(COALESCE(risk, '{}'), '$.holders_bad', ?) WHERE id = ?").bind(why, c.id).run().catch(() => {});
        log.push(`${c.sym} abgelehnt (${why})`); continue;
      }
      if (!h || h.top10 > RN.top10 || h.top1 > RN.top1) {
        await env.DB.prepare("UPDATE hub_meme SET risk = json_set(COALESCE(risk, '{}'), '$.holders_bad', ?) WHERE id = ?").bind(h ? `Top10 ${Math.round(h.top10 * 100)} %, größte ${Math.round(h.top1 * 100)} %` : "keine Halterdaten", c.id).run().catch(() => {});
        log.push(`${c.sym} abgelehnt (${h ? "Top10 " + Math.round(h.top10 * 100) + " %" : "keine Halterdaten"})`); continue;
      }
      const qty = RN.size / (q.px * (1 + RN.cost));
      let db_ = null; try { db_ = await devBundle(env, c.token); } catch (e) { log.push("Entwickler-Prüfung " + e.message); }   // v3.7
      if (db_?.bad) { await env.DB.prepare("UPDATE hub_meme SET risk = json_set(COALESCE(risk, '{}'), '$.holders_bad', ?) WHERE id = ?").bind(db_.bad, c.id).run().catch(() => {}); log.push(`${c.sym} abgelehnt (${db_.bad})`); continue; }
      const f = JSON.stringify({ ...(c.f ? JSON.parse(c.f) : {}), dev: db_?.dev || null, bundle: db_?.bundle ?? null, dev_n: db_?.hist?.n ?? null, dev_best: db_?.hist?.best ?? null, top10: h.top10, top1: h.top1, ins_cluster: ins?.cluster ?? null, ins_fresh: ins?.fresh ?? null, soc_now: q.soc, narr: tagNarr(c.name, c.sym), mc_in: q.mc, liq_in: q.liq, v24_in: q.v24, tx24_in: q.tx24, volmc: vm, liqmc: lm });
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
      else if (!plausible(p, q)) { await env.DB.prepare("UPDATE hub_rpos SET last_seen = ? WHERE id = ?").bind(now, p.id).run(); }   // v3.2 Schein-Kurs ignorieren (FLYWHEEL 17.11.: 456× ohne Handel)
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
