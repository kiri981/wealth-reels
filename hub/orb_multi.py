#!/usr/bin/env python3
"""
WC Trading Hub – Multi-Asset ORB (Opening-Range-Breakout) Forschung
=====================================================================
Gleiche Regeln auf vielen Märkten testen. Eine Regel gilt nur dann als brauchbar, wenn sie
  (1) auf den älteren 70 % der Daten (Entwicklung) UND auf den neuesten 30 % (Holdout) im Plus ist,
  (2) auf der Mehrheit der Märkte im Holdout positiv ist (nicht nur ein Glückstreffer auf einem Markt),
  (3) die Mehrfachtest-Schwelle schafft (t-Wert ≥ max(2, 0,6·√(2·ln K)), K = Anzahl getesteter Varianten),
  (4) Nachbar-Einstellungen ebenfalls im Plus sind.

Merkmale (alle kombiniert):
  session  – Eröffnung: asia (09:00 Tokio), london (08:00 London = 09:00 Frankfurt), ny (08:00 NY), nyse (09:30 NY)
  rng      – Range-Dauer 15 / 30 / 60 Min.
  win      – Einstiegsfenster nach der Range 60 / 120 / 240 Min. (erster 5-Min.-Schluss außerhalb der Range)
  sl       – Stopp an der Gegenseite der Range oder an der Mitte
  tgt      – Ziel 1 / 1,5 / 2 / 3 R oder „Tagesende“ (Schluss 21:00 UTC)
  width    – Range-Breite relativ zur Tages-ATR: eng (< 0,25), normal (0,25–0,6), alle
  trend    – nur in Richtung des Vortags-Trends (Schluss über/unter 20-Tage-Schnitt) oder beide Richtungen
  dir      – nur Long, nur Short oder beide
Kosten: halber Median-Spread je Seite aus den Broker-Daten + Schlupf 0,02·Range (mindestens).

Aufruf:  python3 hub/orb_multi.py <ordner mit *_m5.csv> [--utc-offset-auto] [--out hub/reports/orb_multi.md]
CSV: t,o,h,l,c[,spread,symbol]  (t = Unix-Sekunden; Broker-Serverzeit wird mit --offset STUNDEN korrigiert)
"""
import csv, sys, os, math, glob, json, argparse
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import numpy as np

SESS = {"asia": ("Asia/Tokyo", 9, 0), "london": ("Europe/London", 8, 0),   # (Frankfurt 09:00 = London 08:00 → doppelt, weggelassen)
        "ny": ("America/New_York", 8, 0), "nyse": ("America/New_York", 9, 30)}
RNG, WIN, SLS, TGTS = [15, 30, 60], [60, 120, 240, 375], ["opp", "mid"], [1.0, 1.5, 2.0, 3.0, "eod"]
WIDTH, TREND, DIRS = ["eng", "normal", "alle"], ["mit", "egal"], ["long", "short", "beide"]
EOD_UTC = 21

def load(path, offset_h=0.0):
    T, O, H, L, C, SP = [], [], [], [], [], []
    with open(path) as f:
        for r in csv.DictReader(f):
            T.append(int(float(r["t"])) - (0 if offset_h == "ny" else int(float(offset_h) * 3600))); O.append(float(r["o"])); H.append(float(r["h"])); L.append(float(r["l"])); C.append(float(r["c"]))
            SP.append(float(r.get("spread") or 0))
    if offset_h == "ny":   # Broker-Zeit = New-York-Zeit + 7 Std. (übliche MT5-Konvention, folgt der US-Sommerzeit)
        from zoneinfo import ZoneInfo; import datetime as _dt
        ny = ZoneInfo("America/New_York"); cache = {}; T2 = []
        for t in T:
            loc = t - 7 * 3600; d = loc // 86400
            if d not in cache:
                cache[d] = int(_dt.datetime.fromtimestamp(d * 86400 + 43200, _dt.timezone.utc).replace(tzinfo=ny).utcoffset().total_seconds())
            T2.append(loc - cache[d])
        T = T2
    a = np.array; idx = np.argsort(T)
    return a(T)[idx], a(O)[idx], a(H)[idx], a(L)[idx], a(C)[idx], a(SP)[idx]

def daily(T, H, L, C):
    d = (T // 86400); days = np.unique(d)
    hi, lo, cl = {}, {}, {}
    for x in days:
        m = d == x
        hi[x], lo[x], cl[x] = H[m].max(), L[m].min(), C[m][-1]
    ks = sorted(days); atr, sma = {}, {}
    trs = []
    for i, x in enumerate(ks):
        if i:
            p = ks[i - 1]; tr = max(hi[x] - lo[x], abs(hi[x] - cl[p]), abs(lo[x] - cl[p])); trs.append(tr)
        if i >= 15: atr[x] = float(np.mean(trs[-14:]))   # ATR bis einschließlich Vortag (für Tag x+1 verwenden)
        if i >= 20: sma[x] = float(np.mean([cl[k] for k in ks[i - 19:i + 1]]))
    return ks, atr, sma, cl

def entries(T, O, H, L, C, sess, rng, win):
    """→ Liste je Tag: (day, ix_entry, dir, hi, lo, close_entry) – erster Schluss außerhalb der Range im Fenster."""
    tz, hh, mm = SESS[sess]; Z = ZoneInfo(tz)
    out = []; d = T // 86400; uniq = np.unique(d)
    pos = np.searchsorted
    for day in uniq:
        loc = datetime.fromtimestamp(int(day) * 86400, timezone.utc).astimezone(Z)
        start_local = datetime(loc.year, loc.month, loc.day, hh, mm, tzinfo=Z) if loc.hour < 18 else None
        # Tag in Ortszeit bestimmen: Ortsdatum = UTC-Datum (für Tokio kann die Eröffnung am Vortag UTC liegen)
        dt_utc = datetime.fromtimestamp(int(day) * 86400, timezone.utc)
        st = datetime(dt_utc.year, dt_utc.month, dt_utc.day, hh, mm, tzinfo=Z).astimezone(timezone.utc)
        s = int(st.timestamp()); e_r = s + rng * 60; e_w = e_r + win * 60
        i0, i1, i2 = pos(T, s), pos(T, e_r), pos(T, e_w)
        if i1 - i0 < max(2, rng // 5 - 1) or i2 <= i1: continue
        hi, lo = H[i0:i1].max(), L[i0:i1].min()
        if hi <= lo: continue
        for j in range(i1, min(i2, len(T))):
            if C[j] > hi: out.append((int(T[j] // 86400), j, 1, hi, lo, C[j])); break
            if C[j] < lo: out.append((int(T[j] // 86400), j, -1, hi, lo, C[j])); break
    return out

def outcome(T, H, L, C, j, dr, e, stop, tgt, cost):
    R = abs(e - stop)
    if R <= 0: return None
    end = int(T[j] // 86400) * 86400 + EOD_UTC * 3600
    k = j + 1; n = len(T)
    tp = None if tgt == "eod" else e + dr * tgt * R
    while k < n and T[k] < end:
        if (dr > 0 and L[k] <= stop) or (dr < 0 and H[k] >= stop): return -1 - cost / R
        if tp is not None and ((dr > 0 and H[k] >= tp) or (dr < 0 and L[k] <= tp)): return tgt - cost / R
        k += 1
    last = C[min(k, n) - 1]
    return dr * (last - e) / R - cost / R

def run_asset(name, path, offset):
    T, O, H, L, C, SP = load(path, offset)
    if len(T) < 5000: return None
    ks, atr, sma, cl = daily(T, H, L, C)
    prev = {ks[i]: ks[i - 1] for i in range(1, len(ks))}
    point = float(np.median(np.diff(np.unique(np.round(C[-2000:], 6))))) if len(C) > 2000 else 0
    spread_px = float(np.median(SP[SP > 0])) * point if (SP > 0).any() and point > 0 else 0.0
    res = {}
    for sess in SESS:
        for rng in RNG:
            for win in WIN:
                for (day, j, dr, hi, lo, e) in entries(T, O, H, L, C, sess, rng, win):
                    p = prev.get(day)
                    if p is None or p not in atr or p not in sma: continue
                    wd = (hi - lo) / atr[p]
                    wcls = "eng" if wd < 0.25 else "normal" if wd < 0.6 else "weit"
                    trend_ok = (dr > 0 and cl[p] > sma[p]) or (dr < 0 and cl[p] < sma[p])
                    cost = spread_px + 0.02 * (hi - lo)
                    for sl in SLS:
                        stop = (lo if dr > 0 else hi) if sl == "opp" else (hi + lo) / 2
                        for tgt in TGTS:
                            r = outcome(T, H, L, C, j, dr, e, stop, tgt, cost)
                            if r is None: continue
                            for width in WIDTH:
                                if width != "alle" and wcls != width: continue
                                for trend in TREND:
                                    if trend == "mit" and not trend_ok: continue
                                    for d_ in DIRS:
                                        if (d_ == "long" and dr < 0) or (d_ == "short" and dr > 0): continue
                                        res.setdefault((sess, rng, win, sl, str(tgt), width, trend, d_), []).append((day, r))
    return {"name": name, "res": res, "t0": int(T[0]), "t1": int(T[-1]), "weeks": (T[-1] - T[0]) / 604800}

def stats(L):
    if not L: return None
    a = np.array([r for _, r in L]); n = len(a)
    return n, float(a.mean()), float(a.mean() / (a.std(ddof=1) / math.sqrt(n))) if n > 2 and a.std() > 0 else 0.0

def auto_offset(path, ref="hub/data/xauusd_m5.csv"):
    """Broker-Serverzeit → UTC: verschiebt die Gold-Kerzen des Brokers stundenweise gegen die Hub-Gold-Kerzen (UTC) und nimmt die beste Übereinstimmung."""
    if not os.path.exists(ref): return 0.0
    rt = {}
    with open(ref) as f:
        for r in csv.DictReader(f): rt[int(float(r["t"]))] = float(r["c"])
    bt = {}
    with open(path) as f:
        for r in csv.DictReader(f): bt[int(float(r["t"]))] = float(r["c"])
    best = (1e18, 0)
    for h in range(-4, 5):
        d = [abs(c - rt[t - h * 3600]) for t, c in bt.items() if (t - h * 3600) in rt]
        if len(d) > 500: best = min(best, (float(np.median(d)), h))
    return float(best[1])

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("folder"); ap.add_argument("--offset", default="0", help="Broker-Serverzeit minus UTC in Stunden")
    ap.add_argument("--out", default="hub/reports/orb_multi.md"); ap.add_argument("--only", default="")
    a = ap.parse_args()
    files = sorted(glob.glob(os.path.join(a.folder, "*_m5.csv")))
    if a.only: files = [f for f in files if any(x.upper() in os.path.basename(f).upper() for x in a.only.split(","))]
    if a.offset == "ny": pass
    elif a.offset == "auto":
        g = [f for f in files if os.path.basename(f).upper().startswith("XAUUSD")]
        a.offset = auto_offset(g[0]) if g else 0.0
        print(f"Zeitversatz Broker → UTC: {a.offset:+.0f} Std.", file=sys.stderr)
    else: a.offset = float(a.offset)
    A = []
    for f in files:
        nm = os.path.basename(f).replace("_m5.csv", "").upper()
        r = run_asset(nm, f, a.offset)
        if r: A.append(r); print(f"{nm}: {r['weeks']:.0f} Wochen, {len(r['res'])} Varianten mit Trades", file=sys.stderr)
    keys = set().union(*[set(x["res"]) for x in A]) if A else set()
    K = len(keys); thr = max(2.0, 0.6 * math.sqrt(2 * math.log(max(K, 2))))
    rows = []
    for k in keys:
        dev_all, ho_all, per = [], [], []
        weeks = 0.0
        for x in A:
            L = sorted(x["res"].get(k, []))
            if len(L) < 20: continue
            cut = L[int(len(L) * 0.7)][0]
            D = [v for v in L if v[0] < cut]; Hh = [v for v in L if v[0] >= cut]
            dev_all += D; ho_all += Hh; weeks = max(weeks, x["weeks"])
            sh = stats(Hh); per.append((x["name"], stats(D), sh, len(L) / max(1, x["weeks"])))
        if len(per) < 3: continue
        sd, sh = stats(dev_all), stats(ho_all)
        if not sd or not sh: continue
        pos_share = sum(1 for p in per if p[2] and p[2][1] > 0) / len(per)
        tpw = sum(p[3] for p in per)
        rows.append({"k": k, "dev": sd, "ho": sh, "pos": pos_share, "n_assets": len(per), "tpw": tpw, "per": per})
    def nb(k):   # Nachbarn: eine Einstellung eine Stufe daneben
        out = []
        for i, grid in [(1, RNG), (2, WIN), (4, [str(t) for t in TGTS])]:
            v = grid.index(k[i] if i != 4 else k[i]) if (k[i] in grid) else None
            if v is None: continue
            for dv in (-1, 1):
                if 0 <= v + dv < len(grid): q = list(k); q[i] = grid[v + dv]; out.append(tuple(q))
        return out
    idx = {r["k"]: r for r in rows}
    good = []
    for r in rows:
        if r["dev"][1] > 0 and r["ho"][1] > 0 and r["dev"][2] >= thr and r["pos"] >= 0.6 and r["ho"][0] >= 60:
            ns = [idx[q]["dev"][1] for q in nb(r["k"]) if q in idx]
            if ns and np.mean(ns) > 0: good.append(r)
    good.sort(key=lambda r: (-r["ho"][1] * math.sqrt(r["ho"][0])))
    top = sorted(rows, key=lambda r: -(r["dev"][2]))[:15]
    L = [f"# Multi-Asset ORB – Forschung {datetime.utcnow():%Y-%m-%d}", "",
         f"Märkte: {', '.join(x['name'] + f' ({x['weeks']:.0f} Wo.)' for x in A)}", f"Getestete Varianten: {K} · Mehrfachtest-Schwelle t ≥ {thr:.2f}", ""]
    L.append(f"## Bestanden ({len(good)})")
    for r in good[:20]:
        k = r["k"]
        L.append(f"- **{k[0]}**, Range {k[1]}m, Fenster {k[2]}m, SL {k[3]}, Ziel {k[4]}, Breite {k[5]}, Trend {k[6]}, Richtung {k[7]} · "
                 f"Entw. Ø {r['dev'][1]:+.3f}R (n={r['dev'][0]}, t={r['dev'][2]:.1f}) · Holdout Ø {r['ho'][1]:+.3f}R (n={r['ho'][0]}) · "
                 f"{r['pos']:.0%} der {r['n_assets']} Märkte im Holdout positiv · ≈ {r['tpw']:.1f} Trades/Woche")
    if not good: L.append("- keine Variante hat alle Prüfungen bestanden")
    L += ["", "## Stärkste Varianten in der Entwicklung (zum Vergleich, nicht automatisch gut)"]
    for r in top:
        k = r["k"]
        L.append(f"- {k} · Entw. Ø {r['dev'][1]:+.3f}R t={r['dev'][2]:.1f} (n={r['dev'][0]}) · Holdout Ø {r['ho'][1]:+.3f}R (n={r['ho'][0]}) · Märkte positiv {r['pos']:.0%} · {r['tpw']:.1f}/Woche")
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    open(a.out, "w").write("\n".join(L) + "\n")
    json.dump([{"k": list(r["k"]), "dev": r["dev"], "ho": r["ho"], "pos": r["pos"], "tpw": r["tpw"],
                "per": [[p[0], p[1], p[2], p[3]] for p in r["per"]]} for r in good], open(a.out.replace(".md", ".json"), "w"))
    print("\n".join(L[:40]))

if __name__ == "__main__":
    main()
