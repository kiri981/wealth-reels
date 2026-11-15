// WC Trading Hub – Lernschleife Altcoin-Scanner (v2.8)
// Jede Nacht: Der Scanner wird auf ~600 Tagen Tageskerzen der Top 100 nachgespielt (jeder Tag so, als wäre er „heute“ – ohne Blick in die Zukunft).
// Jeder „Ausbruch läuft“/„Bruch nach unten läuft“ wird mit den folgenden Tagen bewertet: Stop (1R) oder Ziel (kR) zuerst? (gleicher Tag: Stop zählt)
// Gelernt wird je Richtung (Long/Short): ab welcher Punktzahl und mit welchem Ziel (1–3R) es sich lohnt – auf älteren 70 % gefunden,
// auf den neuesten 30 % bestätigt (mind. 15 Fälle, Ø > +0,05R). Fällt eine Richtung durch, wird sie für Hinweise und Papierdepot pausiert.
// Zusätzlich: welche Merkmale (Spanne, Volumen, Stärke ggü. BTC, Volatilität …) Gewinner von Verlierern trennen.
// Hinweis: Nachgespielt wird nur mit Tageskerzen (4-Std.-Struktur gibt es nicht so weit zurück) – darum nutzt die Live-Prüfung dieselbe Tages-Punktzahl.
import { scan } from "./alts.js";

export const AL = { days: 600, minDev: 20, minHo: 15, minEdge: 0.05, scores: [45, 50, 55, 60, 65, 70, 75], ks: [1, 1.5, 2, 3], maxHold: 14, cost: 0.0012 };
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
function rank(a) { const o = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = Array(a.length); for (let i = 0; i < o.length; ) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2; i = j + 1; } return r; }
function spear(x, y) { const I = x.map((v, i) => i).filter((i) => x[i] != null && y[i] != null); if (I.length < 25) return null; const a = rank(I.map((i) => x[i])), b = rank(I.map((i) => y[i])), ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return da && db ? n / Math.sqrt(da * db) : 0; }

export function replay(D, btcD) {   // → Ereignisse [{t, dir, score, e, R, path:[{h,l,c}], f}]
  const out = []; let lastT = -1e12, bi = 0;
  for (let i = 80; i < D.length - 1; i++) {
    const t = D[i].t; while (bi < btcD.length && btcD[bi].t <= t) bi++;
    const B = btcD.slice(Math.max(0, bi - 230), bi);
    const s = scan(D.slice(Math.max(0, i - 229), i + 1), null, B.length > 60 ? B : null, {}); if (!s || !s.scen || !/läuft/.test(s.scen)) continue;   // wie live: 230 Tage Fenster
    if (t - lastT < 5 * 86400) continue; lastT = t;   // je Coin höchstens ein Fall pro 5 Tage (wie live)
    const dir = /unten|short/.test(s.scen) ? -1 : 1, e = D[i].c, R = Math.abs(e - s.stop); if (!(R > 0) || R / e > 0.4) continue;
    out.push({ t, dir, score: s.score, e, R, stop: s.stop, path: D.slice(i + 1, i + 1 + AL.maxHold).map((k) => ({ h: k.h, l: k.l, c: k.c })),
      f: { rng20: s.rng20, atrRel: s.atrRel, vx: s.vx, rs30: s.rs30, rs7: s.rs7, r7: s.r7, r30: s.r30, ext: dir * (e - s.lvl) / (s.atr || 1) } });
  }
  return out;
}
export function resR(ev, k) {   // Ergebnis in R bei Ziel kR (Stop zuerst, wenn beides am selben Tag; sonst Schluss nach maxHold)
  const { dir, e, R, stop, path } = ev, tgt = e + dir * k * R, c = (AL.cost * e) / R;
  for (const d of path) { if (dir > 0 ? d.l <= stop : d.h >= stop) return -1 - c; if (dir > 0 ? d.h >= tgt : d.l <= tgt) return k - c; }
  if (path.length < AL.maxHold) return null;   // noch nicht zu Ende
  return (dir * (path[path.length - 1].c - e)) / R - c;
}

export const PARTS = 4;
export async function altLearn(env, say, kvGet, kvPut, czMap, hist, part) {   // part 0…3: je ein Viertel der Coins nachspielen (Rechenzeit), part 4: lernen
  const now = Math.floor(Date.now() / 1000);
  if (part < PARTS) {
    const top = (await env.DB.prepare("SELECT sym FROM hub_alts ORDER BY rank LIMIT 100").all()).results.map((r) => r.sym);
    const map = await czMap(env, kvGet, kvPut); const all = top.filter((s) => map[s] && s !== "BTC"), per = Math.ceil(all.length / PARTS), mine = all.slice(part * per, (part + 1) * per);
    const Dd = await hist(env, "ohlcv-history", ["BTC", ...mine].filter((s) => map[s]).map((s) => map[s]), "daily", now - AL.days * 86400, now);
    const toC = (L) => (L || []).map((h) => ({ t: h.t, o: h.o, h: h.h, l: h.l, c: h.c, v: h.v })).filter((x) => x.c != null && x.t + 86400 <= now + 60);
    const btcD = toC(Dd[map.BTC]); const EV = [];
    for (const s of mine) { const D = toC(Dd[map[s]]); if (D.length < 120) continue; for (const ev of replay(D, btcD)) EV.push({ ...ev, sym: s }); }
    await kvPut(env, "alt_ev_" + part, JSON.stringify({ t: now, coins: mine.length, EV }));
    return `Altcoin-Lernen Teil ${part + 1}/${PARTS}: ${mine.length} Coins, ${EV.length} Fälle`;
  }
  let EV = [], ncoins = 0;
  for (let k = 0; k < PARTS; k++) { const v = await kvGet(env, "alt_ev_" + k); if (!v) continue; const o = JSON.parse(v); if (now - o.t > 6 * 3600) continue; EV = EV.concat(o.EV); ncoins += o.coins; }
  if (EV.length < 60) return "Altcoin-Lernen: zu wenige nachgespielte Fälle (" + EV.length + ")";
  const syms = { length: ncoins + 1 };
  EV.sort((a, b) => a.t - b.t);
  const cut = EV.length ? EV[Math.floor(EV.length * 0.7)].t : 0, DEV = EV.filter((x) => x.t < cut), HO = EV.filter((x) => x.t >= cut);
  const rep = { t: now, n: EV.length, coins: syms.length - 1, from: EV[0]?.t || null, cut, dirs: {}, feats: [] };
  const old = await kvGet(env, "alt_model").then((v) => (v ? JSON.parse(v) : null)).catch(() => null);
  const M = { t: now, dirs: {} };
  for (const dir of [1, -1]) {
    const name = dir > 0 ? "long" : "short";
    const st = (L, sc, k) => { const r = L.filter((x) => x.dir === dir && x.score >= sc).map((x) => resR(x, k)).filter((v) => v != null); return { n: r.length, m: mean(r), win: r.length ? r.filter((v) => v > 0).length / r.length : null }; };
    const base = { dev: st(DEV, 60, 2), ho: st(HO, 60, 2) };   // bisherige Regel ≈ Punktzahl ≥ 60, Ziel ≈ 2R
    const G = [];
    for (const sc of AL.scores) for (const k of AL.ks) { const d = st(DEV, sc, k); if (d.n >= AL.minDev) G.push({ sc, k, d }); }
    G.sort((a, b) => b.d.m - a.d.m);
    let pick = null;
    for (const g of G.slice(0, 8)) {   // Nachbarn (nächste Punktzahl/nächstes Ziel) müssen auch positiv sein → kein Zufallstreffer
      const nb = G.filter((q) => (q.sc === g.sc && Math.abs(AL.ks.indexOf(q.k) - AL.ks.indexOf(g.k)) === 1) || (q.k === g.k && Math.abs(AL.scores.indexOf(q.sc) - AL.scores.indexOf(g.sc)) === 1));
      if (!nb.length || mean(nb.map((q) => q.d.m)) <= 0) continue;
      const h = st(HO, g.sc, g.k); if (h.n < AL.minHo) continue;
      pick = { ...g, h }; break;
    }
    const ok = !!(pick && pick.d.m > AL.minEdge && pick.h.m > AL.minEdge);
    const enough = base.dev.n >= AL.minDev && base.ho.n >= AL.minHo;   // erst urteilen, wenn genug Fälle da sind – sonst bleibt die feste Regel
    if (ok) M.dirs[name] = { on: true, minScore: pick.sc, k: pick.k }; else if (enough) M.dirs[name] = { on: false };
    rep.dirs[name] = { base, pick: pick ? { sc: pick.sc, k: pick.k, dev: pick.d, ho: pick.h } : null, on: ok, judged: ok || enough, was: old?.dirs?.[name]?.on ?? null };
    // Merkmale
    const L = EV.filter((x) => x.dir === dir), y = L.map((x) => resR(x, ok ? pick.k : 2));
    for (const f of ["rng20", "atrRel", "vx", "rs30", "rs7", "r7", "r30", "ext"]) {
      const Ld = L.filter((x) => x.t < cut), Lh = L.filter((x) => x.t >= cut);
      const a = spear(Ld.map((x) => x.f[f]), Ld.map((x) => resR(x, ok ? pick.k : 2))), b = spear(Lh.map((x) => x.f[f]), Lh.map((x) => resR(x, ok ? pick.k : 2)));
      if (a == null || b == null) continue;
      rep.feats.push({ dir: name, f, dev: +a.toFixed(3), ho: +b.toFixed(3), stable: Math.sign(a) === Math.sign(b) && Math.abs(a) * Math.sqrt(Ld.length - 1) >= 2 && Math.abs(b) * Math.sqrt(Lh.length - 1) >= 2 });
    }
  }
  await kvPut(env, "alt_model", JSON.stringify(M)); await kvPut(env, "alt_learn", JSON.stringify(rep));
  const FL = { rng20: "enge Spanne", atrRel: "Volatilität relativ", vx: "Volumen", rs30: "Stärke ggü. BTC 30T", rs7: "Stärke ggü. BTC 7T", r7: "7-Tage-Bewegung", r30: "30-Tage-Bewegung", ext: "Abstand vom Level" };
  const changed = ["long", "short"].some((d) => rep.dirs[d].was !== null && rep.dirs[d].was !== rep.dirs[d].on);
  if (changed || new Date().getUTCDay() === 0 || !old) {
    const P = (v) => (v == null ? "–" : (v >= 0 ? "+" : "") + v.toFixed(2).replace(".", ",") + "R");
    const line = (d) => { const x = rep.dirs[d]; return `${d === "long" ? "Long-Ausbrüche" : "Short-Brüche"}: ${!x.judged ? `noch zu wenige Fälle (${x.base.dev.n + x.base.ho.n}) – feste Regel bleibt` : x.on ? `✅ aktiv ab Punktzahl ${x.pick.sc}, Ziel ${x.pick.k}R (Ø ${P(x.pick.dev.m)} alt / ${P(x.pick.ho.m)} neu, ${x.pick.ho.n} neue Fälle)` : `⏸ pausiert – keine Einstellung hält auf neuen Daten (bisherige Regel Ø ${P(x.base.ho.m)} bei ${x.base.ho.n} Fällen)`}`; };
    const fs = rep.feats.filter((f) => f.stable).slice(0, 4).map((f) => `${f.dir}: ${FL[f.f] || f.f} ${f.dev > 0 ? "höher = besser" : "höher = schlechter"}`);
    await say(env, `🪙🧠 Altcoin-Lernschleife: ${rep.n} Ausbrüche aus ${Math.round((now - (rep.from || now)) / 86400)} Tagen nachgespielt (${rep.coins} Coins)\n${line("long")}\n${line("short")}\n${fs.length ? "Bestätigte Merkmale: " + fs.join(" · ") : "Noch keine stabil bestätigten Merkmale."}\nGilt ab sofort für Hinweise und Papierdepot. Keine Anlageberatung.`);
  }
  const w = (d) => (!M.dirs[d] ? "fest" : M.dirs[d].on ? "gelernt" : "pausiert");
  return `Altcoin-Lernen: ${rep.n} Fälle, long ${w("long")}, short ${w("short")}`;
}
