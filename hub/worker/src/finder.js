// WC Trading Hub – Wallet-Finder (v3.0, Solana): sucht selbstständig und laufend nach Wallets, die früh in starke Gewinner einsteigen.
// v3.0: Gewinner haben bei Erkennung meist > 8.000 Transaktionen → Start nicht erreichbar. Daher VORAB-ERFASSUNG: junge Radar-Coins
// (≤ 8 Std., Liq. ≥ 10k) bekommen ihre ersten Käufer sofort gespeichert; wird der Coin später ein Gewinner, werden diese Käufer übernommen.
//
// 1) GEWINNER sammeln (breit, nicht nur unsere Hinweise):
//    · Meme-Radar: Coins mit ≥ +200 % (24 Std.) oder ≥ 3× seit Entdeckung
//    · GeckoTerminal: Solana-Trend 24 Std. mit ≥ +200 %
//    · DexScreener: Top-Boosts auf Solana mit ≥ +200 % (24 Std.)
//    · Käufe unserer Wallets, die danach ≥ 2× gemacht haben (Netzwerk-Erweiterung: wer kauft dasselbe früh?)
//    Nur Coins mit Liquidität ≥ 20k $, jünger als 4 Tage.
// 2) FRÜHE KÄUFER je Gewinner über Helius: die ältesten ~250 Transaktionen ab dem Start des Coins. Aussortiert werden
//    Käufe in den ersten 2 Slots (Sniper-Bots) und Wallets, die Coins ohne SOL-Einsatz bekamen (Dev/Team/Airdrop).
// 3) KANDIDATEN: Wallets, die in den letzten 21 Tagen bei ≥ 2 VERSCHIEDENEN Gewinnern früh drin waren. Deren eigene letzte
//    Transaktionen werden geprüft: kein Hochfrequenz-Bot (nicht > 100 Transaktionen in 2 Std.), ≥ 3 gehandelte Coins,
//    mindestens die Hälfte mit SOL-Gewinn, insgesamt im Plus → Aufnahme als „Probe“-Wallet (max. 40).
// 4) PROBEZEIT (in walletTick/hier): zählt nur, was NACH der Aufnahme passiert. Nach ≥ 5 ausgewerteten Käufen:
//    Median nach 24 Std. ≥ +20 % und ≥ 50 % im Plus → „aktiv“ (zählt für Cluster-Hinweise und Papier-Wallet);
//    nach ≥ 8 Käufen Median < 0 → raus. Manuell eingetragene Wallets sind immer aktiv.
// Nur Beobachtung – der Hub kauft nichts mit echtem Geld.
import { parseTx } from "./wallets.js";

const GT = "https://api.geckoterminal.com/api/v2", DS = "https://api.dexscreener.com";
const UA = { "User-Agent": "Mozilla/5.0 wc-hub", Accept: "application/json" };
const N = (x) => (x == null || x === "" ? null : +x);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const WF = { maxProbe: 40, tokensPerRun: 1, walletsPerRun: 6, minWinners: 2, days: 21, prePerRun: 3, preTx: 150, preMaxAgeH: 8 };

export async function finderSchema(env) {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_wfind_tok (mint TEXT PRIMARY KEY, sym TEXT, src TEXT, gain REAL, t INTEGER, done INTEGER DEFAULT 0, buyers INTEGER, note TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_wfind_hit (wallet TEXT, mint TEXT, t INTEGER, sol REAL, PRIMARY KEY (wallet, mint))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_wfind_eval (wallet TEXT PRIMARY KEY, t INTEGER, ok INTEGER, why TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_wfind_pre (mint TEXT PRIMARY KEY, sym TEXT, t INTEGER, done INTEGER DEFAULT 0, buyers INTEGER, note TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_wfind_early (wallet TEXT, mint TEXT, t INTEGER, sol REAL, PRIMARY KEY (wallet, mint))"),
  ]);
  for (const col of ["status TEXT DEFAULT 'manual'", "found INTEGER", "score REAL"]) { try { await env.DB.prepare("ALTER TABLE hub_wallet ADD COLUMN " + col).run(); } catch (e) {} }
}
async function rpc(env, body) {
  const r = await fetch(`https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_KEY}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("Helius " + r.status); return r.json();
}
async function j(url) { for (let k = 0; k < 3; k++) { const r = await fetch(url, { headers: UA }).catch(() => null); if (r && r.ok) return r.json(); if (r && r.status !== 429) return null; await wait(2500 * (k + 1)); } return null; }

// ---------------------------------------------------------------- 1) Gewinner sammeln
async function collect(env, now) {
  const add = []; const push = (mint, sym, src, gain) => { if (mint && gain != null) add.push([mint, sym, src, gain]); };
  // Meme-Radar
  for (const r of (await env.DB.prepare("SELECT token, sym, data, first_mc FROM hub_meme WHERE chain = 'solana' AND last_t > ? AND created > ?").bind(now - 3600, now - 4 * 86400).all()).results) {
    const d = JSON.parse(r.data || "{}"); const g = Math.max((d.c24 ?? 0) / 100, r.first_mc && d.mc ? d.mc / r.first_mc - 1 : 0);
    if ((d.liq || 0) >= 20000 && g >= 2) push(r.token, r.sym, "Meme-Radar", g);
  }
  // GeckoTerminal 24 Std.
  const g = await j(`${GT}/networks/solana/trending_pools?include=base_token&duration=24h`);
  if (g) { const T = Object.fromEntries((g.included || []).map((t) => [t.id, t.attributes])); for (const p of g.data || []) { const a = p.attributes, tk = T[p.relationships?.base_token?.data?.id] || {};
    const c = N(a.price_change_percentage?.h24), age = a.pool_created_at ? (now - Date.parse(a.pool_created_at) / 1000) / 86400 : 99;
    if (c >= 200 && N(a.reserve_in_usd) >= 20000 && age <= 4) push(tk.address, tk.symbol, "GeckoTerminal 24h", c / 100); } }
  // DexScreener Top-Boosts
  const b = await j(`${DS}/token-boosts/top/v1`);
  const sol = (Array.isArray(b) ? b : []).filter((x) => x.chainId === "solana").map((x) => x.tokenAddress).slice(0, 30);
  if (sol.length) { const P = await j(`${DS}/tokens/v1/solana/${sol.join(",")}`); for (const x of Array.isArray(P) ? P : []) { const age = x.pairCreatedAt ? (now * 1000 - x.pairCreatedAt) / 86400000 : 99;
    if (N(x.priceChange?.h24) >= 200 && N(x.liquidity?.usd) >= 20000 && age <= 4) push(x.baseToken?.address, x.baseToken?.symbol, "DexScreener-Boost", N(x.priceChange.h24) / 100); } }
  // Käufe unserer Wallets, die ≥ 2× gemacht haben
  for (const r of (await env.DB.prepare("SELECT mint, sym, MAX(COALESCE(px24h, px6h, px1h) / px) - 1 g FROM hub_wtx WHERE side = 1 AND px > 0 AND t > ? GROUP BY mint HAVING g >= 1").bind(now - 4 * 86400).all()).results) push(r.mint, r.sym, "Kauf einer Smart-Wallet", r.g);
  let n = 0;
  for (const [mint, sym, src, gain] of add) { const r = await env.DB.prepare("INSERT OR IGNORE INTO hub_wfind_tok (mint, sym, src, gain, t) VALUES (?, ?, ?, ?, ?)").bind(mint, sym || null, src, gain, now).run(); n += r.meta?.changes || 0; }
  return n;
}

// ---------------------------------------------------------------- 2) Frühe Käufer eines Gewinners
async function earlyBuyers(env, mint, nTx = 250) {
  let before = null, oldest = [], pages = 0, reached = false;
  while (pages < 8) {
    const r = await rpc(env, { jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint, before ? { limit: 1000, before } : { limit: 1000 }] });
    const L = r.result || []; pages++;
    if (!L.length) { reached = true; break; }
    oldest = L; before = L[L.length - 1].signature;
    if (L.length < 1000) { reached = true; break; }
  }
  if (!reached) return { skip: "zu viele Transaktionen (> 8.000) – Start nicht erreichbar" };
  const sigs = oldest.filter((x) => !x.err).reverse().slice(0, nTx); if (!sigs.length) return { skip: "keine Transaktionen" };
  const first = sigs[0].slot; const buyers = {};
  for (let i = 0; i < sigs.length; i += 50) {
    const res = await rpc(env, sigs.slice(i, i + 50).map((s, k) => ({ jsonrpc: "2.0", id: k, method: "getTransaction", params: [s.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }] })));
    for (const x of Array.isArray(res) ? res : []) {
      const tx = x.result; if (!tx) continue; const slot = tx.slot;
      const keys = tx.transaction.message.accountKeys; const signer = typeof keys[0] === "string" ? keys[0] : keys[0].pubkey;
      for (const p of parseTx(tx, signer)) {
        if (p.mint !== mint || p.side <= 0) continue;
        if (slot <= first + 2) continue;               // Sniper in den ersten Slots
        if (!(p.sol > 0.001)) continue;                // ohne SOL-Einsatz: Dev/Team/Airdrop
        if (!buyers[signer]) buyers[signer] = { sol: 0, t: tx.blockTime };
        buyers[signer].sol += p.sol;
      }
    }
  }
  return { buyers };
}

// ---------------------------------------------------------------- 3) Kandidaten prüfen (eigene Historie)
async function judge(env, wallet) {
  const s = await rpc(env, { jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [wallet, { limit: 100 }] });
  const L = (s.result || []).filter((x) => !x.err); if (L.length < 6) return { ok: 0, why: "zu wenig Aktivität" };
  if (L.length >= 100 && L[0].blockTime - L[L.length - 1].blockTime < 7200) return { ok: 0, why: "Hochfrequenz-Bot" };
  const res = await rpc(env, L.slice(0, 60).map((x, k) => ({ jsonrpc: "2.0", id: k, method: "getTransaction", params: [x.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }] })));
  const flow = {};   // je Coin: SOL rein/raus
  for (const x of Array.isArray(res) ? res : []) for (const p of parseTx(x.result, wallet)) { const f = (flow[p.mint] ||= { buy: 0, sell: 0 }); if (p.side > 0) f.buy += Math.max(0, p.sol); else f.sell += Math.max(0, -p.sol); }
  const closed = Object.values(flow).filter((f) => f.buy > 0.01 && f.sell > 0);
  if (Object.keys(flow).length < 3) return { ok: 0, why: "weniger als 3 Coins gehandelt" };
  if (closed.length < 2) return { ok: 0, why: "kaum abgeschlossene Trades" };
  const wins = closed.filter((f) => f.sell > f.buy).length, net = closed.reduce((a, f) => a + f.sell - f.buy, 0);
  const ok = wins / closed.length >= 0.5 && net > 0;
  return { ok: ok ? 1 : 0, why: `${closed.length} abgeschlossen, ${wins} im Plus, netto ${net >= 0 ? "+" : ""}${net.toFixed(2)} SOL`, score: wins / closed.length + Math.min(1, net / 10) };
}

// ---------------------------------------------------------------- 4) Probezeit
async function probation(env, say) {
  const P = (await env.DB.prepare("SELECT w.addr, w.label, w.found FROM hub_wallet w WHERE w.status = 'probe'").all()).results; let up = 0, out = 0;
  for (const w of P) {
    const R = (await env.DB.prepare("SELECT px, px24h FROM hub_wtx WHERE addr = ? AND side = 1 AND t > ? AND px > 0 AND px24h IS NOT NULL").bind(w.addr, w.found || 0).all()).results.map((x) => x.px24h / x.px - 1).sort((a, b) => a - b);
    if (R.length < 5) continue; const med = R[Math.floor(R.length / 2)], pos = R.filter((x) => x > 0).length / R.length;
    if (med >= 0.2 && pos >= 0.5) { await env.DB.prepare("UPDATE hub_wallet SET status = 'active' WHERE addr = ?").bind(w.addr).run(); up++; await say(env, `👛 Wallet-Finder: ${w.label} hat die Probezeit bestanden (${R.length} Käufe, Median nach 24 Std. ${med >= 0 ? "+" : ""}${Math.round(med * 100)} %, ${Math.round(pos * 100)} % im Plus) – zählt jetzt für Cluster-Hinweise.`); }
    else if (R.length >= 8 && med < 0) { await env.DB.prepare("DELETE FROM hub_wallet WHERE addr = ?").bind(w.addr).run(); out++; }
  }
  return `Probezeit: ${P.length} in Probe, ${up} aufgestiegen, ${out} entfernt`;
}

export async function finderTick(env, say, kvGet, kvPut, force) {
  if (!env.HELIUS_KEY) return "Wallet-Finder: kein HELIUS_KEY";
  await finderSchema(env);
  const now = Math.floor(Date.now() / 1000), hr = Math.floor(now / 3600);
  if (!force && (await kvGet(env, "wf_hr")) === String(hr)) return "";
  await kvPut(env, "wf_hr", String(hr));
  const log = [];
  try { log.push("neue Gewinner " + (await collect(env, now))); } catch (e) { log.push("Sammeln-Fehler " + e.message); }
  // v3.0 VORAB-ERFASSUNG: junge Coins aus dem Meme-Radar (≤ 8 Std. alt, Liq. ≥ 20k) – erste Käufer festhalten, solange der Start noch erreichbar ist
  try {
    const young = (await env.DB.prepare("SELECT m.token, m.sym FROM hub_meme m LEFT JOIN hub_wfind_pre p ON p.mint = m.token WHERE m.chain = 'solana' AND m.created > ? AND m.last_t > ? AND p.mint IS NULL AND json_extract(m.data, '$.liq') >= 10000 ORDER BY COALESCE(m.score, 0) DESC, json_extract(m.data, '$.liq') DESC LIMIT 10").bind(now - WF.preMaxAgeH * 3600, now - 3600).all()).results;
    let pre = 0;
    for (const y of young) {
      if (pre >= WF.prePerRun) break;
      const r = await earlyBuyers(env, y.token, WF.preTx); pre++;
      if (r.skip) { await env.DB.prepare("INSERT OR REPLACE INTO hub_wfind_pre (mint, sym, t, done, note) VALUES (?, ?, ?, 1, ?)").bind(y.token, y.sym, now, r.skip).run(); continue; }
      const st = Object.entries(r.buyers).map(([w, b]) => env.DB.prepare("INSERT OR IGNORE INTO hub_wfind_early (wallet, mint, t, sol) VALUES (?, ?, ?, ?)").bind(w, y.token, b.t || now, b.sol));
      for (let i = 0; i < st.length; i += 90) await env.DB.batch(st.slice(i, i + 90));
      await env.DB.prepare("INSERT OR REPLACE INTO hub_wfind_pre (mint, sym, t, done, buyers) VALUES (?, ?, ?, 1, ?)").bind(y.token, y.sym, now, st.length).run();
    }
    log.push(`vorab erfasst ${pre} junge Coins`);
    // Gewinner, deren frühe Käufer schon vorab erfasst sind → direkt übernehmen
    const M = (await env.DB.prepare("SELECT t.mint, t.sym FROM hub_wfind_tok t JOIN hub_wfind_pre p ON p.mint = t.mint AND p.buyers > 0 WHERE t.done = 0 OR t.note LIKE 'zu viele%'").all()).results;
    for (const m of M) {
      await env.DB.prepare("INSERT OR IGNORE INTO hub_wfind_hit (wallet, mint, t, sol) SELECT wallet, mint, t, sol FROM hub_wfind_early WHERE mint = ?").bind(m.mint).run();
      const n = (await env.DB.prepare("SELECT COUNT(*) n FROM hub_wfind_hit WHERE mint = ?").bind(m.mint).first()).n;
      await env.DB.prepare("UPDATE hub_wfind_tok SET done = 1, buyers = ?, note = 'aus Vorab-Erfassung' WHERE mint = ?").bind(n, m.mint).run();
      log.push(`${m.sym || m.mint.slice(0, 6)}: ${n} frühe Käufer (vorab)`);
    }
  } catch (e) { log.push("Vorab-Fehler " + e.message); }
  // frühe Käufer der nächsten Gewinner (höchste Gewinne zuerst)
  const todo = (await env.DB.prepare("SELECT * FROM hub_wfind_tok WHERE done = 0 ORDER BY gain DESC LIMIT ?").bind(WF.tokensPerRun).all()).results;
  for (const t of todo) {
    try {
      const r = await earlyBuyers(env, t.mint);
      if (r.skip) { await env.DB.prepare("UPDATE hub_wfind_tok SET done = 1, note = ? WHERE mint = ?").bind(r.skip, t.mint).run(); continue; }
      const st = Object.entries(r.buyers).map(([w, b]) => env.DB.prepare("INSERT OR IGNORE INTO hub_wfind_hit (wallet, mint, t, sol) VALUES (?, ?, ?, ?)").bind(w, t.mint, b.t || now, b.sol));
      for (let i = 0; i < st.length; i += 90) await env.DB.batch(st.slice(i, i + 90));
      await env.DB.prepare("UPDATE hub_wfind_tok SET done = 1, buyers = ? WHERE mint = ?").bind(st.length, t.mint).run();
      log.push(`${t.sym || t.mint.slice(0, 6)}: ${st.length} frühe Käufer`);
    } catch (e) { log.push("Käufer-Fehler " + e.message); break; }
  }
  // Kandidaten: ≥ 2 verschiedene Gewinner, noch nicht bewertet (oder Bewertung älter als 7 Tage), noch nicht in der Liste
  const nProbe = (await env.DB.prepare("SELECT COUNT(*) n FROM hub_wallet WHERE status = 'probe'").first()).n;
  const cand = (await env.DB.prepare(`SELECT h.wallet, COUNT(DISTINCT h.mint) n FROM hub_wfind_hit h LEFT JOIN hub_wallet w ON w.addr = h.wallet LEFT JOIN hub_wfind_eval e ON e.wallet = h.wallet
    WHERE h.t > ? AND w.addr IS NULL AND (e.wallet IS NULL OR e.t < ?) GROUP BY h.wallet HAVING n >= ? ORDER BY n DESC LIMIT ?`).bind(now - WF.days * 86400, now - 7 * 86400, WF.minWinners, WF.walletsPerRun).all()).results;
  let added = 0;
  for (const c of cand) {
    try {
      const v = await judge(env, c.wallet);
      await env.DB.prepare("INSERT OR REPLACE INTO hub_wfind_eval (wallet, t, ok, why) VALUES (?, ?, ?, ?)").bind(c.wallet, now, v.ok, `${c.n} Gewinner früh · ${v.why}`).run();
      if (v.ok && nProbe + added < WF.maxProbe) {
        const lab = "Finder-" + c.wallet.slice(0, 4);
        await env.DB.prepare("INSERT OR IGNORE INTO hub_wallet (addr, label, added, alert, status, found, score, note) VALUES (?, ?, ?, 0, 'probe', ?, ?, ?)").bind(c.wallet, lab, now, now, v.score ?? null, `${c.n} Gewinner früh · ${v.why}`).run();
        added++;
      }
    } catch (e) { log.push("Prüf-Fehler " + e.message); break; }
  }
  if (added) await say(env, `👛 Wallet-Finder: ${added} neue Wallet${added > 1 ? "s" : ""} in Probezeit aufgenommen (früh bei ≥ ${WF.minWinners} Gewinnern, eigene Historie im Plus). Sie zählen erst nach bestandener Probezeit für Hinweise.`);
  try { log.push(await probation(env, say)); } catch (e) { log.push("Probezeit-Fehler " + e.message); }
  const msg = `Wallet-Finder: ${log.join(" · ")} · ${cand.length} Kandidaten geprüft, ${added} aufgenommen`;
  await kvPut(env, "log_finder", new Date().toISOString() + " " + msg.slice(0, 800));
  return msg;
}

export async function finderData(env) {
  await finderSchema(env);
  const now = Math.floor(Date.now() / 1000);
  const tok = (await env.DB.prepare("SELECT * FROM hub_wfind_tok ORDER BY t DESC LIMIT 40").all()).results;
  const ev = (await env.DB.prepare("SELECT * FROM hub_wfind_eval ORDER BY t DESC LIMIT 40").all()).results;
  const st = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM hub_wfind_tok) toks, (SELECT COUNT(*) FROM hub_wfind_tok WHERE done = 1) done, (SELECT COUNT(DISTINCT wallet) FROM hub_wfind_hit WHERE t > ?) early, (SELECT COUNT(*) FROM hub_wfind_eval) judged, (SELECT COUNT(*) FROM hub_wfind_eval WHERE ok = 1) okc").bind(now - WF.days * 86400).first();
  return { tok, ev, st, rules: WF };
}
