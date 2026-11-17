// WC Trading Hub – Filter-Prüfer (v3.5, Kevin 17.11.: „alles miteinander verknüpfen, gegenprüfen in sämtlichen Strategien, fortlaufend weiterentwickeln“)
// Jede Stunde: jeder geschlossene Papier-Trade JEDER Strategie wird gegen alle Zusatzdaten geprüft, die es zum Einstiegszeitpunkt gab:
//   • Orderflow (Delta der Stunde davor: mit / gegen Trade-Richtung)        • CME-Volumen (hoch / normal / niedrig, Yahoo)
//   • VIP-Zonen (Gold: aktive Zone in gleicher / anderer Richtung)          • Hyperliquid-Profis (Mehrheit gleiche / andere Richtung)
// Einmal täglich: Bringt ein Filter bei einer Strategie einen ECHTEN Vorteil? Nur wenn
//   ≥ 30 Trades mit UND ≥ 30 ohne Filter, Vorteil ≥ 0,2 R, gefilterte Trades im Schnitt im Plus und der Vorteil in BEIDEN Zeithälften →
//   dann legt der Hub selbst eine neue Papier-Strategie „<Strategie> + <Filter>“ an (Familie „filt“) und lässt sie ab dann vorwärts mitlaufen.
// Varianten werden weiter beobachtet: schlagen sie das Original live (≥ 20 Trades, ≥ 0,15 R besser) → Meldung „Kandidat“ (freigeben entscheidet Kevin);
//   bringen sie nach 40 Trades nichts (< 0,05 R besser) → automatisch in Rente.
// Sonntags 20 Uhr ein Wochenbericht: welche Datenquelle hilft welcher Strategie. Nur Papier, keine Anlageberatung.
const DAY = 86400;
const OFSYM = new Set(["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "DOGEUSD", "BNBUSD", "XAUUSD", "XAGUSD", "SP500", "NAS100"]);
const CMESYM = new Set(["XAUUSD", "XAGUSD", "SP500", "NAS100"]);
const HLC = { BTCUSD: "BTC", ETHUSD: "ETH", SOLUSD: "SOL", XRPUSD: "XRP", DOGEUSD: "DOGE", BNBUSD: "BNB", XAUUSD: "xyz:GOLD", XAGUSD: "xyz:SILVER", SP500: "xyz:SP500", NAS100: "xyz:XYZ100" };
// Filter = Hypothese, vorher festgelegt (nicht im Nachhinein die beste Schublade suchen)
export const FILTERS = {
  of_mit: { name: "Orderflow in Trade-Richtung", src: "of", pass: (l) => l.of === 1 },
  of_nichtgegen: { name: "nicht gegen den Orderflow", src: "of", pass: (l) => l.of !== -1 },
  cme_hoch: { name: "hohes CME-Volumen", src: "cme", pass: (l) => l.cme === 1 },
  cme_nichtniedrig: { name: "kein dünnes CME-Volumen", src: "cme", pass: (l) => l.cme !== -1 },
  vz_mit: { name: "VIP-Zone in gleicher Richtung", src: "vz", pass: (l) => l.vz === 1 },
  vz_nichtgegen: { name: "nicht gegen eine VIP-Zone", src: "vz", pass: (l) => l.vz !== -1 },
  hl_mit: { name: "Hyperliquid-Profis gleiche Richtung", src: "hl", pass: (l) => l.hl === 1 },
  hl_nichtgegen: { name: "Profis nicht dagegen", src: "hl", pass: (l) => l.hl !== -1 },
  // v3.7 Marktphase (aus den eigenen Kerzen, 24 Std. vor dem Einstieg) und Zeit
  trend_mit: { name: "mit dem 24-Std.-Trend", src: "reg", pass: (l) => l.reg === 1 },
  keine_seitw: { name: "kein Seitwärtsmarkt", src: "reg", pass: (l) => l.reg !== 0 },
  vola_ok: { name: "keine tote (ruhige) Phase", src: "vola", pass: (l) => l.vola !== -1 },
  vola_ruhig: { name: "keine hektische Phase", src: "vola", pass: (l) => l.vola !== 1 },
  sess_haupt: { name: "nur London/New York (7–21 Uhr UTC)", src: "sess", pass: (l) => l.sess === 1 },
  wt_mitte: { name: "nur Dienstag–Donnerstag", src: "wt", pass: (l) => l.wt === 1 },
};

// ---------- Kontext je Markt laden und Trades beschriften ----------
async function ctx(env, sym, from) {
  const C = {};
  if (OFSYM.has(sym)) {
    const src = (await env.DB.prepare("SELECT src FROM hub_oflow WHERE sym = ? GROUP BY src ORDER BY (src LIKE 'bn:%' OR src LIKE 'gt:%') DESC, COUNT(*) DESC LIMIT 1").bind(sym).first().catch(() => null))?.src;
    if (src) C.of = (await env.DB.prepare("SELECT t, delta d, buy + sell v FROM hub_oflow WHERE sym = ? AND src = ? AND t > ? ORDER BY t").bind(sym, src, from - DAY).all()).results;
  }
  if (CMESYM.has(sym)) C.cme = new Map((await env.DB.prepare("SELECT t, vol FROM hub_cme WHERE sym = ? AND t > ?").bind(sym, from - 17 * DAY).all().catch(() => ({ results: [] }))).results.map((r) => [r.t, r.vol]));
  if (sym === "XAUUSD") C.vz = (await env.DB.prepare("SELECT t, side, lo, hi, ev FROM hub_vipzone").all().catch(() => ({ results: [] }))).results.map((z) => ({ ...z, e: z.ev ? JSON.parse(z.ev) : {} }));
  {   // Stundenkerzen (eigene Tabelle, sonst aus 5-Min. zusammengesetzt)
    const tk = sym === "XAUUSD" ? "" : sym + ":";
    let H = (await env.DB.prepare("SELECT t, h, l, c FROM hub_candles WHERE tf = ? AND t > ? ORDER BY t").bind(tk + "1h", from - 25 * DAY).all().catch(() => ({ results: [] }))).results;
    if (H.length < 200) { const F = (await env.DB.prepare("SELECT t, h, l, c FROM hub_candles WHERE tf = ? AND t > ? ORDER BY t").bind(tk + "5m", from - 25 * DAY).all().catch(() => ({ results: [] }))).results;
      const M = new Map(); for (const k of F) { const b = k.t - (k.t % 3600), o = M.get(b); if (!o) M.set(b, { t: b, h: k.h, l: k.l, c: k.c }); else { o.h = Math.max(o.h, k.h); o.l = Math.min(o.l, k.l); o.c = k.c; } }
      H = [...M.values()].sort((a, b) => a.t - b.t); }
    C.h1 = H;
  }
  if (HLC[sym]) C.hl = (await env.DB.prepare("SELECT t, long, short FROM hub_hl_cons WHERE coin = ? AND t > ? ORDER BY t").bind(HLC[sym], from - DAY).all().catch(() => ({ results: [] }))).results;
  return C;
}
function label(C, x) {
  const L = {}, t0 = x.t - (x.t % 300);
  if (C.of?.length) { let d = 0, v = 0; for (const r of C.of) { if (r.t > t0 - 300) break; if (r.t >= t0 - 3600) { d += r.d; v += r.v; } }
    if (v) { const rel = d / v; L.of = Math.abs(rel) < 0.03 ? 0 : Math.sign(rel) === x.dr ? 1 : -1; } }
  if (C.cme?.size) { const h = (b) => { let s = 0, n = 0; for (let t = b - 3600; t < b; t += 300) { const q = C.cme.get(t); if (q != null) { s += q; n++; } } return n >= 6 ? s : null; };
    const cur = h(t0); if (cur != null) { const P = []; for (let k = 1; k <= 15; k++) { const v = h(t0 - k * DAY); if (v) P.push(v); }
      if (P.length >= 5) { const rv = cur / (P.reduce((a, v) => a + v, 0) / P.length); L.cme = rv >= 1.5 ? 1 : rv <= 0.7 ? -1 : 0; } } }
  if (C.vz) { const act = C.vz.filter((z) => z.t <= x.t && x.t - z.t < 2 * DAY && !(z.e.broken && z.e.broken <= x.t) && Math.min(Math.abs(x.e - z.lo), Math.abs(x.e - z.hi)) <= 15);
    L.vz = !act.length ? 0 : act.every((z) => z.side === x.dr) ? 1 : act.every((z) => z.side !== x.dr) ? -1 : 0; }
  if (C.hl?.length) { let c = null; for (const r of C.hl) { if (r.t > x.t) break; if (r.t >= x.t - 1800) c = r; }
    if (c && c.long + c.short >= 3) { const net = (c.long - c.short) / (c.long + c.short); L.hl = Math.abs(net) < 0.2 ? 0 : Math.sign(net) === x.dr ? 1 : -1; } }
  if (C.h1?.length > 48) {   // Marktphase: Effizienz (Netto-Weg / Gesamt-Weg) der letzten 24 Std.; Volatilität: Spanne 24 Std. vs. Median der 20 Tage davor
    let j = -1; for (let i = C.h1.length - 1; i >= 0; i--) if (C.h1[i].t + 3600 <= x.t) { j = i; break; }
    if (j >= 24) { const W = C.h1.slice(j - 23, j + 1); let path = 0; for (let i = 1; i < W.length; i++) path += Math.abs(W[i].c - W[i - 1].c);
      const net = W[W.length - 1].c - W[0].c, er = path ? Math.abs(net) / path : 0; L.reg = er >= 0.35 ? (Math.sign(net) === x.dr ? 1 : -1) : er <= 0.15 ? 0 : 2;
      if (j >= 24 * 21) { const rng = (A) => A.reduce((a, k) => a + (k.h - k.l), 0) / A.length, now_ = rng(W), P = [];
        for (let d = 1; d <= 20; d++) P.push(rng(C.h1.slice(j - 23 - d * 24, j + 1 - d * 24))); P.sort((a, b) => a - b); const med = P[10];
        L.vola = now_ > 1.3 * med ? 1 : now_ < 0.7 * med ? -1 : 0; } } }
  const hh = new Date(x.t * 1000).getUTCHours(), wd = new Date(x.t * 1000).getUTCDay();
  L.sess = hh >= 7 && hh < 21 ? 1 : 0; L.wt = wd >= 2 && wd <= 4 ? 1 : 0;
  return L;
}
const stat = (A) => { const n = A.length, m = n ? A.reduce((a, x) => a + x.r, 0) / n : null; return { n, m, w: n ? A.filter((x) => x.r > 0).length / n : null }; };

export async function filtTick(env, say, kvGet, kvPut) {
  const now = Math.floor(Date.now() / 1000), from = now - 120 * DAY, log = [];
  const S = (await env.DB.prepare("SELECT id, name, family, params, status, created FROM hub_strats WHERE status IN ('paper', 'approved')").all()).results;
  const base = S.filter((s) => s.family !== "filt"), vars = S.filter((s) => s.family === "filt");
  const symOf = (s) => { try { return JSON.parse(s.params || "{}").sym || "XAUUSD"; } catch { return "XAUUSD"; } };
  const T = (await env.DB.prepare("SELECT sid, t, dr, e, sl, tp, r, why, tx, closed, COALESCE(sym, '') sym FROM hub_trades WHERE t > ? AND sid NOT LIKE '%|%' ORDER BY t").bind(from).all()).results;
  const bySid = {}; for (const x of T) (bySid[x.sid] ||= []).push(x);
  // v3.9 Backtest-Historie dazu (nur für die Prüfung, nicht für die Varianten-Trades): Trades, die es live noch nicht gibt
  const BH = (await env.DB.prepare("SELECT sid, t, dr, e, r, sym FROM hub_bt WHERE t > ? ORDER BY t").bind(now - 365 * DAY).all().catch(() => ({ results: [] }))).results;
  const byHist = {}; for (const x of BH) (byHist[x.sid] ||= []).push({ ...x, closed: 1, hist: 1 });
  const CTX = {}; const getC = async (sym) => (CTX[sym] ||= await ctx(env, sym, from));

  // 1) Varianten mit neuen Trades des Originals füllen (nur Trades NACH ihrer Entstehung, die den Filter erfüllen)
  for (const v of vars) {
    const p = JSON.parse(v.params || "{}"), F = FILTERS[p.f]; if (!F) continue;
    const born = Math.floor(Date.parse((v.created || "2000-01-01") + "T00:00:00Z") / 1000) + DAY;
    const L = (bySid[p.base] || []).filter((x) => x.t >= born); if (!L.length) continue;
    const C = await getC(p.sym || symOf(v)); const st = [];
    for (const x of L) { if (!F.pass(label(C, { ...x, sym: p.sym }))) continue;
      st.push(env.DB.prepare("INSERT INTO hub_trades (sid, t, dr, e, sl, tp, r, why, tx, closed, pf, sym) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?) ON CONFLICT(sid, t) DO UPDATE SET r = excluded.r, why = excluded.why, tx = excluded.tx, closed = excluded.closed")
        .bind(v.id, x.t, x.dr, x.e, x.sl, x.tp, x.r, x.why, x.tx, x.closed, x.sym || p.sym || null)); }
    for (let i = 0; i < st.length; i += 100) await env.DB.batch(st.slice(i, i + 100));
  }

  // 2) einmal täglich: Kreuzprüfung aller Strategien × aller Filter, neue Varianten, Varianten bewerten
  const day = new Date().toISOString().slice(0, 10);
  if ((await kvGet(env, "flt_day")) === day) return `Filter-Prüfer: ${vars.length} Varianten aktualisiert`;
  await kvPut(env, "flt_day", day);
  const M = [];   // Matrix für Bericht/AURUM
  let created = 0;
  for (const s of base) {
    const sym = symOf(s), live = (bySid[s.id] || []).filter((x) => x.closed), seen = new Set(live.map((x) => x.t));
    const A = [...(byHist[s.id] || []).filter((x) => !seen.has(x.t)), ...live].sort((a, b) => a.t - b.t); if (A.length < 40) continue;
    const C = await getC(sym); const LB = A.map((x) => ({ x, l: label(C, { ...x, sym }) }));
    const half = A[Math.floor(A.length / 2)].t, OK = [];
    for (const [fk, F] of Object.entries(FILTERS)) {
      const known = LB.filter((z) => z.l[F.src] !== undefined); if (known.length < 60) continue;
      const P = known.filter((z) => F.pass(z.l)).map((z) => z.x), R = known.filter((z) => !F.pass(z.l)).map((z) => z.x);
      const sp = stat(P), sr = stat(R); if (sp.n < 10 || sr.n < 10) continue;
      const h1 = stat(P.filter((x) => x.t < half)).m - stat(R.filter((x) => x.t < half)).m, h2 = stat(P.filter((x) => x.t >= half)).m - stat(R.filter((x) => x.t >= half)).m;
      const edge = sp.m - sr.m;
      const ok = sp.n >= 30 && sr.n >= 30 && edge >= 0.2 && sp.m > 0 && h1 > 0 && h2 > 0;
      M.push({ sid: s.id, name: s.name, f: fk, fn: F.name, np: sp.n, mp: +sp.m.toFixed(3), nr: sr.n, mr: +sr.m.toFixed(3), edge: +edge.toFixed(3), ok });
      if (ok) OK.push({ fk, F, sp, sr, edge });
    }
    // je Datenquelle nur den stärksten Filter, höchstens 2 neue Varianten je Strategie (sonst doppeln sich fast gleiche Varianten)
    const best = {}; for (const o of OK) if (!best[o.F.src] || o.edge > best[o.F.src].edge) best[o.F.src] = o;
    for (const { fk, F, sp, sr, edge } of Object.values(best).sort((a, b) => b.edge - a.edge).slice(0, 2)) {
      const id = `${s.id}|${fk}`;
      const ins = await env.DB.prepare("INSERT OR IGNORE INTO hub_strats (id, name, family, params, status, backtest, live, created) VALUES (?, ?, 'filt', ?, 'paper', ?, '{}', ?)")
        .bind(id, `${s.name} + ${F.name}`, JSON.stringify({ base: s.id, f: fk, sym }), JSON.stringify({ n: sp.n, mean: sp.m, win: sp.w, rest_n: sr.n, rest_mean: sr.m, edge, quelle: "Filter-Prüfer (Papier-Historie)" }), day).run();
      if (ins.meta?.changes) { created++;
        await say(env, `🧪 Neue Filter-Variante (Papier): „${s.name} + ${F.name}“\nMit Filter Ø ${sp.m >= 0 ? "+" : ""}${sp.m.toFixed(2)} R (${sp.n} Trades) · ohne Ø ${sr.m >= 0 ? "+" : ""}${sr.m.toFixed(2)} R (${sr.n}), Vorteil in beiden Zeithälften.\nLäuft ab morgen vorwärts neben dem Original.`).catch(() => {}); }
    }
  }
  // Varianten live bewerten
  let cand = 0, ret = 0;
  for (const v of vars) {
    const p = JSON.parse(v.params || "{}"), born = Math.floor(Date.parse((v.created || "2000-01-01") + "T00:00:00Z") / 1000) + DAY;
    const V = stat((await env.DB.prepare("SELECT r FROM hub_trades WHERE sid = ? AND closed = 1").bind(v.id).all()).results);
    const B = stat((bySid[p.base] || []).filter((x) => x.closed && x.t >= born));
    if (V.n >= 20 && B.n && V.m - B.m >= 0.15 && V.m > 0 && !(await kvGet(env, "flt_cand_" + v.id))) {
      await kvPut(env, "flt_cand_" + v.id, day); cand++;
      await say(env, `⭐ Kandidat: „${v.name}“ schlägt das Original auch live – Ø ${V.m.toFixed(2)} R (${V.n}) gegenüber ${B.m.toFixed(2)} R (${B.n}). Freigabe („approved“) entscheidest du.`).catch(() => {});
    }
    if (V.n >= 40 && (!B.n || V.m - B.m < 0.05)) {
      await env.DB.prepare("UPDATE hub_strats SET status = 'retired' WHERE id = ?").bind(v.id).run(); ret++;
      await say(env, `🗄️ Filter-Variante in Rente: „${v.name}“ – live kein Vorteil (Ø ${V.m.toFixed(2)} R vs. Original ${B.n ? B.m.toFixed(2) : "–"} R).`).catch(() => {});
    }
    await env.DB.prepare("UPDATE hub_strats SET live = ? WHERE id = ?").bind(JSON.stringify({ n: V.n, mean: V.m, win: V.w, base_n: B.n, base_mean: B.m }), v.id).run();
  }
  await kvPut(env, "flt_matrix", JSON.stringify({ t: now, M }));
  // Wochenbericht sonntags 20 Uhr (Bukarest): welche Quelle hilft wem (auch ohne neue Variante)
  const d = new Date(), loc = (d.getUTCHours() + 2) % 24;
  if (d.getUTCDay() === 0 && loc >= 20 && (await kvGet(env, "flt_week")) !== day) {
    await kvPut(env, "flt_week", day);
    const src = {}; for (const m of M) { const k = FILTERS[m.f].src; const a = (src[k] ||= { n: 0, plus: 0, best: null }); a.n++; if (m.edge > 0.1) a.plus++; if (!a.best || m.edge > a.best.edge) a.best = m; }
    const NM = { of: "Orderflow", cme: "CME-Volumen", vz: "VIP-Zonen", hl: "Hyperliquid-Profis", reg: "Marktphase", vola: "Volatilität", sess: "Handelszeit", wt: "Wochentag" };
    const lines = Object.entries(src).map(([k, a]) => `• ${NM[k]}: hilft bei ${a.plus} von ${a.n} Prüfungen${a.best && a.best.edge > 0.1 ? ` – am meisten bei „${a.best.name}“ (${a.best.fn}: +${a.best.edge.toFixed(2)} R)` : ""}`);
    const nv = (await env.DB.prepare("SELECT COUNT(*) n FROM hub_strats WHERE family = 'filt' AND status != 'retired'").first())?.n || 0;
    await say(env, `🔗 Wochenbericht Verknüpfung\n${lines.length ? lines.join("\n") : "Noch zu wenige Trades für belastbare Vergleiche (je Strategie mind. 40 geschlossene)."}\nAktive Filter-Varianten: ${nv}\nNur Papier, keine Anlageberatung.`).catch(() => {});
  }
  return `Filter-Prüfer: ${M.length} Prüfungen, ${created} neue Varianten, ${cand} Kandidaten, ${ret} in Rente`;
}
