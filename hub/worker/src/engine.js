// WC Trading Hub – Live-Engine (JavaScript). 1:1 zur Python-Engine hub/engine.py.
// Kerzen: Arrays von {t (Unix-Sek. UTC), o, h, l, c}. Trades: {t, dr, e, sl, r, why, tx, open}
export const COST = 0.35;
// Handelskosten und Mindestrisiko je Symbol (wie hub/engine.py SYMS)
export const SYMS = { XAUUSD: { _cost: 0.35, _minr: 0.3, name: "Gold" }, XAGUSD: { _cost: 0.03, _minr: 0.02, name: "Silber" }, BTCUSD: { _cost: 20, _minr: 20, name: "Bitcoin" } };
export const withSym = (p) => ({ ...p, ...(SYMS[p.sym || "XAUUSD"] || SYMS.XAUUSD) });

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
    if (!ent) { i++; continue; }
    const j0 = i + 1, e = o[j0], R = p.k * atr[i], stop = e - R; let ex = null, j = j0;
    while (j < n) {
      if (l[j] <= stop) { ex = Math.min(stop, o[j]); break; }
      if (j > j0 + 1 && c[j] < ll(j) && j + 1 < n) { ex = o[j + 1]; j++; break; }
      j++;
    }
    const open = ex === null; if (open) { ex = c[n - 1]; j = n - 1; }
    out.push({ t: t[j0], dr: 1, e, sl: e - R, r: (ex - e - (p._cost ?? 0.5)) / R, why: open ? "offen" : "exit", tx: t[j], open });
    i = j + 1;
  }
  return out;
}

export function trades(fam, p, data) {
  if (fam === "sess") return runSess(data.DAYS, p);
  if (fam === "rbo") return runRbo(p.tf === "15m" ? data.F15 : data.F5, p);
  if (fam === "swing") return data.D1 ? runSwing(data.D1, p) : [];
  return [];
}
export function resample(C, sec) {
  const out = [];
  for (const k of C) { const b = Math.floor(k.t / sec) * sec; const x = out[out.length - 1]; if (x && x.t === b) { x.h = Math.max(x.h, k.h); x.l = Math.min(x.l, k.l); x.c = k.c; } else out.push({ t: b, o: k.o, h: k.h, l: k.l, c: k.c }); }
  return out;
}
