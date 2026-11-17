// WC Trading Hub – zwei Schutzfilter für Meme-Coins (v3.7, Kevin 18.11.), aus den Verlusten der letzten Tage abgeleitet:
// 1) Kein Hinterherrennen: schon > 300 % in 1 Std. oder > 1000 % in 6 Std. gestiegen → kein Kauf/Hinweis (diese Käufe kosteten bisher am meisten).
// 2) Keine Trittbrettfahrer: Gibt es in den letzten 72 Std. schon einen ÄLTEREN Solana-Coin mit gleichem Symbol/Namen und mindestens halb so viel
//    Marktwert, oder schwirren 3+ gleichnamige Coins herum und dieser ist nicht der älteste → nur das Original zählt (Beispiel GTA6-Kopien).
// Gilt für Radar-Hinweise, Radar-Papierkäufe und den Langläufer – NICHT für Wallet-Kopien (dort ist die Entscheidung des Profis das Signal).
const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9一-鿿]/g, "");
export function chase(x) {
  const c1 = +x?.c1h, c6 = +x?.c6h;
  if (c1 > 300) return `schon +${Math.round(c1)} % in 1 Std. – kein Hinterherrennen`;
  if (c6 > 1000) return `schon +${Math.round(c6)} % in 6 Std. – kein Hinterherrennen`;
  return null;
}
export async function copycat(env, x) {
  const s = norm(x?.sym), n = norm(x?.name); if (!s && !n) return null;
  const now = Math.floor(Date.now() / 1000), id = x.id || "solana:" + x.token;
  const R = (await env.DB.prepare(`SELECT id, sym, name, created, first_seen, json_extract(data, '$.mc') mc FROM hub_meme
    WHERE chain = 'solana' AND id != ? AND COALESCE(created, first_seen) > ? AND (LOWER(sym) = ? OR LOWER(name) = ? OR LOWER(sym) = ? OR LOWER(name) = ?)`)
    .bind(id, now - 72 * 3600, String(x.sym || "").toLowerCase(), String(x.name || "").toLowerCase(), String(x.name || "").toLowerCase(), String(x.sym || "").toLowerCase()).all().catch(() => ({ results: [] }))).results
    .filter((r) => (s && (norm(r.sym) === s || norm(r.name) === s)) || (n && n.length >= 3 && (norm(r.name) === n || norm(r.sym) === n)));
  if (!R.length) return null;
  const myT = x.created || now, older = R.filter((r) => (r.created || r.first_seen) < myT);
  const big = older.find((r) => (r.mc || 0) >= (x.mc || 0) * 0.5);
  if (big) return `Trittbrettfahrer: älterer „${big.sym}“ existiert schon (Marktwert ${Math.round((big.mc || 0) / 1000)}k $)`;
  if (R.length >= 2 && older.length) return `Trittbrettfahrer: ${R.length + 1} gleichnamige Coins, dieser ist nicht das Original`;
  return null;
}

// ---------- v3.7 Entwickler-Historie + Sniper-Bündel beim Start (Helius, kostenlos) ----------
// Start-Transaktion = älteste Signatur des Coins (bis 3.000 zurück). Ihr Absender ist der Entwickler.
// Bündel: viele Käufe im selben Block wie der Start (bzw. im Block danach) = das Team kauft sich mit vielen Wallets selbst ein und verkauft später gebündelt.
// Entwickler-Historie: alle Coins dieses Entwicklers, die der Hub je gesehen hat (Tabelle hub_meme_dev) – und was aus ihnen wurde.
//   Ablehnen, wenn ≥ 2 frühere Coins und alle tot (Marktwert heute < 5.000 $) bzw. ≥ 4 Starts in 7 Tagen („Serien-Starter“).
import { rpc } from "./helius.js";
export async function devBundle(env, mint) {
  if (!env.HELIUS_KEY) return null;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_meme_dev (dev TEXT, id TEXT, t INTEGER, bundle INTEGER, PRIMARY KEY (dev, id))").run();
  let before = null, sigs = [];
  for (let p = 0; p < 3; p++) {
    const r = await rpc(env, { jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint, before ? { limit: 1000, before } : { limit: 1000 }] });
    const L = r?.result || []; sigs = sigs.concat(L); if (L.length < 1000) break; before = L[L.length - 1].signature;
    if (p === 2) return { unknown: "zu viele Transaktionen für die Start-Prüfung" };
  }
  if (!sigs.length) return null;
  const first = sigs[sigs.length - 1], slot0 = first.slot;
  const bundle = sigs.filter((x) => x.slot <= slot0 + 1 && !x.err).length - 1;   // Käufe im Start-Block und im Block danach
  const tx = await rpc(env, { jsonrpc: "2.0", id: 2, method: "getTransaction", params: [first.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }] });
  const k0 = tx?.result?.transaction?.message?.accountKeys?.[0]; const dev = typeof k0 === "string" ? k0 : k0?.pubkey || null;
  const id = "solana:" + mint, now = Math.floor(Date.now() / 1000);
  let hist = { n: 0, dead: 0, best: 0, week: 0 };
  if (dev) {
    await env.DB.prepare("INSERT OR IGNORE INTO hub_meme_dev (dev, id, t, bundle) VALUES (?, ?, ?, ?)").bind(dev, id, first.blockTime || now, bundle).run();
    const P = (await env.DB.prepare(`SELECT d.id, d.t, (SELECT MAX(s.mc) FROM hub_meme_snap s WHERE s.id = d.id AND s.liq > 1000) mx, json_extract(m.data, '$.mc') mc
      FROM hub_meme_dev d LEFT JOIN hub_meme m ON m.id = d.id WHERE d.dev = ? AND d.id != ?`).bind(dev, id).all().catch(() => ({ results: [] }))).results;
    hist = { n: P.length, dead: P.filter((x) => (x.mc || 0) < 5000 && x.t < now - 6 * 3600).length, best: Math.max(0, ...P.map((x) => x.mx || 0)), week: P.filter((x) => x.t > now - 7 * 86400).length };
  }
  let bad = null;
  if (bundle >= 10) bad = `Sniper-Bündel: ${bundle} Käufe im Start-Block`;
  else if (hist.n >= 2 && hist.dead === hist.n) bad = `Entwickler hat ${hist.n} frühere Coins, alle tot`;
  else if (hist.week >= 4) bad = `Serien-Starter: ${hist.week} Coins in 7 Tagen`;
  return { dev, bundle, hist, bad };
}
