"""DEMA-Test (Reel @ash_trax): DEMA 10 fürs Timing, langsamer EMA 30 für die Richtung – gegen den gleichen Aufbau mit normalem EMA 10.
Kreuzungs-System, immer im Markt (Umkehr bei Gegenkreuzung) oder mit ATR-Stopp + Ziel. Kosten = Spread. Ergebnis in R (Risiko = 1,5 × ATR14)."""
import sys, os, glob, math, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from orb_multi import load, point_of
def ema(x, n):
    a = 2 / (n + 1); o = np.empty_like(x); o[0] = x[0]
    for i in range(1, len(x)): o[i] = a * x[i] + (1 - a) * o[i - 1]
    return o
def bars(T, O, H, L, C, sec):
    k = T // sec; u, st = np.unique(k, return_index=True); en = np.r_[st[1:], len(T)]
    return np.maximum.reduceat(H, st), np.minimum.reduceat(L, st), C[en - 1], u * sec
def run(h, l, c, fast, slow, mode, sp):
    tr = np.r_[np.nan, np.maximum(h[1:] - l[1:], np.maximum(abs(h[1:] - c[:-1]), abs(l[1:] - c[:-1])))]; atr = ema(np.nan_to_num(tr), 14)
    out = []; pos = 0; e = R = sl = tp = None
    for i in range(60, len(c)):
        up = fast[i] > slow[i] and fast[i - 1] <= slow[i - 1]; dn = fast[i] < slow[i] and fast[i - 1] >= slow[i - 1]
        if pos and mode == "atr":
            if (pos > 0 and l[i] <= sl) or (pos < 0 and h[i] >= sl): out.append(-1 - sp / R); pos = 0
            elif (pos > 0 and h[i] >= tp) or (pos < 0 and l[i] <= tp): out.append(2 - sp / R); pos = 0
        if (up or dn):
            d = 1 if up else -1
            if pos and mode == "flip": out.append(pos * (c[i] - e) / R - sp / R); pos = 0
            if not pos:
                pos, e, R = d, c[i], 1.5 * atr[i]
                if R <= 0: pos = 0; continue
                sl, tp = e - d * R, e + d * 2 * R
    return out
def st(v):
    a = np.array(v); return (len(a), a.mean(), a.mean() / (a.std(ddof=1) / math.sqrt(len(a)))) if len(a) > 2 else (0, 0, 0)
D = sys.argv[1]
for tfname, sec in [("15m", 900), ("1h", 3600), ("4h", 14400)]:
    print(f"\n### {tfname}")
    agg = {}
    for f in sorted(glob.glob(D + "/*_m5.csv")):
        m = os.path.basename(f)[:-7]; T, O, H, L, C, SP = load(f, 0)
        sp = float(np.median(SP[SP > 0])) * point_of(f) if (SP > 0).any() else 0
        h, l, c, t = bars(T, O, H, L, C, sec); e10 = ema(c, 10); dema = 2 * e10 - ema(e10, 10); e30 = ema(c, 30)
        for name, fast in [("DEMA10", dema), ("EMA10", e10)]:
            for mode in ["flip", "atr"]:
                r = run(h, l, c, fast, e30, mode, sp); agg.setdefault((name, mode), []).append((m, r))
    for k, L in agg.items():
        allr = [x for _, r in L for x in r]; n, mu, t = st(allr); pos = sum(1 for _, r in L if r and np.mean(r) > 0)
        cut = int(len(allr) * 0.7)
        print(f"{k[0]:7} {k[1]:4}: n={n} Ø {mu:+.3f}R t={t:.1f} · Märkte im Plus {pos}/{len(L)} · " + ", ".join(f"{m} {np.mean(r):+.2f}" for m, r in L if r and m in ('XAUUSD','BTCUSD','NAS100','EURUSD','GER40')))
