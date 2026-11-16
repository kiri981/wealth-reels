// WC Trading Hub – Smart-Wallet-Tracker (v1.9, Solana)
// Kevin trägt erfolgreiche Wallets ein (gefunden z. B. über DexScreener „Top Traders“ oder gmgn.ai). Der Hub liest alle 5 Minuten
// über Helius (Secret HELIUS_KEY) deren neue Transaktionen, erkennt Käufe/Verkäufe von Coins und meldet:
//  · jeden Kauf von Wallets mit Alarm-Häkchen,
//  · „Cluster“: 2+ beobachtete Wallets kaufen denselben Coin innerhalb von 6 Std. (stärkstes Zeichen).
// Danach ehrliche Bilanz je Wallet: was wurde aus ihren Käufen 1h/6h/24h später (ab dem Zeitpunkt, an dem der Hub den Kauf sah)?
// Nur Beobachtung – der Hub kauft nichts.
import { security } from "./meme.js";
import { mpOpen } from "./mpaper.js";

const SKIP = new Set(["So11111111111111111111111111111111111111112", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v", "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB"]);
const DS = "https://api.dexscreener.com";
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const N = (x) => (x == null || x === "" ? null : +x);

export async function walletSchema(env) {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_wallet (addr TEXT PRIMARY KEY, label TEXT, added INTEGER, last_sig TEXT, alert INTEGER DEFAULT 0, note TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_wtx (sig TEXT, addr TEXT, mint TEXT, t INTEGER, seen INTEGER, side INTEGER, amt REAL, sol REAL, sym TEXT, pool TEXT, px REAL, mc REAL, liq REAL, px1h REAL, px6h REAL, px24h REAL, PRIMARY KEY (sig, mint))"),
  ]);
}
let _mig = false;
async function walletMig(env) { if (_mig) return; _mig = true; for (const col of ["status TEXT DEFAULT 'manual'", "found INTEGER", "score REAL"]) { try { await env.DB.prepare("ALTER TABLE hub_wallet ADD COLUMN " + col).run(); } catch (e) {} } }
async function rpc(env, body) {
  const r = await fetch(`https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_KEY}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("Helius " + r.status + " " + (await r.text()).slice(0, 80));
  return r.json();
}
async function dsInfo(mints) {
  const out = {};
  for (let i = 0; i < mints.length; i += 30) {
    const r = await fetch(`${DS}/tokens/v1/solana/${mints.slice(i, i + 30).join(",")}`, { headers: { "User-Agent": "Mozilla/5.0 wc-hub" } }).catch(() => null);
    const L = r && r.ok ? await r.json().catch(() => []) : [];
    for (const x of Array.isArray(L) ? L : []) { const k = x.baseToken?.address; if (k && (!out[k] || (x.liquidity?.usd || 0) > (out[k].liquidity?.usd || 0))) out[k] = x; }
  }
  return out;
}
// Eine Transaktion → Liste {mint, side, amt, sol} für die Wallet addr
export function parseTx(tx, addr) {
  if (!tx?.meta || tx.meta.err) return [];
  const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === "string" ? k : k.pubkey));
  const ix = keys.indexOf(addr);
  const d = {};
  for (const b of tx.meta.preTokenBalances || []) if (b.owner === addr) d[b.mint] = (d[b.mint] || 0) - (b.uiTokenAmount.uiAmount || 0);
  for (const b of tx.meta.postTokenBalances || []) if (b.owner === addr) d[b.mint] = (d[b.mint] || 0) + (b.uiTokenAmount.uiAmount || 0);
  const wsol = d["So11111111111111111111111111111111111111112"] || 0;
  const sol = (ix >= 0 ? (tx.meta.postBalances[ix] - tx.meta.preBalances[ix]) / 1e9 : 0) + wsol;   // + = SOL bekommen, − = SOL ausgegeben
  const out = [];
  for (const [mint, v] of Object.entries(d)) { if (SKIP.has(mint) || Math.abs(v) < 1e-9) continue; out.push({ mint, side: v > 0 ? 1 : -1, amt: Math.abs(v), sol: -sol }); }
  return out;
}

export async function walletTick(env, say, kvGet, kvPut) {
  if (!env.HELIUS_KEY) return "Wallets: kein HELIUS_KEY";
  await walletSchema(env); await walletMig(env);
  const W = (await env.DB.prepare("SELECT * FROM hub_wallet").all()).results; if (!W.length) return "Wallets: keine eingetragen";
  const now = Math.floor(Date.now() / 1000);
  const sres = await rpc(env, W.map((w, i) => ({ jsonrpc: "2.0", id: i, method: "getSignaturesForAddress", params: [w.addr, w.last_sig ? { limit: 25, until: w.last_sig } : { limit: 10 }] })));
  const want = [];   // [wallet, sig, blockTime]
  for (const r of Array.isArray(sres) ? sres : []) {
    const w = W[r.id]; const L = (r.result || []).filter((x) => !x.err);
    if (r.result?.length) await env.DB.prepare("UPDATE hub_wallet SET last_sig = ? WHERE addr = ?").bind(r.result[0].signature, w.addr).run();
    for (const x of L) want.push([w, x.signature, x.blockTime]);
  }
  if (!want.length) return `Wallets: ${W.length}, nichts Neues`;
  const take = want.slice(0, 40);   // v3.0: Helius-Guthaben schonen (mehr beobachtete Wallets)
  const tres = await rpc(env, take.map(([, sig], i) => ({ jsonrpc: "2.0", id: i, method: "getTransaction", params: [sig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }] })));
  const rows = [];
  for (const r of Array.isArray(tres) ? tres : []) { const [w, sig, bt] = take[r.id]; for (const p of parseTx(r.result, w.addr)) rows.push({ ...p, sig, addr: w.addr, t: r.result?.blockTime || bt, w }); }
  if (!rows.length) return `Wallets: ${take.length} Transaktionen, keine Coin-Käufe`;
  const info = await dsInfo([...new Set(rows.map((x) => x.mint))]);
  const st = rows.map((x) => { const i = info[x.mint]; return env.DB.prepare("INSERT OR IGNORE INTO hub_wtx (sig, addr, mint, t, seen, side, amt, sol, sym, pool, px, mc, liq) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(x.sig, x.addr, x.mint, x.t, now, x.side, x.amt, x.sol, i?.baseToken?.symbol || null, i?.pairAddress || null, N(i?.priceUsd), N(i?.marketCap) || N(i?.fdv), N(i?.liquidity?.usd)); });
  for (let i = 0; i < st.length; i += 90) await env.DB.batch(st.slice(i, i + 90));

  // Hinweise nur für frische Käufe (≤ 20 Min. alt), max. 6 pro Stunde
  const hk = "w_alerts_" + new Date().toISOString().slice(0, 13); let sent = +(await kvGet(env, hk) || 0);
  const fresh = rows.filter((x) => x.side > 0 && now - x.t < 1200);
  const lab = (w) => w.label || w.addr.slice(0, 4) + "…" + w.addr.slice(-4);
  const usd = (v) => (v == null ? "?" : v >= 1e6 ? (v / 1e6).toFixed(2) + " Mio $" : v >= 1e3 ? (v / 1e3).toFixed(1) + "k $" : v.toFixed(0) + " $");
  for (const mint of [...new Set(fresh.map((x) => x.mint))]) {
    if (sent >= 6) break;
    const i = info[mint]; const sym = i?.baseToken?.symbol || mint.slice(0, 6);
    const buyers = (await env.DB.prepare("SELECT DISTINCT w.addr, w.label FROM hub_wtx x JOIN hub_wallet w ON w.addr = x.addr WHERE x.mint = ? AND x.side = 1 AND x.t > ? AND COALESCE(w.status, 'manual') != 'probe'").bind(mint, now - 6 * 3600).all()).results;
    const cluster = buyers.length >= 2 && !(await kvGet(env, "wclu_" + mint));
    const solo = fresh.filter((x) => x.mint === mint && (x.w.alert || x.w.status === "copy"));
    const copy = fresh.find((x) => x.mint === mint && x.w.status === "copy");   // v3.0 Papier-Kopie ausgewählter Wallets (Kevin 17.11.)
    if (!cluster && !solo.length) continue;
    const sec = await security({ chain: "solana", token: mint });
    const amp = sec.level === "ok" ? "🟢" : sec.level === "warn" ? "🟡" : sec.level === "danger" ? "🔴" : "⚪";
    const head = cluster ? `👛👛 Smart-Wallet-Cluster: ${buyers.length} deiner Wallets kaufen ${sym}` : `👛 ${lab(solo[0].w)} kauft ${sym}`;
    const spent = fresh.filter((x) => x.mint === mint).map((x) => `${lab(x.w)}: ${x.sol > 0 ? x.sol.toFixed(2) + " SOL" : "?"}`).join(", ");
    await say(env, `${head}\nKäufer: ${cluster ? buyers.map((b) => b.label || b.addr.slice(0, 4) + "…").join(", ") : spent}\n` +
      `Marktwert ${usd(N(i?.marketCap) || N(i?.fdv))} · Liquidität ${usd(N(i?.liquidity?.usd))} · 1h ${i?.priceChange?.h1 ?? "?"} % · 24h ${i?.priceChange?.h24 ?? "?"} %\n` +
      `Sicherheit ${amp} ${(sec.flags || []).slice(0, 3).join("; ") || "keine Auffälligkeiten"}\nhttps://dexscreener.com/solana/${i?.pairAddress || mint}\nNur Beobachtung, keine Anlageberatung.`);
    if (cluster) { await kvPut(env, "wclu_" + mint, String(now)); if (sec.level !== "danger" && (N(i?.liquidity?.usd) || 0) >= 20000) await mpOpen(env, say, { chain: "solana", token: mint, pool: i?.pairAddress, sym, px: N(i?.priceUsd), src: `Smart-Wallet-Cluster (${buyers.length} Wallets)` }).catch(() => {}); }
    if (copy && sec.level !== "danger" && (N(i?.liquidity?.usd) || 0) >= 10000) await mpOpen(env, say, { chain: "solana", token: mint, pool: i?.pairAddress, sym, px: N(i?.priceUsd), src: `Kopie ${lab(copy.w)}` }).catch(() => {});
    sent++;
  }
  await kvPut(env, hk, sent);

  // Nachverfolgung: Kurs 1h/6h/24h nach dem Sehen eines Kaufs
  const due = (await env.DB.prepare("SELECT sig, mint, seen, px1h, px6h FROM hub_wtx WHERE side = 1 AND px24h IS NULL AND seen < ? AND seen > ? LIMIT 90").bind(now - 3600, now - 3 * 86400).all()).results;
  if (due.length) {
    const P = await dsInfo([...new Set(due.map((d) => d.mint))]);
    for (const d of due) {
      const px = N(P[d.mint]?.priceUsd); if (px == null) continue; const dt = now - d.seen;
      const col = dt >= 86400 ? "px24h" : dt >= 6 * 3600 && d.px6h == null ? "px6h" : d.px1h == null ? "px1h" : null;
      if (col) await env.DB.prepare(`UPDATE hub_wtx SET ${col} = ? WHERE sig = ? AND mint = ?`).bind(px, d.sig, d.mint).run();
    }
  }
  return `Wallets: ${W.length}, ${take.length} neue Transaktionen, ${rows.length} Coin-Bewegungen, ${sent} Hinweise`;
}

// Verwaltung über die Seite: ?add=<adresse>&label=…&alert=1 · ?del=<adresse> · ?alert=<adresse>&on=0|1
export async function walletAdmin(env, q) {
  await walletSchema(env);
  if (q.get("add")) {
    const a = q.get("add").trim(); if (!B58.test(a)) return "Ungültige Solana-Adresse";
    await env.DB.prepare("INSERT INTO hub_wallet (addr, label, added, alert) VALUES (?, ?, ?, ?) ON CONFLICT(addr) DO UPDATE SET label = excluded.label, alert = excluded.alert")
      .bind(a, (q.get("label") || "").slice(0, 40), Math.floor(Date.now() / 1000), q.get("alert") === "1" ? 1 : 0).run();
    return "ok";
  }
  if (q.get("del")) { await env.DB.prepare("DELETE FROM hub_wallet WHERE addr = ?").bind(q.get("del")).run(); return "ok"; }
  if (q.get("toggle")) { await env.DB.prepare("UPDATE hub_wallet SET alert = 1 - COALESCE(alert, 0) WHERE addr = ?").bind(q.get("toggle")).run(); return "ok"; }
  return "nichts zu tun";
}
export async function walletData(env) {
  await walletSchema(env); await walletMig(env);
  const now = Math.floor(Date.now() / 1000);
  const W = (await env.DB.prepare("SELECT addr, label, added, alert, COALESCE(status, 'manual') status, found, score, note FROM hub_wallet ORDER BY CASE COALESCE(status,'manual') WHEN 'manual' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, added").all()).results;
  const T = (await env.DB.prepare("SELECT x.*, w.label FROM hub_wtx x LEFT JOIN hub_wallet w ON w.addr = x.addr WHERE x.t > ? ORDER BY x.t DESC LIMIT 200").bind(now - 7 * 86400).all()).results;
  const S = (await env.DB.prepare("SELECT x.addr, COUNT(*) n, SUM(CASE WHEN px24h IS NOT NULL THEN 1 ELSE 0 END) n24, SUM(CASE WHEN px24h > px THEN 1 ELSE 0 END) up24, AVG(CASE WHEN px24h IS NOT NULL AND px > 0 THEN px24h / px - 1 END) avg24, SUM(CASE WHEN px24h <= px * 0.2 THEN 1 ELSE 0 END) rug FROM hub_wtx x LEFT JOIN hub_wallet w ON w.addr = x.addr WHERE side = 1 AND x.t >= COALESCE(w.found, 0) GROUP BY x.addr").all()).results;
  const cl = (await env.DB.prepare("SELECT x.mint, COUNT(DISTINCT x.addr) n FROM hub_wtx x JOIN hub_wallet w ON w.addr = x.addr WHERE x.side = 1 AND x.t > ? AND COALESCE(w.status, 'manual') != 'probe' GROUP BY x.mint HAVING n >= 2").bind(now - 6 * 3600).all()).results;
  return { wallets: W, tx: T, stats: Object.fromEntries(S.map((s) => [s.addr, s])), clusters: Object.fromEntries(cl.map((c) => [c.mint, c.n])), helius: !!env.HELIUS_KEY };
}
