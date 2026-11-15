// WC Trading Hub – Worker (Cloudflare). v1.1 – Gold, Silber, Bitcoin
// Alle 5 Minuten: neue Kerzen (XAUUSD, XAGUSD, BTCUSD) über MetaApi (nur lesend) -> D1, freigegebene Strategien laufen live auf Papier mit,
// neue/abgeschlossene Papier-Trades -> Nachricht an Kevin (über den Postausgang des Welcome-Bots).
// Stündlich: Strategie-Register aus GitHub (hub/registry.json, vom nächtlichen Forschungs-Agenten gepflegt).
// Täglich: neue Kerzen + Papier-Trades als Datei nach GitHub (für die Forschung), Forschungsbericht an Kevin.
// Dashboard: https://<worker>/?key=HUB_KEY
// Secrets: META_TOKEN, META_ACCOUNT, (META_REGION), GH_TOKEN, HUB_KEY
import * as E from "./engine.js";

const VERSION = "1.2";
const SYMBOLS = (env) => String(env.SYMBOLS || "XAUUSD,XAGUSD,BTCUSD").split(",").map((x) => x.trim()).filter(Boolean);
// Kerzen-Schlüssel in hub_candles.tf: Gold ohne Präfix (abwärtskompatibel), sonst "XAGUSD:5m"
const TK = (sym, tf) => (sym === "XAUUSD" ? tf : `${sym}:${tf}`);
const NAME = (sym) => (E.SYMS[sym]?.name || sym);
const DIG = (sym) => (sym === "XAGUSD" ? 3 : 2);
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
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_events (id TEXT PRIMARY KEY, t INTEGER, cur TEXT, title TEXT, impact TEXT, forecast TEXT, previous TEXT, actual TEXT, note TEXT)"),
  ]);
  await env.STATE?.put?.("hub:schema1", "1");
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

// ---------------------------------------------------------------- Papierhandel
const fmtT = (t) => new Date(t * 1000).toLocaleString("de-DE", { timeZone: "Europe/Bucharest", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
async function paper(env) {
  const { results: strats } = await env.DB.prepare("SELECT * FROM hub_strats WHERE status IN ('paper', 'approved')").all();
  if (!strats.length) return 0;
  const now = Math.floor(Date.now() / 1000);
  const recent = now - 4 * 86400; let n = 0; const DATA = {};
  const NW = await newsWindows(env, now - 5 * 86400).catch(() => []);
  const inNews = (t) => NW.some(([a, b]) => t >= a && t <= b);
  for (const s of strats) {
    const p = E.withSym(JSON.parse(s.params)); const sym = p.sym || "XAUUSD";
    if (!DATA[sym]) {
      const C5 = await load(env, TK(sym, "5m"), now - 30 * 86400);
      DATA[sym] = C5.length >= 500 ? { DAYS: E.days(C5), F5: E.feats(C5), F15: E.feats(E.resample(C5, 900)) } : {};
      if (strats.some((x) => x.family === "swing")) DATA[sym].D1 = await load(env, TK(sym, "1d"), 0);
    }
    const data = DATA[sym];
    if (s.family !== "swing" && !data.DAYS) continue;
    let tr; try { tr = E.trades(s.family, p, data); } catch (e) { console.log("Engine", s.id, e.message); continue; }
    const born = Math.floor(new Date((s.created || "2000-01-01") + "T00:00:00Z").getTime() / 1000) + 86400;   // nur Trades NACH der Aufnahme zählen (echter Vorwärtstest)
    for (const x of tr.filter((x) => (x.t >= recent || x.open) && x.t >= born && !inNews(x.t))) {
      const old = await env.DB.prepare("SELECT closed, notified FROM hub_trades WHERE sid = ? AND t = ?").bind(s.id, x.t).first();
      await env.DB.prepare("INSERT INTO hub_trades (sid, t, dr, e, sl, tp, r, why, tx, closed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(sid, t) DO UPDATE SET r=excluded.r, why=excluded.why, tx=excluded.tx, closed=excluded.closed, sl=excluded.sl")
        .bind(s.id, x.t, x.dr, x.e, x.sl, x.tp ?? null, x.r, x.why, x.tx, x.open ? 0 : 1).run();
      const dir = x.dr > 0 ? "LONG" : "SHORT";
      if (!old && now - x.t < 3 * 3600) {   // neu eröffnet (nur frische melden)
        const d = DIG(sym);
        await say(env, `🧪 Hub-Papiertrade eröffnet – ${NAME(sym)}\n${s.name}\n${dir} ${sym} @ ${x.e.toFixed(d)} · SL ${x.sl.toFixed(d)}${x.tp ? " · Ziel " + x.tp.toFixed(d) : ""}\n${fmtT(x.t)} Uhr · Status: ${s.status === "approved" ? "freigabereif" : "Papier"}\n(Lern-/Testzwecke, keine Anlageberatung)`); n++;
      }
      if (!x.open && (!old || !old.closed) && now - x.tx < 3 * 3600) {
        await say(env, `${x.r > 0.05 ? "✅" : x.r < -0.05 ? "❌" : "➖"} Hub-Papiertrade beendet: ${x.r >= 0 ? "+" : ""}${x.r.toFixed(2)}R (${x.why})\n${s.name}\n${dir} ${sym} @ ${x.e.toFixed(DIG(sym))} → ${fmtT(x.tx)} Uhr`); n++;
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

// ---------------------------------------------------------------- Dashboard
async function dashboard(env) {
  const { results: S } = await env.DB.prepare("SELECT * FROM hub_strats ORDER BY CASE status WHEN 'approved' THEN 0 WHEN 'paper' THEN 1 ELSE 2 END, created DESC").all();
  const { results: T } = await env.DB.prepare("SELECT * FROM hub_trades ORDER BY t DESC LIMIT 60").all();
  const { results: agg } = await env.DB.prepare("SELECT sid, COUNT(*) n, SUM(r) s, AVG(r) m, AVG(CASE WHEN r > 0 THEN 1.0 ELSE 0 END) w FROM hub_trades WHERE closed = 1 GROUP BY sid").all();
  const last = await env.DB.prepare("SELECT MAX(t) t FROM hub_candles WHERE tf = '5m'").first();
  const syms = (await env.DB.prepare("SELECT tf, COUNT(*) n FROM hub_candles WHERE tf = '5m' OR tf LIKE '%:5m' GROUP BY tf").all()).results.map((x) => (x.tf === "5m" ? "Gold" : NAME(x.tf.split(":")[0])) + " " + x.n).join(" · ");
  const symOf = Object.fromEntries(S.map((s) => [s.id, (JSON.parse(s.params || "{}").sym) || "XAUUSD"]));
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
<h1>WC Trading Hub</h1><div class="s">v${VERSION} · letzte Kerze ${last?.t ? fmtT(last.t) : "–"} · Kerzen: ${esc(syms)} · Register ${esc(await kvGet(env, "reg_updated") || "–")} · Papierhandel, keine Anlageberatung</div>
<h2>Strategien</h2><div class="w"><table><tr><th>Status</th><th>Strategie</th><th>BT n</th><th>BT Ø</th><th>BT Treffer</th><th>Holdout Ø</th><th>Live n</th><th>Live Ø</th><th>Live Treffer</th><th>Live Σ</th></tr>${rows || '<tr><td colspan="10">Noch keine – der Forschungs-Agent läuft jede Nacht.</td></tr>'}</table></div>
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
    try { log.push("Kalender:" + await syncCalendar(env)); } catch (e) { log.push("Kalender-Fehler " + e.message); }
    try { log.push("Register:" + await syncRegistry(env)); } catch (e) { log.push("Register-Fehler " + e.message); }
    await env.DB.prepare("DELETE FROM hub_candles WHERE (tf = '5m' OR tf LIKE '%:5m') AND t < ?").bind(Math.floor(Date.now() / 1000) - 75 * 86400).run();
  }
  try { log.push("News:" + await newsAlerts(env)); } catch (e) { log.push("News-Fehler " + e.message); }
  try { log.push("Papier:" + await paper(env)); } catch (e) { log.push("Papier-Fehler " + e.message); }
  if (hr === 22 && min >= 30 && min < 35) { try { await exportDaily(env); log.push("Export ok"); } catch (e) { log.push("Export-Fehler " + e.message); await say(env, "⚠️ Hub-Export nach GitHub: " + e.message.slice(0, 200)); } }
  if (hr >= 4 && hr < 7 && min % 15 < 5) { try { await reportPush(env); } catch (e) { log.push("Bericht-Fehler " + e.message); } }
  console.log(log.join(" | "));
}

export default {
  async scheduled(ev, env, ctx) { ctx.waitUntil(tick(env)); },
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.searchParams.get("key") !== env.HUB_KEY || !env.HUB_KEY) return new Response("WC Trading Hub", { status: 403 });
    if (url.pathname === "/run") { await tick(env); return new Response("ok"); }
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
