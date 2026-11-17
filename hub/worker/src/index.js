// WC Trading Hub – Worker (Cloudflare). v1.1 – Gold, Silber, Bitcoin
// Alle 5 Minuten: neue Kerzen (XAUUSD, XAGUSD, BTCUSD) über MetaApi (nur lesend) -> D1, freigegebene Strategien laufen live auf Papier mit,
// neue/abgeschlossene Papier-Trades -> Nachricht an Kevin (über den Postausgang des Welcome-Bots).
// Stündlich: Strategie-Register aus GitHub (hub/registry.json, vom nächtlichen Forschungs-Agenten gepflegt).
// Täglich: neue Kerzen + Papier-Trades als Datei nach GitHub (für die Forschung), Forschungsbericht an Kevin.
// Dashboard: https://<worker>/?key=HUB_KEY
// Secrets: META_TOKEN, META_ACCOUNT, (META_REGION), GH_TOKEN, HUB_KEY
import * as E from "./engine.js";
import { memeTick, memePage } from "./meme.js";
import { walletTick, walletAdmin, walletData } from "./wallets.js";
import { altTick, altPage, mktTick, altSchema } from "./alts.js";
import { mpData } from "./mpaper.js";
import { finderTick, finderData } from "./finder.js";
import { runnerTick, runnerData } from "./runner.js";
import { hist100Tick } from "./hist100.js";
import { narrTick } from "./narrative.js";
import { vzTick, vzTradesAll } from "./vipzones.js";
import { sigTick, sigPage, sigData } from "./signals.js";
import { memeLearn, mlPage } from "./memelearn.js";
import { olTick } from "./outlook.js";
import { altLearn, PARTS } from "./altlearn.js";
import { czMap, hist } from "./alts.js";
import { mpRules, mpFast, fwCheck } from "./mpaper.js";

const VERSION = "3.1";
const SYMBOLS = (env) => String(env.SYMBOLS || "XAUUSD,XAGUSD,BTCUSD").split(",").map((x) => x.trim()).filter(Boolean);
// Kerzen-Schlüssel in hub_candles.tf: Gold ohne Präfix (abwärtskompatibel), sonst "XAGUSD:5m"
const TK = (sym, tf) => (sym === "XAUUSD" ? tf : `${sym}:${tf}`);
const NAME = (sym) => (E.SYMS[sym]?.name || sym);
const DIG = (sym) => ({ XAGUSD: 3, XRPUSD: 4, DOGEUSD: 5 }[sym] ?? (/^[A-Z]{6}$/.test(sym) && !/^(XAU|XAG|BTC|ETH|SOL|BNB)/.test(sym) ? (/JPY$/.test(sym) ? 3 : 5) : 2));
const REPO = (env) => env.GH_REPO || "kiri981/wealth-reels";

// ---------------------------------------------------------------- MetaApi
// Broker-Symbolname auflösen (Ultima kann z. B. "XAGUSD" oder "XAGUSD.s" heißen) – einmalig über die Symbol-Liste, dann gespeichert
async function brokerSym(env, sym) {
  const k = "brokersym:" + sym; const c = await kvGet(env, k); if (c) return c;
  const region = env.META_REGION || "london";
  let name = sym;
  try {
    const r = await fetch(`https://mt-client-api-v1.${region}.agiliumtrade.ai/users/current/accounts/${env.META_ACCOUNT}/symbols`, { headers: { "auth-token": env.META_TOKEN } });
    if (r.ok) {
      const L = (await r.json()).map(String);
      const base = sym.slice(0, 3), alt = sym === "BTCUSD" ? ["BTCUSD", "BTCUSDT", "BITCOIN", "BTC/USD"] : [sym];
      name = L.find((x) => alt.includes(x.toUpperCase())) || L.find((x) => x.toUpperCase().startsWith(sym)) || L.find((x) => x.toUpperCase().startsWith(base) && /USD/i.test(x)) || sym;
      await kvPut(env, k, name);
    }
  } catch (e) { console.log("Symbole:", e.message); }
  return name;
}
async function candles(env, sym, tf, limit, before) {
  const region = env.META_REGION || "london";
  const bs = await brokerSym(env, sym);
  const url = `https://mt-market-data-client-api-v1.${region}.agiliumtrade.ai/users/current/accounts/${env.META_ACCOUNT}` +
    `/historical-market-data/symbols/${encodeURIComponent(bs)}/timeframes/${tf}/candles?limit=${limit}` + (before ? `&startTime=${new Date(before * 1000).toISOString()}` : "");
  const r = await fetch(url, { headers: { "auth-token": env.META_TOKEN } });
  if (!r.ok) throw new Error(`MetaApi ${bs} ${tf} ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const a = await r.json();
  return (Array.isArray(a) ? a : []).filter((k) => k && k.high != null).map((k) => ({ t: Math.floor(new Date(k.time).getTime() / 1000), o: +k.open, h: +k.high, l: +k.low, c: +k.close }))
    .sort((x, y) => x.t - y.t);
}

async function schema(env) {
  if (await env.STATE?.get?.("hub:schema1")) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_candles (tf TEXT, t INTEGER, o REAL, h REAL, l REAL, c REAL, PRIMARY KEY (tf, t))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_trades (sid TEXT, t INTEGER, dr INTEGER, e REAL, sl REAL, tp REAL, r REAL, why TEXT, tx INTEGER, closed INTEGER, notified INTEGER DEFAULT 0, PRIMARY KEY (sid, t))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_strats (id TEXT PRIMARY KEY, name TEXT, family TEXT, params TEXT, status TEXT, backtest TEXT, live TEXT, created TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_kv (k TEXT PRIMARY KEY, v TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_news (id TEXT PRIMARY KEY, t INTEGER, src TEXT, title TEXT, url TEXT, score INTEGER, dir TEXT, summary TEXT, sent INTEGER DEFAULT 0)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_deriv (sym TEXT, t INTEGER, oi REAL, fr REAL, liq_l REAL, liq_s REAL, ls REAL, PRIMARY KEY (sym, t))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_cot (sym TEXT, d TEXT, mm_l REAL, mm_s REAL, pm_l REAL, pm_s REAL, sd_l REAL, sd_s REAL, oi REAL, PRIMARY KEY (sym, d))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_deriv_d (sym TEXT, d TEXT, o REAL, h REAL, l REAL, c REAL, oi REAL, fr REAL, liq_l REAL, liq_s REAL, ls REAL, PRIMARY KEY (sym, d))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_macro (series TEXT, d TEXT, v REAL, PRIMARY KEY (series, d))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_etf (sym TEXT, d TEXT, tonnes REAL, PRIMARY KEY (sym, d))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_events (id TEXT PRIMARY KEY, t INTEGER, cur TEXT, title TEXT, impact TEXT, forecast TEXT, previous TEXT, actual TEXT, note TEXT)"),
  ]);
  await env.STATE?.put?.("hub:schema1", "1");
  if ((await kvGet(env, "mig17")) !== "1") {   // v1.7: Portfolio-Kennzeichen + Symbol je Papier-Trade
    for (const col of ["pf INTEGER DEFAULT 1", "sym TEXT"]) { try { await env.DB.prepare("ALTER TABLE hub_trades ADD COLUMN " + col).run(); } catch (e) { /* Spalte existiert schon */ } }
    await env.DB.prepare("UPDATE hub_trades SET sym = COALESCE((SELECT COALESCE(json_extract(params, '$.sym'), 'XAUUSD') FROM hub_strats WHERE id = hub_trades.sid), 'XAUUSD') WHERE sym IS NULL").run();
    await kvPut(env, "mig17", "1");
  }
}
const kvGet = async (env, k) => (await env.DB.prepare("SELECT v FROM hub_kv WHERE k = ?").bind(k).first())?.v ?? null;
const kvPut = (env, k, v) => env.DB.prepare("INSERT INTO hub_kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(k, String(v)).run();

async function store(env, tf, C) {
  const st = []; for (const k of C) st.push(env.DB.prepare("INSERT INTO hub_candles (tf, t, o, h, l, c) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(tf, t) DO UPDATE SET o=excluded.o, h=excluded.h, l=excluded.l, c=excluded.c").bind(tf, k.t, k.o, k.h, k.l, k.c));
  for (let i = 0; i < st.length; i += 90) await env.DB.batch(st.slice(i, i + 90));
}
async function load(env, tf, sinceSec) {
  const { results } = await env.DB.prepare("SELECT t, o, h, l, c FROM hub_candles WHERE tf = ? AND t >= ? ORDER BY t").bind(tf, sinceSec).all();
  return results;
}

// ---------------------------------------------------------------- Wirtschaftskalender (v1.2)
// Quelle: Forex-Factory-Wochenkalender (JSON, kostenlos). Wichtig für Gold/Silber/Bitcoin: US-Termine mit hoher Bedeutung.
const IMPORTANT = (e) => e.impact === "High" && ["USD"].includes(e.cur);
async function syncCalendar(env) {
  let n = 0;
  for (const w of ["thisweek", "nextweek"]) {
    const r = await fetch(`https://nfs.faireconomy.media/ff_calendar_${w}.json?ts=${Date.now()}`, { headers: { "User-Agent": "Mozilla/5.0 wc-hub" } });
    if (!r.ok) continue;
    const L = await r.json(); const st = [];
    for (const e of L) {
      const t = Math.floor(new Date(e.date).getTime() / 1000); if (!t) continue;
      const id = `${t}_${e.country}_${e.title}`.slice(0, 120);
      st.push(env.DB.prepare("INSERT INTO hub_events (id, t, cur, title, impact, forecast, previous) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET t=excluded.t, impact=excluded.impact, forecast=excluded.forecast, previous=excluded.previous")
        .bind(id, t, e.country, e.title, e.impact, e.forecast || "", e.previous || ""));
    }
    for (let i = 0; i < st.length; i += 80) await env.DB.batch(st.slice(i, i + 80));
    n += st.length;
  }
  return n;
}
const hmB = (t) => new Date(t * 1000).toLocaleTimeString("de-DE", { timeZone: "Europe/Bucharest", hour: "2-digit", minute: "2-digit" });
async function newsAlerts(env) {
  const now = Math.floor(Date.now() / 1000); let n = 0;
  // 1) Tagesübersicht morgens (07:00–07:05 Bukarest, Mo–Fr)
  const loc = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Bucharest" }));
  if (loc.getHours() === 7 && loc.getMinutes() < 5 && loc.getDay() >= 1 && loc.getDay() <= 5) {
    const day = loc.toISOString().slice(0, 10);
    if ((await kvGet(env, "news_day")) !== day) {
      await kvPut(env, "news_day", day);
      const { results: E2 } = await env.DB.prepare("SELECT * FROM hub_events WHERE t BETWEEN ? AND ? AND impact IN ('High','Medium') AND cur = 'USD' ORDER BY t").bind(now, now + 18 * 3600).all();
      const txt = E2.length ? E2.map((e) => `${e.impact === "High" ? "🔴" : "🟠"} ${hmB(e.t)} ${e.title}${e.forecast ? " · Prognose " + e.forecast : ""}${e.previous ? " · vorher " + e.previous : ""}`).join("\n") : "Keine wichtigen US-Termine heute.";
      await say(env, `📅 Wirtschaftstermine heute (Bukarest-Zeit)\n\n${txt}\n\n🔴 = hoch: Gold, Silber und Bitcoin reagieren oft stark. Der Hub eröffnet ±30 Min. um rote Termine keine Papier-Trades.`); n++;
    }
  }
  // 2) Vorwarnung 30 Minuten vor wichtigen Terminen
  const { results: E3 } = await env.DB.prepare("SELECT * FROM hub_events WHERE t BETWEEN ? AND ? AND impact = 'High' AND cur = 'USD' AND (note IS NULL OR note NOT LIKE '%warn%') ORDER BY t").bind(now + 20 * 60, now + 35 * 60).all();
  if (E3.length) {
    await say(env, `⏰ In ca. 30 Min. (${hmB(E3[0].t)} Uhr):\n` + E3.map((e) => `🔴 ${e.title}${e.forecast ? " · Prognose " + e.forecast : ""}${e.previous ? " · vorher " + e.previous : ""}`).join("\n") + `\n\nErfahrungsgemäß springen Gold, Silber und Bitcoin um diese Zeit stark. Erst den Kerzenschluss abwarten.`); n++;
    for (const e of E3) await env.DB.prepare("UPDATE hub_events SET note = COALESCE(note,'') || ' warn' WHERE id = ?").bind(e.id).run();
  }
  return n;
}
async function newsWindows(env, from) {   // Zeitfenster ±30 Min. um rote US-Termine
  const { results } = await env.DB.prepare("SELECT t FROM hub_events WHERE impact = 'High' AND cur = 'USD' AND t >= ?").bind(from).all();
  return results.map((x) => [x.t - 1800, x.t + 1800]);
}

// ---------------------------------------------------------------- Dollar & Devisen (v1.3)
// DXY-Näherung aus den 6 Währungspaaren des Dollar-Index (offizielle Formel), dazu Sprung-Warnungen für Dollar und Gold/Silber/Bitcoin.
const FX = ["EURUSD", "USDJPY", "GBPUSD", "USDCAD", "USDSEK", "USDCHF"];   // für den Dollar-Index
// v2.5: Devisen zum Handeln (Papier) – 7 Hauptpaare + 3 Kreuze; Kerzen vom Broker (MetaApi), eigener Lauf /fxrun
const FX_TRADE = ["EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDJPY", "USDCAD", "USDCHF", "EURJPY", "GBPJPY", "EURGBP"];
const FX_ALL = [...new Set([...FX, ...FX_TRADE])];
const IDX = ["NAS100", "SP500", "DJ30", "GER40"];   // v3.0: Indizes für IBS / Turnaround Tuesday / TBO (Tages- und Stundenkerzen über MetaApi)
async function fxRun(env) {   // sparsam mit Datenbank-Abfragen: alle Paare in einem Schub speichern, Nachladen nur 1 Paar je Lauf
  const now = new Date(), min = now.getUTCMinutes(), out = [], st = [];
  const put = (tf, C) => { for (const k of C) st.push(env.DB.prepare("INSERT INTO hub_candles (tf, t, o, h, l, c) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(tf, t) DO UPDATE SET o=excluded.o, h=excluded.h, l=excluded.l, c=excluded.c").bind(tf, k.t, k.o, k.h, k.l, k.c)); };
  for (const s of FX_ALL) { try { put(`${s}:5m`, await candles(env, s, "5m", 24)); } catch (e) { out.push(s + " " + e.message.slice(0, 50)); } }
  const state = JSON.parse((await kvGet(env, "fx_state")) || "{}");   // {bf: {EURUSD: 1, …}, d1: {…}}
  state.bf ||= {}; state.d1 ||= {};
  const nbf = FX_ALL.find((s) => !state.bf[s]);
  if (nbf) try {
    const o = await env.DB.prepare("SELECT MIN(t) a FROM hub_candles WHERE tf = ?").bind(`${nbf}:5m`).first();
    if (o?.a && o.a > Date.now() / 1000 - 45 * 86400) { const c = (await candles(env, nbf, "5m", 1000, o.a)).filter((k) => k.t < o.a); if (c.length) put(`${nbf}:5m`, c); else state.bf[nbf] = 1; } else if (o?.a) state.bf[nbf] = 1;
  } catch (e) { out.push(nbf + " Nachladen " + e.message.slice(0, 40)); }
  const nd = FX_TRADE.find((s) => !state.d1[s]);
  if (nd) { try { put(`${nd}:1d`, await candles(env, nd, "1d", 1000)); state.d1[nd] = 1; } catch (e) { out.push(nd + " 1d " + e.message.slice(0, 40)); } }
  else if (min < 5) for (const s of FX_TRADE) { try { put(`${s}:1d`, await candles(env, s, "1d", 5)); } catch (e) {} }
  state.ix ||= {};
  const ni = IDX.find((s) => !state.ix[s]);
  if (ni) { try { put(`${ni}:1d`, await candles(env, ni, "1d", 1000)); put(`${ni}:1h`, await candles(env, ni, "1h", 1000)); state.ix[ni] = 1; } catch (e) { out.push(ni + " Index " + e.message.slice(0, 50)); } }
  else if (min < 5) for (const s of IDX) { try { put(`${s}:1d`, await candles(env, s, "1d", 5)); put(`${s}:1h`, await candles(env, s, "1h", 5)); } catch (e) { out.push(s + " " + e.message.slice(0, 40)); } }
  for (let k = 0; k < st.length; k += 90) await env.DB.batch(st.slice(k, k + 90));
  await kvPut(env, "fx_state", JSON.stringify(state));
  const msg = `Devisen: ${FX_ALL.length} Paare, ${st.length} Kerzen, nachgeladen ${Object.keys(state.bf).length}/${FX_ALL.length}, Tageshistorie ${Object.keys(state.d1).length}/${FX_TRADE.length}${out.length ? " | " + out.join(" | ") : ""}`;
  await kvPut(env, "log_fx", new Date().toISOString() + " " + msg.slice(0, 600));
  return msg;
}
const DXYW = { EURUSD: -0.576, USDJPY: 0.136, GBPUSD: -0.119, USDCAD: 0.091, USDSEK: 0.042, USDCHF: 0.036 };
async function fxTick(env, log) {
  if (!(env.SELF && env.HUB_KEY)) for (const s2 of FX) {   // v2.5: sonst holt /fxrun die Kerzen
    try { const c = await candles(env, s2, "5m", 60); await store(env, `${s2}:5m`, c); } catch (e) { log.push(s2 + " Fehler " + e.message.slice(0, 60)); }
  }
  // DXY für die letzten ~2 Stunden berechnen
  const since = Math.floor(Date.now() / 1000) - 3 * 3600; const M = {};
  for (const s2 of FX) for (const k of await load(env, `${s2}:5m`, since)) (M[k.t] ||= {})[s2] = k.c;
  const dxy = Object.entries(M).filter(([, v]) => FX.every((x) => v[x])).map(([t, v]) => [Number(t), 50.14348112 * FX.reduce((p, x) => p * Math.pow(v[x], DXYW[x]), 1)]).sort((a, b) => a[0] - b[0]);
  if (dxy.length) await kvPut(env, "dxy", JSON.stringify(dxy.slice(-36)));
  // Sprung-Warnungen: Dollar-Index ≥ 0,30 % in 30 Min.; Gold ≥ 0,8 %, Silber ≥ 1,5 %, Bitcoin ≥ 2,5 % in 15 Min.
  const alerts = [];
  if (dxy.length > 6) { const a = dxy[dxy.length - 7][1], b = dxy[dxy.length - 1][1], ch = (b / a - 1) * 100; if (Math.abs(ch) >= 0.3) alerts.push(["DXY", `💵 Dollar-Index ${ch > 0 ? "steigt" : "fällt"} kräftig: ${ch > 0 ? "+" : ""}${ch.toFixed(2)} % in 30 Min. (≈ ${b.toFixed(2)}). Ein stärkerer Dollar drückt meist auf Gold und Silber.`]); }
  for (const [sym, thr] of [["XAUUSD", 0.8], ["XAGUSD", 1.5], ["BTCUSD", 2.5]]) {
    const C = await load(env, TK(sym, "5m"), Math.floor(Date.now() / 1000) - 3600);
    if (C.length > 3) { const a = C[C.length - 4].c, b = C[C.length - 1].c, ch = (b / a - 1) * 100; if (Math.abs(ch) >= thr) alerts.push([sym, `⚡ ${NAME(sym)} ${ch > 0 ? "springt" : "fällt"} ${ch > 0 ? "+" : ""}${ch.toFixed(2)} % in 15 Min. (${b.toFixed(DIG(sym))}).`]); }
  }
  for (const [k, txt] of alerts) {
    const key = "spike_" + k + "_" + new Date().toISOString().slice(0, 13);   // höchstens 1 Warnung je Markt und Stunde
    if (!(await kvGet(env, key))) { await kvPut(env, key, 1); await say(env, txt + "\n(Hinweis, keine Anlageberatung)"); }
  }
}

// ---------------------------------------------------------------- Weltnachrichten / Geopolitik (v1.3)
// RSS mehrerer Nachrichtenquellen, Vorfilter über Stichworte, Bewertung durch Workers AI (Bedeutung für Gold/Silber/Bitcoin 0–3).
const FEEDS = [
  ["BBC", "https://feeds.bbci.co.uk/news/world/rss.xml"],
  ["BBC Business", "https://feeds.bbci.co.uk/news/business/rss.xml"],
  ["Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml"],
  ["CNBC", "https://www.cnbc.com/id/100727362/device/rss/rss.html"],
  ["CNBC Economy", "https://www.cnbc.com/id/20910258/device/rss/rss.html"],
  ["FXStreet", "https://www.fxstreet.com/rss/news"],
  ["Investing", "https://www.investing.com/rss/news_11.rss"],
];
const KW = /\b(war|attack|missile|strike|invasion|troops|sanction|tariff|trade war|fed|fomc|powell|rate (cut|hike)|interest rate|inflation|cpi|jobs report|payrolls|recession|default|debt ceiling|shutdown|treasury|yield|dollar|gold|silver|bitcoin|crypto|etf|central bank|ecb|boj|pboc|china|taiwan|iran|israel|gaza|russia|ukraine|nato|nuclear|ceasefire|opec|oil|bank (run|collapse|failure)|crisis|emergency|coup|election|trump|putin|xi jinping)\b/i;
const unesc = (x) => String(x || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/<[^>]+>/g, "").trim();
async function newsTick(env, log) {
  let found = 0, sent = 0, ai = 0; const now = Math.floor(Date.now() / 1000);
  for (const [src, url] of FEEDS) {
    let xml; try { const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (wc-hub news)" } }); if (!r.ok) continue; xml = await r.text(); } catch { continue; }
    const items = xml.split(/<item[ >]/).slice(1, 25);
    for (const it of items) {
      const title = unesc((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1]); const link = unesc((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1]);
      const pd = Date.parse(unesc((it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1])); const t = isNaN(pd) ? now : Math.floor(pd / 1000);
      if (!title || now - t > 3 * 3600 || !KW.test(title)) continue;
      const id = (src + ":" + title).slice(0, 180);
      if (await env.DB.prepare("SELECT 1 FROM hub_news WHERE id = ?").bind(id).first()) continue;
      found++;
      let score = 1, dir = "", summary = "";
      if (env.AI && ai++ < 12) {   // höchstens 12 KI-Bewertungen pro Lauf
        try {
          const out = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", { max_tokens: 160, messages: [
            { role: "system", content: "You rate breaking news for a gold, silver and bitcoin trader. Reply ONLY with JSON: {\"score\":0-3,\"gold\":\"up|down|unclear\",\"de\":\"one short German sentence why it matters\"}. score 3 = likely to move gold/USD/BTC strongly within hours (war escalation, surprise central bank action, major sanctions/tariffs, bank crisis); 2 = relevant macro/geopolitical news; 1 = minor; 0 = irrelevant." },
            { role: "user", content: `${src}: ${title}` }] });
          const j = JSON.parse(String(out.response || "").match(/\{[\s\S]*\}/)[0]); score = Math.max(0, Math.min(3, Number(j.score) || 0)); dir = j.gold || ""; summary = String(j.de || "").slice(0, 220);
        } catch (e) { score = 1; }
      }
      await env.DB.prepare("INSERT INTO hub_news (id, t, src, title, url, score, dir, summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, t, src, title.slice(0, 300), link.slice(0, 400), score, dir, summary).run();
      if (score >= 3 || (score >= 2 && /fed|powell|fomc|tariff|sanction|war|missile|attack|nuclear|invasion|default|bank/i.test(title))) {
        const hr = "news_hour_" + new Date().toISOString().slice(0, 13);
        const cnt = Number((await kvGet(env, hr)) || 0); if (cnt >= 4) continue;   // max. 4 Eilmeldungen pro Stunde
        await kvPut(env, hr, cnt + 1);
        await say(env, `🌍 Eilmeldung (${src}): ${title}${summary ? "\n→ " + summary : ""}${dir && dir !== "unclear" ? `\nGold-Tendenz laut KI-Einschätzung: ${dir === "up" ? "eher steigend" : "eher fallend"} (unsicher)` : ""}\n${link}\n(Automatische Einschätzung, keine Anlageberatung)`);
        await env.DB.prepare("UPDATE hub_news SET sent = 1 WHERE id = ?").bind(id).run(); sent++;
      }
    }
  }
  log.push(`News neu:${found} gemeldet:${sent}`);
}

// ---------------------------------------------------------------- Futures-Positionierung Krypto & Gold/Silber-Perps (Coinalyze, v1.4)
// Stündlich: Open Interest, Funding, Liquidationen, Long/Short-Verhältnis je Markt. Schlüssel: Secret COINALYZE_KEY.
const CZ_BASES = ["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "XAU", "XAG", "PAXG"];
async function cz(env, path, q) {
  const r = await fetch(`https://api.coinalyze.net/v1/${path}?${new URLSearchParams(q)}`, { headers: { api_key: env.COINALYZE_KEY } });
  if (!r.ok) throw new Error(`Coinalyze ${path} ${r.status}: ${(await r.text()).slice(0, 120)}`);
  return r.json();
}
async function czMarkets(env) {
  const c = await kvGet(env, "cz_markets"); if (c) return JSON.parse(c);
  const L = await cz(env, "future-markets", {}); const pick = {};
  for (const b of CZ_BASES) {
    const m = L.filter((x) => String(x.base_asset).toUpperCase() === b && x.is_perpetual);
    const best = m.find((x) => /USDT_PERP\.A$/.test(x.symbol)) || m.find((x) => /USDT?_PERP/.test(x.symbol)) || m[0];
    if (best) pick[b] = best.symbol;
  }
  await kvPut(env, "cz_markets", JSON.stringify(pick));
  return pick;
}
async function derivTick(env, log) {
  if (!env.COINALYZE_KEY) return;
  const M = await czMarkets(env); const syms = Object.values(M).join(",");
  if (!syms) return;
  const now = Math.floor(Date.now() / 1000);
  const first = !(await kvGet(env, "cz_backfill"));
  const q = { symbols: syms, interval: "1hour", from: now - (first ? 60 : 1) * 86400, to: now };
  const rows = {};
  const add = (sym, t, k, v) => { ((rows[sym] ||= {})[t] ||= {})[k] = v; };
  for (const x of await cz(env, "open-interest-history", { ...q, convert_to_usd: "true" })) for (const h of x.history || []) add(x.symbol, h.t, "oi", h.c);
  for (const x of await cz(env, "funding-rate-history", q)) for (const h of x.history || []) add(x.symbol, h.t, "fr", h.c);
  for (const x of await cz(env, "liquidation-history", { ...q, convert_to_usd: "true" })) for (const h of x.history || []) { add(x.symbol, h.t, "liq_l", h.l); add(x.symbol, h.t, "liq_s", h.s); }
  try { for (const x of await cz(env, "long-short-ratio-history", q)) for (const h of x.history || []) add(x.symbol, h.t, "ls", h.r); } catch (e) { log.push("LS " + e.message.slice(0, 40)); }
  const base = Object.fromEntries(Object.entries(M).map(([b, s]) => [s, b]));
  const st = [];
  for (const [sym, T] of Object.entries(rows)) for (const [t, v] of Object.entries(T))
    st.push(env.DB.prepare("INSERT INTO hub_deriv (sym, t, oi, fr, liq_l, liq_s, ls) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(sym, t) DO UPDATE SET oi=COALESCE(excluded.oi, oi), fr=COALESCE(excluded.fr, fr), liq_l=COALESCE(excluded.liq_l, liq_l), liq_s=COALESCE(excluded.liq_s, liq_s), ls=COALESCE(excluded.ls, ls)")
      .bind(base[sym] || sym, Number(t), v.oi ?? null, v.fr ?? null, v.liq_l ?? null, v.liq_s ?? null, v.ls ?? null));
  for (let i = 0; i < st.length; i += 90) await env.DB.batch(st.slice(i, i + 90));
  if (first) await kvPut(env, "cz_backfill", "1");
  log.push(`Coinalyze:${st.length}`);
}

// ---------------------------------------------------------------- Krypto-Kerzen über Coinalyze (v1.6): ETH, SOL, XRP, BNB, DOGE als ETHUSD … (Perp-Kurse, ohne MetaApi)
const CZ_CANDLES = ["ETH", "SOL", "XRP", "BNB", "DOGE"];
async function czCandles(env, log) {
  if (!env.COINALYZE_KEY) return;
  const M = await czMarkets(env); const bases = CZ_CANDLES.filter((b) => M[b]); if (!bases.length) return;
  const now = Math.floor(Date.now() / 1000);
  const last = await env.DB.prepare("SELECT MIN(m) a FROM (SELECT MAX(t) m FROM hub_candles WHERE tf IN (" + bases.map(() => "?").join(",") + ") GROUP BY tf)").bind(...bases.map((b) => b + "USD:5m")).first();
  const have = (await env.DB.prepare("SELECT COUNT(DISTINCT tf) n FROM hub_candles WHERE tf LIKE '%USD:5m' AND tf IN (" + bases.map(() => "?").join(",") + ")").bind(...bases.map((b) => b + "USD:5m")).first()).n;
  const from = have < bases.length || !last?.a ? now - 7 * 86400 : last.a - 600;   // erster Lauf: so weit zurück, wie Coinalyze 5-Min-Kerzen hergibt
  const back = Object.fromEntries(bases.map((b) => [M[b], b]));
  const L = await cz(env, "ohlcv-history", { symbols: bases.map((b) => M[b]).join(","), interval: "5min", from, to: now });
  let n = 0;
  for (const x of L) { const C = (x.history || []).filter((h) => h.t < now - 300).map((h) => ({ t: h.t, o: h.o, h: h.h, l: h.l, c: h.c })); if (C.length) { await store(env, back[x.symbol] + "USD:5m", C); n += C.length; } }
  log.push(`Krypto-5m:${n}`);
}

// Tageshistorie seit 2021 je Markt (Kurs, Open Interest, Funding, Liquidationen, Long/Short) – beim ersten Start ein Markt pro 5-Min-Lauf (≈45 Min.), danach täglich die letzten 10 Tage
async function czDaily(env, log) {
  if (!env.COINALYZE_KEY) return;
  const M = await czMarkets(env); const bases = CZ_BASES.filter((b) => M[b]);
  const nx = await kvGet(env, "czd_next"); const idx = nx === "done" ? 99 : +(nx || 0); const now = Math.floor(Date.now() / 1000);
  let todo, from;
  if (idx < bases.length) { todo = [bases[idx]]; from = Math.floor(Date.UTC(2021, 0, 1) / 1000); }
  else { if ((await kvGet(env, "czd_check")) === new Date().toISOString().slice(0, 10)) return; todo = bases; from = now - 10 * 86400; }
  const q = { symbols: todo.map((b) => M[b]).join(","), interval: "daily", from, to: now };
  const rows = {}; const add = (sym, t, k, v) => { ((rows[sym] ||= {})[t] ||= {})[k] = v; };
  for (const x of await cz(env, "ohlcv-history", q)) for (const h of x.history || []) { add(x.symbol, h.t, "o", h.o); add(x.symbol, h.t, "h", h.h); add(x.symbol, h.t, "l", h.l); add(x.symbol, h.t, "c", h.c); }
  for (const x of await cz(env, "open-interest-history", { ...q, convert_to_usd: "true" })) for (const h of x.history || []) add(x.symbol, h.t, "oi", h.c);
  for (const x of await cz(env, "funding-rate-history", q)) for (const h of x.history || []) add(x.symbol, h.t, "fr", h.c);
  for (const x of await cz(env, "liquidation-history", { ...q, convert_to_usd: "true" })) for (const h of x.history || []) { add(x.symbol, h.t, "liq_l", h.l); add(x.symbol, h.t, "liq_s", h.s); }
  try { for (const x of await cz(env, "long-short-ratio-history", q)) for (const h of x.history || []) add(x.symbol, h.t, "ls", h.r); } catch (e) { log.push("LS-d " + e.message.slice(0, 40)); }
  const base = Object.fromEntries(Object.entries(M).map(([b, s]) => [s, b]));
  const st = [];
  for (const [sym, T] of Object.entries(rows)) for (const [t, v] of Object.entries(T)) {
    const b = base[sym] || sym, d = new Date(+t * 1000).toISOString().slice(0, 10);
    st.push(env.DB.prepare("INSERT OR REPLACE INTO hub_deriv_d (sym, d, o, h, l, c, oi, fr, liq_l, liq_s, ls) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(b, d, v.o ?? null, v.h ?? null, v.l ?? null, v.c ?? null, v.oi ?? null, v.fr ?? null, v.liq_l ?? null, v.liq_s ?? null, v.ls ?? null));
    if (CZ_CANDLES.includes(b) && v.c != null && +t < now - 86400) st.push(env.DB.prepare("INSERT OR REPLACE INTO hub_candles (tf, t, o, h, l, c) VALUES (?, ?, ?, ?, ?, ?)").bind(b + "USD:1d", +t, v.o, v.h, v.l, v.c));
  }
  for (let i = 0; i < st.length; i += 90) await env.DB.batch(st.slice(i, i + 90));
  if (idx < bases.length) await kvPut(env, "czd_next", idx + 1 >= bases.length ? "done" : String(idx + 1)); else await kvPut(env, "czd_check", new Date().toISOString().slice(0, 10));
  log.push(`Coinalyze-Tag ${todo.join("/")}:${st.length}`);
}

// ---------------------------------------------------------------- COMEX-Positionierung (CFTC Commitments of Traders, v1.4)
// Disaggregated Futures Only: Managed Money (Fonds), Producer/Merchant, Swap Dealer. Gold 088691, Silber 084691. Wöchentlich, Historie seit 2006.
async function cotTick(env, log) {
  const last = await kvGet(env, "cot_check"); const today = new Date().toISOString().slice(0, 10);
  if (last === today) return; await kvPut(env, "cot_check", today);
  const first = !(await env.DB.prepare("SELECT 1 FROM hub_cot LIMIT 1").first());
  let n = 0;
  for (const [sym, code] of [["XAUUSD", "088691"], ["XAGUSD", "084691"]]) {
    const url = `https://publicreporting.cftc.gov/resource/72hh-3qpy.json?cftc_contract_market_code=${code}&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=${first ? 1000 : 8}`;
    const r = await fetch(url, { headers: { "User-Agent": "wc-hub" } }); if (!r.ok) { log.push("COT " + r.status); continue; }
    const L = await r.json(); const st = [];
    for (const x of L) st.push(env.DB.prepare("INSERT OR REPLACE INTO hub_cot (sym, d, mm_l, mm_s, pm_l, pm_s, sd_l, sd_s, oi) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(sym, String(x.report_date_as_yyyy_mm_dd).slice(0, 10), +x.m_money_positions_long_all || 0, +x.m_money_positions_short_all || 0, +x.prod_merc_positions_long || +x.prod_merc_positions_long_all || 0, +x.prod_merc_positions_short || +x.prod_merc_positions_short_all || 0, +x.swap_positions_long_all || 0, +x.swap__positions_short_all || +x.swap_positions_short_all || 0, +x.open_interest_all || 0));
    for (let i = 0; i < st.length; i += 90) await env.DB.batch(st.slice(i, i + 90));
    n += st.length;
  }
  // GLD-Bestand (Tonnen) – Archiv des Anbieters
  try {
    const r = await fetch("https://www.spdrgoldshares.com/assets/dynamic/GLD/GLD_US_archive_EN.csv", { headers: { "User-Agent": "Mozilla/5.0" } });
    if (r.ok) {
      const all = (await r.text()).split(/\r?\n/);
      const hi = all.findIndex((l) => /date/i.test(l) && /tonnes/i.test(l));
      const col = hi >= 0 ? all[hi].split(",").findIndex((c) => /tonnes/i.test(c)) : -1;
      const lines = all.slice(hi + 1).filter((l) => /^\s*\d{1,2}-[A-Za-z]{3}-\d{4}/.test(l));
      const st = [];
      if (col > 0) for (const l of (first ? lines : lines.slice(-10))) {
        const c = l.split(","); const d = new Date(c[0].trim() + " UTC"); const tonnes = parseFloat(String(c[col]).replace(/[^0-9.]/g, ""));
        if (!isNaN(d) && !isNaN(tonnes)) st.push(env.DB.prepare("INSERT OR REPLACE INTO hub_etf (sym, d, tonnes) VALUES ('GLD', ?, ?)").bind(d.toISOString().slice(0, 10), tonnes));
      }
      for (let i = 0; i < st.length; i += 90) await env.DB.batch(st.slice(i, i + 90));
      n += st.length;
    } else log.push("GLD " + r.status);
  } catch (e) { log.push("GLD-Fehler " + e.message.slice(0, 60)); }
  log.push(`COT/ETF:${n}`);
}

// ---------------------------------------------------------------- Zinsen & Dollar (FRED, ohne Schlüssel, v1.5)
// DFII10 = US-Realzins 10J (TIPS) · DGS10 = 10J-Rendite · DTWEXBGS = breiter Dollar-Index · T10YIE = Inflationserwartung 10J
async function macroTick(env, log) {
  const today = new Date().toISOString().slice(0, 10);
  if ((await kvGet(env, "macro_check")) === today) return; await kvPut(env, "macro_check", today);
  const st = []; const put = (series, d, v) => { if (!isNaN(v)) st.push(env.DB.prepare("INSERT OR REPLACE INTO hub_macro (series, d, v) VALUES (?, ?, ?)").bind(series, d, v)); };
  // 1) FRED (blockt Cloudflare oft mit 520) – 2) Fallback: US-Finanzministerium (Quelle der FRED-Reihen DFII10/DGS10)
  try {
    const from = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10);
    const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFII10,DGS10,DTWEXBGS,T10YIE&cosd=${from}`, { headers: { "User-Agent": "Mozilla/5.0 wc-hub" } });
    if (r.ok) { const L = (await r.text()).trim().split(/\r?\n/); const head = L[0].split(","); for (const l of L.slice(1)) { const c = l.split(","); for (let k = 1; k < c.length; k++) put(head[k], c[0], parseFloat(c[k])); } }
    else log.push("FRED " + r.status);
  } catch (e) { log.push("FRED-Fehler " + e.message.slice(0, 60)); }
  if (!st.length) {
    const y = new Date().getUTCFullYear();
    for (const [type, series, col] of [["daily_treasury_real_yield_curve", "DFII10", "10 YR"], ["daily_treasury_yield_curve", "DGS10", "10 Yr"]]) for (const yr of [y - 1, y]) {
      const r = await fetch(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${yr}/all?type=${type}&field_tdr_date_value=${yr}&page&_format=csv`, { headers: { "User-Agent": "Mozilla/5.0 wc-hub" } });
      if (!r.ok) { log.push(`Treasury ${series} ${yr}: ${r.status}`); continue; }
      const L = (await r.text()).trim().split(/\r?\n/); const head = L[0].split(",").map((x) => x.replace(/"/g, "").trim()); const k = head.findIndex((x) => x.toUpperCase() === col.toUpperCase());
      if (k < 0) continue;
      for (const l of L.slice(1)) { const c = l.split(","); const m = c[0].match(/(\d{2})\/(\d{2})\/(\d{4})/); if (m) put(series, `${m[3]}-${m[1]}-${m[2]}`, parseFloat(c[k])); }
    }
    if (st.length) log.push("Treasury");
  }
  if (!st.length) { await kvPut(env, "macro_check", ""); return; }
  for (let i = 0; i < st.length; i += 90) await env.DB.batch(st.slice(i, i + 90));
  log.push(`Zinsen:${st.length}`);
}

// ---------------------------------------------------------------- Postausgang (Welcome-Bot schickt an Kevin)
const say = (env, text) => env.DB.prepare("INSERT INTO outbox (kind, text) VALUES ('admin', ?)").bind(text).run();

// ---------------------------------------------------------------- Register aus GitHub
async function syncRegistry(env) {
  const r = await fetch(`https://raw.githubusercontent.com/${REPO(env)}/main/hub/registry.json?ts=${Date.now()}`, { headers: { "User-Agent": "wc-hub" } });
  if (!r.ok) return 0;
  const reg = await r.json(); const st = [];
  for (const s of reg.strategies || []) st.push(env.DB.prepare("INSERT INTO hub_strats (id, name, family, params, status, backtest, live, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, params=excluded.params, status=excluded.status, backtest=excluded.backtest, live=excluded.live")
    .bind(s.id, s.name, s.family, JSON.stringify(s.params), s.status, JSON.stringify(s.backtest || {}), JSON.stringify(s.live || {}), s.created || ""));
  for (let i = 0; i < st.length; i += 50) await env.DB.batch(st.slice(i, i + 50));
  await kvPut(env, "reg_updated", reg.updated || "");
  return st.length;
}

// ---------------------------------------------------------------- Risiko-Steuerung über alle Strategien (v1.7)
// Jede Strategie wird weiter einzeln vorwärts getestet (für ihre Freigabe). Das PORTFOLIO (pf = 1) nimmt einen neuen Trade aber nur, wenn
//  · höchstens RISK.maxOpen Trades gleichzeitig offen sind,
//  · je Gruppe (Metalle = Gold+Silber, Krypto = alle Coins) höchstens RISK.maxGroup offen sind (die laufen oft gleich → doppeltes Risiko),
//  · der Tag (Bukarest) nicht schon RISK.dayStop R im Minus ist (Tages-Stopp).
// Positionsgröße: jeder Trade riskiert genau 1R (Stop-Abstand nach Volatilität) – das gleicht unterschiedliche Märkte automatisch aus.
const RISK = { maxOpen: 8, maxGroup: 3, dayStop: -3 };   // v2.0: Kevin – mehr gleichzeitige Trades
const GROUP = (sym) => (["XAUUSD", "XAGUSD"].includes(sym) ? "Metalle" : sym === "BTCUSD" || E.SYMS[sym]?._costp ? "Krypto" : /^(EUR|GBP|AUD|NZD|USD|CAD|CHF|JPY){2}$/.test(sym || "") ? "Devisen" : sym);
const dayStartBuc = (now) => { const d = new Date(now * 1000); const loc = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Bucharest" })); return now - (loc.getHours() * 3600 + loc.getMinutes() * 60 + loc.getSeconds()); };
async function riskState(env, now) {
  const open = (await env.DB.prepare("SELECT sym FROM hub_trades WHERE closed = 0 AND pf = 1").all()).results.map((x) => x.sym);
  const day = (await env.DB.prepare("SELECT COALESCE(SUM(r), 0) s FROM hub_trades WHERE pf = 1 AND closed = 1 AND tx >= ?").bind(dayStartBuc(now)).first()).s;
  return { open, day };
}
function riskCheck(st, sym) {
  if (st.day <= RISK.dayStop) return `Tages-Stopp erreicht (${st.day.toFixed(1)}R heute)`;
  if (st.open.length >= RISK.maxOpen) return `schon ${st.open.length} Trades offen (max. ${RISK.maxOpen})`;
  const g = GROUP(sym); const ng = st.open.filter((s) => GROUP(s) === g).length;
  if (ng >= RISK.maxGroup) return `schon ${ng} offene Trades in der Gruppe ${g} (max. ${RISK.maxGroup})`;
  return "";
}

// ---------------------------------------------------------------- Papierhandel
const fmtT = (t) => new Date(t * 1000).toLocaleString("de-DE", { timeZone: "Europe/Bucharest", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
async function paper(env) {
  const { results: strats } = await env.DB.prepare("SELECT * FROM hub_strats WHERE status IN ('paper', 'approved')").all();
  if (!strats.length) return 0;
  const now = Math.floor(Date.now() / 1000);
  const recent = now - 4 * 86400; let n = 0; const DATA = {};
  const NW = await newsWindows(env, now - 5 * 86400).catch(() => []);
  const inNews = (t) => NW.some(([a, b]) => t >= a && t <= b);
  const RS = await riskState(env, now);
  for (const s of strats) {
    const p = E.withSym(JSON.parse(s.params)); const sym = p.sym || "XAUUSD";
    if (s.family === "fxs" && !DATA.FX) {   // v2.5: Währungsstärke – Tageskerzen aller 7 Hauptpaare
      const D = {}; for (const leg of E.FX_LEGS) D[leg] = await load(env, `${leg}:1d`, 0);
      DATA.FX = { FXCUR: E.fxCur(D) };
    }
    if (!DATA[sym]) {
      const C5 = await load(env, TK(sym, "5m"), now - 30 * 86400);
      DATA[sym] = C5.length >= 500 ? { DAYS: E.days(C5), F5: E.feats(C5), F15: E.feats(E.resample(C5, 900)), C5 } : {};
      DATA[sym].px = C5.length ? C5.slice(-8640).map((k) => k.c).sort((a, b) => a - b)[Math.floor(Math.min(C5.length, 8640) / 2)] : null;
      if (strats.some((x) => ["swing", "ibs", "tt"].includes(x.family))) DATA[sym].D1 = await load(env, TK(sym, "1d"), 0);
      if (strats.some((x) => x.family === "tbo")) DATA[sym].H1 = C5.length >= 2400 ? E.resample(C5, 3600) : await load(env, TK(sym, "1h"), now - 60 * 86400);   // v3.0 TBO
    }
    const data = DATA[sym];
    if (s.family === "deriv") {   // Derivate-Familie (v1.6): Coinalyze-Tageshistorie, Kurs der Perps
      if (!data.DD) data.DD = (await env.DB.prepare("SELECT d, o, h, l, c, oi, fr, liq_l, liq_s FROM hub_deriv_d WHERE sym = ? AND c IS NOT NULL ORDER BY d").bind(sym.replace(/USD$/, "")).all()).results
        .map((x) => ({ ...x, t: Math.floor(Date.parse(x.d + "T00:00:00Z") / 1000) }));
      p._costp = ["XAUUSD", "XAGUSD"].includes(sym) ? 0.0006 : (E.SYMS[sym]?._costp ?? 0.0012);
    }
    if (s.family !== "deriv" && E.SYMS[sym]?._costp) Object.assign(p, E.withSym(JSON.parse(s.params), data.px || (data.D1 && data.D1.length ? data.D1[data.D1.length - 1].c : 0)));
    if (!["swing", "deriv", "fxs", "ibs", "tt", "tbo"].includes(s.family) && !data.DAYS) continue;
    const daily = ["swing", "deriv", "fxs", "ibs", "tt"].includes(s.family);
    if (s.family === "swing" && p.filt && p.filt !== "none" && data.D1) {   // COT/Realzins-Filter (v1.5)
      const cot = (await env.DB.prepare("SELECT d, mm_l, mm_s, oi FROM hub_cot WHERE sym = ? ORDER BY d").bind(sym).all()).results;
      const ry = (await env.DB.prepare("SELECT d, v FROM hub_macro WHERE series = 'DFII10' ORDER BY d").all()).results;
      p._filt = E.swingFilter(data.D1, p.filt, cot, ry);
    }
    if (s.family === "vipz") { DATA.VZ ||= await vzTradesAll(env); data.VZ = DATA.VZ; }   // v3.1
    let tr; try { tr = E.trades(s.family, p, data); } catch (e) { console.log("Engine", s.id, e.message); continue; }
    const born = Math.floor(new Date((s.created || "2000-01-01") + "T00:00:00Z").getTime() / 1000) + 86400;   // nur Trades NACH der Aufnahme zählen (echter Vorwärtstest)
    for (const x of tr.filter((x) => (x.t >= recent || x.open) && x.t >= born && !inNews(x.t))) {
      const tsym = x.pair || sym;   // Währungsstärke: das gehandelte Kreuzpaar
      const old = await env.DB.prepare("SELECT closed, notified, pf FROM hub_trades WHERE sid = ? AND t = ?").bind(s.id, x.t).first();
      const block = old ? "" : riskCheck(RS, tsym); const pf = old ? (old.pf ?? 1) : block ? 0 : 1;
      if (!old && pf && x.open) RS.open.push(tsym);
      if (!old && pf && !x.open) RS.day += x.r;
      await env.DB.prepare("INSERT INTO hub_trades (sid, t, dr, e, sl, tp, r, why, tx, closed, pf, sym) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(sid, t) DO UPDATE SET r=excluded.r, why=excluded.why, tx=excluded.tx, closed=excluded.closed, sl=excluded.sl, sym=excluded.sym")
        .bind(s.id, x.t, x.dr, x.e, x.sl, x.tp ?? null, x.r, x.why, x.tx, x.open ? 0 : 1, pf, tsym).run();
      const dir = x.dr > 0 ? "LONG" : "SHORT";
      if (!old && now - x.t < (daily ? 26 : 3) * 3600) {   // neu eröffnet (nur frische melden)
        const d = DIG(tsym);
        await say(env, `🧪 Hub-Papiertrade eröffnet – ${NAME(tsym)}\n${s.name}\n${dir} ${tsym} @ ${x.e.toFixed(d)} · SL ${x.sl.toFixed(d)}${x.tp ? " · Ziel " + x.tp.toFixed(d) : ""}\n${fmtT(x.t)} Uhr · Status: ${s.status === "approved" ? "freigabereif" : "Papier"}${block ? "\n🛡 Risikomanager: fürs Portfolio übersprungen – " + block + " (Strategie wird trotzdem weiter getestet)" : ""}\n(Lern-/Testzwecke, keine Anlageberatung)`); n++;
      }
      if (!x.open && (!old || !old.closed) && now - x.tx < (daily ? 26 : 3) * 3600) {
        await say(env, `${x.r > 0.05 ? "✅" : x.r < -0.05 ? "❌" : "➖"} Hub-Papiertrade beendet: ${x.r >= 0 ? "+" : ""}${x.r.toFixed(2)}R (${x.why})\n${s.name}\n${dir} ${tsym} @ ${x.e.toFixed(DIG(tsym))} → ${fmtT(x.tx)} Uhr`); n++;
      }
    }
  }
  return n;
}

// ---------------------------------------------------------------- GitHub-Export (für die Forschung)
async function ghPut(env, path, content, msg) {
  const api = `https://api.github.com/repos/${REPO(env)}/contents/${path}`;
  const h = { Authorization: `Bearer ${env.GH_TOKEN}`, "User-Agent": "wc-hub", Accept: "application/vnd.github+json" };
  const cur = await fetch(api, { headers: h }); const sha = cur.ok ? (await cur.json()).sha : undefined;
  const b64 = btoa(unescape(encodeURIComponent(content)));
  const r = await fetch(api, { method: "PUT", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ message: msg, content: b64, sha }) });
  if (!r.ok) throw new Error(`GitHub ${path} ${r.status}: ${(await r.text()).slice(0, 160)}`);
}
async function exportDaily(env) {
  if (!env.GH_TOKEN) return;
  const now = new Date(); const ym = now.toISOString().slice(0, 7);
  const since = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000) - 3 * 86400;
  const C5 = await load(env, "5m", since);
  await ghPut(env, `hub/data/live/m5_${ym}.csv`, "t,o,h,l,c\n" + C5.map((k) => [k.t, k.o, k.h, k.l, k.c].join(",")).join("\n") + "\n", `Hub: 5m-Kerzen ${ym}`);
  const D1 = await load(env, "1d", 0);
  if (D1.length) await ghPut(env, "hub/data/xauusd_d1.csv", "t,o,h,l,c\n" + D1.map((k) => [k.t, k.o, k.h, k.l, k.c].join(",")).join("\n") + "\n", "Hub: Tageskerzen");
  const { results: T } = await env.DB.prepare("SELECT sid, t, dr, e, sl, r, why, tx, closed FROM hub_trades ORDER BY t").all();
  await ghPut(env, "hub/live/trades.json", JSON.stringify(T), "Hub: Papier-Trades");
}

// ---------------------------------------------------------------- Bericht der Nacht an Kevin
async function reportPush(env) {
  const r = await fetch(`https://raw.githubusercontent.com/${REPO(env)}/main/hub/reports/latest.md?ts=${Date.now()}`, { headers: { "User-Agent": "wc-hub" } });
  if (!r.ok) return;
  const txt = await r.text(); const first = txt.split("\n")[0];
  if ((await kvGet(env, "last_report")) === first) return;
  await kvPut(env, "last_report", first);
  const clean = txt.replace(/\*\*/g, "").replace(/^#+\s*/gm, "").replace(/_/g, "").slice(0, 3500);
  await say(env, "🧠 " + clean);
}

// ---------------------------------------------------------------- Wochenbericht (v1.7): sonntags 18 Uhr Bukarest – Papier gegen Backtest je Strategie, mit Ampel
async function weeklyReport(env, force) {
  const now = Math.floor(Date.now() / 1000); const wk = new Date().toISOString().slice(0, 10);
  if (!force && (await kvGet(env, "weekly_" + wk))) return; await kvPut(env, "weekly_" + wk, "1");
  const strats = (await env.DB.prepare("SELECT id, name, status, backtest, created FROM hub_strats WHERE status IN ('paper', 'approved')").all()).results;
  const T = (await env.DB.prepare("SELECT sid, t, r, closed, pf FROM hub_trades WHERE closed = 1").all()).results;
  const f = (v) => (v >= 0 ? "+" : "") + v.toFixed(2);
  const L = ["📊 Hub-Wochenbericht (Papierhandel)", ""];
  for (const s of strats) {
    const born = Math.floor(Date.parse((s.created || "2000-01-01") + "T00:00:00Z") / 1000) + 86400;
    const all = T.filter((x) => x.sid === s.id && x.t >= born), wk7 = all.filter((x) => x.t >= now - 7 * 86400);
    const bt = JSON.parse(s.backtest || "{}").mean ?? null; const m = all.length ? all.reduce((a, x) => a + x.r, 0) / all.length : null;
    const amp = all.length < 5 ? "⚪" : bt != null && m >= 0.5 * bt ? "🟢" : m > 0 ? "🟡" : "🔴";
    L.push(`${amp} ${s.name}`, `   Woche: ${wk7.length} Trades, ${f(wk7.reduce((a, x) => a + x.r, 0))}R · gesamt: ${all.length} Trades${m != null ? ", Ø " + f(m) + "R" : ""} · Backtest Ø ${bt != null ? f(bt) + "R" : "–"}`);
  }
  if (!strats.length) L.push("Keine aktiven Strategien.");
  const W = T.filter((x) => x.t >= now - 7 * 86400); const P = W.filter((x) => x.pf !== 0);
  L.push("", `Portfolio (mit Risikomanager): ${P.length} Trades, ${f(P.reduce((a, x) => a + x.r, 0))}R · übersprungen: ${W.length - P.length}`,
    "⚪ zu wenig Trades · 🟢 hält, was der Backtest verspricht · 🟡 positiv, aber schwächer · 🔴 verliert", "Lern-/Testzwecke, keine Anlageberatung.");
  await say(env, L.join("\n").slice(0, 3800));
  return L.join("\n");
}

// ---------------------------------------------------------------- Dashboard
async function dashboard(env) {
  const { results: S } = await env.DB.prepare("SELECT * FROM hub_strats ORDER BY CASE status WHEN 'approved' THEN 0 WHEN 'paper' THEN 1 ELSE 2 END, created DESC").all();
  const { results: T } = await env.DB.prepare("SELECT * FROM hub_trades ORDER BY t DESC LIMIT 60").all();
  const { results: agg } = await env.DB.prepare("SELECT sid, COUNT(*) n, SUM(r) s, AVG(r) m, AVG(CASE WHEN r > 0 THEN 1.0 ELSE 0 END) w FROM hub_trades WHERE closed = 1 GROUP BY sid").all();
  const last = await env.DB.prepare("SELECT MAX(t) t FROM hub_candles WHERE tf = '5m'").first();
  const syms = (await env.DB.prepare("SELECT tf, COUNT(*) n FROM hub_candles WHERE tf = '5m' OR tf LIKE '%:5m' GROUP BY tf").all()).results.map((x) => (x.tf === "5m" ? "Gold" : NAME(x.tf.split(":")[0])) + " " + x.n).join(" · ");
  const symOf = Object.fromEntries(S.map((s) => [s.id, (JSON.parse(s.params || "{}").sym) || "XAUUSD"]));
  const DXYV = await kvGet(env, "dxy");
  const A = Object.fromEntries(agg.map((a) => [a.sid, a])); const nm = Object.fromEntries(S.map((s) => [s.id, s.name]));
  const esc = (x) => String(x ?? "").replace(/[<&>]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  const f = (v, d = 2) => (v == null || isNaN(v) ? "–" : (v >= 0 ? "+" : "") + Number(v).toFixed(d));
  const badge = { approved: "#2e9d5b", paper: "#e8b54a", retired: "#666" };
  const rows = S.map((s) => { const b = JSON.parse(s.backtest || "{}"), l = A[s.id] || {};
    return `<tr><td><span class="b" style="background:${badge[s.status] || "#444"}">${esc(s.status)}</span></td><td>${esc(s.name)}</td><td>${b.n ?? "–"}</td><td>${f(b.mean)}R</td><td>${b.win != null ? Math.round(b.win * 100) + "%" : "–"}</td><td>${f(b.hold_mean)}R</td><td>${l.n || 0}</td><td>${f(l.m)}R</td><td>${l.w != null ? Math.round(l.w * 100) + "%" : "–"}</td><td>${f(l.s, 1)}R</td></tr>`; }).join("");
  const trs = T.map((x) => `<tr><td>${fmtT(x.t)}</td><td>${esc(nm[x.sid] || x.sid)}</td><td>${x.dr > 0 ? "LONG" : "SHORT"} ${symOf[x.sid] || ""}</td><td>${Number(x.e).toFixed(DIG(symOf[x.sid]))}</td><td>${x.closed ? f(x.r) + "R" : "offen"}</td><td>${esc(x.why)}</td></tr>`).join("");
  return `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WC Trading Hub</title>
<style>body{margin:0;background:#0d0d0f;color:#eee;font:15px/1.45 system-ui,sans-serif;padding:16px}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 8px;color:#e8b54a}.s{color:#999;font-size:13px}
.w{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:640px}td,th{padding:7px 8px;border-bottom:1px solid #222;text-align:left;font-size:13.5px}th{color:#aaa;font-weight:600}.b{color:#000;font-weight:700;border-radius:10px;padding:2px 8px;font-size:12px}</style>
<h1>WC Trading Hub</h1><div class="s">v${VERSION} · letzte Kerze ${last?.t ? fmtT(last.t) : "–"} · Dollar-Index ≈ ${(() => { try { const d = JSON.parse(DXYV || "[]"); return d.length ? d[d.length - 1][1].toFixed(2) : "–"; } catch { return "–"; } })()} · Kerzen: ${esc(syms)} · Register ${esc(await kvGet(env, "reg_updated") || "–")} · Papierhandel, keine Anlageberatung</div>
<h2>Strategien</h2><div class="w"><table><tr><th>Status</th><th>Strategie</th><th>BT n</th><th>BT Ø</th><th>BT Treffer</th><th>Holdout Ø</th><th>Live n</th><th>Live Ø</th><th>Live Treffer</th><th>Live Σ</th></tr>${rows || '<tr><td colspan="10">Noch keine – der Forschungs-Agent läuft jede Nacht.</td></tr>'}</table></div>
<h2>Wichtige Nachrichten (KI-Bewertung ≥ 2)</h2><div class="w"><table><tr><th>Zeit</th><th>Quelle</th><th>Schlagzeile</th><th>Bewertung</th></tr>${(await env.DB.prepare("SELECT * FROM hub_news WHERE score >= 2 ORDER BY t DESC LIMIT 15").all()).results.map((x) => `<tr><td>${fmtT(x.t)}</td><td>${esc(x.src)}</td><td><a style="color:#e8b54a" href="${esc(x.url)}">${esc(x.title)}</a><br><span class="s">${esc(x.summary)}</span></td><td>${x.score}${x.dir ? " · Gold " + esc(x.dir) : ""}</td></tr>`).join("") || '<tr><td colspan="4">Noch keine.</td></tr>'}</table></div>
<h2>Letzte Papier-Trades</h2><div class="w"><table><tr><th>Zeit</th><th>Strategie</th><th>Richtung</th><th>Einstieg</th><th>Ergebnis</th><th>Grund</th></tr>${trs || '<tr><td colspan="6">Noch keine.</td></tr>'}</table></div></html>`;
}

// ---------------------------------------------------------------- Ablauf
async function tick(env) {
  await schema(env);
  const now = new Date(); const min = now.getUTCMinutes(), hr = now.getUTCHours();
  const log = [];
  for (const sym of SYMBOLS(env)) {
    try { const c = await candles(env, sym, "5m", 600); await store(env, TK(sym, "5m"), c); log.push(`${sym} 5m:${c.length}`); }
    catch (e) { log.push(sym + " 5m-Fehler " + e.message); const k = "err_" + sym + "_" + now.toISOString().slice(0, 13); if (!(await kvGet(env, k))) { await kvPut(env, k, 1); await say(env, `⚠️ Hub (${NAME(sym)}): Kerzen konnten nicht geladen werden – ` + e.message.slice(0, 200)); } }
    try {   // Nachladen nach hinten, bis 45 Tage 5m-Historie da sind (je Lauf 1000 Kerzen)
      const o = await env.DB.prepare("SELECT MIN(t) a FROM hub_candles WHERE tf = ?").bind(TK(sym, "5m")).first();
      const bk = sym === "XAUUSD" ? "backfill_done" : "backfill_done_" + sym;
      if (o?.a && o.a > Date.now() / 1000 - 45 * 86400 && (await kvGet(env, bk)) !== "1") {
        const c = await candles(env, sym, "5m", 1000, o.a); const older = c.filter((k) => k.t < o.a);
        if (older.length) { await store(env, TK(sym, "5m"), older); log.push(`${sym} Nachladen:${older.length}`); } else await kvPut(env, bk, "1");
      }
    } catch (e) { log.push(sym + " Nachladen-Fehler " + e.message); }
    if (min < 5) { try { const c = await candles(env, sym, "1d", 1000); await store(env, TK(sym, "1d"), c); log.push(`${sym} 1d:${c.length}`); } catch (e) { log.push(sym + " 1d-Fehler " + e.message); } }
  }
  if (min < 5) {   // stündlich
    try { await derivTick(env, log); } catch (e) { log.push("Coinalyze-Fehler " + e.message); }
    try {   // COT abends – und sofort, solange die Tabelle noch leer ist (erster Start)
      const empty = !(await env.DB.prepare("SELECT 1 FROM hub_cot LIMIT 1").first());
      if (empty) await kvPut(env, "cot_check", "");
      if (hr === 21 || empty) await cotTick(env, log);
    } catch (e) { log.push("COT-Fehler " + e.message); }
    try { await macroTick(env, log); } catch (e) { log.push("FRED-Fehler " + e.message); }
    try { log.push("Kalender:" + await syncCalendar(env)); } catch (e) { log.push("Kalender-Fehler " + e.message); }
    try { log.push("Register:" + await syncRegistry(env)); } catch (e) { log.push("Register-Fehler " + e.message); }
    await env.DB.prepare("DELETE FROM hub_candles WHERE (tf = '5m' OR tf LIKE '%:5m') AND t < ?").bind(Math.floor(Date.now() / 1000) - 75 * 86400).run();
  }
  try { await czCandles(env, log); } catch (e) { log.push("Krypto-Fehler " + e.message.slice(0, 80)); }
  if ((min >= 30 && min < 35) || (await kvGet(env, "czd_next") || "0") !== "done") { try { await czDaily(env, log); } catch (e) { log.push("Coinalyze-Tag-Fehler " + e.message.slice(0, 80)); } }
  if (min % 10 < 5) { try { await newsTick(env, log); } catch (e) { log.push("Nachrichten-Fehler " + e.message); } }
  try { await fxTick(env, log); } catch (e) { log.push("FX-Fehler " + e.message); }
  try { log.push("News:" + await newsAlerts(env)); } catch (e) { log.push("News-Fehler " + e.message); }
  try { log.push("Papier:" + await paper(env)); } catch (e) { log.push("Papier-Fehler " + e.message); }
  if (hr === 22 && min >= 30 && min < 35) { try { await exportDaily(env); log.push("Export ok"); } catch (e) { log.push("Export-Fehler " + e.message); await say(env, "⚠️ Hub-Export nach GitHub: " + e.message.slice(0, 200)); } }
  { const loc = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Bucharest" }));
    if (loc.getDay() === 0 && loc.getHours() === 18 && loc.getMinutes() < 5) { try { await weeklyReport(env); log.push("Wochenbericht"); } catch (e) { log.push("Wochenbericht-Fehler " + e.message); } } }
  if (hr >= 4 && hr < 7 && min % 15 < 5) { try { await reportPush(env); } catch (e) { log.push("Bericht-Fehler " + e.message); } }
  console.log(log.join(" | "));
}

async function memeRun(env) {   // v1.9: Meme-Radar, danach Smart-Wallets
  const out = [];
  try { out.push(await memeTick(env, say, kvGet, kvPut)); } catch (e) { out.push("Meme-Radar-Fehler " + e.message); }
  try { out.push(await walletTick(env, say, kvGet, kvPut)); } catch (e) { out.push("Wallet-Fehler " + e.message); }
  try { out.push(await mktTick(env, kvGet, kvPut)); } catch (e) { out.push("Marktbreite-Fehler " + e.message); }
  // ab und zu nachholen: Altcoin-Scan, falls der stündliche Lauf ausfiel (z. B. nach einem Deploy)
  try { if (!(await kvGet(env, "alt_hr")) || +(await kvGet(env, "alt_hr")) < Math.floor(Date.now() / 3600000) - 1) out.push(await altTick(env, say, kvGet, kvPut)); } catch (e) { out.push("Alt-Fehler " + e.message); }
  const msg = out.filter(Boolean).join(" | ");
  try { await kvPut(env, "log_memerun", new Date().toISOString() + " " + msg.slice(0, 900)); } catch (e) {}
  return msg;
}

export default {
  async scheduled(ev, env, ctx) {
    if (String(ev.cron).startsWith("2-59")) { ctx.waitUntil(memeRun(env)); return; }   // falls ein zweiter Zeitplan aktiv ist
    // v2.8: Zeitplan jede Minute – Meme-Papier-Positionen alle ~15 Sek. prüfen (eigener Lauf); alles andere wie bisher nur alle 5 Minuten
    if (env.SELF && env.HUB_KEY) ctx.waitUntil(env.SELF.fetch("https://wc-hub/mpfast?key=" + encodeURIComponent(env.HUB_KEY)).then((r) => r.text()).then((t) => console.log(t)).catch((e) => console.log("Papier schnell: " + e.message)));
    if (new Date().getUTCMinutes() % 5 !== 0) return;
    ctx.waitUntil(tick(env));
    // Meme-Radar + Smart-Wallets als EIGENER Lauf (eigenes Rechenzeit-Budget) über die Selbst-Verbindung SELF – braucht keinen zweiten Zeitplan
    if (env.SELF && env.HUB_KEY) ctx.waitUntil(env.SELF.fetch("https://wc-hub/memerun?key=" + encodeURIComponent(env.HUB_KEY)).then((r) => r.text()).then((t) => console.log(t)).catch((e) => console.log("Meme-Lauf: " + e.message)));
    else ctx.waitUntil(memeRun(env));
    // Altcoin-Scanner stündlich (Minute 10–14) als weiterer eigener Lauf
    const m = new Date().getUTCMinutes();
    if (env.SELF && env.HUB_KEY) ctx.waitUntil(env.SELF.fetch("https://wc-hub/fxrun?key=" + encodeURIComponent(env.HUB_KEY)).then((r) => r.text()).then((t) => console.log(t)).catch((e) => console.log("FX-Lauf: " + e.message)));   // v2.5 Devisen
    if (env.SELF && env.HUB_KEY) ctx.waitUntil(env.SELF.fetch("https://wc-hub/sigrun?key=" + encodeURIComponent(env.HUB_KEY)).then((r) => r.text()).then((t) => console.log(t)).catch((e) => console.log("Fremd-Ideen: " + e.message)));   // v2.6 Telegram-Kanäle
    if (env.SELF && env.HUB_KEY) ctx.waitUntil(env.SELF.fetch("https://wc-hub/runrun?key=" + encodeURIComponent(env.HUB_KEY)).then((r) => r.text()).then((t) => console.log(t)).catch((e) => console.log("Langläufer: " + e.message)));   // v3.0
    if (env.SELF && env.HUB_KEY && !/fertig/.test((await kvGet(env, "log_hist100")) || "")) ctx.waitUntil(env.SELF.fetch("https://wc-hub/hist100run?key=" + encodeURIComponent(env.HUB_KEY)).then((r) => r.text()).then((t) => console.log(t)).catch((e) => console.log("Rückblick: " + e.message)));   // v3.0 einmaliger 100×-Rückblick
    if (env.SELF && env.HUB_KEY) ctx.waitUntil(env.SELF.fetch("https://wc-hub/vzrun?key=" + encodeURIComponent(env.HUB_KEY)).then((r) => r.text()).then((t) => console.log(t)).catch((e) => console.log("VIP-Zonen: " + e.message)));   // v3.1 alle 5 Min.
    if (m >= 45 && m < 50 && env.SELF && env.HUB_KEY) ctx.waitUntil(env.SELF.fetch("https://wc-hub/narrrun?key=" + encodeURIComponent(env.HUB_KEY)).then((r) => r.text()).then((t) => console.log(t)).catch((e) => console.log("Narrative: " + e.message)));   // v3.0 stündlich
    if (m >= 20 && m < 25) {   // Wallet-Finder stündlich als eigener Lauf
      if (env.SELF && env.HUB_KEY) ctx.waitUntil(env.SELF.fetch("https://wc-hub/finderrun?key=" + encodeURIComponent(env.HUB_KEY)).then((r) => r.text()).then((t) => console.log(t)).catch((e) => console.log("Finder-Lauf: " + e.message)));
      else ctx.waitUntil(finderTick(env, say, kvGet, kvPut).catch((e) => console.log("Finder-Fehler " + e.message)));
    }
    if (new Date().getUTCHours() === 0 && m >= 30 && m < 35 && env.SELF && env.HUB_KEY) ctx.waitUntil(env.SELF.fetch("https://wc-hub/mlearnrun?key=" + encodeURIComponent(env.HUB_KEY)).then((r) => r.text()).then((t) => console.log(t)).catch((e) => console.log("Meme-Lernen: " + e.message)));   // v2.7 nachts 2:30 Uhr (Bukarest, Winterzeit)
    const hU = new Date().getUTCHours();
    if (m >= 25 && m < 30 && env.SELF && env.HUB_KEY) ctx.waitUntil(env.SELF.fetch("https://wc-hub/olrun?key=" + encodeURIComponent(env.HUB_KEY)).then((r) => r.text()).then((t) => console.log(t)).catch((e) => console.log("Ausblick-Auswertung: " + e.message)));   // v2.8 stündlich
    const alPart = hU === 0 && m >= 40 ? Math.floor((m - 40) / 5) : hU === 1 && m < 5 ? PARTS : -1;   // v2.8 Altcoin-Lernen nachts: 4 Teile nachspielen, dann lernen
    if (alPart >= 0 && env.SELF && env.HUB_KEY) ctx.waitUntil(env.SELF.fetch("https://wc-hub/altlearnrun?part=" + alPart + "&key=" + encodeURIComponent(env.HUB_KEY)).then((r) => r.text()).then((t) => console.log(t)).catch((e) => console.log("Altcoin-Lernen: " + e.message)));
    if (m >= 10 && m < 15) {
      if (env.SELF && env.HUB_KEY) ctx.waitUntil(env.SELF.fetch("https://wc-hub/altrun?key=" + encodeURIComponent(env.HUB_KEY)).then((r) => r.text()).then((t) => console.log(t)).catch((e) => console.log("Alt-Lauf: " + e.message)));
      else ctx.waitUntil(altTick(env, say, kvGet, kvPut).catch((e) => console.log("Alt-Fehler " + e.message)));
    }
  },
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.searchParams.get("key") !== env.HUB_KEY || !env.HUB_KEY) return new Response("WC Trading Hub", { status: 403 });
    if (url.pathname === "/run") { await tick(env); return new Response("ok"); }
    if (url.pathname === "/cot") { const log = []; await schema(env); await kvPut(env, "cot_check", ""); await cotTick(env, log); return new Response(log.join(" | ")); }
    if (url.pathname === "/deriv") { const log = []; await schema(env); await derivTick(env, log); return new Response(log.join(" | ") + "\n" + (await kvGet(env, "cz_markets"))); }
    if (url.pathname === "/czdaily") { const log = []; await schema(env); await czDaily(env, log); return new Response(log.join(" | ")); }
    if (url.pathname === "/olrun") { try { const msg = await olTick(env, say, kvGet, kvPut); await kvPut(env, "log_ol", new Date().toISOString() + " " + msg); return new Response(msg); } catch (e) { await kvPut(env, "log_ol", new Date().toISOString() + " Fehler " + e.message); return new Response("Ausblick-Fehler " + e.message); } }
    if (url.pathname === "/altlearnrun") { try { await altSchema(env); const msg = await altLearn(env, say, kvGet, kvPut, czMap, hist, +(url.searchParams.get("part") ?? PARTS)); await kvPut(env, "log_altlearn", new Date().toISOString() + " " + msg); return new Response(msg); } catch (e) { await kvPut(env, "log_altlearn", new Date().toISOString() + " Fehler " + e.message); return new Response("Altcoin-Lernen-Fehler " + e.message); } }
    if (url.pathname === "/mpfast") { try { return new Response(await mpFast(env, say, kvPut)); } catch (e) { return new Response("Papier schnell Fehler " + e.message); } }
    if (url.pathname === "/fwcheck") return Response.json(await fwCheck(env));
    if (url.pathname === "/mlearnrun") { try { const d0 = await kvGet(env, "mlearn_day"), day = new Date().toISOString().slice(0, 10); if (d0 === day && url.searchParams.get("force") !== "1") return new Response("heute schon gelaufen"); await kvPut(env, "mlearn_day", day); await env.DB.prepare("DELETE FROM hub_meme_snap WHERE t < ?").bind(Math.floor(Date.now() / 1000) - 40 * 86400).run(); const msg = await memeLearn(env, say, kvGet, kvPut, await mpRules(env)); await kvPut(env, "log_mlearn", new Date().toISOString() + " " + msg); return new Response(msg); } catch (e) { await kvPut(env, "log_mlearn", new Date().toISOString() + " Fehler " + e.message); return new Response("Meme-Lernen-Fehler " + e.message); } }
    if (url.pathname === "/mlearn") return new Response(await mlPage(env), { headers: { "content-type": "text/html; charset=utf-8" } });
    if (url.pathname === "/sigrun") { try { return new Response(await sigTick(env, say, kvGet, kvPut)); } catch (e) { return new Response("Fremd-Ideen-Fehler " + e.message); } }
    if (url.pathname === "/sig") return new Response(await sigPage(env), { headers: { "content-type": "text/html; charset=utf-8" } });
    if (url.pathname === "/sigjson") return Response.json(await sigData(env));
    if (url.pathname === "/fxrun") return new Response(await fxRun(env));
    if (url.pathname === "/vzrun") { try { const msg = await vzTick(env, say, kvGet, kvPut); await kvPut(env, "log_vz", msg); return new Response(msg); } catch (e) { return new Response("VIP-Zonen-Fehler " + e.message); } }
    if (url.pathname === "/narrrun") { try { const msg = await narrTick(env, say, kvGet, kvPut); await kvPut(env, "log_narr", msg); return new Response(msg); } catch (e) { return new Response("Narrativ-Fehler " + e.message); } }
    if (url.pathname === "/hist100run") { try { const msg = await hist100Tick(env, kvGet, kvPut); await kvPut(env, "log_hist100", msg); return new Response(msg); } catch (e) { return new Response("Rückblick-Fehler " + e.message); } }
    if (url.pathname === "/runrun") { try { return new Response(await runnerTick(env, say)); } catch (e) { return new Response("Langläufer-Fehler " + e.message); } }
    if (url.pathname === "/finderrun") { try { return new Response(await finderTick(env, say, kvGet, kvPut, url.searchParams.get("force") === "1")); } catch (e) { return new Response("Finder-Fehler " + e.message); } }
    if (url.pathname === "/alts") return new Response(await altPage(env), { headers: { "content-type": "text/html; charset=utf-8" } });
    if (url.pathname === "/altrun") { try { return new Response(await altTick(env, say, kvGet, kvPut, url.searchParams.get("force") === "1")); } catch (e) { return new Response("Alt-Fehler " + e.message); } }
    if (url.pathname === "/wallet") return new Response(await walletAdmin(env, url.searchParams));
    if (url.pathname === "/walletrun") return new Response(await walletTick(env, say, kvGet, kvPut));
    if (url.pathname === "/memes") return new Response(await memePage(env, url.searchParams.get("key"), await walletData(env).then(async (w) => ({ ...w, finder: await finderData(env).catch(() => null) })).catch(() => null), await mpData(env).catch(() => null)), { headers: { "content-type": "text/html; charset=utf-8" } });
    if (url.pathname === "/memerun") return new Response(await memeRun(env));
    if (url.pathname === "/weekly") { await schema(env); return new Response(await weeklyReport(env, true)); }
    if (url.pathname === "/macro") { const log = []; await schema(env); await kvPut(env, "macro_check", ""); await macroTick(env, log); return new Response(log.join(" | ")); }
    if (url.pathname === "/export") { await exportDaily(env); return new Response("export ok"); }
    if (url.pathname === "/status") {
      await schema(env);
      const n = await env.DB.prepare("SELECT tf, COUNT(*) n, MIN(t) a, MAX(t) b FROM hub_candles GROUP BY tf").all();
      return Response.json({ version: VERSION, candles: n.results, strategies: (await env.DB.prepare("SELECT status, COUNT(*) n FROM hub_strats GROUP BY status").all()).results });
    }
    await schema(env);
    return new Response(await dashboard(env), { headers: { "content-type": "text/html; charset=utf-8" } });
  },
};
