"""Nachtest der AlgoTradingHub-Vorlagen (Namen + Kurzangaben von algotradinghub.io/docs/templates) auf Kevins MT5-Daten.
Genaue Regeln sind dort nicht veröffentlicht → je Vorlage eine Familie naheliegender Fassungen, Entwicklung (70 %) / Holdout (30 %).
Kosten: Median-Spread + kleiner Schlupf. Ergebnis in R (Risiko = Stopp-Abstand)."""
import sys, os, math, numpy as np, itertools
from zoneinfo import ZoneInfo
import datetime as dt
sys.path.insert(0, os.path.dirname(__file__))
from orb_multi import load, point_of

def prep(path):
    T, O, H, L, C, SP = load(path, "ny")
    sp = float(np.median(SP[SP > 0])) * point_of(path) if (SP > 0).any() else 0
    return T, O, H, L, C, sp

def bars(T, O, H, L, C, sec):          # Zusammenfassen auf sec Sekunden (UTC-ausgerichtet)
    k = T // sec; u, st = np.unique(k, return_index=True); en = np.r_[st[1:], len(T)]
    return u * sec, O[st], np.maximum.reduceat(H, st), np.minimum.reduceat(L, st), C[en - 1], en - 1

def run_trade(T, H, L, C, j, dr, e, stop, tp, tmax):
    R = abs(e - stop)
    if R <= 0: return None
    k = j + 1
    while k < len(T) and T[k] < tmax:
        if (dr > 0 and L[k] <= stop) or (dr < 0 and H[k] >= stop): return -1.0, R
        if tp is not None and ((dr > 0 and H[k] >= tp) or (dr < 0 and L[k] <= tp)): return (tp - e) * dr / R, R
        k += 1
    return (C[min(k, len(T)) - 1] - e) * dr / R, R

NY = ZoneInfo("America/New_York")
def nyh(t): d = dt.datetime.fromtimestamp(int(t), dt.timezone.utc).astimezone(NY); return d.hour + d.minute / 60, d.date(), d.weekday()

def stats(v):
    a = np.array(v); n = len(a)
    if n < 3: return n, 0, 0
    return n, a.mean(), a.mean() / (a.std(ddof=1) / math.sqrt(n)) if a.std() > 0 else 0

# ---------------- 1) Daily Range Breakout USDJPY H1: Range der ersten N Stunden des Tages (NY 0 Uhr / Tokio), Ausbruch, Stopp Gegenseite
def t_range(T, O, H, L, C, sp, N=6, start=0, tgt=1.0, sl="opp"):
    out = []
    hT, hO, hH, hL, hC, last = bars(T, O, H, L, C, 3600)
    info = [nyh(t) for t in hT]
    by = {}
    for i, (h, d, wd) in enumerate(info): by.setdefault(d, []).append(i)
    for d, I in by.items():
        r = [i for i in I if start <= info[i][0] < start + N]
        if len(r) < N: continue
        hi, lo = hH[r].max(), hL[r].min(); after = [i for i in I if info[i][0] >= start + N and info[i][0] < 16]
        for i in after:
            dr = 1 if hC[i] > hi else -1 if hC[i] < lo else 0
            if not dr: continue
            e = hC[i]; stop = (lo if dr > 0 else hi) if sl == "opp" else (hi + lo) / 2
            Rr = abs(e - stop); tp = e + dr * tgt * Rr if tgt else None
            res = run_trade(T, H, L, C, last[i], dr, e, stop, tp, hT[I[-1]] + 3600)
            if res: out.append((d, res[0] - sp / res[1]))
            break
    return out

# ---------------- 2) ATR Expansion XAUUSD H1: Kerze > k × ATR(14), Schluss im äußeren Drittel → in Kerzenrichtung, Stopp = Kerzenende, Ziel m R, max. 24 Std.
def t_atr(T, O, H, L, C, sp, k=1.8, tgt=1.5, maxh=24):
    out = []
    hT, hO, hH, hL, hC, last = bars(T, O, H, L, C, 3600)
    tr = np.maximum(hH[1:] - hL[1:], np.maximum(abs(hH[1:] - hC[:-1]), abs(hL[1:] - hC[:-1]))); atr = np.r_[np.nan, np.convolve(tr, np.ones(14) / 14, "full")[:len(tr)]]
    busy = 0
    for i in range(20, len(hC) - 1):
        if hT[i] < busy: continue
        rg = hH[i] - hL[i]
        if not rg > k * atr[i - 1]: continue
        pos = (hC[i] - hL[i]) / rg
        dr = 1 if pos > 0.67 and hC[i] > hO[i] else -1 if pos < 0.33 and hC[i] < hO[i] else 0
        if not dr: continue
        e = hC[i]; stop = hL[i] if dr > 0 else hH[i]; Rr = abs(e - stop)
        res = run_trade(T, H, L, C, last[i], dr, e, stop, e + dr * tgt * Rr, hT[i] + maxh * 3600)
        if res: out.append((nyh(hT[i])[1], res[0] - sp / res[1])); busy = hT[i] + maxh * 3600
    return out

# ---------------- 3) Turnaround Tuesday DE40: Montag schließt unter Freitag → Kauf Montag-Schluss, Verkauf Dienstag-Schluss (in %, auf 1 % Risiko normiert)
def t_tt(T, O, H, L, C, sp, mode="close", drop=0.0):
    out = []
    dT, dO, dH, dL, dC, last = bars(T, O, H, L, C, 86400)     # Server-Tage ≈ UTC hier (Daten in UTC) – Wochentag nach NY
    for i in range(1, len(dC) - 1):
        wd = nyh(dT[i] + 43200)[2]
        if wd != 0 or not (dC[i] < dC[i - 1] * (1 - drop)): continue
        e = dC[i]; j = i + 1
        if mode == "high":                                       # raus, sobald Schluss > Vortageshoch (max. 4 Tage)
            while j < len(dC) - 1 and dC[j] <= dH[j - 1] and j - i < 4: j += 1
        out.append((nyh(dT[i])[1], (dC[j] - e - sp) / e * 100))
    return out

# ---------------- 4) TJR Asian Session Sweep NAS100 M5: Asien-Range (NY 20–24 Uhr Vortag), in NY-Vormittag (8–11:30) Docht über/unter die Range und Schluss zurück → Gegenrichtung
def t_tjr(T, O, H, L, C, sp, a0=20, a1=24, w0=8, w1=11.5, tgt="mid"):
    out = []
    info = [nyh(t) for t in T]
    by = {}
    for i, (h, d, wd) in enumerate(info): by.setdefault(d, []).append(i)
    days = sorted(by)
    for di in range(1, len(days)):
        d0, d = days[di - 1], days[di]
        asia = [i for i in by[d0] if a0 <= info[i][0] < a1] + [i for i in by[d] if a1 - 24 > info[i][0] >= 0 and a1 > 24]
        if len(asia) < 20: continue
        ah, al = H[asia].max(), L[asia].min(); mid = (ah + al) / 2
        for i in by[d]:
            h = info[i][0]
            if not (w0 <= h < w1): continue
            if H[i] > ah and C[i] < ah: dr, stop = -1, H[i]
            elif L[i] < al and C[i] > al: dr, stop = 1, L[i]
            else: continue
            e = C[i]; Rr = abs(e - stop); tp = mid if tgt == "mid" else (al if dr < 0 else ah) if tgt == "opp" else e + dr * float(tgt) * Rr
            res = run_trade(T, H, L, C, i, dr, e, stop, tp, T[by[d][-1]])
            if res: out.append((d, res[0] - sp / res[1]))
            break
    return out

# ---------------- 5) 4H FU Retest US500 M15: vorherige 4-Std.-Kerze, M15 sticht darüber/darunter und schließt zurück → Gegenrichtung, Ziel Gegenseite der 4H-Kerze
def t_fu(T, O, H, L, C, sp, tgt="opp", w0=9.5, w1=16):
    out = []
    qT, qO, qH, qL, qC, qlast = bars(T, O, H, L, C, 900)
    fT, fO, fH, fL, fC, flast = bars(T, O, H, L, C, 14400)
    fidx = np.searchsorted(fT, qT, side="right") - 2           # vorherige abgeschlossene 4H-Kerze
    used = set()
    for i in range(len(qT)):
        f = fidx[i]
        if f < 0 or f in used: continue
        h, d, wd = nyh(qT[i])
        if not (w0 <= h < w1): continue
        if qH[i] > fH[f] and qC[i] < fH[f]: dr, stop = -1, qH[i]
        elif qL[i] < fL[f] and qC[i] > fL[f]: dr, stop = 1, qL[i]
        else: continue
        used.add(f); e = qC[i]; Rr = abs(e - stop)
        tp = (fL[f] if dr < 0 else fH[f]) if tgt == "opp" else (fH[f] + fL[f]) / 2 if tgt == "mid" else e + dr * float(tgt) * Rr
        res = run_trade(T, H, L, C, qlast[i], dr, e, stop, tp, qT[i] + 8 * 3600)
        if res: out.append((d, res[0] - sp / res[1]))
    return out

TESTS = [
  ("Daily Range Breakout", t_range, ["USDJPY", "EURUSD", "XAUUSD", "GER40"], dict(N=[4, 6, 8], start=[0, 2, 3], tgt=[1.0, 1.5, 2.0, 0], sl=["opp", "mid"])),
  ("ATR Expansion", t_atr, ["XAUUSD", "NAS100", "BTCUSD", "GER40"], dict(k=[1.5, 1.8, 2.2], tgt=[1.0, 1.5, 2.0, 3.0], maxh=[8, 24])),
  ("Turnaround Tuesday", t_tt, ["GER40", "NAS100", "SP500", "DJ30"], dict(mode=["close", "high"], drop=[0.0, 0.005, 0.01])),
  ("TJR Asian Sweep", t_tjr, ["NAS100", "SP500", "XAUUSD", "GER40"], dict(a0=[18, 20], a1=[24, 26], w0=[3, 8], w1=[11.5], tgt=["mid", "opp", "2"])),
  ("4H FU Retest", t_fu, ["SP500", "NAS100", "DJ30", "XAUUSD"], dict(tgt=["opp", "mid", "1.5"], w0=[3, 9.5], w1=[12, 16])),
]

def main(folder, out):
    Lm = ["# AlgoTradingHub-Vorlagen – Nachtest auf MT5-Daten (Aug. 2022 – Nov. 2026)", "",
          "Genaue Regeln sind nicht öffentlich → je Vorlage mehrere naheliegende Fassungen. Bestanden = Entwicklung UND Holdout im Plus, t ≥ 2 über alle Märkte.", ""]
    cache = {}
    for name, fn, mk, grid in TESTS:
        Lm.append(f"## {name}")
        keys = list(grid); best = []
        for combo in itertools.product(*[grid[k] for k in keys]):
            kw = dict(zip(keys, combo)); allr = []; per = {}
            for m in mk:
                f = os.path.join(folder, m + "_m5.csv")
                if not os.path.exists(f): continue
                D = cache.get(m) or cache.setdefault(m, prep(f))
                r = sorted(fn(*D, **kw)); per[m] = r; allr += r
            if len(allr) < 60: continue
            cut = sorted(x[0] for x in allr)[int(len(allr) * 0.7)]
            dv = [x[1] for x in allr if x[0] < cut]; ho = [x[1] for x in allr if x[0] >= cut]
            sd, sh, sa = stats(dv), stats(ho), stats([x[1] for x in allr])
            posm = sum(1 for m, r in per.items() if len(r) > 10 and np.mean([x[1] for x in r]) > 0)
            best.append((sd[2], kw, sd, sh, sa, posm, len(per), {m: (len(r), np.mean([x[1] for x in r]) if r else 0) for m, r in per.items()}))
        best.sort(key=lambda b: -b[0])
        K = len(best); thr = max(2.0, 0.6 * math.sqrt(2 * math.log(max(K, 2))))
        ok = [b for b in best if b[2][1] > 0 and b[3][1] > 0 and b[2][2] >= thr]
        unit = "%" if fn is t_tt else "R"
        Lm.append(f"{K} Fassungen getestet, Schwelle t ≥ {thr:.2f} · bestanden: {len(ok)}")
        for b in (ok or best)[:3]:
            Lm.append(f"- {'✅' if b in ok else '·'} {b[1]} · Entw. Ø {b[2][1]:+.3f}{unit} t={b[2][2]:.1f} (n={b[2][0]}) · Holdout Ø {b[3][1]:+.3f}{unit} (n={b[3][0]}) · Märkte im Plus {b[5]}/{b[6]} · "
                      + ", ".join(f"{m} {v[1]:+.2f} (n={v[0]})" for m, v in b[7].items()))
        Lm.append("")
    open(out, "w").write("\n".join(Lm) + "\n"); print("\n".join(Lm))

if __name__ == "__main__": main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "hub/reports/ath_templates.md")
