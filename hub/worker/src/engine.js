import { runLearn } from "./learn.js";
// WC Trading Hub – Live-Engine (JavaScript). 1:1 zur Python-Engine hub/engine.py.
// Kerzen: Arrays von {t (Unix-Sek. UTC), o, h, l, c}. Trades: {t, dr, e, sl, r, why, tx, open}
export const COST = 0.35;
// Handelskosten und Mindestrisiko je Symbol (wie hub/engine.py SYMS)
export const SYMS = { XAUUSD: { _cost: 0.35, _minr: 0.3, name: "Gold" }, XAGUSD: { _cost: 0.03, _minr: 0.02, name: "Silber" }, BTCUSD: { _cost: 20, _minr: 20, name: "Bitcoin" },
  ETHUSD: { _costp: 0.0012, _minrp: 0.001, name: "Ethereum" }, SOLUSD: { _costp: 0.0012, _minrp: 0.001, name: "Solana" }, XRPUSD: { _costp: 0.0012, _minrp: 0.001, name: "XRP" },
  BNBUSD: { _costp: 0.0012, _minrp: 0.001, name: "BNB" }, DOGEUSD: { _costp: 0.0015, _minrp: 0.001, name: "Dogecoin" },
  EURUSD: { _cost: 0.00008, _minr: 0.0005, name: "EUR/USD" }, GBPUSD: { _cost: 0.00012, _minr: 0.0005, name: "GBP/USD" }, AUDUSD: { _cost: 0.0001, _minr: 0.0005, name: "AUD/USD" },
  NZDUSD: { _cost: 0.00015, _minr: 0.0005, name: "NZD/USD" }, USDJPY: { _cost: 0.012, _minr: 0.05, name: "USD/JPY" }, USDCAD: { _cost: 0.00015, _minr: 0.0005, name: "USD/CAD" },
  USDCHF: { _cost: 0.00015, _minr: 0.0005, name: "USD/CHF" }, EURJPY: { _cost: 0.02, _minr: 0.05, name: "EUR/JPY" }, GBPJPY: { _cost: 0.03, _minr: 0.05, name: "GBP/JPY" },
  EURGBP: { _cost: 0.0001, _minr: 0.0005, name: "EUR/GBP" }, FX: { _cost: 0, _minr: 0, name: "Devisen" },
  NAS100: { _costp: 0.0002, _minrp: 0.001, name: "Nasdaq 100" }, SP500: { _costp: 0.0002, _minrp: 0.001, name: "S&P 500" }, DJ30: { _costp: 0.0002, _minrp: 0.001, name: "Dow Jones" },
  GER40: { _costp: 0.0002, _minrp: 0.001, name: "DAX" } };
export const withSym = (p, price) => {
  const c = SYMS[p.sym || "XAUUSD"] || SYMS.XAUUSD;
  if (c._costp) return { ...p, name: c.name, _costp: c._costp, _cost: c._costp * (price || 0), _minr: c._minrp * (price || 0) };
  return { ...p, ...c };
};

const fmtBuc = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
const fmtNy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function parts(f, t) { const o = {}; for (const p of f.formatToParts(new Date(t * 1000))) o[p.type] = p.value; return o; }

// ---------------------------------------------------------------- Tage (Kalendertag Bukarest), NY-Minuten relativ dazu
export function days(C) {
  const out = []; const hist = []; let cur = null;
  const push = () => {
    if (!cur) return;
    if (!cur.we && cur.t.length >= 20) {
      const sig = hist.length >= 5 ? 0.68 * avg(hist.slice(-14)) : NaN;
      out.push({ day: cur.day, t: cur.t, m: cur.m, o: cur.o, h: cur.h, l: cur.l, c: cur.c, op: cur.o[0], sig });
      hist.push(Math.max(...cur.h) - Math.min(...cur.l));
    }
  };
  for (const k of C) {
    const b = parts(fmtBuc, k.t), n = parts(fmtNy, k.t);
    const day = `${b.year}-${b.month}-${b.day}`, nyd = `${n.year}-${n.month}-${n.day}`;
    let m = (+n.hour) * 60 + (+n.minute); if (nyd < day) m -= 1440;
    if (!cur || cur.day !== day) { push(); cur = { day, we: b.weekday === "Sat" || b.weekday === "Sun", t: [], m: [], o: [], h: [], l: [], c: [] }; }
    cur.t.push(k.t); cur.m.push(m); cur.o.push(k.o); cur.h.push(k.h); cur.l.push(k.l); cur.c.push(k.c);
  }
  push();
  return out;
}
const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;

// ---------------------------------------------------------------- Familie sess
function manage(D, k, dr, e, sl, tp, xend, be, COST) {
  const { h, l, o, c, m } = D; const r = dr * (e - sl); let stop = sl, moved = false;
  for (let q = k; q < c.length; q++) {
    if (m[q] >= xend) return [(dr * (o[q] - e) - COST) / r, q, "Zeit", false];
    if ((dr > 0 && l[q] <= stop) || (dr < 0 && h[q] >= stop)) { const px = dr > 0 ? Math.min(stop, o[q]) : Math.max(stop, o[q]); return [(dr * (px - e) - COST) / r, q, moved ? "BE" : "SL", false]; }
    if ((dr > 0 && h[q] >= tp) || (dr < 0 && l[q] <= tp)) return [(dr * (tp - e) - COST) / r, q, "Ziel", false];
    if (be && !moved && dr * ((dr > 0 ? h[q] : l[q]) - e) >= be * r) { stop = e; moved = true; }
  }
  return [(dr * (c[c.length - 1] - e) - COST) / r, c.length - 1, "Tagesende", true];   // noch offen (Daten enden)
}
export function sessDay(D, p, last) {
  const a = p.anchor, rl = p.rl, win = p.win, hold = p.hold; const { m, h, l, c, o } = D;
  let H = -Infinity, L = Infinity, nR = 0, preI = -1;
  for (let i = 0; i < m.length; i++) { if (m[i] >= a && m[i] < a + rl) { H = Math.max(H, h[i]); L = Math.min(L, l[i]); nR++; } if (m[i] < a) preI = i; }
  if (nR < 2 || preI < 0 || !isFinite(D.sig)) return null;
  const pre = c[preI];
  for (let j = 0; j < m.length; j++) {
    if (!(m[j] >= a + rl && m[j] < a + rl + win)) continue;
    if (j + 1 >= c.length) { return last ? { pending: true } : null; }
    if (c[j] > H || c[j] < L) {
      const dr = c[j] > H ? 1 : -1;
      if (p.ctr && Math.sign(pre - D.op) === dr) return null;
      if ((H - L) / D.sig >= (p.maxW ?? 99)) return null;
      const e = o[j + 1]; const sl = (p.slm || "opp") === "opp" ? (dr > 0 ? L : H) : (H + L) / 2;
      const r = dr * (e - sl); if (r <= (p._minr ?? 0.3)) return null;
      let [R, q, why, open] = manage(D, j + 1, dr, e, sl, e + dr * p.tp * r, a + rl + hold, p.be || 0, p._cost ?? COST);
      if (open && !last) open = false;
      let mfe = 0; for (let z = j + 1; z <= q; z++) mfe = Math.max(mfe, dr * ((dr > 0 ? h[z] : l[z]) - e) / r);
      return { t: D.t[j + 1], dr, e, sl, tp: e + dr * p.tp * r, r: R, why: open ? "offen" : why, mfe, tx: D.t[q], open };
    }
  }
  return null;
}
export function runSess(DAYS, p) {
  const out = [];
  DAYS.forEach((D, i) => { const t = sessDay(D, p, i === DAYS.length - 1); if (t && !t.pending) out.push(t); });
  return out;
}

// ---------------------------------------------------------------- Familie rbo
export function feats(C) {
  const n = C.length, o = C.map((x) => x.o), h = C.map((x) => x.h), l = C.map((x) => x.l), c = C.map((x) => x.c), t = C.map((x) => x.t);
  const atr = []; for (let i = 0; i < n; i++) { const pc = i ? c[i - 1] : c[0]; const tr = Math.max(h[i] - l[i], Math.abs(h[i] - pc), Math.abs(l[i] - pc)); atr.push(i ? atr[i - 1] + (tr - atr[i - 1]) / 14 : tr); }
  // 1h-Trend: stündliche Schlusskurse (Stunde = floor(t/3600)), EMA50, Wert gilt ab Ende der Stunde
  const hrs = []; for (let i = 0; i < n; i++) { const hk = Math.floor(t[i] / 3600); if (!hrs.length || hrs[hrs.length - 1].k !== hk) hrs.push({ k: hk, c: c[i] }); else hrs[hrs.length - 1].c = c[i]; }
  const ema = []; const al = 2 / 51; hrs.forEach((x, i) => ema.push(i ? ema[i - 1] + al * (x.c - ema[i - 1]) : x.c));
  const stH = hrs.map((x, i) => i >= 3 ? (x.c > ema[i] && ema[i] > ema[i - 3] ? 1 : x.c < ema[i] && ema[i] < ema[i - 3] ? -1 : 0) : 0);
  const st = []; let hi = -1;
  for (let i = 0; i < n; i++) { const cur = Math.floor(t[i] / 3600); while (hi + 1 < hrs.length && hrs[hi + 1].k + 1 <= cur) hi++; st.push(hi >= 0 ? stH[hi] : 0); }
  return { o, h, l, c, t, atr, st, n };
}
export function runRbo(F, p) {
  const { N, body, trend, tp } = p, be = p.be ?? 1.0, wait = p.wait ?? 6, maxb = p.maxb ?? 96;
  const { o, h, l, c, atr: a, st, n, t } = F; const out = []; const COST = p._cost ?? 0.35, MINR = p._minr ?? 0.3;
  const hiN = (i) => { let m = -Infinity; for (let k = i - N; k < i; k++) m = Math.max(m, h[k]); return m; };
  const loN = (i) => { let m = Infinity; for (let k = i - N; k < i; k++) m = Math.min(m, l[k]); return m; };
  let i = 300;
  while (i < n - 2) {
    const hi = hiN(i), lo = loN(i); let sig = null;
    for (const [dr, lvl] of [[1, hi], [-1, lo]]) {
      if (dr * (c[i] - lvl) > 0 && Math.abs(c[i] - o[i]) >= body * a[i] && dr * (c[i] - o[i]) > 0 && (!trend || st[i] === dr)) { sig = [dr, lvl, dr > 0 ? lo : hi]; break; }
    }
    if (!sig) { i++; continue; }
    const [dr, lvl, sl] = sig; let k = null;
    for (let j = i + 1; j < Math.min(n, i + 1 + wait); j++) if ((dr > 0 && l[j] <= lvl) || (dr < 0 && h[j] >= lvl)) { k = j; break; }
    if (k === null) { i++; continue; }
    const e = dr > 0 ? Math.min(lvl, o[k]) : Math.max(lvl, o[k]); const r = Math.abs(e - sl);
    if (r <= MINR) { i++; continue; }
    const tpp = e + dr * tp * r; let stop = sl, moved = false, res = null;
    if ((dr > 0 && l[k] <= sl) || (dr < 0 && h[k] >= sl)) res = [(-r - COST) / r, k, "SL"];
    else {
      for (let q = k + 1; q < Math.min(n, k + maxb); q++) {
        if ((dr > 0 && l[q] <= stop) || (dr < 0 && h[q] >= stop)) { const px = dr > 0 ? Math.min(stop, o[q]) : Math.max(stop, o[q]); res = [(dr * (px - e) - COST) / r, q, moved ? "BE" : "SL"]; break; }
        if ((dr > 0 && h[q] >= tpp) || (dr < 0 && l[q] <= tpp)) { res = [(dr * (tpp - e) - COST) / r, q, "Ziel"]; break; }
        if (be && !moved && dr * ((dr > 0 ? h[q] : l[q]) - e) >= be * r) { stop = e; moved = true; }
      }
      if (!res) {
        if (k + maxb > n) { const q = n - 1; out.push({ t: t[k], dr, e, sl: stop, tp: tpp, r: (dr * (c[q] - e) - COST) / r, why: "offen", tx: t[q], open: true }); break; }
        const q = Math.min(n - 1, k + maxb - 1); res = [(dr * (c[q] - e) - COST) / r, q, "Zeit"];
      }
    }
    out.push({ t: t[k], dr, e, sl, tp: tpp, r: res[0], why: res[2], tx: t[res[1]], open: false });
    i = res[1] + 1;
  }
  return out;
}

// ---------------------------------------------------------------- Familie swing (Tageskerzen)
export function runSwing(C, p) {
  const n = C.length, o = C.map((x) => x.o), h = C.map((x) => x.h), l = C.map((x) => x.l), c = C.map((x) => x.c), t = C.map((x) => x.t);
  const sma = (w, i) => { if (i < w - 1) return NaN; let s = 0; for (let k = i - w + 1; k <= i; k++) s += c[k]; return s / w; };
  const atr = []; for (let i = 0; i < n; i++) { const pc = i ? c[i - 1] : c[0]; const tr = Math.max(h[i] - l[i], Math.abs(h[i] - pc), Math.abs(l[i] - pc)); atr.push(i ? atr[i - 1] + (tr - atr[i - 1]) / 20 : tr); }
  const brkN = p.brkN ?? 55, exitN = p.exitN;
  const hh = (i) => { if (i < brkN) return NaN; let m = -Infinity; for (let k = i - brkN; k < i; k++) m = Math.max(m, h[k]); return m; };
  const ll = (i) => { if (i < exitN) return NaN; let m = Infinity; for (let k = i - exitN; k < i; k++) m = Math.min(m, l[k]); return m; };
  const out = []; let i = 210;
  while (i < n - 1) {
    const s50 = sma(50, i), s200 = sma(200, i), trend = c[i] > s200 && s50 > s200; let ent = false;
    if (trend && (p.entry === "A" || p.entry === "AB") && c[i] > hh(i)) ent = true;
    if (trend && (p.entry === "B" || p.entry === "AB") && Math.min(l[i], l[i - 1], l[i - 2]) <= Math.max(s50, sma(50, i - 1), sma(50, i - 2)) && c[i] > h[i - 1]) ent = true;
    if (ent && p._filt && !p._filt[i]) ent = false;   // Zusatzfilter (COT/Realzins), vorab je Tag berechnet
    if (!ent) { i++; continue; }
    const j0 = i + 1, e = o[j0], R = p.k * atr[i], stop = e - R; let ex = null, j = j0;
    while (j < n) {
      if (l[j] <= stop) { ex = Math.min(stop, o[j]); break; }
      if (j > j0 + 1 && c[j] < ll(j) && j + 1 < n) { ex = o[j + 1]; j++; break; }
      j++;
    }
    const open = ex === null; if (open) { ex = c[n - 1]; j = n - 1; }
    out.push({ t: t[j0], dr: 1, e, sl: e - R, r: (ex - e - (p._costp ? p._costp * e : (p._cost ?? 0.5))) / R, why: open ? "offen" : "exit", tx: t[j], open });
    i = j + 1;
  }
  return out;
}

// ---------------------------------------------------------------- Swing-Zusatzfilter (v1.5) – 1:1 wie swing_filter() in engine.py
// cot: [{d:"YYYY-MM-DD", mm_l, mm_s, oi}] aufsteigend · ry: [{d, v}] (FRED DFII10, US-Realzins 10J) aufsteigend
export const FILTERS = ["none", "cot80", "cotchg", "ry20", "rysma", "cot80ry"];
const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const addDays = (d, k) => new Date(Date.parse(d + "T00:00:00Z") + k * 86400000).toISOString().slice(0, 10);
export function swingFilter(C, kind, cot, ry) {
  const n = C.length, ok = new Array(n).fill(true), D = C.map((x) => day(x.t));
  if (!kind || kind === "none") return ok;
  if (["cot80", "cotchg", "cot80ry"].includes(kind) && cot && cot.length) {
    const net = cot.map((x) => (x.mm_l - x.mm_s) / x.oi), av = cot.map((x) => addDays(x.d.slice(0, 10), 4));
    const pct = net.map((v, i) => { const w = net.slice(Math.max(0, i - 155), i + 1); return w.length >= 52 ? w.filter((x) => x <= v).length / w.length : NaN; });
    const chg = net.map((v, i) => (i >= 4 ? v - net[i - 4] : NaN));
    let j = -1;
    for (let i = 0; i < n; i++) {
      while (j + 1 < av.length && av[j + 1] <= D[i]) j++;
      const P = j >= 0 ? pct[j] : NaN, G = j >= 0 ? chg[j] : NaN;
      if ((kind === "cot80" || kind === "cot80ry") && P >= 0.8) ok[i] = false;
      if (kind === "cotchg" && G <= 0) ok[i] = false;
    }
  }
  if (["ry20", "rysma", "cot80ry"].includes(kind) && ry && ry.length) {
    const R = []; let j = -1;
    for (let i = 0; i < n; i++) { while (j + 1 < ry.length && ry[j + 1].d < D[i]) j++; R.push(j >= 0 ? ry[j].v : NaN); }   // letzter Wert VOR dem Handelstag
    for (let i = 0; i < n; i++) {
      if ((kind === "ry20" || kind === "cot80ry") && i >= 20 && R[i] - R[i - 20] > 0) ok[i] = false;
      if (kind === "rysma" && i >= 49) { let s = 0, f = true; for (let k = i - 49; k <= i; k++) { if (!isFinite(R[k])) f = false; s += R[k]; } if (f && R[i] > s / 50) ok[i] = false; }
    }
  }
  return ok;
}

// ---------------------------------------------------------------- Familie deriv (v1.6) – 1:1 wie run_deriv() in engine.py
// D: [{t, o, h, l, c, oi, fr, liq_l, liq_s}] aufsteigend (Tage)
function rollZ(x, w = 90, mp = 60) {
  return x.map((v, i) => {
    const s = x.slice(Math.max(0, i - w + 1), i + 1).filter((y) => y !== null && isFinite(y));
    if (s.length < mp || v === null || !isFinite(v)) return NaN;
    const m = s.reduce((a, b) => a + b, 0) / s.length; const sd = Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / (s.length - 1));
    return sd > 0 ? (v - m) / sd : NaN;
  });
}
export function derivSig(D, sig, z) {
  const n = D.length;
  if (sig === "liqL") return rollZ(D.map((x) => x.liq_l ?? 0)).map((v) => v > z);
  if (sig === "liqS") return rollZ(D.map((x) => x.liq_s ?? 0)).map((v) => v > z);
  if (sig === "frHi") return rollZ(D.map((x) => x.fr)).map((v) => v > z);
  if (sig === "frLo") return rollZ(D.map((x) => x.fr)).map((v) => v < -z);
  const oc = rollZ(D.map((x, i) => (i >= 3 && D[i - 3].oi ? x.oi / D[i - 3].oi - 1 : null)));
  const pc = D.map((x, i) => (i >= 3 ? x.c / D[i - 3].c - 1 : NaN));
  if (sig === "oiUpPxDn") return oc.map((v, i) => v > z && pc[i] < 0);
  if (sig === "oiUpPxUp") return oc.map((v, i) => v > z && pc[i] > 0);
  return new Array(n).fill(false);
}
export function runDeriv(D, p) {
  const n = D.length, o = D.map((x) => x.o), h = D.map((x) => x.h), l = D.map((x) => x.l), c = D.map((x) => x.c);
  const tr = D.map((x, i) => { const pc = i ? c[i - 1] : c[0]; return Math.max(h[i] - l[i], Math.abs(h[i] - pc), Math.abs(l[i] - pc)); });
  const atr = tr.map((v, i) => (i < 13 ? NaN : tr.slice(i - 13, i + 1).reduce((a, b) => a + b, 0) / 14));
  const S = derivSig(D, p.sig, p.z); const dr = p.dr, H = p.hold, k = p.k; const out = []; let i = 0;
  while (i < n - 1) {
    if (!S[i] || !isFinite(atr[i]) || !isFinite(o[i + 1])) { i++; continue; }
    const j0 = i + 1, e = o[j0], R = k * atr[i], stop = e - dr * R; let ex = null, j = j0, why = "";
    while (j < n && j < j0 + H) {
      if ((dr > 0 && l[j] <= stop) || (dr < 0 && h[j] >= stop)) { ex = (o[j] - stop) * dr > 0 ? stop : o[j]; why = "SL"; break; }
      j++;
    }
    if (ex === null) { if (j0 + H - 1 < n) { j = j0 + H - 1; ex = c[j]; why = "Zeit"; } else { j = n - 1; ex = c[j]; why = "offen"; } }
    const cost = (p._costp ?? 0.0012) * e;
    out.push({ t: D[j0].t, dr, e, sl: stop, r: (dr * (ex - e) - cost) / R, why, tx: D[j].t, open: why === "offen" });
    i = j + 1;
  }
  return out;
}

// ---------------------------------------------------------------- Familie fxs (v2.5) – 1:1 wie run_fxs() in engine.py
export const FX_ORDER = ["EUR", "GBP", "AUD", "NZD", "USD", "CAD", "CHF", "JPY"];
export const FX_LEGS = ["EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDJPY", "USDCAD", "USDCHF"];
export function fxCur(D) {   // D: {EURUSD: [{t,c}], …} Tageskerzen → [{t, v:[8 log-Werte in FX_ORDER]}] nur Tage mit allen Paaren
  const day = (t) => Math.floor(t / 86400) * 86400; const M = {};
  for (const s of FX_LEGS) for (const k of D[s] || []) (M[day(k.t)] ||= {})[s] = k.c;
  return Object.keys(M).map(Number).sort((a, b) => a - b).filter((t) => FX_LEGS.every((s) => M[t][s] > 0)).map((t) => {
    const m = M[t], L = (x) => Math.log(x);
    const v = { EUR: L(m.EURUSD), GBP: L(m.GBPUSD), AUD: L(m.AUDUSD), NZD: L(m.NZDUSD), USD: 0, CAD: -L(m.USDCAD), CHF: -L(m.USDCHF), JPY: -L(m.USDJPY) };
    return { t, v: FX_ORDER.map((c) => v[c]) };
  });
}
export function runFxs(cur, p) {
  const n = cur.length, N = p.N, H = p.H, k = p.k, out = []; let i = Math.max(N, 61);
  while (i < n - 2) {
    const raw = cur[i].v.map((x, q) => x - cur[i - N].v[q]); const m = raw.reduce((a, b) => a + b, 0) / raw.length; const st = raw.map((x) => x - m);
    let a = 0, b = 0; for (let q = 1; q < st.length; q++) { if (st[q] > st[a]) a = q; if (st[q] < st[b]) b = q; }
    const [lo, hi] = p.mode === "rev" ? [b, a] : [a, b]; const [f, s] = lo < hi ? [lo, hi] : [hi, lo]; const dr = f === lo ? 1 : -1;
    const px = (j) => Math.exp(cur[j].v[f] - cur[j].v[s]);
    const lr = []; for (let q = i - 59; q <= i; q++) lr.push(Math.log(px(q) / px(q - 1)));
    const mu = lr.reduce((x, y) => x + y, 0) / lr.length, sig = Math.sqrt(lr.reduce((x, y) => x + (y - mu) ** 2, 0) / (lr.length - 1));
    const j0 = i + 1, e = px(j0), R = k * sig * Math.sqrt(H) * e, stop = e - dr * R; let ex = null, why = "", j = j0 + 1;
    while (j < n && j <= j0 + H) { const v = px(j); if ((dr > 0 && v <= stop) || (dr < 0 && v >= stop)) { ex = v; why = "Stop"; break; } j++; }
    if (ex === null) { if (j0 + H < n) { j = j0 + H; ex = px(j); why = "Zeit"; } else { j = n - 1; ex = px(j); why = "offen"; } }
    out.push({ t: cur[j0].t, dr, e, sl: stop, r: (dr * (ex - e) - 0.0003 * e) / R, why, tx: cur[j].t, pair: FX_ORDER[f] + FX_ORDER[s], open: why === "offen" });
    i = j;
  }
  return out;
}

export function trades(fam, p, data) {
  if (fam === "sess") return runSess(data.DAYS, p);
  if (fam === "rbo") return runRbo(p.tf === "15m" ? data.F15 : data.F5, p);
  if (fam === "swing") return data.D1 ? runSwing(data.D1, p) : [];
  if (fam === "deriv") return data.DD ? runDeriv(data.DD, p) : [];
  if (fam === "fxs") return data.FXCUR ? runFxs(data.FXCUR, p) : [];
  if (fam === "vipz") return data.VZ ? (data.VZ[p.v] || []) : [];   // v3.1 VIP-Zonen (Trades kommen fertig aus vipzones.js)
  if (fam === "ibs") return data.D1 ? runIbs(data.D1, p) : [];
  if (fam === "tt") return data.D1 ? runTt(data.D1, p) : [];
  if (fam === "tbo") return data.H1 && data.H1.length > 250 ? runTbo(data.H1, p) : [];
  if (fam === "learn") return data.C5 && data.C5.length > 3000 ? runLearn(data.C5, p) : [];   // v2.1: Lernmodell (15m aus 5m)
  return [];
}
// ---------------------------------------------------------------- v3.0 Familien aus den MT5-Nachtests (4 Jahre, 19 Märkte)
function atrArr(C, n = 14) { const a = new Array(C.length).fill(null); let s = 0; for (let i = 1; i < C.length; i++) { const tr = Math.max(C[i].h - C[i].l, Math.abs(C[i].h - C[i - 1].c), Math.abs(C[i].l - C[i - 1].c)); s += tr; if (i > n) s -= Math.max(C[i - n].h - C[i - n].l, Math.abs(C[i - n].h - C[i - n - 1].c), Math.abs(C[i - n].l - C[i - n - 1].c)); if (i >= n) a[i] = s / n; } return a; }
// IBS (Internal Bar Strength): Schluss im unteren 20 % der Tagesspanne → Kauf zum Schluss; raus, sobald Schluss > Vortageshoch, spätestens nach 5 Tagen.
//   Notstopp 2 × ATR(14) (im Nachtest nicht nötig, hier zur Sicherheit). R = 2 × ATR.
export function runIbs(D, p) {
  const out = [], A = atrArr(D), lim = p.ibs ?? 0.2, mx = p.hold ?? 5, cost = (p._costp ?? 0.0002);
  for (let i = 15; i < D.length; i++) {
    const x = D[i], rg = x.h - x.l; if (!(rg > 0) || !A[i]) continue;
    if ((x.c - x.l) / rg >= lim) continue;
    const e = x.c, R = 2 * A[i], sl = e - R; let j = i + 1, why = null, px = null;
    for (; j < D.length; j++) {
      if (D[j].l <= sl) { px = sl; why = "Notstopp"; break; }
      if (D[j].c > D[j - 1].h) { px = D[j].c; why = "Schluss > Vortageshoch"; break; }
      if (j - i >= mx) { px = D[j].c; why = "Zeit"; break; }
    }
    if (px == null) { out.push({ t: x.t, dr: 1, e, sl, tp: null, r: (D[D.length - 1].c - e - cost * e) / R, why: "offen", tx: D[D.length - 1].t, open: true }); break; }
    out.push({ t: x.t, dr: 1, e, sl, tp: null, r: (px - e - cost * e) / R, why, tx: D[j].t, open: false }); i = j;
  }
  return out;
}
// Turnaround Tuesday: Montag schließt ≥ 0,5 % unter Freitag → Kauf Montag-Schluss; raus, sobald Schluss > Vortageshoch, spätestens nach 4 Tagen. R = 2 × ATR.
export function runTt(D, p) {
  const out = [], A = atrArr(D), drop = p.drop ?? 0.005, cost = (p._costp ?? 0.0002);
  for (let i = 15; i < D.length; i++) {
    const wd = new Date((D[i].t + 43200) * 1000).getUTCDay(); if (wd !== 1 || !(D[i].c < D[i - 1].c * (1 - drop)) || !A[i]) continue;
    const e = D[i].c, R = 2 * A[i], sl = e - R; let j = i + 1, px = null, why = null;
    for (; j < D.length; j++) {
      if (D[j].l <= sl) { px = sl; why = "Notstopp"; break; }
      if (D[j].c > D[j - 1].h) { px = D[j].c; why = "Schluss > Vortageshoch"; break; }
      if (j - i >= 4) { px = D[j].c; why = "Zeit"; break; }
    }
    if (px == null) { out.push({ t: D[i].t, dr: 1, e, sl, tp: null, r: (D[D.length - 1].c - e - cost * e) / R, why: "offen", tx: D[D.length - 1].t, open: true }); break; }
    out.push({ t: D[i].t, dr: 1, e, sl, tp: null, r: (px - e - cost * e) / R, why, tx: D[j].t, open: false }); i = j;
  }
  return out;
}
// TBO (Kevins Trend Breakout, 1 Std.): Schluss über Hoch / unter Tief der letzten N Kerzen (erste Ausbruchskerze), nur mit EMA 200,
//   SL k × ATR(14), Ziel rr × SL, spätestens nach 48 Std.; immer nur eine Position.
export function runTbo(H, p) {
  const N = p.n ?? 30, k = p.k ?? 2, rr = p.rr ?? 2, mh = p.maxh ?? 48, cost = p._costp ? p._costp : 0, A = atrArr(H), out = [];
  const em = []; const a = 2 / 201; for (let i = 0; i < H.length; i++) em.push(i ? a * H[i].c + (1 - a) * em[i - 1] : H[i].c);
  const hh = (i) => { let m = -Infinity; for (let q = i - N; q < i; q++) m = Math.max(m, H[q].h); return m; };
  const ll = (i) => { let m = Infinity; for (let q = i - N; q < i; q++) m = Math.min(m, H[q].l); return m; };
  for (let i = Math.max(N + 1, 200); i < H.length; i++) {
    if (!A[i]) continue;
    const up = H[i].c > hh(i) && !(H[i - 1].c > hh(i - 1)), dn = H[i].c < ll(i) && !(H[i - 1].c < ll(i - 1));
    const dr = up && H[i].c > em[i] ? 1 : dn && H[i].c < em[i] ? -1 : 0; if (!dr) continue;
    const e = H[i].c, R = k * A[i], sl = e - dr * R, tp = e + dr * rr * R, c0 = cost ? cost * e : (p._cost ?? 0); let j = i + 1, px = null, why = null;
    for (; j < H.length; j++) {
      if ((dr > 0 && H[j].l <= sl) || (dr < 0 && H[j].h >= sl)) { px = sl; why = "SL"; break; }
      if ((dr > 0 && H[j].h >= tp) || (dr < 0 && H[j].l <= tp)) { px = tp; why = "TP"; break; }
      if (H[j].t - H[i].t >= mh * 3600) { px = H[j].c; why = "Zeit"; break; }
    }
    if (px == null) { out.push({ t: H[i].t, dr, e, sl, tp, r: (dr * (H[H.length - 1].c - e) - c0) / R, why: "offen", tx: H[H.length - 1].t, open: true }); break; }
    out.push({ t: H[i].t, dr, e, sl, tp, r: (dr * (px - e) - c0) / R, why, tx: H[j].t, open: false }); i = j;
  }
  return out;
}
export function resample(C, sec) {
  const out = [];
  for (const k of C) { const b = Math.floor(k.t / sec) * sec; const x = out[out.length - 1]; if (x && x.t === b) { x.h = Math.max(x.h, k.h); x.l = Math.min(x.l, k.l); x.c = k.c; } else out.push({ t: b, o: k.o, h: k.h, l: k.l, c: k.c }); }
  return out;
}
