// WC Trading Hub – Lernende Handelslogik „learn“ (v2.1)
// EINZIGE Quelle der Merkmale: der Worker (Papierhandel live) und die Forschung (hub/learn.py ruft dieses Modul über node auf)
// rechnen exakt dasselbe. Kein Merkmal schaut in die Zukunft: alles an Kerze i nutzt nur Kerzen ≤ i.
//
// Merkmale je 15-Min.-Kerze (30): Momentum (1/4/16/64 Kerzen), Abstand und Steigung EMA20/50/200, RSI, Volatilität im Verhältnis,
// Kompression, Kerzenkörper/Dochte, Kerzenformationen (Engulfing, Pin-Bar, Inside Bar), MARKTSTRUKTUR (bestätigte Hochs/Tiefs,
// Trend, Bruch = BOS, Charakterwechsel = CHoCH, Abstand zum letzten Hoch/Tief), Tageszeit/Wochentag, Vortageshoch/-tief, Tagesöffnung.
//
// Ziel (Label): erreicht der Kurs ab der nächsten Eröffnung zuerst +k·ATR (Ziel) oder −1·ATR (Stop), innerhalb von H Kerzen?
//   Scalp: k = 1, H = 8 (2 Std.) · Intraday: k = 2, H = 32 (8 Std.). Beide Richtungen getrennt.
// Modell: logistische Regression je Richtung (Gewichte + Mittelwerte/Streuungen aus der Forschung), gehandelt wird nur,
// wenn die geschätzte Trefferwahrscheinlichkeit nach Kosten einen positiven Erwartungswert ergibt (Schwelle aus der Validierung).

export const NAMES = ["r1", "r4", "r16", "r64", "e20", "e50", "e200", "e20s", "rsi", "volr", "comp16", "body", "clpos", "uwick", "lwick",
  "engulf", "pin", "inside", "trend", "bos", "choch", "dsh", "dsl", "hsin", "hcos", "dow", "dpdh", "dpdl", "dopen", "drange"];

export function resample(C, sec) {
  const out = [];
  for (const k of C) { const b = Math.floor(k.t / sec) * sec; const x = out[out.length - 1]; if (x && x.t === b) { x.h = Math.max(x.h, k.h); x.l = Math.min(x.l, k.l); x.c = k.c; } else out.push({ t: b, o: k.o, h: k.h, l: k.l, c: k.c }); }
  return out;
}

export function features(C) {
  const n = C.length, F = new Array(n).fill(null), A = new Array(n);
  const ema = (p) => { const a = 2 / (p + 1), o = new Array(n); for (let i = 0; i < n; i++) o[i] = i ? o[i - 1] + a * (C[i].c - o[i - 1]) : C[i].c; return o; };
  const E20 = ema(20), E50 = ema(50), E200 = ema(200);
  const TR = C.map((x, i) => (i ? Math.max(x.h - x.l, Math.abs(x.h - C[i - 1].c), Math.abs(x.l - C[i - 1].c)) : x.h - x.l));
  for (let i = 0; i < n; i++) A[i] = i < 14 ? TR.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1) : A[i - 1] + (TR[i] - A[i - 1]) / 14;
  // RSI (Wilder)
  const RSI = new Array(n).fill(50); let ag = 0, al = 0;
  for (let i = 1; i < n; i++) { const d = C[i].c - C[i - 1].c, g = Math.max(d, 0), l = Math.max(-d, 0); if (i <= 14) { ag += g / 14; al += l / 14; } else { ag = (ag * 13 + g) / 14; al = (al * 13 + l) / 14; } RSI[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al); }
  // Marktstruktur: Fraktal-Hochs/-Tiefs mit K Kerzen links/rechts, erst K Kerzen später BESTÄTIGT (kein Blick in die Zukunft)
  const K = 3; let sh = [], sl = []; let trend = 0, lastBos = 0, lastBosI = -99, lastChoch = 0, lastChochI = -99;
  // Tagesdaten (UTC-Tag): Vortageshoch/-tief, Tagesöffnung, Tageshoch/-tief bis jetzt
  let day = -1, dO = null, dH = -Infinity, dL = Infinity, pdh = null, pdl = null;
  let trSum = 0; const TRW = [];
  for (let i = 0; i < n; i++) {
    const x = C[i], dd = Math.floor(x.t / 86400);
    if (dd !== day) { if (day >= 0) { pdh = dH; pdl = dL; } day = dd; dO = x.o; dH = -Infinity; dL = Infinity; }
    dH = Math.max(dH, x.h); dL = Math.min(dL, x.l);
    TRW.push(TR[i]); trSum += TR[i]; if (TRW.length > 100) trSum -= TRW.shift();
    const j = i - K;   // Kandidat, der jetzt bestätigt wird
    if (j >= K) {
      let H = true, L = true;
      for (let m = 1; m <= K; m++) { if (C[j].h <= C[j - m].h || C[j].h < C[j + m].h) H = false; if (C[j].l >= C[j - m].l || C[j].l > C[j + m].l) L = false; }
      if (H) { sh.push(C[j].h); if (sh.length > 3) sh.shift(); }
      if (L) { sl.push(C[j].l); if (sl.length > 3) sl.shift(); }
      if (sh.length >= 2 && sl.length >= 2) { const t2 = sh[sh.length - 1] > sh[sh.length - 2] && sl[sl.length - 1] > sl[sl.length - 2] ? 1 : sh[sh.length - 1] < sh[sh.length - 2] && sl[sl.length - 1] < sl[sl.length - 2] ? -1 : 0; if (t2 !== 0) trend = t2; }
    }
    const lastH = sh.length ? sh[sh.length - 1] : null, lastL = sl.length ? sl[sl.length - 1] : null;
    if (i > 0 && lastH != null && x.c > lastH && C[i - 1].c <= lastH) { if (trend === -1) { lastChoch = 1; lastChochI = i; } lastBos = 1; lastBosI = i; }
    if (i > 0 && lastL != null && x.c < lastL && C[i - 1].c >= lastL) { if (trend === 1) { lastChoch = -1; lastChochI = i; } lastBos = -1; lastBosI = i; }
    if (i < 200) continue;   // Aufwärmphase
    const a = A[i] || 1e-9, p = C[i - 1], rng = x.h - x.l || 1e-12, body = Math.abs(x.c - x.o);
    const up = x.c > x.o, lw = Math.min(x.o, x.c) - x.l, uw = x.h - Math.max(x.o, x.c);
    const engulf = up && p.c < p.o && x.c >= p.o && x.o <= p.c ? 1 : !up && p.c > p.o && x.c <= p.o && x.o >= p.c ? -1 : 0;
    const pin = lw > 2 * body && lw > 0.55 * rng ? 1 : uw > 2 * body && uw > 0.55 * rng ? -1 : 0;
    let hi16 = -Infinity, lo16 = Infinity; for (let m = i - 15; m <= i; m++) { hi16 = Math.max(hi16, C[m].h); lo16 = Math.min(lo16, C[m].l); }
    const hr = ((x.t % 86400) / 3600) + 0.25;   // Ende der Kerze in UTC-Stunden
    const dow = new Date(x.t * 1000).getUTCDay();
    const clip = (v, b = 6) => Math.max(-b, Math.min(b, v));
    F[i] = [clip((x.c - p.c) / a), clip((x.c - C[i - 4].c) / a), clip((x.c - C[i - 16].c) / a, 12), clip((x.c - C[i - 64].c) / a, 20),
      clip((x.c - E20[i]) / a), clip((x.c - E50[i]) / a, 10), clip((x.c - E200[i]) / a, 20), clip((E20[i] - E20[i - 4]) / a),
      RSI[i] / 100 - 0.5, clip(a / (trSum / TRW.length), 4), clip((hi16 - lo16) / a, 20), (x.c - x.o) / rng, (x.c - x.l) / rng, clip(uw / a), clip(lw / a),
      engulf, pin, x.h <= p.h && x.l >= p.l ? 1 : 0, trend, i - lastBosI <= 3 ? lastBos : 0, i - lastChochI <= 3 ? lastChoch : 0,
      lastH != null ? clip((lastH - x.c) / a, 20) : 0, lastL != null ? clip((x.c - lastL) / a, 20) : 0,
      Math.sin((2 * Math.PI * hr) / 24), Math.cos((2 * Math.PI * hr) / 24), dow / 6,
      pdh != null ? clip((pdh - x.c) / a, 30) : 0, pdl != null ? clip((x.c - pdl) / a, 30) : 0, clip((x.c - dO) / a, 30), clip((dH - dL) / a, 40)];
  }
  return { F, A };
}

// Ergebnis eines Trades ab Kerze i (Einstieg Eröffnung i+1): +k (Ziel), −1 (Stop, auch wenn beides in derselben Kerze), sonst Schlusskurs nach H Kerzen
export function outcome(C, A, i, dr, k, H, cost) {
  const n = C.length; if (i + 1 >= n) return null;
  const e = C[i + 1].o, a = A[i], sl = e - dr * a, tp = e + dr * k * a;
  for (let j = i + 1; j < Math.min(n, i + 1 + H); j++) {
    const b = C[j];
    if (dr > 0 ? b.l <= sl : b.h >= sl) return { r: -1 - cost / a, j, why: "SL", e, sl, tp };
    if (dr > 0 ? b.h >= tp : b.l <= tp) return { r: k - cost / a, j, why: "TP", e, sl, tp };
  }
  const j = i + H; if (j >= n) return { r: (dr * (C[n - 1].c - e) - cost) / a, j: n - 1, why: "offen", e, sl, tp, open: true };
  return { r: (dr * (C[j].c - e) - cost) / a, j, why: "Zeit", e, sl, tp };
}

const sig = (z) => 1 / (1 + Math.exp(-z));
export function prob(row, m) {   // m: {mu, sd, w, b}
  let z = m.b; for (let q = 0; q < row.length; q++) z += m.w[q] * ((row[q] - m.mu[q]) / (m.sd[q] || 1)); return sig(z);
}
// Handel: Kerzen C (5m), p = {tf:"15m", k, H, thr, mL:{…}, mS:{…}, _cost}; ein Trade zur Zeit
export function runLearn(C5, p) {
  const C = resample(C5, 900); const { F, A } = features(C); const out = []; let i = 200;
  while (i < C.length - 1) {
    const f = F[i]; if (!f) { i++; continue; }
    const pl = p.mL ? prob(f, p.mL) : 0, ps = p.mS ? prob(f, p.mS) : 0;
    const evL = pl * p.k - (1 - pl), evS = ps * p.k - (1 - ps);
    let dr = 0; if (pl >= p.thr && evL >= evS) dr = 1; else if (ps >= p.thr) dr = -1;
    if (!dr) { i++; continue; }
    const o = outcome(C, A, i, dr, p.k, p.H, p._cost ?? 0.35); if (!o) break;
    out.push({ t: C[i + 1].t, dr, e: o.e, sl: o.sl, tp: o.tp, r: o.r, why: o.why + ` p=${(dr > 0 ? pl : ps).toFixed(2)}`, tx: C[o.j].t + 900, open: !!o.open });
    i = o.j + 1;
  }
  return out;
}
