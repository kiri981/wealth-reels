"""Nachtest bekannter Strategie-Vorlagen (Namen aus einer fremden Liste; Regeln = übliche Lehrbuch-Fassung).
Tageskerzen = Broker-Tage (Serverzeit, Tagesschluss 17:00 New York), gebaut aus 5-Min.-Daten. Kosten = Median-Spread je Trade.
Vergleich mit Buy & Hold: 'Vorteil' = Ø Trade-Rendite minus (Haltetage × Ø Tagesrendite des Marktes)."""
import sys, os, glob, math, json
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from orb_multi import load, point_of

def days(path):
    T, O, H, L, C, SP = load(path, 0)
    d = T // 86400; u, st = np.unique(d, return_index=True); en = np.r_[st[1:], len(T)]
    D = dict(d=u, o=O[st], h=np.array([H[a:b].max() for a, b in zip(st, en)]), l=np.array([L[a:b].min() for a, b in zip(st, en)]), c=C[en - 1])
    keep = (en - st) >= 60                                     # nur volle Handelstage (≥ 5 Std.)
    for k in D: D[k] = D[k][keep]
    D["wd"] = ((D["d"] + 3) % 7)                               # 0 = Montag (Serverzeit)
    sp = float(np.median(SP[SP > 0])) * point_of(path) if (SP > 0).any() else 0
    D["cost"] = sp; D["intr"] = (T, H, L, C)
    return D

def atr(D, n=14):
    tr = np.maximum(D["h"][1:] - D["l"][1:], np.maximum(abs(D["h"][1:] - D["c"][:-1]), abs(D["l"][1:] - D["c"][:-1])))
    a = np.r_[np.nan, np.convolve(tr, np.ones(n) / n, "full")[:len(tr)]]; a[:n] = np.nan; return a

def rsi(c, n=2):
    d = np.diff(c, prepend=c[0]); up = np.where(d > 0, d, 0); dn = np.where(d < 0, -d, 0); ru = np.zeros_like(c); rd = np.zeros_like(c)
    for i in range(1, len(c)): ru[i] = (ru[i - 1] * (n - 1) + up[i]) / n; rd[i] = (rd[i - 1] * (n - 1) + dn[i]) / n
    return 100 - 100 / (1 + ru / np.maximum(rd, 1e-12))

def ema(x, n):
    a = 2 / (n + 1); o = np.empty_like(x); o[0] = x[0]
    for i in range(1, len(x)): o[i] = a * x[i] + (1 - a) * o[i - 1]
    return o

# Jede Strategie liefert Liste (Index Einstiegstag, Rendite in %, Haltetage)
def s_turnaround(D):
    o, c, wd = D["o"], D["c"], D["wd"]; out = []
    for i in range(1, len(c) - 1):
        if wd[i] == 0 and c[i] < c[i - 1]:                     # Montag schließt unter Freitag → Kauf zum Schluss, Verkauf Dienstag-Schluss
            out.append((i, (c[i + 1] - c[i] - D["cost"]) / c[i] * 100, 1))
    return out
def s_ibs(D):
    h, l, c = D["h"], D["l"], D["c"]; out = []; i = 1
    while i < len(c) - 1:
        ibs = (c[i] - l[i]) / (h[i] - l[i]) if h[i] > l[i] else 0.5
        if ibs < 0.2:                                           # Schluss im unteren 20 % der Tagesspanne → Kauf zum Schluss
            j = i + 1
            while j < len(c) - 1 and c[j] <= h[j - 1] and j - i < 5: j += 1   # raus, sobald Schluss > Vortageshoch (max. 5 Tage)
            out.append((i, (c[j] - c[i] - D["cost"]) / c[i] * 100, j - i)); i = j
        i += 1
    return out
def s_rsi_ema(D):
    c = D["c"]; r = rsi(c, 2); e = ema(c, 200); out = []; i = 200
    while i < len(c) - 1:
        if r[i] < 10 and c[i] > e[i]:                           # RSI(2) < 10 über EMA 200 → Kauf; raus bei RSI(2) > 70 (max. 5 Tage)
            j = i + 1
            while j < len(c) - 1 and r[j] <= 70 and j - i < 5: j += 1
            out.append((i, (c[j] - c[i] - D["cost"]) / c[i] * 100, j - i)); i = j
        i += 1
    return out
def s_daybreak(D):
    T, H, L, C = D["intr"]; out = []
    for i in range(1, len(D["c"])):                             # Ausbruch über Vortageshoch (Kauf) / unter Vortagestief (Verkauf), Schluss am Tagesende
        a, b = np.searchsorted(T // 86400, D["d"][i]), np.searchsorted(T // 86400, D["d"][i] + 1)
        ph, pl = D["h"][i - 1], D["l"][i - 1]
        for k in range(a, b):
            if H[k] > ph: out.append((i, (C[b - 1] - ph - D["cost"]) / ph * 100, 1)); break
            if L[k] < pl: out.append((i, (pl - C[b - 1] - D["cost"]) / pl * 100, 1)); break
    return out
def s_atrcandle(D):
    h, l, o, c = D["h"], D["l"], D["o"], D["c"]; a = atr(D); out = []
    for i in range(15, len(c) - 1):                             # Kerze > 1,5 × ATR mit Schluss im äußeren Viertel → nächster Tag in Kerzenrichtung
        rg = h[i] - l[i]
        if rg > 1.5 * a[i - 1]:
            if c[i] > o[i] and (c[i] - l[i]) / rg > 0.75: out.append((i, (c[i + 1] - c[i] - D["cost"]) / c[i] * 100, 1))
            elif c[i] < o[i] and (c[i] - l[i]) / rg < 0.25: out.append((i, (c[i] - c[i + 1] - D["cost"]) / c[i] * 100, 1))
    return out
def s_friday_monday(D):
    c, h, wd = D["c"], D["h"], D["wd"]; T, H, L, C = D["intr"]; out = []
    for i in range(1, len(c)):                                  # Montag: Short, wenn Freitagshoch überschritten wird; Schluss Montag-Abend
        if wd[i] == 0 and wd[i - 1] == 4:
            a, b = np.searchsorted(T // 86400, D["d"][i]), np.searchsorted(T // 86400, D["d"][i] + 1)
            for k in range(a, b):
                if H[k] > h[i - 1]: out.append((i, (h[i - 1] - C[b - 1] - D["cost"]) / h[i - 1] * 100, 1)); break
    return out
def s_asia_sweep(D):
    T, H, L, C = D["intr"]; out = []
    hr = (T % 86400) // 3600                                    # Serverzeit; Asien = 01–08 Server (≈ 18–01 NY), London-Sweep 09–13 Server
    for i in range(len(D["d"])):
        a, b = np.searchsorted(T // 86400, D["d"][i]), np.searchsorted(T // 86400, D["d"][i] + 1)
        if b - a < 200: continue
        seg = np.arange(a, b); asia = seg[(hr[seg] >= 1) & (hr[seg] < 9)]; ldn = seg[(hr[seg] >= 9) & (hr[seg] < 14)]
        if len(asia) < 50 or len(ldn) < 30: continue
        ah, al = H[asia].max(), L[asia].min(); mid = (ah + al) / 2
        for k in ldn:
            if H[k] > ah and C[k] < ah:                         # über Asien-Hoch gestochen, Schluss zurück darunter → Short, Stopp über Docht, Ziel Asien-Mitte
                e, s = C[k], H[k]; r = s - e; res = None
                for m in range(k + 1, b):
                    if H[m] >= s: res = -1; break
                    if L[m] <= mid: res = (e - mid) / r; break
                if res is None: res = (e - C[b - 1]) / r
                out.append((i, res - D["cost"] / r, 0)); break
            if L[k] < al and C[k] > al:
                e, s = C[k], L[k]; r = e - s; res = None
                for m in range(k + 1, b):
                    if L[m] <= s: res = -1; break
                    if H[m] >= mid: res = (mid - e) / r; break
                if res is None: res = (C[b - 1] - e) / r
                out.append((i, res - D["cost"] / r, 0)); break
    return out

S = [("Turnaround Tuesday", s_turnaround, ["GER40", "NAS100", "DJ30", "SP500"], "%"),
     ("Internal Bar Strength (IBS)", s_ibs, ["NAS100", "DJ30", "SP500", "GER40"], "%"),
     ("RSI(2) + EMA 200", s_rsi_ema, ["NAS100", "DJ30", "SP500", "GER40", "XAUUSD"], "%"),
     ("Tages-Range-Ausbruch", s_daybreak, ["USDJPY", "GER40", "NAS100", "XAUUSD"], "%"),
     ("ATR-Kerzen-Ausbruch", s_atrcandle, ["XAUUSD", "NAS100", "GER40"], "%"),
     ("Friday Range → Monday Short", s_friday_monday, ["NAS100", "DJ30", "SP500", "GER40"], "%"),
     ("Asien-Sweep (London)", s_asia_sweep, ["XAUUSD", "EURUSD", "GBPUSD", "NAS100", "GER40"], "R")]

def st(v):
    a = np.array(v); n = len(a)
    return n, a.mean(), a.mean() / (a.std(ddof=1) / math.sqrt(n)) if n > 2 and a.std() > 0 else 0, (a > 0).mean()

def main(folder, out):
    cache = {}; L = ["# Strategie-Vorlagen – Nachtest " + __import__("datetime").date.today().isoformat(), "",
                     "Daten: 5-Min.-Kerzen vom Broker, Aug. 2022 – Nov. 2026, Kosten = Spread. Regeln = übliche Lehrbuch-Fassung der Namen.", ""]
    for name, fn, mk, unit in S:
        L.append(f"## {name}")
        for m in mk:
            f = os.path.join(folder, m + "_m5.csv")
            if not os.path.exists(f): continue
            D = cache.get(m) or cache.setdefault(m, days(f))
            tr = fn(D)
            if len(tr) < 20: L.append(f"- {m}: zu wenig Trades ({len(tr)})"); continue
            r = [x[1] for x in tr]; n, mu, t, w = st(r); cut = int(n * 0.7); n2, mu2, _, _ = st(r[cut:])
            wk = (D["d"][-1] - D["d"][0]) / 7; extra = ""
            if unit == "%":
                drift = np.mean(np.diff(D["c"]) / D["c"][:-1]) * 100; hold = np.mean([x[2] for x in tr]); adv = mu - hold * drift
                extra = f" · Buy&Hold für gleiche Haltezeit {hold * drift:+.3f} % → Vorteil {adv:+.3f} %"
            L.append(f"- {m}: {n} Trades ({n / wk:.1f}/Woche) · Ø {mu:+.3f} {unit} · Treffer {w:.0%} · t={t:.1f} · letzte 30 % Ø {mu2:+.3f} {unit}{extra}")
        L.append("")
    open(out, "w").write("\n".join(L) + "\n"); print("\n".join(L))

if __name__ == "__main__": main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "hub/reports/templates.md")
