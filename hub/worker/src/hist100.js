// WC Trading Hub – Rückblick auf bekannte Solana-Meme-Coins mit 100× und mehr (v3.0, Kevin 17.11.)
// Je Coin: größter Solana-Pool (DexScreener-Suche) → Tageskerzen seit Pool-Start (GeckoTerminal) →
//   Startwert (Schluss Tag 1), Tage bis 10× / 100× / Höchststand, tiefster Rückgang VOR dem 100×, Volumen/Marktwert und Liquidität am Anfang,
//   Pump.fun-Start ja/nein, Socials heute. Läuft in Teilen (8 Coins je Lauf, Abruf-Grenzen), Ergebnis in hub_kv 'hist100'.
import { KNOWN, tagNarr } from "./narrative.js";
const DS = "https://api.dexscreener.com", GT = "https://api.geckoterminal.com/api/v2";
const UA = { "User-Agent": "Mozilla/5.0 wc-hub", Accept: "application/json" };
const N = (x) => (x == null || x === "" ? null : +x);
export const H100 = ["FARTCOIN", "GOAT", "PNUT", "MOODENG", "CHILLGUY", "USELESS", "ZEREBRO", "FWOG", "MICHI", "RETARDIO", "SIGMA", "ACT", "LOCKIN", "ALCH",
  "GRIFFAIN", "BUTTCOIN", "HOUSE", "TROLL", "ANI", "JELLYJELLY", "VINE", "KLED", "AI16Z", "GIGA", "WIF", "BONK", "POPCAT", "MEW", "PONKE", "BOME", "SLERF", "MOTHER"];

async function j(url) { const r = await fetch(url, { headers: UA }).catch(() => null); return r && r.ok ? r.json().catch(() => null) : null; }

async function one(sym) {
  const s = await j(`${DS}/latest/dex/search?q=${encodeURIComponent(sym)}`);
  const P = (s?.pairs || []).filter((p) => p.chainId === "solana" && String(p.baseToken?.symbol || "").toUpperCase() === sym && N(p.liquidity?.usd) > 50000)
    .sort((a, b) => N(b.liquidity?.usd) - N(a.liquidity?.usd));
  if (!P.length) return { sym, err: "kein Solana-Pool gefunden" };
  // ältester großer Pool = möglichst nah am Start
  const p = [...P].sort((a, b) => (a.pairCreatedAt || 9e15) - (b.pairCreatedAt || 9e15))[0];
  const o = await j(`${GT}/networks/solana/pools/${p.pairAddress}/ohlcv/day?limit=1000&currency=usd`);
  const L = (o?.data?.attributes?.ohlcv_list || []).map((x) => ({ t: x[0], o: x[1], h: x[2], l: x[3], c: x[4], v: x[5] })).sort((a, b) => a.t - b.t);
  if (L.length < 3) return { sym, token: p.baseToken?.address, err: "zu wenig Kursdaten" };
  const supply = N(p.marketCap) && N(p.priceUsd) ? N(p.marketCap) / N(p.priceUsd) : null;
  const base = L[0].c, d = (k) => L.findIndex((x) => x.h >= base * k);
  const i10 = d(10), i100 = d(100); let peak = 0, ipk = 0; L.forEach((x, i) => { if (x.h > peak) { peak = x.h; ipk = i; } });
  let dd = 0, hi = base; for (let i = 0; i < (i100 > 0 ? i100 : L.length); i++) { hi = Math.max(hi, L[i].h); dd = Math.min(dd, L[i].l / hi - 1); }
  return { sym, token: p.baseToken?.address, pump: /pump$/.test(p.baseToken?.address || ""), dex: p.dexId, created: p.pairCreatedAt ? Math.floor(p.pairCreatedAt / 1000) : L[0].t,
    mc0: supply ? base * supply : null, v0: L[0].v, volmc0: supply ? L[0].v / (base * supply) : null, x_peak: peak / base, d10: i10, d100: i100, dpeak: ipk, dd_before100: dd,
    mc_now: N(p.marketCap), x_now: N(p.priceUsd) / base, soc: (p.info?.socials || []).map((x) => x.type).concat((p.info?.websites || []).length ? ["web"] : []), liq_now: N(p.liquidity?.usd), days: L.length, narr: KNOWN[sym]?.[0] || tagNarr(p.baseToken?.name, sym), story: KNOWN[sym]?.[1] || null };
}

export async function hist100Tick(env, kvGet, kvPut, n = 8) {
  const cur = JSON.parse((await kvGet(env, "hist100")) || "[]"); const done = new Set(cur.map((x) => x.sym));
  const todo = H100.filter((s) => !done.has(s)).slice(0, n); if (!todo.length) return "Rückblick 100×: fertig (" + cur.length + ")";
  for (const s of todo) { try { cur.push(await one(s)); } catch (e) { cur.push({ sym: s, err: e.message }); } }
  await kvPut(env, "hist100", JSON.stringify(cur));
  return `Rückblick 100×: ${cur.length}/${H100.length}`;
}
