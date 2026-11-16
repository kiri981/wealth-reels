"""TBO (Kevins Original: N=30, EMA 200, SL 2·ATR(14), Ziel 2R, max. 48 Std.)
TBO – Trend-Breakout (stündlich) über mehrere Märkte.
Kauf/Verkauf, wenn eine 1-Std.-Kerze über dem Hoch / unter dem Tief der letzten N Stunden schließt.
Merkmale: N, Trendfilter (EMA 50/200 auf 1 Std. oder keiner), Stopp (k·ATR oder Kanal-Mitte), Ziel (R), Richtung.
Auswertung auf 5-Min.-Kerzen (Stopp zuerst, wenn beides in einer Kerze), max. 48 Std. Haltedauer, immer nur 1 Trade je Markt.
Gleiche Prüfungen wie orb_multi: Entwicklung/Holdout, Mehrfachtest-Schwelle, Mehrheit der Märkte, Nachbarn."""
import sys, os, glob, math, json, argparse
from datetime import datetime
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from orb_multi import load, stats, auto_offset, point_of

NS = [12, 24, 30, 48]; TRS = ["ema50", "ema200", "egal"]; SLS = ["atr1", "atr1.5", "atr2", "mitte"]; TPS = [1.0, 1.5, 2.0, 3.0]; DIRS = ["long", "short", "beide"]
MAXH = 48 * 3600

def hourly(T, O, H, L, C):
    hk = T // 3600; u, st = np.unique(hk, return_index=True); en = np.r_[st[1:], len(T)]
    h = np.array([H[a:b].max() for a, b in zip(st, en)]); l = np.array([L[a:b].min() for a, b in zip(st, en)]); c = C[en - 1]
    return u * 3600, h, l, c, en - 1          # Stundenbeginn, H, L, C, Index der letzten 5-Min.-Kerze

def ema(x, n):
    a = 2 / (n + 1); out = np.empty_like(x); out[0] = x[0]
    for i in range(1, len(x)): out[i] = a * x[i] + (1 - a) * out[i - 1]
    return out

def run_asset(name, path, offset):
    T, O, H, L, C, SP = load(path, offset)
    if len(T) < 5000: return None
    point = point_of(path)
    spread_px = float(np.median(SP[SP > 0])) * point if (SP > 0).any() else 0.0
    ht, hh, hl, hc, last5 = hourly(T, O, H, L, C)
    tr = np.maximum(hh[1:] - hl[1:], np.maximum(abs(hh[1:] - hc[:-1]), abs(hl[1:] - hc[:-1]))); atr = np.r_[np.nan, ema(tr, 14)]
    E = {"ema50": ema(hc, 50), "ema200": ema(hc, 200)}
    res = {}
    for N in NS:
        sigs = []
        for i in range(max(N, 200), len(hc) - 1):
            up, dn = hh[i - N:i].max(), hl[i - N:i].min()
            up1, dn1 = hh[i - 1 - N:i - 1].max(), hl[i - 1 - N:i - 1].min()      # wie im Pine: nur die erste Ausbruchskerze
            if hc[i] > up and not hc[i - 1] > up1: sigs.append((i, 1, up, dn))
            elif hc[i] < dn and not hc[i - 1] < dn1: sigs.append((i, -1, up, dn))
        for sl in SLS:
            for tp in TPS:
                for trn in TRS:
                    for d_ in DIRS:
                        out, busy = [], 0
                        for (i, dr, up, dn) in sigs:
                            if (d_ == "long" and dr < 0) or (d_ == "short" and dr > 0): continue
                            if trn != "egal" and not ((dr > 0 and hc[i] > E[trn][i]) or (dr < 0 and hc[i] < E[trn][i])): continue
                            j = last5[i]
                            if T[j] < busy: continue
                            e = hc[i]; stop = (e - dr * float(sl[3:]) * atr[i]) if sl != "mitte" else (up + dn) / 2
                            R = abs(e - stop)
                            if not R > 0: continue
                            tpx = e + dr * tp * R; cost = spread_px + 0.05 * atr[i] * 0.1
                            k = j + 1; r = None
                            while k < len(T) and T[k] - T[j] < MAXH:
                                if (dr > 0 and L[k] <= stop) or (dr < 0 and H[k] >= stop): r = -1; break
                                if (dr > 0 and H[k] >= tpx) or (dr < 0 and L[k] <= tpx): r = tp; break
                                k += 1
                            if k >= len(T): break
                            if r is None: r = dr * (C[k - 1] - e) / R
                            busy = T[min(k, len(T) - 1)]
                            out.append((int(T[j] // 86400), r - cost / R))
                        res[(N, trn, sl, str(tp), d_)] = out
    return {"name": name, "res": res, "weeks": (T[-1] - T[0]) / 604800}

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("folder"); ap.add_argument("--offset", default="0"); ap.add_argument("--out", default="hub/reports/tbo_multi.md"); ap.add_argument("--only", default="")
    a = ap.parse_args()
    files = sorted(glob.glob(os.path.join(a.folder, "*_m5.csv")))
    if a.only: files = [f for f in files if any(x.upper() in os.path.basename(f).upper() for x in a.only.split(","))]
    off = "ny" if a.offset == "ny" else auto_offset([f for f in files if "XAUUSD" in f.upper()][0]) if a.offset == "auto" else float(a.offset)
    A = []
    for f in files:
        nm = os.path.basename(f).replace("_m5.csv", "").upper(); r = run_asset(nm, f, off)
        if r: A.append(r); print(nm, f"{r['weeks']:.0f} Wo.", file=sys.stderr)
    keys = set().union(*[set(x["res"]) for x in A]); K = len(keys); thr = max(2.0, 0.6 * math.sqrt(2 * math.log(K)))
    rows = []
    for k in keys:
        dev, ho, per = [], [], []
        for x in A:
            Lr = sorted(x["res"].get(k, []))
            if len(Lr) < 20: continue
            cut = Lr[int(len(Lr) * 0.7)][0]; D = [v for v in Lr if v[0] < cut]; Hh = [v for v in Lr if v[0] >= cut]
            dev += D; ho += Hh; per.append((x["name"], stats(D), stats(Hh), len(Lr) / max(1, x["weeks"])))
        if len(per) < 3: continue
        sd, sh = stats(dev), stats(ho)
        if not sd or not sh: continue
        rows.append({"k": k, "dev": sd, "ho": sh, "pos": sum(1 for p in per if p[2] and p[2][1] > 0) / len(per), "n": len(per), "tpw": sum(p[3] for p in per), "per": per})
    idx = {r["k"]: r for r in rows}
    def nb(k):
        out = []
        for i, g in [(0, NS), (3, [str(t) for t in TPS])]:
            v = g.index(k[i])
            for dv in (-1, 1):
                if 0 <= v + dv < len(g): q = list(k); q[i] = g[v + dv]; out.append(tuple(q))
        return out
    good = [r for r in rows if r["dev"][1] > 0 and r["ho"][1] > 0 and r["dev"][2] >= thr and r["pos"] >= 0.6 and r["ho"][0] >= 60
            and np.mean([idx[q]["dev"][1] for q in nb(r["k"]) if q in idx] or [-1]) > 0]
    good.sort(key=lambda r: -r["ho"][1] * math.sqrt(r["ho"][0]))
    Lm = [f"# TBO Multi-Asset – Forschung {datetime.utcnow():%Y-%m-%d}", "", "Märkte: " + ", ".join(f"{x['name']} ({x['weeks']:.0f} Wo.)" for x in A),
          f"Varianten: {K} · Schwelle t ≥ {thr:.2f}", "", f"## Bestanden ({len(good)})"]
    for r in good[:20]:
        Lm.append(f"- {r['k']} · Entw. Ø {r['dev'][1]:+.3f}R t={r['dev'][2]:.1f} (n={r['dev'][0]}) · Holdout Ø {r['ho'][1]:+.3f}R (n={r['ho'][0]}) · {r['pos']:.0%} von {r['n']} Märkten · ≈ {r['tpw']:.1f}/Woche")
    if not good: Lm.append("- keine Variante hat alle Prüfungen bestanden")
    Lm += ["", "## Stärkste in der Entwicklung (Vergleich)"]
    for r in sorted(rows, key=lambda r: -r["dev"][2])[:12]:
        Lm.append(f"- {r['k']} · Entw. Ø {r['dev'][1]:+.3f}R t={r['dev'][2]:.1f} · Holdout Ø {r['ho'][1]:+.3f}R (n={r['ho'][0]}) · Märkte + {r['pos']:.0%} · {r['tpw']:.1f}/Woche")
    Lm += ["", "## Pro Markt (bester Kandidat je Markt, nur Info)"]
    for x in A:
        b = max(((k, stats(v)) for k, v in x["res"].items() if len(v) >= 30), key=lambda kv: kv[1][2], default=None)
        if b: Lm.append(f"- {x['name']}: {b[0]} · n={b[1][0]} Ø {b[1][1]:+.3f}R t={b[1][2]:.1f}")
    Lm += ["", "## Dein Original-TBO (30 Kerzen, EMA 200, SL 2·ATR, 2R) auf jedem Markt"]
    ok_ = (30, "ema200", "atr2", "2.0", "beide")
    for x in A:
        v = sorted(x["res"].get(ok_, []))
        if len(v) < 10: continue
        st = stats(v); half = v[int(len(v) * 0.7)][0]; h2 = stats([q for q in v if q[0] >= half])
        Lm.append(f"- {x['name']}: n={st[0]} ({st[0] / x['weeks']:.1f}/Woche) · Ø {st[1]:+.3f}R t={st[2]:.1f} · letzte 30 % Ø {h2[1]:+.3f}R")
    open(a.out, "w").write("\n".join(Lm) + "\n")
    json.dump([{"k": list(r["k"]), "dev": r["dev"], "ho": r["ho"], "pos": r["pos"], "tpw": r["tpw"]} for r in good], open(a.out.replace(".md", ".json"), "w"))
    print("\n".join(Lm))

if __name__ == "__main__": main()
