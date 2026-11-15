import { mpOpen, mpManage } from "./mpaper.js";
// WC Trading Hub – Meme-Radar (v1.8)
// Alle 5 Minuten (eigener Cron-Lauf, damit der Hub-Takt nicht langsamer wird):
//  · Kandidaten: GeckoTerminal (Trend 5 Min. / 1 Std., neue Pools – alle Ketten + Solana) und DexScreener (neue Token-Profile, Boosts)
//  · Kennzahlen: Alter, Marktwert, Liquidität, Volumen, Preis 5m/1h/6h/24h, Kaufdruck, Volumen-Beschleunigung, Wachstum seit Entdeckung
//  · Sicherheit für die besten Kandidaten: GoPlus (EVM: Honeypot, Mint, Steuern, Halter) bzw. RugCheck (Solana)
//  · Seite /memes?key=… und Hinweise an Kevin (max. 3 pro Stunde), danach ehrliche Nachverfolgung: was wurde 1h/6h/24h nach dem Hinweis daraus?
// Nur Beobachtung und Bildung – der Hub kauft nichts. Die meisten neuen Memecoins verlieren fast ihren ganzen Wert.

const GT = "https://api.geckoterminal.com/api/v2";
const DS = "https://api.dexscreener.com";
const UA = { "User-Agent": "Mozilla/5.0 wc-hub", Accept: "application/json" };
const NET = { eth: "ethereum", ethereum: "ethereum", solana: "solana", base: "base", bsc: "bsc", arbitrum: "arbitrum", polygon_pos: "polygon", polygon: "polygon", avax: "avalanche", avalanche: "avalanche", ton: "ton", sui: "sui", robinhood: "robinhood" };
const GT_NET = { ethereum: "eth", solana: "solana", base: "base", bsc: "bsc", arbitrum: "arbitrum", polygon: "polygon_pos", avalanche: "avax", ton: "ton", sui: "sui-network", robinhood: "robinhood" };
const GOPLUS = { ethereum: 1, bsc: 56, base: 8453, arbitrum: 42161, polygon: 137, avalanche: 43114 };
const STABLE = /^(USDC|USDT|DAI|WETH|WBTC|SOL|WSOL|ETH|BNB|WBNB|CBBTC|USDE|FDUSD|PYUSD|EURC|STETH|WSTETH|JITOSOL|MSOL)$/i;
const RISK_CACHE = 3 * 3600;
const N = (x) => (x == null || x === "" ? null : +x);

export async function memeSchema(env) {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_meme (id TEXT PRIMARY KEY, chain TEXT, token TEXT, pool TEXT, sym TEXT, name TEXT, created INTEGER, first_seen INTEGER, first_px REAL, first_mc REAL, last_t INTEGER, data TEXT, score REAL, src TEXT, risk TEXT, risk_t INTEGER, alert_t INTEGER, alert_px REAL, px1h REAL, px6h REAL, px24h REAL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_meme_snap (id TEXT, t INTEGER, px REAL, mc REAL, liq REAL, v1h REAL, PRIMARY KEY (id, t))"),
  ]);
}

// ---------------------------------------------------------------- Daten holen
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function j(url, tries = 3) {   // bei „zu viele Anfragen“ (429) kurz warten und wiederholen – Cloudflare-Server teilen sich die Grenzen der Anbieter
  for (let k = 0; ; k++) {
    const r = await fetch(url, { headers: UA });
    if (r.ok) return r.json();
    if ((r.status === 429 || r.status >= 500) && k < tries - 1) { await wait(+(r.headers.get("retry-after") || 0) * 1000 || 2500 + k * 2500); continue; }
    throw new Error(url.split("?")[0].replace(/^https:\/\/[^/]+/, "").slice(-40) + " " + r.status);
  }
}
function fromGT(p, tokens, src) {
  const a = p.attributes; const net = p.relationships?.network?.data?.id || p.id.split("_")[0]; const chain = NET[net] || net;
  const tid = p.relationships?.base_token?.data?.id; const tk = tokens[tid] || {}; const addr = tk.address || (tid ? tid.slice(tid.indexOf("_") + 1) : null);
  const pc = a.price_change_percentage || {}, v = a.volume_usd || {}, tx = a.transactions || {};
  return { chain, token: addr, pool: a.address, sym: tk.symbol || String(a.name || "").split(" / ")[0], name: tk.name || a.name, created: a.pool_created_at ? Math.floor(Date.parse(a.pool_created_at) / 1000) : null,
    px: N(a.base_token_price_usd), mc: N(a.market_cap_usd) || N(a.fdv_usd), fdv: N(a.fdv_usd), liq: N(a.reserve_in_usd),
    v5: N(v.m5), v1h: N(v.h1), v6h: N(v.h6), v24: N(v.h24), c5: N(pc.m5), c1h: N(pc.h1), c6h: N(pc.h6), c24: N(pc.h24),
    b5: tx.m5?.buys ?? null, s5: tx.m5?.sells ?? null, b1h: tx.h1?.buys ?? null, s1h: tx.h1?.sells ?? null, buyers1h: tx.h1?.buyers ?? null, sellers1h: tx.h1?.sellers ?? null, src: [src] };
}
function fromDS(x, src) {
  return { chain: x.chainId, token: x.baseToken?.address, pool: x.pairAddress, sym: x.baseToken?.symbol, name: x.baseToken?.name, created: x.pairCreatedAt ? Math.floor(x.pairCreatedAt / 1000) : null,
    px: N(x.priceUsd), mc: N(x.marketCap) || N(x.fdv), fdv: N(x.fdv), liq: N(x.liquidity?.usd),
    v5: N(x.volume?.m5), v1h: N(x.volume?.h1), v6h: N(x.volume?.h6), v24: N(x.volume?.h24), c5: N(x.priceChange?.m5), c1h: N(x.priceChange?.h1), c6h: N(x.priceChange?.h6), c24: N(x.priceChange?.h24),
    b5: x.txns?.m5?.buys ?? null, s5: x.txns?.m5?.sells ?? null, b1h: x.txns?.h1?.buys ?? null, s1h: x.txns?.h1?.sells ?? null, buyers1h: null, sellers1h: null,
    boost: x.boosts?.active || 0, socials: (x.info?.socials || []).length + (x.info?.websites || []).length, src: [src] };
}
async function dsPairs(chain, addrs) {   // DexScreener: je Token das Paar mit der höchsten Liquidität (bis 30 Adressen je Abruf)
  const out = {};
  for (let i = 0; i < addrs.length; i += 30) {
    const L = await j(`${DS}/tokens/v1/${chain}/${addrs.slice(i, i + 30).join(",")}`).catch(() => []);
    for (const x of Array.isArray(L) ? L : []) { const k = x.baseToken?.address; if (k && (!out[k] || (x.liquidity?.usd || 0) > (out[k].liquidity?.usd || 0))) out[k] = x; }
  }
  return out;
}

// ---------------------------------------------------------------- Bewertung
export function metrics(x, now, first) {
  const age = x.created ? (now - x.created) / 3600 : null;   // Stunden
  const buyPct = x.b1h + x.s1h > 0 ? x.b1h / (x.b1h + x.s1h) : null;
  const acc5 = x.v1h > 0 && x.v5 != null && (age == null || age >= 1) ? (x.v5 * 12) / x.v1h : null;   // erst sinnvoll, wenn der Pool älter als das Zeitfenster ist      // >1: die letzten 5 Min. schneller als der Stundenschnitt
  const acc1h = x.v6h > 0 && x.v1h != null && (age == null || age >= 6) ? (x.v1h * 6) / x.v6h : null;    // >1: letzte Stunde schneller als der 6-Std.-Schnitt
  const grow = first?.first_mc > 0 && x.mc ? x.mc / first.first_mc - 1 : null;
  const turn = x.liq > 0 && x.v1h != null ? x.v1h / x.liq : null;          // Umschlag der Liquidität pro Stunde
  // Heiß-Wert (0–100): Volumen, Beschleunigung, Kaufdruck, Preis-Momentum, Jugend – gedeckelt, damit kein Einzelwert dominiert
  const cl = (v, a, b) => Math.max(0, Math.min(1, (v - a) / (b - a)));
  let s = 0;
  s += 25 * cl(Math.log10((x.v1h || 0) + 1), 3.5, 6);        // 3k $ … 1 Mio $ Volumen/Std.
  s += 20 * (acc1h != null ? cl(acc1h, 1, 4) : cl(turn ?? 0, 0.5, 4));   // junge Pools (< 6 Std.): Umschlag statt Beschleunigung
  s += 10 * (acc5 != null ? cl(acc5, 1, 3) : cl(x.c5 ?? 0, 0, 20));
  s += 15 * cl(buyPct ?? 0.5, 0.5, 0.7);
  s += 15 * cl(x.c1h ?? 0, 0, 80);
  s += 10 * (age == null ? 0.3 : cl(48 - age, 0, 47));        // jünger = mehr Punkte
  s += 5 * cl(turn ?? 0, 0.2, 3);
  if ((x.liq || 0) < 10000) s *= 0.5;                          // zu dünn, um rein- und rauszukommen
  if ((x.c5 ?? 0) < -15 || (x.c1h ?? 0) < -30) s *= 0.5;      // läuft gerade ab
  return { age, buyPct, acc5, acc1h, grow, turn, score: Math.round(s) };
}
function basicFlags(x, m) {
  const f = [];
  if ((x.liq || 0) < 15000) f.push("Liquidität < 15k $");
  if (x.mc && x.liq && x.mc / x.liq > 40) f.push("Marktwert 40× größer als Liquidität");
  if (m.age != null && m.age < 0.5) f.push("jünger als 30 Min.");
  if (m.buyPct != null && m.buyPct < 0.4) f.push("mehr Verkäufe als Käufe");
  if ((x.c1h ?? 0) > 300) f.push("+300 % in 1 Std. (Spätkäufer-Gefahr)");
  if ((x.src || []).some((s) => /^Pump\.fun(?! abgeschlossen)/.test(s))) f.push("noch auf der Pump.fun-Kurve (Liquidität = Kurve, Abschluss ungewiss)");
  return f;
}
export async function security(x) {   // → { level: "ok"|"warn"|"danger"|"unknown", flags: [] }
  const flags = []; let lvl = "ok";
  try {
    if (x.chain === "solana") {
      const r = await j(`https://api.rugcheck.xyz/v1/tokens/${x.token}/report/summary`);
      for (const k of r.risks || []) { flags.push(k.name + (k.value ? ` (${k.value})` : "")); if (k.level === "danger") lvl = "danger"; else if (k.level === "warn" && lvl === "ok") lvl = "warn"; }
      if (r.lpLockedPct != null && r.lpLockedPct < 50) { flags.push(`LP nur ${Math.round(r.lpLockedPct)} % gesperrt`); if (lvl === "ok") lvl = "warn"; }
      return { level: lvl, flags, score: r.score_normalised ?? null, src: "RugCheck" };
    }
    const cid = GOPLUS[x.chain]; if (!cid) return { level: "unknown", flags: ["kein Sicherheitscheck für diese Kette"], src: "" };
    const r = (await j(`https://api.gopluslabs.io/api/v1/token_security/${cid}?contract_addresses=${x.token}`)).result?.[String(x.token).toLowerCase()];
    if (!r) return { level: "unknown", flags: ["GoPlus kennt den Token noch nicht"], src: "GoPlus" };
    const d = (c, t) => { if (c) { flags.push(t); lvl = "danger"; } }, w = (c, t) => { if (c) { flags.push(t); if (lvl === "ok") lvl = "warn"; } };
    d(r.is_honeypot === "1", "HONEYPOT – Verkauf nicht möglich"); d(r.cannot_sell_all === "1", "nicht alles verkaufbar"); d(r.owner_change_balance === "1", "Besitzer kann Guthaben ändern");
    d(+r.sell_tax > 0.1, `Verkaufssteuer ${Math.round(+r.sell_tax * 100)} %`); d(r.hidden_owner === "1", "versteckter Besitzer"); d(r.selfdestruct === "1", "Selbstzerstörung im Vertrag");
    w(r.is_mintable === "1", "neue Token können erzeugt werden"); w(+r.buy_tax > 0.05, `Kaufsteuer ${Math.round(+r.buy_tax * 100)} %`); w(r.transfer_pausable === "1", "Handel kann pausiert werden");
    w(r.is_blacklisted === "1", "Blacklist-Funktion"); w(r.is_open_source === "0", "Vertrag nicht offen");
    const top = (r.holders || []).filter((h) => h.is_contract !== 1 && h.is_locked !== 1).slice(0, 10).reduce((a, h) => a + +h.percent, 0);
    w(top > 0.5, `Top-10-Halter besitzen ${Math.round(top * 100)} %`);
    const lpl = (r.lp_holders || []).filter((h) => h.is_locked === 1 || /dead|0x0000/i.test(h.address)).reduce((a, h) => a + +h.percent, 0);
    w(r.lp_holders && lpl < 0.5, `LP nur ${Math.round(lpl * 100)} % gesperrt/verbrannt`);
    return { level: lvl, flags, src: "GoPlus" };
  } catch (e) { return { level: "unknown", flags: ["Sicherheitscheck fehlgeschlagen"], src: "" }; }
}

// ---------------------------------------------------------------- Lauf alle 5 Minuten
export async function memeTick(env, say, kvGet, kvPut) {
  await memeSchema(env);
  const now = Math.floor(Date.now() / 1000); const log = []; const C = {};
  const add = (x) => { if (!x.token || !x.pool || STABLE.test(x.sym || "")) return; const k = x.chain + ":" + x.token; if (C[k]) { C[k].src = [...new Set([...C[k].src, ...x.src])]; if ((x.liq || 0) > (C[k].liq || 0)) Object.assign(C[k], { ...x, src: C[k].src }); } else C[k] = x; };
  for (const [url, src] of [[`${GT}/networks/trending_pools?include=base_token&duration=5m`, "Trend 5m"], [`${GT}/networks/trending_pools?include=base_token&duration=1h`, "Trend 1h"],
    [`${GT}/networks/new_pools?include=base_token`, "Neu"], [`${GT}/networks/solana/new_pools?include=base_token`, "Neu"]]) {
    try { const r = await j(url); await wait(1200); const T = Object.fromEntries((r.included || []).map((t) => [t.id, t.attributes])); for (const p of r.data || []) add(fromGT(p, T, src)); }
    catch (e) { log.push("GT " + e.message); }
  }
  try {   // DexScreener: frisch angelegte Profile und Boosts (Teams, die Werbung bezahlen – Hinweis, kein Qualitätsmerkmal)
    const P = [...(await j(`${DS}/token-profiles/latest/v1`).catch(() => [])).map((x) => [x, "Profil"]), ...(await j(`${DS}/token-boosts/latest/v1`).catch(() => [])).map((x) => [x, "Boost"])];
    const by = {}; for (const [x, s] of P) if (x.chainId && x.tokenAddress) (by[x.chainId] ||= {})[x.tokenAddress] = s;
    for (const [chain, M] of Object.entries(by)) { const pairs = await dsPairs(chain, Object.keys(M).slice(0, 30)); for (const [addr, x] of Object.entries(pairs)) add(fromDS(x, M[addr])); }
  } catch (e) { log.push("DS " + e.message); }
  try {   // Pump.fun (Solana-Startrampe): Coins kurz vor dem Abschluss der Bonding-Kurve, frisch abgeschlossene und „König des Hügels“ – Kennzahlen dann über DexScreener
    const PF = "https://frontend-api-v3.pump.fun", M = {}; let ok = 0;
    for (const [path, tag] of [["/coins?offset=0&limit=50&sort=market_cap&order=DESC&includeNsfw=false", "Pump.fun"], ["/coins?offset=0&limit=50&sort=last_trade_timestamp&order=DESC&includeNsfw=false", "Pump.fun aktiv"], ["/coins/king-of-the-hill?includeNsfw=false", "Pump.fun König"]]) {
      try {
        const r = await j(PF + path, 2); ok++;
        for (const c of Array.isArray(r) ? r : r && r.mint ? [r] : r?.coins || []) {
          if (!c.mint || (c.created_timestamp && now - c.created_timestamp / 1000 > 3 * 86400)) continue;   // nur die letzten 3 Tage
          M[c.mint] = c.complete ? "Pump.fun abgeschlossen" : (c.usd_market_cap || 0) > 35000 ? "Pump.fun kurz vor Abschluss" : tag;
        }
      } catch (e) { log.push("PF " + e.message); }
    }
    if (!ok) {   // Ausweichweg: GeckoTerminal-Pools der Pump-Börsen auf Solana
      for (const dex of ["pump-fun", "pumpswap"]) {
        try { const r = await j(`${GT}/networks/solana/dexes/${dex}/pools?include=base_token&sort=h24_tx_count_desc`, 2); await wait(1200); const T = Object.fromEntries((r.included || []).map((t) => [t.id, t.attributes])); for (const p of r.data || []) add(fromGT(p, T, dex === "pumpswap" ? "Pump.fun abgeschlossen" : "Pump.fun")); }
        catch (e) { log.push("GT-" + dex + " " + e.message); }
      }
    }
    const mints = Object.keys(M).slice(0, 60);
    if (mints.length) { const pairs = await dsPairs("solana", mints); for (const [addr, x] of Object.entries(pairs)) add(fromDS(x, M[addr])); log.push("PF " + mints.length); }
  } catch (e) { log.push("PF " + e.message); }

  const ids = Object.keys(C);
  if (!ids.length) { let mp = ""; try { mp = await mpManage(env, say); } catch (e) { mp = "Papier-Wallet " + e.message; } return "Meme-Radar: keine Daten " + log.join(" ") + " | " + mp; }
  const old = {}; for (let i = 0; i < ids.length; i += 90) for (const r of (await env.DB.prepare(`SELECT * FROM hub_meme WHERE id IN (${ids.slice(i, i + 90).map(() => "?").join(",")})`).bind(...ids.slice(i, i + 90)).all()).results) old[r.id] = r;
  const rows = ids.map((id) => { const x = C[id], o = old[id]; const m = metrics(x, now, o); return { id, x, o, m }; }).sort((a, b) => b.m.score - a.m.score);

  // Sicherheitscheck für die 8 besten ohne frischen Check
  let sc = 0;
  for (const r of rows) { if (sc >= 8) break; if (r.o?.risk_t && now - r.o.risk_t < RISK_CACHE) continue; if (r.m.score < 35) break; r.sec = await security(r.x); sc++; }

  const st = [];
  for (const { id, x, o, m, sec } of rows) {
    const risk = sec ? JSON.stringify(sec) : o?.risk || null;
    st.push(env.DB.prepare(`INSERT INTO hub_meme (id, chain, token, pool, sym, name, created, first_seen, first_px, first_mc, last_t, data, score, src, risk, risk_t) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET pool=excluded.pool, last_t=excluded.last_t, data=excluded.data, score=excluded.score, src=excluded.src, risk=COALESCE(excluded.risk, risk), risk_t=COALESCE(excluded.risk_t, risk_t)`)
      .bind(id, x.chain, x.token, x.pool, x.sym, x.name, x.created, o?.first_seen || now, o?.first_px || x.px, o?.first_mc || x.mc, now, JSON.stringify({ ...x, ...m, flags: basicFlags(x, m) }), m.score, x.src.join(","), risk, sec ? now : null));
    st.push(env.DB.prepare("INSERT OR REPLACE INTO hub_meme_snap (id, t, px, mc, liq, v1h) VALUES (?, ?, ?, ?, ?, ?)").bind(id, Math.floor(now / 300) * 300, x.px, x.mc, x.liq, x.v1h));
  }
  for (let i = 0; i < st.length; i += 90) await env.DB.batch(st.slice(i, i + 90));

  // Hinweise an Kevin: Heiß-Wert ≥ 70, Sicherheit nicht „danger“, nicht schon gemeldet; max. 3 pro Stunde
  const hk = "meme_alerts_" + new Date().toISOString().slice(0, 13); let sent = +(await kvGet(env, hk) || 0);
  for (const r of rows) {
    if (sent >= 3 || r.m.score < 70) break;
    if (r.o?.alert_t) continue;
    const sec = r.sec || (r.o?.risk ? JSON.parse(r.o.risk) : null);
    if (!sec || sec.level === "danger" || sec.level === "unknown" || (r.x.liq || 0) < 20000) continue;   // nur mit Sicherheitscheck und genug Liquidität
    const x = r.x, m = r.m, f = (v, d = 0) => (v == null ? "–" : (v >= 0 ? "+" : "") + v.toFixed(d));
    const amp = sec.level === "ok" ? "🟢" : sec.level === "warn" ? "🟡" : "⚪";
    await say(env, `🚀 Meme-Radar: ${x.sym} (${x.chain})\nHeiß-Wert ${m.score}/100 · Alter ${m.age != null ? (m.age < 1 ? Math.round(m.age * 60) + " Min." : m.age.toFixed(1) + " Std.") : "?"}\n` +
      `Marktwert ${usd(x.mc)} · Liquidität ${usd(x.liq)} · Volumen 1h ${usd(x.v1h)}\nPreis: 5m ${f(x.c5)} % · 1h ${f(x.c1h)} % · 24h ${f(x.c24)} %\nKäufe 1h: ${m.buyPct != null ? Math.round(m.buyPct * 100) + " %" : "?"} · ${m.acc1h != null ? "Volumen-Beschleunigung " + m.acc1h.toFixed(1) + "×" : "Umschlag " + (m.turn != null ? m.turn.toFixed(1) + "× Liquidität/Std." : "?")}\n` +
      `Sicherheit ${amp} ${sec.src || ""}: ${(sec.flags || []).slice(0, 3).join("; ") || "keine Auffälligkeiten"}${basicFlags(x, m).length ? "\n⚠️ " + basicFlags(x, m).join("; ") : ""}\n` +
      `https://dexscreener.com/${x.chain}/${x.pool}\nNur Beobachtung, keine Anlageberatung – die meisten Memecoins verlieren fast alles.`);
    await env.DB.prepare("UPDATE hub_meme SET alert_t = ?, alert_px = ? WHERE id = ?").bind(now, x.px, r.id).run();
    sent++;
    try { await mpOpen(env, say, { chain: x.chain, token: x.token, pool: x.pool, sym: x.sym, px: x.px, src: "Meme-Radar (Heiß-Wert " + m.score + ")" }); } catch (e) { log.push("Papier " + e.message); }
  }
  await kvPut(env, hk, sent);

  // Nachverfolgung gemeldeter Coins: Kurs 1h/6h/24h nach dem Hinweis (über DexScreener, auch wenn sie aus den Listen gefallen sind)
  const due = (await env.DB.prepare("SELECT id, chain, token, alert_t, px1h, px6h, px24h FROM hub_meme WHERE alert_t IS NOT NULL AND px24h IS NULL AND alert_t < ? LIMIT 60").bind(now - 3600).all()).results;
  if (due.length) {
    const by = {}; for (const d of due) (by[d.chain] ||= []).push(d);
    for (const [chain, L] of Object.entries(by)) {
      const P = await dsPairs(chain, L.map((d) => d.token));
      for (const d of L) {
        const px = P[d.token] ? N(P[d.token].priceUsd) : (C[d.chain + ":" + d.token]?.px ?? null); const dt = now - d.alert_t; if (px == null) continue;
        const col = dt >= 86400 && d.px24h == null ? "px24h" : dt >= 6 * 3600 && d.px6h == null ? "px6h" : dt >= 3600 && d.px1h == null ? "px1h" : null;
        if (col) await env.DB.prepare(`UPDATE hub_meme SET ${col} = ? WHERE id = ?`).bind(px, d.id).run();
      }
    }
  }
  if (new Date().getUTCMinutes() < 5) {   // stündlich aufräumen: Schnappschüsse 3 Tage, Coins ohne Hinweis 7 Tage
    await env.DB.prepare("DELETE FROM hub_meme_snap WHERE t < ?").bind(now - 3 * 86400).run();
    await env.DB.prepare("DELETE FROM hub_meme WHERE alert_t IS NULL AND last_t < ?").bind(now - 7 * 86400).run();
  }
  try { log.push(await mpManage(env, say)); } catch (e) { log.push("Papier-Wallet " + e.message); }
  return `Meme-Radar: ${ids.length} Kandidaten, ${sc} geprüft, ${sent} Hinweise${log.length ? " | " + log.join(" | ") : ""}`;
}

const usd = (v) => (v == null ? "?" : v >= 1e9 ? (v / 1e9).toFixed(2) + " Mrd $" : v >= 1e6 ? (v / 1e6).toFixed(2) + " Mio $" : v >= 1e3 ? (v / 1e3).toFixed(1) + "k $" : v.toFixed(0) + " $");

// ---------------------------------------------------------------- Seite /memes
export async function memePage(env, key, WD, MPD) {
  await memeSchema(env);
  const now = Math.floor(Date.now() / 1000);
  const R = (await env.DB.prepare("SELECT * FROM hub_meme WHERE last_t > ? ORDER BY score DESC LIMIT 300").bind(now - 1800).all()).results;
  const A = (await env.DB.prepare("SELECT * FROM hub_meme WHERE alert_t IS NOT NULL ORDER BY alert_t DESC LIMIT 100").all()).results;
  const items = R.map((r) => { const d = JSON.parse(r.data || "{}"); const s = r.risk ? JSON.parse(r.risk) : null; return { id: r.id, chain: r.chain, token: r.token, pool: r.pool, sym: r.sym, name: r.name, src: r.src, score: r.score,
    age: d.age, mc: d.mc, liq: d.liq, v1h: d.v1h, v24: d.v24, c5: d.c5, c1h: d.c1h, c6h: d.c6h, c24: d.c24, buy: d.buyPct, acc: d.acc1h, acc5: d.acc5, grow: d.grow, flags: d.flags || [],
    sec: s ? s.level : null, secf: s ? s.flags : [], secsrc: s ? s.src : "", seen: r.first_seen, alerted: !!r.alert_t }; });
  const ch = (a, b) => (a && b ? (b / a - 1) * 100 : null);
  const al = A.map((r) => ({ sym: r.sym, chain: r.chain, pool: r.pool, t: r.alert_t, h1: ch(r.alert_px, r.px1h), h6: ch(r.alert_px, r.px6h), h24: ch(r.alert_px, r.px24h) }));
  const done = al.filter((x) => x.h24 != null); const med = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const stats = { n: al.length, n24: done.length, up24: done.filter((x) => x.h24 > 0).length, med24: med(done.map((x) => x.h24)), x2: done.filter((x) => x.h24 >= 100).length, rug: done.filter((x) => x.h24 <= -80).length };
  const DATA = JSON.stringify({ items, al, stats, t: now, wd: WD || null, mp: MPD || null }).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Meme-Radar</title>
<style>:root{--bg:#0b0b0d;--card:#151518;--line:#26262b;--tx:#ececf0;--mut:#9a9aa3;--gold:#e8b54a;--g:#3ecf8e;--r:#ff6b6b;--y:#f5c451}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;padding:16px;max-width:1280px;margin:auto}
h1{font-size:22px;margin:0}h1 b{color:var(--gold)}.sub{color:var(--mut);font-size:12.5px;margin:4px 0 14px}
.warn{background:#2a1c0f;border:1px solid #5a3a12;border-radius:10px;padding:10px 12px;font-size:12.5px;color:#f1c98a;margin-bottom:14px}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}.tabs button,.f select,.f input{background:var(--card);color:var(--tx);border:1px solid var(--line);border-radius:999px;padding:7px 12px;font:inherit;font-size:13px;cursor:pointer}
.tabs button.on{background:var(--gold);color:#111;border-color:var(--gold);font-weight:700}.f{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center;font-size:12.5px;color:var(--mut)}.f input{width:90px;border-radius:8px}.f select{border-radius:8px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:0 0 14px}.k{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px}.k b{display:block;font-size:20px}.k span{color:var(--mut);font-size:12px}
.w{overflow-x:auto;border:1px solid var(--line);border-radius:12px}table{border-collapse:collapse;width:100%;min-width:980px}th,td{padding:8px 9px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
th{color:var(--mut);font-weight:600;font-size:12px;position:sticky;top:0;background:var(--card);cursor:pointer}td:first-child,th:first-child,td:nth-child(2),th:nth-child(2){text-align:left}tr:hover td{background:#18181c}
.sym{font-weight:700}.sym a{color:var(--tx);text-decoration:none}.nm{color:var(--mut);font-size:11.5px;max-width:160px;overflow:hidden;text-overflow:ellipsis;display:block}.pos{color:var(--g)}.neg{color:var(--r)}
.sc{display:inline-block;min-width:34px;text-align:center;border-radius:6px;padding:2px 6px;font-weight:700;color:#111}.chip{font-size:11px;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:1px 7px;margin-left:4px}
.risk{cursor:help}.lk a{color:var(--gold);text-decoration:none;font-size:12px;margin-left:6px}.foot{color:var(--mut);font-size:12px;margin-top:12px}.mini{background:var(--card);color:var(--tx);border:1px solid var(--line);border-radius:8px;padding:5px 10px;font:inherit;font-size:12.5px;cursor:pointer}
@media(max-width:640px){body{padding:12px}h1{font-size:19px}}</style></head><body>
<h1>🚀 Meme-<b>Radar</b></h1><div class="sub" id="sub"></div>
<div class="warn">⚠️ Nur Beobachtung und Bildung, keine Anlageberatung. Die große Mehrheit neuer Memecoins verliert innerhalb von Tagen fast ihren gesamten Wert; frühe Käufe macht oft schon ein Bot in Sekunden. Sicherheits-Checks (GoPlus/RugCheck) finden nicht jeden Betrug. Nur Geld einsetzen, dessen Totalverlust du verkraftest.</div>
<div class="kpis" id="kpis"></div>
<div class="tabs" id="tabs"></div>
<div class="f">Kette <select id="fc"><option value="">alle</option></select> Min. Liquidität <input id="fl" type="number" value="15000" step="5000"> Sicherheit <select id="fs"><option value="">alle</option><option value="nodanger" selected>ohne 🔴</option><option value="ok">nur 🟢</option></select> <span id="cnt"></span></div>
<div id="wbox" style="display:none;margin-bottom:12px"><div class="warn" style="background:#121a14;border-color:#244a30;color:#bfe6c9">👛 Trage Wallets ein, die du z. B. über DexScreener „Top Traders“ oder gmgn.ai gefunden hast (hoher Gewinn, gute Trefferquote). Der Hub meldet, wenn 2+ deiner Wallets denselben Coin kaufen (👛×2), und zeigt ehrlich, was aus ihren Käufen wurde – gemessen ab dem Moment, in dem der Hub den Kauf sah. Viele „Top-Trader“ sind Insider oder Bots: entscheidend ist die Bilanz hier, nicht die auf gmgn.</div>
<div id="wnote" class="foot" style="color:#f5c451"></div>
<div class="f" style="display:flex"><input id="wa" placeholder="Solana-Wallet-Adresse" style="width:340px;max-width:100%"><input id="wn" placeholder="Name (z. B. gmgn-Top1)" style="width:180px"><label><input id="wal" type="checkbox"> Alarm bei jedem Kauf</label><button id="wadd" class="mini" style="background:#e8b54a;color:#111;font-weight:700">+ Wallet hinzufügen</button></div>
<div id="wfind"></div><div class="w" id="wl" style="margin-bottom:14px"></div></div>
<div class="w"><table><thead id="th"></thead><tbody id="tb"></tbody></table></div>
<div class="foot">Heiß-Wert 0–100 = Volumen, Volumen-Beschleunigung, Kaufdruck, Preis-Momentum, Alter und Umschlag kombiniert. Beschl. 1h = Volumen der letzten Stunde ÷ Schnitt der letzten 6 Std. Quellen: GeckoTerminal, DexScreener, GoPlus, RugCheck. Seite lädt jede Minute neu.</div>
<script>const D=${DATA};const GP=${JSON.stringify(GOPLUS)};
const $=(i)=>document.getElementById(i);const usd=(v)=>v==null?"–":v>=1e9?(v/1e9).toFixed(2)+"B":v>=1e6?(v/1e6).toFixed(2)+"M":v>=1e3?(v/1e3).toFixed(1)+"k":v.toFixed(0);
const pc=(v)=>v==null?'<span>–</span>':'<span class="'+(v>=0?"pos":"neg")+'">'+(v>=0?"+":"")+(Math.abs(v)>=100?v.toFixed(0):v.toFixed(1))+'%</span>';
const ag=(h)=>h==null?"–":h<1?Math.round(h*60)+"m":h<48?h.toFixed(1)+"h":Math.round(h/24)+"d";
const esc=(s)=>String(s??"").replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const scol=(s)=>s>=70?"#3ecf8e":s>=50?"#f5c451":s>=30?"#d9a441":"#666";
const sec=(x)=>{const i=x.sec==="ok"?"🟢":x.sec==="warn"?"🟡":x.sec==="danger"?"🔴":"⚪";const t=[...(x.secf||[]),...(x.flags||[])].join(" · ")||"noch nicht geprüft";return '<span class="risk" title="'+esc((x.secsrc?x.secsrc+": ":"")+t)+'">'+i+(x.flags&&x.flags.length?" ⚠️"+x.flags.length:"")+'</span>'};
const TABS=[["hot","🔥 Heiß jetzt",(a,b)=>b.score-a.score,()=>true],["new","🆕 Neu < 24h",(a,b)=>b.score-a.score,(x)=>x.age!=null&&x.age<24],["acc","🚀 Beschleuniger",(a,b)=>(b.acc||0)-(a.acc||0),(x)=>(x.v1h||0)>5000],["c1h","📈 Top 1h",(a,b)=>(b.c1h||-1e9)-(a.c1h||-1e9),()=>true],["c24","📊 Top 24h",(a,b)=>(b.c24||-1e9)-(a.c24||-1e9),()=>true],["al","🔔 Hinweise & Ergebnis"],["w","👛 Smart-Wallets"],["mp","🤖 Papier-Wallet"]];
let tab="hot";try{tab=localStorage.getItem("mr_tab")||"hot"}catch(e){}
[...new Set(D.items.map(x=>x.chain))].sort().forEach(c=>{const o=document.createElement("option");o.value=o.textContent=c;$("fc").appendChild(o)});
$("sub").textContent="Stand "+new Date(D.t*1000).toLocaleString("de-DE")+" · "+D.items.length+" Coins in Beobachtung";
const s=D.stats;$("kpis").innerHTML=[["Hinweise gesamt",s.n],["nach 24h ausgewertet",s.n24],["davon im Plus",s.n24?Math.round(s.up24/s.n24*100)+" %":"–"],["Median nach 24h",s.med24==null?"–":(s.med24>=0?"+":"")+s.med24.toFixed(0)+" %"],["verdoppelt",s.x2],["−80 % oder schlimmer",s.rug]].map(([a,b])=>'<div class="k"><b>'+b+'</b><span>'+a+'</span></div>').join("");
function render(){$("tabs").innerHTML=TABS.map(t=>'<button class="'+(t[0]===tab?"on":"")+'" data-t="'+t[0]+'">'+t[1]+'</button>').join("");
 document.querySelectorAll("#tabs button").forEach(b=>b.onclick=()=>{tab=b.dataset.t;try{localStorage.setItem("mr_tab",tab)}catch(e){}render()});
 $("wbox").style.display=tab==="w"?"block":"none";document.querySelector(".f").style.display=tab==="w"||tab==="al"?"none":"flex";
 if(tab==="w"){renderW();return}
 if(tab==="mp"){renderMP();return}
 if(tab==="al"){$("th").innerHTML="<tr><th>Coin</th><th>Kette</th><th>Hinweis</th><th>nach 1h</th><th>nach 6h</th><th>nach 24h</th></tr>";
  $("tb").innerHTML=D.al.map(x=>"<tr><td class=sym><a target=_blank rel=noopener href='https://dexscreener.com/"+esc(x.chain)+"/"+esc(x.pool)+"'>"+esc(x.sym)+"</a></td><td>"+esc(x.chain)+"</td><td>"+new Date(x.t*1000).toLocaleString("de-DE",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})+"</td><td>"+pc(x.h1)+"</td><td>"+pc(x.h6)+"</td><td>"+pc(x.h24)+"</td></tr>").join("")||"<tr><td colspan=6>Noch keine Hinweise.</td></tr>";$("cnt").textContent="";return}
 const T=TABS.find(t=>t[0]===tab);const fc=$("fc").value,fl=+$("fl").value||0,fs=$("fs").value;
 const NC={};D.items.forEach(x=>{const k=String(x.sym).toUpperCase();NC[k]=(NC[k]||0)+1});
 const L=D.items.filter(T[3]).filter(x=>(!fc||x.chain===fc)&&(x.liq||0)>=fl&&(fs===""||(fs==="nodanger"?x.sec!=="danger":x.sec==="ok"))).sort(T[2]).slice(0,120);
 $("cnt").textContent=L.length+" Treffer";
 $("th").innerHTML="<tr><th>Coin</th><th>Kette</th><th>Heiß</th><th>Alter</th><th>Marktwert</th><th>Liquidität</th><th>Vol 1h</th><th>Beschl. 1h</th><th>5m</th><th>1h</th><th>6h</th><th>24h</th><th>Käufe 1h</th><th>seit Entdeckung</th><th>Sicherheit</th><th>Links</th></tr>";
 $("tb").innerHTML=L.map(x=>"<tr><td><span class=sym><a target=_blank rel=noopener href='https://dexscreener.com/"+esc(x.chain)+"/"+esc(x.pool)+"'>"+esc(x.sym)+"</a></span>"+(x.alerted?"<span class=chip>🔔</span>":"")+(NC[String(x.sym).toUpperCase()]>1?"<span class=chip title='Mehrere Coins mit diesem Namen – oft Nachahmer. Adresse prüfen!' style='color:#f5c451'>Doppelname</span>":"")+(String(x.src).includes("Boost")?"<span class=chip title='bezahlte Werbung auf DexScreener'>Boost</span>":"")+(String(x.src).includes("Pump")||(x.chain==="solana"&&/pump$/.test(x.token||""))?"<span class=chip title='auf Pump.fun gestartet"+(String(x.src).includes("kurz vor")?" – kurz vor dem Abschluss der Bonding-Kurve":String(x.src).includes("abgeschlossen")?" – Bonding-Kurve abgeschlossen, jetzt frei handelbar":"")+"' style='color:#7ee0a6'>💊 Pump</span>":"")+"<span class=nm>"+esc(x.name)+"</span></td><td>"+esc(x.chain)+"</td><td><span class=sc style='background:"+scol(x.score)+"'>"+x.score+"</span></td><td>"+ag(x.age)+"</td><td>"+usd(x.mc)+"</td><td>"+usd(x.liq)+"</td><td>"+usd(x.v1h)+"</td><td>"+(x.acc==null?"–":x.acc.toFixed(1)+"×")+"</td><td>"+pc(x.c5)+"</td><td>"+pc(x.c1h)+"</td><td>"+pc(x.c6h)+"</td><td>"+pc(x.c24)+"</td><td>"+(x.buy==null?"–":Math.round(x.buy*100)+"%")+"</td><td>"+pc(x.grow==null?null:x.grow*100)+"</td><td>"+sec(x)+"</td><td class=lk><a target=_blank rel=noopener href='https://dexscreener.com/"+esc(x.chain)+"/"+esc(x.pool)+"'>DS</a>"+(x.chain==="solana"?"<a target=_blank rel=noopener href='https://rugcheck.xyz/tokens/"+esc(x.token)+"'>Rug</a>":GP[x.chain]?"<a target=_blank rel=noopener href='https://gopluslabs.io/token-security/"+GP[x.chain]+"/"+esc(x.token)+"'>Sec</a>":"")+"</td></tr>").join("")||"<tr><td colspan=16>Keine Treffer mit diesen Filtern.</td></tr>"}
const Q=location.search;const api=async(p)=>{const r=await fetch("/wallet"+Q+"&"+p);const t=await r.text();if(t!=="ok")alert(t);location.reload()};
const sh=(a)=>a.slice(0,4)+"…"+a.slice(-4);
function renderW(){const W=D.wd;$("cnt").textContent="";
 if(!W){$("th").innerHTML="";$("tb").innerHTML="<tr><td>Wallet-Daten nicht verfügbar.</td></tr>";return}
 $("wnote").innerHTML=W.helius?"":"⚠️ Noch kein Helius-Schlüssel hinterlegt – Wallets werden gespeichert, aber erst beobachtet, sobald HELIUS_KEY gesetzt ist.";
 const F=W.finder;$("wfind").innerHTML=F?("<div class=k style='margin-bottom:10px'><b style='font-size:15px'>🔎 Wallet-Finder</b><span> sucht stündlich selbstständig: "+F.st.toks+" Gewinner-Coins gesammelt ("+F.st.done+" ausgewertet), "+F.st.early+" frühe Käufer in "+F.rules.days+" Tagen, "+F.st.judged+" Kandidaten geprüft, "+F.st.okc+" bestanden. Aufnahme als Probe, Aufstieg erst nach ≥ 5 Käufen mit Median nach 24 Std. ≥ +20 %.</span></div>"+
  (F.tok.length?"<details><summary class=foot style='cursor:pointer'>Zuletzt gefundene Gewinner und Prüfungen anzeigen</summary><div class=foot>"+F.tok.slice(0,15).map(t=>esc(t.sym||t.mint.slice(0,6))+" (+"+Math.round((t.gain||0)*100)+" %, "+esc(t.src)+") → "+(t.done?(t.buyers!=null?t.buyers+" frühe Käufer":esc(t.note||"übersprungen")):"wartet")).join(" · ")+"<br><br>"+F.ev.slice(0,15).map(e=>(e.ok?"✅ ":"❌ ")+esc(e.wallet.slice(0,4)+"…"+e.wallet.slice(-4))+": "+esc(e.why)).join("<br>")+"</div></details>":"")):"";
 $("wl").innerHTML=W.wallets.length?"<table><thead><tr><th>Wallet</th><th>Adresse</th><th>Käufe gesehen</th><th>nach 24h ausgewertet</th><th>davon im Plus</th><th>Ø nach 24h</th><th>−80 % oder schlimmer</th><th>Alarm je Kauf</th><th></th></tr></thead><tbody>"+W.wallets.map(w=>{const s=W.stats[w.addr]||{};return "<tr><td class=sym>"+esc(w.label||"–")+" <span class=chip title='"+esc(w.note||"")+"' style='color:"+(w.status==="probe"?"#f5c451":w.status==="active"?"#3ecf8e":"#9a9aa3")+"'>"+(w.status==="probe"?"Probe":w.status==="active"?"aktiv (Finder)":"manuell")+"</span></td><td><a target=_blank rel=noopener style='color:#e8b54a' href='https://gmgn.ai/sol/address/"+esc(w.addr)+"'>"+sh(w.addr)+"</a></td><td>"+(s.n||0)+"</td><td>"+(s.n24||0)+"</td><td>"+(s.n24?Math.round(s.up24/s.n24*100)+" %":"–")+"</td><td>"+(s.avg24==null?"–":pc(s.avg24*100))+"</td><td>"+(s.rug||0)+"</td><td><button data-tg='"+esc(w.addr)+"' class=mini>"+(w.alert?"🔔 an":"🔕 aus")+"</button></td><td><button data-del='"+esc(w.addr)+"' class=mini>entfernen</button></td></tr>"}).join("")+"</tbody></table>":"<p class=foot>Noch keine Wallets eingetragen.</p>";
 document.querySelectorAll("[data-tg]").forEach(b=>b.onclick=()=>api("toggle="+encodeURIComponent(b.dataset.tg)));
 document.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{if(confirm("Wallet entfernen?"))api("del="+encodeURIComponent(b.dataset.del))});
 $("th").innerHTML="<tr><th>Zeit</th><th>Wallet</th><th>Aktion</th><th>Coin</th><th>SOL</th><th>Marktwert beim Kauf</th><th>Liquidität</th><th>nach 1h</th><th>nach 6h</th><th>nach 24h</th></tr>";
 $("tb").innerHTML=W.tx.map(x=>{const c=(a,b)=>a&&b?(b/a-1)*100:null;const cl=W.clusters[x.mint];return "<tr><td>"+new Date(x.t*1000).toLocaleString("de-DE",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})+"</td><td>"+esc(x.label||sh(x.addr))+"</td><td>"+(x.side>0?"<span class=pos>Kauf</span>":"<span class=neg>Verkauf</span>")+"</td><td class=sym><a target=_blank rel=noopener href='https://dexscreener.com/solana/"+esc(x.pool||x.mint)+"'>"+esc(x.sym||sh(x.mint))+"</a>"+(cl&&x.side>0?"<span class=chip style='color:#3ecf8e'>👛×"+cl+"</span>":"")+"</td><td>"+(x.sol?Math.abs(x.sol).toFixed(2):"–")+"</td><td>"+usd(x.mc)+"</td><td>"+usd(x.liq)+"</td><td>"+(x.side>0?pc(c(x.px,x.px1h)):"")+"</td><td>"+(x.side>0?pc(c(x.px,x.px6h)):"")+"</td><td>"+(x.side>0?pc(c(x.px,x.px24h)):"")+"</td></tr>"}).join("")||"<tr><td colspan=10>Noch keine Transaktionen gesehen.</td></tr>"}
function renderMP(){const P=D.mp;$("cnt").textContent="";if(!P){$("th").innerHTML="";$("tb").innerHTML="<tr><td>Papier-Wallet startet nach dem Deploy.</td></tr>";return}
 const f=(v)=>(v>=0?"+":"")+v.toFixed(2)+" $";const R=P.rules;
 $("th").innerHTML="<tr><th colspan=9 style='text-align:left;font-size:13px;color:var(--tx)'>Kontostand <b>"+P.equity.toFixed(2)+" $</b> (Start "+R.start+" $) · realisiert <span class='"+(P.realized>=0?"pos":"neg")+"'>"+f(P.realized)+"</span> · "+P.closed.length+" Trades, "+P.wins+" im Plus · "+P.open.length+"/"+R.maxOpen+" offen · je Kauf "+R.size+" $, Kosten "+Math.round(R.cost*100)+" % je Richtung · <span style='color:var(--mut)'>simuliert, kein echtes Geld</span></th></tr><tr><th>Coin</th><th>Kette</th><th>Grund</th><th>Kauf</th><th>Einstieg</th><th>aktuell / Ausstieg</th><th>Ergebnis</th><th>Status</th><th>Dauer</th></tr>";
 const rows=[...P.open,...P.closed].map(p=>{const cur=p.t_close?p.px_close:p.last_px;const val=p.t_close?p.pnl:((p.cash||0)+p.qty*(p.last_px||p.px)*(1-R.cost)-p.cost);const dur=((p.t_close||Math.floor(Date.now()/1000))-p.t)/3600;
  return "<tr><td class=sym><a target=_blank rel=noopener href='https://dexscreener.com/"+esc(p.chain)+"/"+esc(p.pool||p.token)+"'>"+esc(p.sym)+"</a></td><td>"+esc(p.chain)+"</td><td style='text-align:left'>"+esc(p.src)+"</td><td>"+new Date(p.t*1000).toLocaleString("de-DE",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})+"</td><td>"+(p.px<1?p.px.toPrecision(4):p.px.toFixed(4))+"</td><td>"+(cur==null?"–":cur<1?cur.toPrecision(4):cur.toFixed(4))+"</td><td><span class='"+(val>=0?"pos":"neg")+"'>"+f(val)+"</span></td><td>"+(p.t_close?esc(p.why):(p.half?"offen (Hälfte verkauft)":"offen"))+"</td><td>"+dur.toFixed(1)+" h</td></tr>"}).join("");
 $("tb").innerHTML=rows||"<tr><td colspan=9>Noch keine Papier-Käufe. Der erste kommt beim nächsten Radar-Hinweis oder Smart-Wallet-Cluster.</td></tr>"}
$("wadd").onclick=()=>{const a=$("wa").value.trim();if(!a)return;api("add="+encodeURIComponent(a)+"&label="+encodeURIComponent($("wn").value.trim())+"&alert="+($("wal").checked?1:0))};
["fc","fl","fs"].forEach(i=>$(i).oninput=render);render();setTimeout(()=>{if(tab!=="w")location.reload()},60000);
</script></body></html>`;
}
