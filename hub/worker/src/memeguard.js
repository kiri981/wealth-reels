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
