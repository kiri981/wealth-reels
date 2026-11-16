// WC Trading Hub – Meme-Lernschleife (v2.7)
// 1) Mitschreiben: Für jeden Meme-Kandidaten werden beim ersten Sehen („seen“) und beim ersten Heiß-Wert ≥ 50 („hot“) alle Merkmale gespeichert.
//    Danach verfolgt der Radar den Kurs weiter (auch wenn der Coin aus den Listen fällt): „hot“ alle 5 Min., die übrigen etwa stündlich.
// 2) Jede Nacht (/mlearnrun): Was wurde 24 Std. später daraus? (Ziel: +100 % erreicht, bevor −35 % kamen)
//    · Merkmale: welche Eigenschaften trennen Gewinner von Verlierern – auf älteren Daten (70 %) gefunden, auf den neuesten 30 % bestätigt
//    · Heiß-Wert: ein gelerntes Modell (logistische Regression) ersetzt die festen Gewichte zu 60 %, aber NUR wenn es auf den neuesten Daten klar besser trennt
//    · Ein-/Ausstieg: 162 Regel-Varianten (Ziel, Stopp, Trailing, Haltedauer, Einstieg sofort/nach Rücksetzer) auf den echten Kursverläufen;
//      übernommen wird nur, was auf älteren UND neuesten Daten besser ist, mit Nachbar-Prüfung (kein Zufallstreffer). Rücksetzer-Einstieg wird nur gemeldet.
// Alles Papier – die Lernschleife ändert nur Bewertung und Papier-Regeln, nie echtes Geld.

export const ML = { minEv: 200, minPos: 15, minTrades: 40, blend: 0.6, gainAuc: 0.03, gainExit: 0.03, days: 30 };
const L10 = (v) => (v == null || !(v > 0) ? null : Math.log10(v));

export async function mlSchema(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_meme_feat (id TEXT, kind TEXT, t INTEGER, px REAL, liq REAL, f TEXT, PRIMARY KEY (id, kind))").run();
}

// ---------------------------------------------------------------- Merkmale
export const FN = ["lv1h", "lliq", "lmc", "mcliq", "age", "buy", "acc5", "acc1h", "turn", "c5", "c1h", "c6h", "c24", "ltx", "boost", "soc", "pump", "grad", "trend", "neu", "prof", "sec", "sol"];
export function feats(x, m, sec) {
  const src = (x.src || []).join(",");
  return {
    lv1h: L10((x.v1h || 0) + 1), lliq: L10(x.liq), lmc: L10(x.mc), mcliq: x.mc && x.liq ? Math.min(100, x.mc / x.liq) : null,
    age: m.age == null ? null : Math.min(72, m.age), buy: m.buyPct, acc5: m.acc5 == null ? null : Math.min(6, m.acc5), acc1h: m.acc1h == null ? null : Math.min(6, m.acc1h),
    turn: m.turn == null ? null : Math.min(10, m.turn), c5: x.c5 == null ? null : Math.max(-50, Math.min(100, x.c5)), c1h: x.c1h == null ? null : Math.max(-80, Math.min(400, x.c1h)),
    c6h: x.c6h == null ? null : Math.max(-90, Math.min(1000, x.c6h)), c24: x.c24 == null ? null : Math.max(-95, Math.min(3000, x.c24)),
    ltx: L10((x.b1h || 0) + (x.s1h || 0) + 1), boost: x.boost ? 1 : 0, soc: x.socials == null ? null : Math.min(5, x.socials),
    pump: /Pump/.test(src) || (x.chain === "solana" && /pump$/.test(x.token || "")) ? 1 : 0, grad: /Pump\.fun abgeschlossen/.test(src) ? 1 : 0,
    trend: /Trend/.test(src) ? 1 : 0, neu: /Neu/.test(src) ? 1 : 0, prof: /Profil|Boost/.test(src) ? 1 : 0,
    sec: !sec ? null : sec.level === "ok" ? 0 : sec.level === "warn" ? 1 : sec.level === "danger" ? 2 : null, sol: x.chain === "solana" ? 1 : 0,
    score0: m.score,
  };
}
const FLABEL = { lv1h: "Volumen 1 Std.", lliq: "Liquidität", lmc: "Marktwert", mcliq: "Marktwert/Liquidität", age: "Alter", buy: "Kaufdruck 1 Std.", acc5: "Volumen-Beschleunigung 5 Min.",
  acc1h: "Volumen-Beschleunigung 1 Std.", turn: "Umschlag der Liquidität", c5: "Preis 5 Min.", c1h: "Preis 1 Std.", c6h: "Preis 6 Std.", c24: "Preis 24 Std.", ltx: "Anzahl Trades",
  boost: "DexScreener-Boost (bezahlt)", soc: "Socials/Webseite", pump: "Pump.fun-Start", grad: "Pump.fun-Kurve abgeschlossen", trend: "in Trend-Listen", neu: "in Neu-Listen",
  prof: "DexScreener-Profil", sec: "Sicherheitsstufe (höher = schlechter)", sol: "Solana", score0: "fester Heiß-Wert" };

// ---------------------------------------------------------------- gelerntes Modell anwenden (im 5-Min.-Lauf)
let MCACHE = null;
export async function loadModel(env) {
  if (MCACHE && Date.now() - MCACHE.at < 600e3) return MCACHE.m;
  let m = null; try { const r = await env.DB.prepare("SELECT v FROM hub_kv WHERE k = 'meme_model'").first(); m = r?.v ? JSON.parse(r.v) : null; } catch (e) {}
  MCACHE = { at: Date.now(), m: m && m.active ? m : null }; return MCACHE.m;
}
const sig = (z) => 1 / (1 + Math.exp(-z));
function predict(M, f) { let z = M.b; FN.forEach((k, i) => { const v = f[k] == null ? M.mu[i] : f[k]; z += M.w[i] * ((v - M.mu[i]) / M.sd[i]); }); return sig(z); }
function qmap(xs, ys, v) { if (v <= xs[0]) return ys[0]; for (let i = 1; i < xs.length; i++) if (v <= xs[i]) { const a = (v - xs[i - 1]) / (xs[i] - xs[i - 1] || 1); return ys[i - 1] + a * (ys[i] - ys[i - 1]); } return ys[ys.length - 1]; }
export function learnedScore(M, f, base) {   // → neuer Heiß-Wert (gemischt), gleiche Skala wie der feste
  if (!M) return base;
  const s = qmap(M.qx, M.qy, predict(M, f));
  return Math.round((1 - M.blend) * base + M.blend * s);
}

// ---------------------------------------------------------------- Ergebnis eines Ereignisses
function outcome(ev, S) {   // S: Schnappschüsse [{t,px,liq}] aufsteigend ab Ereignis
  const P = S.filter((s) => s.t > ev.t && s.t <= ev.t + 86400 + 600);
  if (P.length < 3) return null;
  const e = P[0]; if (!(e.px > 0)) return null;
  const end = P[P.length - 1]; let mx = 0, mn = 0, y = 0, dead = false;
  for (const s of P) {
    if (!(s.px > 0)) continue;   // kein Kurs in diesem Schnappschuss (z. B. Pump.fun-Umzug) – überspringen
    if (s.px <= e.px * 0.1 || (s.liq != null && s.liq < 1000 && s.px < e.px * 0.5)) { dead = true; mn = -1; break; }
    const ch = s.px / e.px - 1; mx = Math.max(mx, ch); mn = Math.min(mn, ch);
    if (!y && ch <= -0.35) y = -1; if (!y && ch >= 1) y = 1;
  }
  if (!dead && end.t < ev.t + 18 * 3600) return null;   // zu früh aus dem Blick verloren → nicht werten
  return { e: e.px, t0: e.t, path: P, mx, mn, y2x: y === 1 ? 1 : 0, dead };
}

// ---------------------------------------------------------------- Papier-Regeln nachspielen (wie mpaper.js)
export function simExit(path, t0, p, cost = 0.03) {   // p: {tp, sl, trail, maxH, dip}; → Rendite je Einsatz (−1 … ) oder null (kein Einstieg)
  let i = path.findIndex((s) => s.t >= t0); if (i < 0) return null;
  let e = path[i].px;
  if (p.dip) { const lim = e * (1 - p.dip), until = path[i].t + 7200; let j = i + 1; while (j < path.length && path[j].t <= until && !(path[j].px > 0 && path[j].px <= lim)) j++; if (j >= path.length || path[j].t > until) return null; i = j; e = path[j].px; }
  const buy = e * (1 + cost); let qty = 1 / buy, cash = 0, half = false, peak = e; const tEnd = path[i].t + p.maxH * 3600;
  for (let k = i + 1; k < path.length; k++) {
    const s = path[k];
    if (!(s.px > 0)) continue;
    if (s.liq != null && s.liq < 1000 && s.px < e * 0.5) return cash - 1;   // Rug: Rest wertlos
    const px = s.px; peak = Math.max(peak, px);
    if (!half && px / e - 1 >= p.tp) { cash += (qty / 2) * px * (1 - cost); qty /= 2; half = true; }
    const stop = half ? Math.max(e, peak * (1 - p.trail)) : e * (1 + p.sl);
    if (px <= stop || s.t >= tEnd) return cash + qty * px * (1 - cost) - 1;
  }
  const last = path[path.length - 1]; return cash + qty * last.px * (1 - cost) - 1;
}

// ---------------------------------------------------------------- Statistik-Helfer
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
function rank(a) { const o = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = Array(a.length); for (let i = 0; i < o.length; ) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2; i = j + 1; } return r; }
function spear(x, y) { const I = x.map((v, i) => i).filter((i) => x[i] != null && y[i] != null); if (I.length < 30) return null; const a = rank(I.map((i) => x[i])), b = rank(I.map((i) => y[i])), ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return da && db ? n / Math.sqrt(da * db) : 0; }
function auc(p, y) { const pos = [], neg = []; p.forEach((v, i) => (y[i] ? pos : neg).push(v)); if (!pos.length || !neg.length) return null; const r = rank(p); const sp = pos.length ? p.map((v, i) => (y[i] ? r[i] + 1 : 0)).reduce((s, x) => s + x, 0) : 0; return (sp - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length); }
function fitLogit(X, y, lam = 1, it = 400, lr = 0.3) {   // X standardisiert
  const n = X.length, d = X[0].length, w = Array(d).fill(0); let b = Math.log((mean(y) + 1e-3) / (1 - mean(y) + 1e-3));
  for (let t = 0; t < it; t++) {
    const g = Array(d).fill(0); let gb = 0;
    for (let i = 0; i < n; i++) { let z = b; for (let j = 0; j < d; j++) z += w[j] * X[i][j]; const e = sig(z) - y[i]; gb += e; for (let j = 0; j < d; j++) g[j] += e * X[i][j]; }
    b -= (lr * gb) / n; for (let j = 0; j < d; j++) w[j] -= lr * (g[j] / n + lam * w[j]);
  }
  return { w, b };
}
const quant = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]; };

// ---------------------------------------------------------------- Nachtlauf
export async function memeLearn(env, say, kvGet, kvPut, MPcur) {
  await mlSchema(env);
  const now = Math.floor(Date.now() / 1000), from = now - ML.days * 86400;
  const E = (await env.DB.prepare("SELECT f.id, f.kind, f.t, f.px, f.liq, f.f FROM hub_meme_feat f WHERE f.t > ? AND f.t < ? ORDER BY f.t LIMIT 6000").bind(from, now - 86400).all()).results;
  const ids = [...new Set(E.map((e) => e.id))], S = {};
  for (let i = 0; i < ids.length; i += 90) {
    const R = (await env.DB.prepare(`SELECT id, t, px, liq FROM hub_meme_snap WHERE id IN (${ids.slice(i, i + 90).map(() => "?").join(",")}) AND t > ? ORDER BY t`).bind(...ids.slice(i, i + 90), from).all()).results;
    for (const r of R) (S[r.id] ||= []).push(r);
  }
  const EV = [];
  for (const e of E) { const o = outcome(e, S[e.id] || []); if (o) EV.push({ ...e, f: JSON.parse(e.f), o }); }
  const rep = { t: now, events: E.length, rated: EV.length, wins: EV.filter((x) => x.o.y2x).length, dead: EV.filter((x) => x.o.dead).length, feats: [], model: null, exit: null, notes: [] };

  // --- Merkmale: Rangkorrelation mit „+100 % vor −35 %“ auf alt (70 %) und neu (30 %)
  const cut = Math.floor(EV.length * 0.7), DEV = EV.slice(0, cut), HO = EV.slice(cut);
  if (EV.length >= 80) {
    for (const k of [...FN, "score0"]) {
      const a = spear(DEV.map((x) => x.f[k]), DEV.map((x) => x.o.y2x)), b = spear(HO.map((x) => x.f[k]), HO.map((x) => x.o.y2x));
      if (a == null || b == null) continue;
      // Gewinnquote im oberen vs. unteren Drittel des Merkmals (alle Daten)
      const V = EV.filter((x) => x.f[k] != null).sort((p, q) => p.f[k] - q.f[k]), n3 = Math.floor(V.length / 3);
      const lo = mean(V.slice(0, n3).map((x) => x.o.y2x)), hi = mean(V.slice(-n3).map((x) => x.o.y2x));
      rep.feats.push({ k, name: FLABEL[k] || k, dev: +a.toFixed(3), ho: +b.toFixed(3), stable: Math.sign(a) === Math.sign(b) && Math.abs(a) * Math.sqrt(DEV.length - 1) >= 2 && Math.abs(b) * Math.sqrt(HO.length - 1) >= 2, lo: lo == null ? null : +lo.toFixed(3), hi: hi == null ? null : +hi.toFixed(3) });
    }
    rep.feats.sort((p, q) => (q.stable - p.stable) || Math.abs(q.dev + q.ho) - Math.abs(p.dev + p.ho));
  } else rep.notes.push(`Merkmale: erst ${EV.length} ausgewertete Fälle (ab 80 werden Muster berechnet).`);

  // --- Heiß-Wert-Modell
  const oldM = await env.DB.prepare("SELECT v FROM hub_kv WHERE k = 'meme_model'").first().then((r) => (r?.v ? JSON.parse(r.v) : null)).catch(() => null);
  const pos = EV.filter((x) => x.o.y2x).length;
  if (EV.length >= ML.minEv && pos >= ML.minPos && HO.filter((x) => x.o.y2x).length >= 5) {
    const mu = FN.map((k) => mean(DEV.map((x) => x.f[k]).filter((v) => v != null)) ?? 0);
    const sd = FN.map((k, j) => { const v = DEV.map((x) => x.f[k]).filter((v) => v != null); const m = mu[j]; return Math.sqrt(mean(v.map((z) => (z - m) ** 2)) || 1) || 1; });
    const Z = (L) => L.map((x) => FN.map((k, j) => ((x.f[k] == null ? mu[j] : x.f[k]) - mu[j]) / sd[j]));
    const fit = fitLogit(Z(DEV), DEV.map((x) => x.o.y2x), 0.05);   // kräftige Dämpfung: Zufallsmuster sollen kein Gewicht bekommen
    const M = { w: fit.w, b: fit.b, mu, sd };
    const pDev = DEV.map((x) => predict(M, x.f)), pHo = HO.map((x) => predict(M, x.f));
    const aM = auc(pHo, HO.map((x) => x.o.y2x)), aS = auc(HO.map((x) => x.f.score0 ?? 0), HO.map((x) => x.o.y2x));
    const top = (p, L) => { const th = quant(p, 0.8); const T = L.filter((x, i) => p[i] >= th); return mean(T.map((x) => x.o.y2x)); };
    const tM = top(pHo, HO), tS = top(HO.map((x) => x.f.score0 ?? 0), HO);
    const qs = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1];
    const sDev = DEV.map((x) => x.f.score0 ?? 0);
    Object.assign(M, { qx: qs.map((q) => quant(pDev, q)), qy: qs.map((q) => quant(sDev, q)), blend: ML.blend, t: now, n: EV.length, aucModel: aM, aucScore: aS, topModel: tM, topScore: tS });
    M.active = aM != null && aS != null && aM - aS >= ML.gainAuc && (tM ?? 0) >= (tS ?? 0);
    M.top = FN.map((k, i) => [FLABEL[k] || k, +M.w[i].toFixed(2)]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6);
    rep.model = { active: M.active, aucModel: aM, aucScore: aS, topModel: tM, topScore: tS, top: M.top, was: !!oldM?.active };
    await kvPut(env, "meme_model", JSON.stringify(M));
  } else rep.notes.push(`Heiß-Wert-Modell: braucht ${ML.minEv} ausgewertete Fälle mit ${ML.minPos} Gewinnern (jetzt ${EV.length} / ${pos}).`);

  // --- Ein-/Ausstieg: Raster auf den „hot“-Ereignissen mit genug Liquidität
  const H = EV.filter((x) => x.kind === "hot" && (x.liq || 0) >= 20000);
  if (H.length >= ML.minTrades) {
    const G = []; const TP = [0.2, 0.3, 0.5, 1, 2], SL = [-0.15, -0.2, -0.35, -0.5], TR = [0.15, 0.25, 0.4, 0.6], MH = [1, 3, 6, 12, 24], DP = [0, 0.15];   // v2.8: auch schnelles Rein-und-raus testen
    for (const tp of TP) for (const sl of SL) for (const trail of TR) for (const maxH of MH) for (const dip of DP) G.push({ tp, sl, trail, maxH, dip });
    const cutH = Math.floor(H.length * 0.7), hD = H.slice(0, cutH), hH = H.slice(cutH);
    const ev = (p, L) => { const r = L.map((x) => simExit(x.o.path, x.o.t0, p)).filter((v) => v != null); return { m: mean(r), n: r.length, win: r.length ? r.filter((v) => v > 0).length / r.length : null }; };
    const cur = { tp: MPcur.tp, sl: MPcur.sl, trail: MPcur.trail, maxH: MPcur.maxH, dip: 0 };
    const cD = ev(cur, hD), cH = ev(cur, hH);
    const R = G.map((p) => ({ p, d: ev(p, hD) })).filter((x) => x.d.n >= Math.max(20, cutH * 0.3)).sort((a, b) => b.d.m - a.d.m);
    const idx = (arr, v) => arr.indexOf(v);
    const nb = (p) => G.filter((q) => q.dip === p.dip && [["tp", TP], ["sl", SL], ["trail", TR], ["maxH", MH]].filter(([k, A]) => q[k] !== p[k]).length === 1 && [["tp", TP], ["sl", SL], ["trail", TR], ["maxH", MH]].every(([k, A]) => Math.abs(idx(A, q[k]) - idx(A, p[k])) <= 1));
    let pick = null;
    for (const c of R.slice(0, 12)) {
      const nm = mean(nb(c.p).map((q) => ev(q, hD).m).filter((v) => v != null));
      if (nm == null || nm <= cD.m) continue;   // Nachbarn müssen auch besser sein als die jetzigen Regeln
      const h = ev(c.p, hH); if (h.n < 12) continue;
      pick = { ...c, h, nm }; break;
    }
    const oldE = await env.DB.prepare("SELECT v FROM hub_kv WHERE k = 'meme_exit'").first().then((r) => (r?.v ? JSON.parse(r.v) : null)).catch(() => null);
    const adopt = pick && !pick.p.dip && pick.d.m - cD.m >= ML.gainExit && pick.h.m - cH.m >= ML.gainExit && H.length >= ML.minTrades;
    rep.exit = { n: H.length, cur: { ...cur, dev: cD, ho: cH }, best: pick ? { ...pick.p, dev: pick.d, ho: pick.h } : null, adopt: !!adopt, dipBetter: !!(pick && pick.p.dip && pick.h.m - cH.m >= ML.gainExit) };
    if (adopt) await kvPut(env, "meme_exit", JSON.stringify({ tp: pick.p.tp, sl: pick.p.sl, trail: pick.p.trail, maxH: pick.p.maxH, t: now, dev: pick.d.m, ho: pick.h.m, curDev: cD.m, curHo: cH.m, prev: oldE }));
  } else rep.notes.push(`Ein-/Ausstieg: braucht ${ML.minTrades} heiße Fälle mit ≥ 20k $ Liquidität und 24-Std.-Verlauf (jetzt ${H.length}).`);

  await kvPut(env, "meme_learn", JSON.stringify(rep));
  // Bericht an Kevin: wenn sich etwas ändert, sonst sonntags
  const P = (v) => (v == null ? "–" : (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + " %");
  const changed = (rep.model && rep.model.active !== rep.model.was) || rep.exit?.adopt;
  if (changed || new Date().getUTCDay() === 0) {
    const st = rep.feats.filter((f) => f.stable).slice(0, 4).map((f) => `${f.name}: ${f.dev > 0 ? "mehr = besser" : "mehr = schlechter"} (oberes Drittel ${Math.round((f.hi ?? 0) * 100)} % vs. unteres ${Math.round((f.lo ?? 0) * 100)} % Treffer)`);
    await say(env, `🧠 Meme-Lernschleife: ${rep.rated} Coins ausgewertet (${rep.wins} × +100 % vor −35 %, ${rep.dead} Rugs)\n` +
      (st.length ? "Bestätigte Muster:\n· " + st.join("\n· ") + "\n" : "Noch keine bestätigten Muster.\n") +
      (rep.model ? `Heiß-Wert-Modell: ${rep.model.active ? "AKTIV" : "nicht besser – feste Formel bleibt"} (Trennschärfe neu ${rep.model.aucModel?.toFixed(2)} vs. fest ${rep.model.aucScore?.toFixed(2)})\n` : "") +
      (rep.exit?.adopt ? `Neue Papier-Regeln: Hälfte bei ${P(rep.exit.best.tp)}, Stopp ${P(rep.exit.best.sl)}, Trailing ${Math.round(rep.exit.best.trail * 100)} %, max. ${rep.exit.best.maxH} Std. (Ø ${P(rep.exit.best.ho.m)} statt ${P(rep.exit.cur.ho.m)} je Trade auf neuesten Daten)\n` : rep.exit ? `Papier-Regeln bleiben (Ø je Trade ${P(rep.exit.cur.ho.m)}).${rep.exit.dipBetter ? " Auffällig: Einstieg nach −15 %-Rücksetzer wäre besser." : ""}\n` : "") +
      rep.notes.join("\n") + "\nAlles Papier – keine Anlageberatung.");
  }
  return `Meme-Lernen: ${rep.rated}/${rep.events} ausgewertet, Modell ${rep.model ? (rep.model.active ? "aktiv" : "inaktiv") : "–"}, Ausstieg ${rep.exit ? (rep.exit.adopt ? "neu" : "unverändert") : "–"}`;
}

// ---------------------------------------------------------------- Bericht-Seite
export async function mlPage(env) {
  const r = await env.DB.prepare("SELECT v FROM hub_kv WHERE k = 'meme_learn'").first().catch(() => null);
  const R = r?.v ? JSON.parse(r.v) : null;
  const ex = await env.DB.prepare("SELECT v FROM hub_kv WHERE k = 'meme_exit'").first().then((x) => (x?.v ? JSON.parse(x.v) : null)).catch(() => null);
  const n = await env.DB.prepare("SELECT kind, COUNT(*) n FROM hub_meme_feat GROUP BY kind").all().then((x) => x.results).catch(() => []);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const P = (v) => (v == null ? "–" : (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + " %");
  return `<!doctype html><html lang=de><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Meme-Lernen · WC Hub</title><style>
body{margin:0;background:#0b0b0d;color:#e8e8ea;font:14px/1.5 system-ui,sans-serif;padding:16px;max-width:1000px;margin:auto}h1{color:#e8b54a;font-size:20px}h2{font-size:15px;margin:18px 0 6px}
.c{background:#141418;border:1px solid #26262c;border-radius:12px;padding:14px;margin:10px 0;overflow-x:auto}.mu{color:#9a9aa3;font-size:12.5px}table{border-collapse:collapse;width:100%;font-size:13px}td,th{padding:5px 8px;border-bottom:1px solid #26262c;text-align:right}td:first-child,th:first-child{text-align:left}th{color:#9a9aa3;font-weight:500}.pos{color:#3ecf8e}.neg{color:#ff6b6b}</style></head><body>
<h1>🧠 Meme-Lernschleife</h1><div class=mu>Gesammelt: ${n.map((x) => x.n + " × " + (x.kind === "hot" ? "heiß (≥ 50)" : "gesehen")).join(" · ") || "noch nichts"} · Letzte Auswertung: ${R ? new Date(R.t * 1000).toLocaleString("de-DE", { timeZone: "Europe/Bucharest" }) : "noch keine (läuft jede Nacht um 2:30 Uhr)"}</div>
${R ? `<div class=c>${R.rated} Coins mit 24-Std.-Verlauf ausgewertet · ${R.wins} erreichten +100 % vor −35 % (${R.rated ? Math.round((R.wins / R.rated) * 100) : 0} %) · ${R.dead} Rugs${R.notes.length ? "<p class=mu>" + R.notes.map(esc).join("<br>") + "</p>" : ""}</div>
<h2>Merkmale – was trennt Gewinner von Verlierern?</h2><div class=c><table><tr><th>Merkmal</th><th>ältere Daten</th><th>neueste Daten</th><th>bestätigt</th><th>Treffer unteres Drittel</th><th>oberes Drittel</th></tr>
${R.feats.map((f) => `<tr><td>${esc(f.name)}</td><td class=${f.dev >= 0 ? "pos" : "neg"}>${f.dev}</td><td class=${f.ho >= 0 ? "pos" : "neg"}>${f.ho}</td><td>${f.stable ? "✅" : ""}</td><td>${f.lo == null ? "–" : Math.round(f.lo * 100) + " %"}</td><td>${f.hi == null ? "–" : Math.round(f.hi * 100) + " %"}</td></tr>`).join("") || "<tr><td colspan=6>noch zu wenig Daten</td></tr>"}</table>
<p class=mu>Zahl = Rangkorrelation mit „+100 % vor −35 %“. Bestätigt heißt: gleiche Richtung und spürbar auf älteren und auf den neuesten Daten.</p></div>
<h2>Heiß-Wert</h2><div class=c>${R.model ? `Gelerntes Modell ${R.model.active ? "<b class=pos>aktiv</b> (60 % gelernt, 40 % feste Formel)" : "<b>nicht aktiv</b> – auf den neuesten Daten nicht klar besser"} · Trennschärfe (AUC) neu ${R.model.aucModel?.toFixed(3)} vs. fest ${R.model.aucScore?.toFixed(3)} · Treffer im besten Fünftel ${P(R.model.topModel)} vs. ${P(R.model.topScore)}<br><span class=mu>Stärkste Gewichte: ${R.model.top.map((t) => esc(t[0]) + " " + (t[1] > 0 ? "+" : "") + t[1]).join(" · ")}</span>` : "noch zu wenig Daten"}</div>
<h2>Ein- und Ausstieg (Papier-Wallet)</h2><div class=c>${R.exit ? `Getestet auf ${R.exit.n} heißen Coins. Jetzige Regeln: Ø ${P(R.exit.cur.dev.m)} (ältere) / ${P(R.exit.cur.ho.m)} (neueste) je Trade.<br>${R.exit.best ? `Beste stabile Variante: Hälfte bei ${P(R.exit.best.tp)}, Stopp ${P(R.exit.best.sl)}, Trailing ${Math.round(R.exit.best.trail * 100)} %, max. ${R.exit.best.maxH} Std.${R.exit.best.dip ? ", Einstieg erst nach −15 %-Rücksetzer" : ""} → Ø ${P(R.exit.best.dev.m)} / ${P(R.exit.best.ho.m)}` : "Keine Variante schlägt die jetzigen Regeln stabil."} ${R.exit.adopt ? "<b class=pos>→ übernommen</b>" : ""}` : "noch zu wenig Daten"}
${ex ? `<p class=mu>Aktive gelernte Regeln seit ${new Date(ex.t * 1000).toLocaleDateString("de-DE")}: Hälfte bei ${P(ex.tp)}, Stopp ${P(ex.sl)}, Trailing ${Math.round(ex.trail * 100)} %, max. ${ex.maxH} Std.</p>` : ""}</div>` : ""}
<p class=mu>Alles Papier und Beobachtung – keine Anlageberatung. Die meisten Memecoins verlieren fast alles.</p></body></html>`;
}
