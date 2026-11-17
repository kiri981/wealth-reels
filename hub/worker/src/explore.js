// WC Trading Hub – Entdecker (v3.6, Kevin 17.11.: „einfach Trades öffnen, wenn ihm etwas auffällt, und daraus neue Strategien entwickeln“)
// Alle 5 Min. sucht der Hub nach AUFFÄLLIGKEITEN – und öffnet für jede sofort zwei Papier-Probetrades:
//   „mit“  = in Richtung der Auffälligkeit,  „gegen“ = dagegen (Ausbrüche laufen weiter ODER drehen – beides wird gemessen).
// Einheitliche Regeln: Stopp = 6 × durchschnittliche 5-Min.-Spanne (24 Std.), Ziel = 1,5 × Stopp, spätestens nach 12 Std. raus, Kosten 0,05 R.
// Auffälligkeiten (je Markt höchstens 1× je 2 Std. pro Art):
//   of_schub   Orderflow-Schub: 5-Min.-Delta ≥ 30 % des Volumens bei ≥ 2× üblichem Volumen
//   of_div     Divergenz: Preis 1 Std. ≥ 0,3 % in eine Richtung, Delta in die andere
//   gross      Großorders: ≥ 3 Mio. $ (Krypto: BTC) bzw. Schwelle je Markt in einer 5-Min.-Kerze einseitig
//   buch       Orderbuch kippt: Ungleichgewicht ≥ 40 % (±0,5 % um den Kurs)
//   cme_spitze CME-Volumen der 5-Min.-Kerze ≥ 4× üblich zu dieser Uhrzeit (Gold/Silber)
//   profi_dreh Hyperliquid-Profis: Netto-Lage ändert sich in 1 Std. um ≥ 3 Konten
//   profi_eins ≥ 75 % der positionierten Profis auf einer Seite (mind. 4)
//   bruch      Kurs bricht das 24-Std.-Hoch/-Tief
//   vipzone    Gold erreicht eine aktive VIP-Zone (Richtung der Zone)
// Täglich prüft der „Musterfinder“ jede Kombination (Auffälligkeit × mit/gegen × Markt, und über alle Märkte):
//   ≥ 40 Probetrades, Ø > 0, t-Wert über der Mehrfachtest-Schwelle max(2, 0,6·√(2·ln K)) und in BEIDEN Zeithälften im Plus →
//   neue Papier-Strategie (Familie „expl“), die ab dann vorwärts mitläuft und auch vom Filter-Prüfer kreuzgeprüft wird.
//   Nach 40 Live-Trades mit Ø ≤ 0 → automatisch in Rente. Nur Papier, keine Anlageberatung.
const DAY = 86400, COSTR = 0.05, MAXH = 12 * 3600;
const SYMS = ["XAUUSD", "XAGUSD", "BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "DOGEUSD", "BNBUSD"];
const TK = (s) => (s === "XAUUSD" ? "5m" : `${s}:5m`);
const HLC = { BTCUSD: "BTC", ETHUSD: "ETH", SOLUSD: "SOL", XRPUSD: "XRP", DOGEUSD: "DOGE", BNBUSD: "BNB", XAUUSD: "xyz:GOLD", XAGUSD: "xyz:SILVER" };
const BIGMIN = { BTCUSD: 3e6, ETHUSD: 1.5e6, XAUUSD: 1e6, XAGUSD: 3e5 };
export const TRIG = { of_schub: "Orderflow-Schub", of_div: "Orderflow-Divergenz", gross: "Großorders", buch: "Orderbuch kippt", cme_spitze: "CME-Volumenspitze",
  profi_dreh: "Profis drehen", profi_eins: "Profis einig", bruch: "24-Std.-Bruch", vipzone: "VIP-Zone erreicht" };

async function schema(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_expl (id INTEGER PRIMARY KEY AUTOINCREMENT, sym TEXT, trig TEXT, mode TEXT, t INTEGER, dr INTEGER, e REAL, sl REAL, tp REAL, r REAL, closed INTEGER DEFAULT 0, tx INTEGER, why TEXT, f TEXT)").run();
}
function sim(C, i0, dr, e, sl, tp) {   // ab Kerze i0+1
  const R = Math.abs(e - sl);
  for (let i = i0 + 1; i < C.length; i++) { const k = C[i];
    if ((dr > 0 && k.l <= sl) || (dr < 0 && k.h >= sl)) return { r: -1 - COSTR, tx: k.t, why: "SL", closed: 1 };
    if ((dr > 0 && k.h >= tp) || (dr < 0 && k.l <= tp)) return { r: Math.abs(tp - e) / R - COSTR, tx: k.t, why: "Ziel", closed: 1 };
    if (k.t - C[i0].t >= MAXH) return { r: dr * (k.c - e) / R - COSTR, tx: k.t, why: "Zeit", closed: 1 }; }
  const L = C[C.length - 1]; return { r: dr * (L.c - e) / R - COSTR, tx: L.t, why: "offen", closed: 0 };
}
const tstat = (A) => { const n = A.length; if (n < 2) return 0; const m = A.reduce((a, x) => a + x, 0) / n; const sd = Math.sqrt(A.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1)) || 1e-9; return m / sd * Math.sqrt(n); };

async function triggers(env, sym, C, now) {
  const out = [], last = C[C.length - 1], c24 = C.filter((k) => k.t > last.t - DAY);
  // Orderflow (Binance bevorzugt)
  const src = (await env.DB.prepare("SELECT src FROM hub_oflow WHERE sym = ? AND (src LIKE 'bn:%' OR src LIKE 'gt:%') ORDER BY src LIKE 'bn:%' DESC LIMIT 1").bind(sym).first().catch(() => null))?.src;
  if (src) {
    const O = (await env.DB.prepare("SELECT t, px, delta, buy + sell v, imb, bigb, bigs FROM hub_oflow WHERE sym = ? AND src = ? AND t > ? ORDER BY t").bind(sym, src, now - DAY - 600).all()).results;
    if (O.length > 50) {
      const b = O[O.length - 1], avgV = O.slice(0, -1).reduce((a, r) => a + r.v, 0) / (O.length - 1);
      if (b.t >= now - 900) {
        const rel = b.v ? b.delta / b.v : 0;
        if (Math.abs(rel) >= 0.3 && b.v >= 2 * avgV) out.push(["of_schub", Math.sign(rel), { rel: +rel.toFixed(2), vx: +(b.v / avgV).toFixed(1) }]);
        const h = O.filter((r) => r.t > b.t - 3600), d = h.reduce((a, r) => a + r.delta, 0), v = h.reduce((a, r) => a + r.v, 0), p0 = h[0]?.px;
        if (p0 && v) { const chg = b.px / p0 - 1, rr = d / v; if (Math.abs(chg) >= 0.003 && Math.abs(rr) > 0.05 && Math.sign(chg) !== Math.sign(rr)) out.push(["of_div", Math.sign(rr), { chg: +(chg * 100).toFixed(2), rel: +rr.toFixed(2) }]); }
        const bg = (b.bigb || 0) - (b.bigs || 0), bmin = BIGMIN[sym] || 3e5; if (Math.abs(bg) >= bmin) out.push(["gross", Math.sign(bg), { net: Math.round(bg) }]);
        const im = [...O].reverse().find((r) => r.imb != null && r.t > now - 900)?.imb; if (im != null && Math.abs(im) >= 0.4) out.push(["buch", Math.sign(im), { imb: im }]);
      }
    }
  }
  // CME-Spitze (Gold/Silber), dieselbe Uhrzeit an den letzten 15 Tagen
  if (sym === "XAUUSD" || sym === "XAGUSD") {
    const b = await env.DB.prepare("SELECT t, vol, px FROM hub_cme WHERE sym = ? ORDER BY t DESC LIMIT 1").bind(sym).first().catch(() => null);
    if (b && b.t > now - 1800) {
      const S = (await env.DB.prepare("SELECT vol FROM hub_cme WHERE sym = ? AND t % 86400 = ? AND t < ? AND t > ?").bind(sym, b.t % DAY, b.t, b.t - 16 * DAY).all()).results;
      const avg = S.length >= 5 ? S.reduce((a, x) => a + x.vol, 0) / S.length : null;
      const prev = await env.DB.prepare("SELECT px FROM hub_cme WHERE sym = ? AND t = ?").bind(sym, b.t - 300).first().catch(() => null);
      if (avg && b.vol >= 4 * avg && prev?.px) out.push(["cme_spitze", Math.sign(b.px - prev.px) || 1, { vx: +(b.vol / avg).toFixed(1) }]);
    }
  }
  // Hyperliquid-Profis
  if (HLC[sym]) {
    const H = (await env.DB.prepare("SELECT t, long, short FROM hub_hl_cons WHERE coin = ? AND t > ? ORDER BY t").bind(HLC[sym], now - 3900).all().catch(() => ({ results: [] }))).results;
    if (H.length >= 2) { const a = H[0], z = H[H.length - 1]; const dn = (z.long - z.short) - (a.long - a.short);
      if (z.t > now - 900 && Math.abs(dn) >= 3) out.push(["profi_dreh", Math.sign(dn), { von: a.long - a.short, auf: z.long - z.short }]);
      const n = z.long + z.short; if (z.t > now - 900 && n >= 4 && Math.max(z.long, z.short) / n >= 0.75) out.push(["profi_eins", z.long > z.short ? 1 : -1, { long: z.long, short: z.short }]); }
  }
  // 24-Std.-Bruch
  if (c24.length > 200) { const prev = c24.slice(0, -1), hi = Math.max(...prev.map((k) => k.h)), lo = Math.min(...prev.map((k) => k.l));
    if (last.c > hi) out.push(["bruch", 1, { hi }]); else if (last.c < lo) out.push(["bruch", -1, { lo }]); }
  // VIP-Zone erreicht (Gold)
  if (sym === "XAUUSD") {
    const Z = (await env.DB.prepare("SELECT side, lo, hi FROM hub_vipzone WHERE done = 0 AND t > ?").bind(now - 2 * DAY).all().catch(() => ({ results: [] }))).results;
    for (const z of Z) if (last.h >= z.lo && last.l <= z.hi) { out.push(["vipzone", z.side, { lo: z.lo, hi: z.hi }]); break; }
  }
  return out;
}

export async function exTick(env, say, kvGet, kvPut) {
  await schema(env);
  const now = Math.floor(Date.now() / 1000); let opened = 0, closed = 0;
  for (const sym of SYMS) {
    const C = (await env.DB.prepare("SELECT t, o, h, l, c FROM hub_candles WHERE tf = ? AND t > ? ORDER BY t").bind(TK(sym), now - 2 * DAY).all()).results;
    if (C.length < 300 || C[C.length - 1].t < now - 1800) continue;   // Markt zu / keine frischen Kerzen
    // offene Probetrades weiterführen
    const OP = (await env.DB.prepare("SELECT id, t, dr, e, sl, tp FROM hub_expl WHERE sym = ? AND closed = 0").bind(sym).all()).results;
    for (const x of OP) { const i0 = C.findIndex((k) => k.t >= x.t); if (i0 < 0) continue; const r = sim(C, i0, x.dr, x.e, x.sl, x.tp);
      await env.DB.prepare("UPDATE hub_expl SET r = ?, tx = ?, why = ?, closed = ? WHERE id = ?").bind(r.r, r.tx, r.why, r.closed, x.id).run(); if (r.closed) closed++; }
    // neue Auffälligkeiten
    let T = []; try { T = await triggers(env, sym, C, now); } catch (e) { console.log("Entdecker", sym, e.message); }
    if (!T.length) continue;
    const last = C[C.length - 1], c24 = C.filter((k) => k.t > last.t - DAY), U = c24.reduce((a, k) => a + (k.h - k.l), 0) / c24.length; if (!(U > 0)) continue;
    for (const [trig, dir, f] of T) {
      const dup = await env.DB.prepare("SELECT 1 FROM hub_expl WHERE sym = ? AND trig = ? AND t > ? LIMIT 1").bind(sym, trig, now - 7200).first(); if (dup) continue;
      for (const mode of ["mit", "gegen"]) { const dr = mode === "mit" ? dir : -dir, e = last.c, sl = e - dr * 6 * U, tp = e + dr * 9 * U;
        await env.DB.prepare("INSERT INTO hub_expl (sym, trig, mode, t, dr, e, sl, tp, f) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(sym, trig, mode, last.t, dr, e, sl, tp, JSON.stringify(f)).run(); opened++; }
    }
  }
  // gefundene Muster (Familie „expl“) mit ihren neuen Probetrades füllen – damit laufen sie wie jede Strategie (Statistik, Filter-Prüfer)
  const X = (await env.DB.prepare("SELECT id, params, created FROM hub_strats WHERE family = 'expl' AND status IN ('paper', 'approved')").all()).results;
  for (const s of X) { const p = JSON.parse(s.params || "{}"), born = Math.floor(Date.parse(s.created + "T00:00:00Z") / 1000) + DAY;
    const R = (await env.DB.prepare(`SELECT t, dr, e, sl, tp, r, why, tx, closed, sym FROM hub_expl WHERE trig = ? AND mode = ? AND t >= ? ${p.sym ? "AND sym = ?" : ""}`).bind(...[p.trig, p.mode, born, ...(p.sym ? [p.sym] : [])]).all()).results;
    const st = R.map((x) => env.DB.prepare("INSERT INTO hub_trades (sid, t, dr, e, sl, tp, r, why, tx, closed, pf, sym) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?) ON CONFLICT(sid, t) DO UPDATE SET r = excluded.r, why = excluded.why, tx = excluded.tx, closed = excluded.closed")
      .bind(s.id, x.t, x.dr, x.e, x.sl, x.tp, x.r ?? 0, x.why || "offen", x.tx, x.closed, x.sym));
    for (let i = 0; i < st.length; i += 100) await env.DB.batch(st.slice(i, i + 100)); }

  // täglicher Musterfinder (nachts 4 Uhr Bukarest)
  const d = new Date(), day = d.toISOString().slice(0, 10), loc = (d.getUTCHours() + 2) % 24;
  let found = 0, retired = 0;
  if (loc === 4 && (await kvGet(env, "ex_day")) !== day) {
    await kvPut(env, "ex_day", day);
    const A = (await env.DB.prepare("SELECT sym, trig, mode, t, r FROM hub_expl WHERE closed = 1 AND t > ? ORDER BY t").bind(now - 180 * DAY).all()).results;
    const G = {}; for (const x of A) { for (const k of [`${x.trig}|${x.mode}|${x.sym}`, `${x.trig}|${x.mode}|*`]) (G[k] ||= []).push(x); }
    const K = Object.keys(G).length, thr = Math.max(2, 0.6 * Math.sqrt(2 * Math.log(Math.max(K, 2))));
    const M = [];
    for (const [k, L] of Object.entries(G)) {
      const n = L.length, m = L.reduce((a, x) => a + x.r, 0) / n, ts = tstat(L.map((x) => x.r)), half = L[Math.floor(n / 2)]?.t;
      const m1 = L.filter((x) => x.t < half), m2 = L.filter((x) => x.t >= half), mm = (B) => B.length ? B.reduce((a, x) => a + x.r, 0) / B.length : 0;
      M.push({ k, n, m: +m.toFixed(3), t: +ts.toFixed(2) });
      const multi = k.endsWith("|*") ? Object.values(L.reduce((a, x) => ((a[x.sym] = (a[x.sym] || 0) + 1), a), {})).filter((c) => c >= 10).length >= 2 : true;   // „alle Märkte“ nur, wenn wirklich mehrere Märkte beitragen
      if (multi && n >= 40 && m > 0 && ts >= thr && mm(m1) > 0 && mm(m2) > 0) {
        const [trig, mode, sym] = k.split("|"), id = `expl:${trig}:${mode}:${sym === "*" ? "alle" : sym}`;
        const nm = `Entdeckt: ${TRIG[trig] || trig} → ${mode === "mit" ? "mitgehen" : "dagegen"} (${sym === "*" ? "alle Märkte" : sym})`;
        const ins = await env.DB.prepare("INSERT OR IGNORE INTO hub_strats (id, name, family, params, status, backtest, live, created) VALUES (?, ?, 'expl', ?, 'paper', ?, '{}', ?)")
          .bind(id, nm, JSON.stringify({ trig, mode, sym: sym === "*" ? null : sym }), JSON.stringify({ n, mean: m, t: ts, schwelle: thr, quelle: "Entdecker (Probetrades)" }), day).run();
        if (ins.meta?.changes) { found++;
          await say(env, `🔍 Entdecker: neues Muster gefunden!\n„${nm}“\n${n} Probetrades, Ø ${m >= 0 ? "+" : ""}${m.toFixed(2)} R, t-Wert ${ts.toFixed(1)} (Schwelle ${thr.toFixed(1)} bei ${K} geprüften Mustern), in beiden Zeithälften im Plus.\nLäuft ab morgen als Papier-Strategie mit.`).catch(() => {}); }
      }
    }
    await kvPut(env, "ex_matrix", JSON.stringify({ t: now, K, thr, M: M.sort((a, b) => b.t - a.t).slice(0, 40) }));
    // gefundene Muster live bewerten → Rente
    for (const s of X) { const L = (await env.DB.prepare("SELECT r FROM hub_trades WHERE sid = ? AND closed = 1").bind(s.id).all()).results;
      if (L.length >= 40 && L.reduce((a, x) => a + x.r, 0) / L.length <= 0) { await env.DB.prepare("UPDATE hub_strats SET status = 'retired' WHERE id = ?").bind(s.id).run(); retired++;
        await say(env, `🗄️ Entdecker-Muster in Rente: ${s.id} – live nach ${L.length} Trades kein Plus.`).catch(() => {}); } }
    // sonntags: Rangliste der Auffälligkeiten
    if (d.getUTCDay() === 0) { const top = M.filter((x) => x.n >= 15).slice(0, 5).map((x) => { const [tr, mo, sy] = x.k.split("|"); return `• ${TRIG[tr] || tr} ${mo === "mit" ? "mitgehen" : "dagegen"} (${sy === "*" ? "alle" : sy}): Ø ${x.m >= 0 ? "+" : ""}${x.m.toFixed(2)} R, ${x.n} Trades, t ${x.t}`; });
      const tot = await env.DB.prepare("SELECT COUNT(*) n FROM hub_expl").first();
      await say(env, `🔍 Entdecker – Wochenstand\n${tot?.n || 0} Probetrades bisher.\nAuffälligste Muster (noch nicht alle belastbar):\n${top.join("\n") || "noch zu wenig Daten"}\nNur Papier, keine Anlageberatung.`).catch(() => {}); }
  }
  await env.DB.prepare("DELETE FROM hub_expl WHERE t < ?").bind(now - 365 * DAY).run();
  return `Entdecker: ${opened} Probetrades geöffnet, ${closed} geschlossen${found ? `, ${found} neue Muster` : ""}${retired ? `, ${retired} in Rente` : ""}`;
}
