"""WC Trading Hub – Backtest-Engine (Python). Muss 1:1 zur JS-Engine im Worker passen (hub/worker/src/engine.js).

Strategie-Grammatik (Familien):
  sess  – Session-Range-Ausbruch: Range ab Anker (New-York-Zeit) über rl Minuten, erster Kerzenschluss außerhalb
          im Fenster win, Einstieg nächste Kerze, SL Gegenseite/Mitte, Ziel tp·R, optional BE, Zeit-Exit.
          Filter: ctr (nur gegen Tagesrichtung Tagesöffnung→Anker), maxW (Range-Breite < maxW·σ),
          σ = 0.68 · Ø-Tagesrange der letzten 14 Tage (Näherung der impliziten Tagesvolatilität).
  rbo   – Range-Ausbruch mit Retest: Schluss über N-Kerzen-Hoch/-Tief, Körper ≥ body·ATR14, optional 1h-Trend (EMA50),
          Limit am gebrochenen Level (wait Kerzen), SL andere Range-Seite, Ziel tp·R, BE ab 1R, max. maxb Kerzen.
  swing – Tagesbasis: Trend (Schluss>SMA200, SMA50>SMA200), Einstieg A=55-Tage-Ausbruch / B=Rücksetzer SMA50,
          SL k·ATR20, Ausstieg Schluss < exitN-Tage-Tief.
Alle Kurse in $, Kosten COST je Trade. Ergebnis: Liste von Trades (dict) mit Zeitstempel, Richtung, R.
"""
import numpy as np, pandas as pd

COST = 0.35
# Handelskosten (Spread/Kommission, in Preis-Einheiten) und Mindestrisiko je Symbol
SYMS = {"XAUUSD": dict(_cost=0.35, _minr=0.3, name="Gold"), "XAGUSD": dict(_cost=0.03, _minr=0.02, name="Silber"), "BTCUSD": dict(_cost=20.0, _minr=20.0, name="Bitcoin")}
def with_sym(p):
    c = SYMS.get(p.get("sym", "XAUUSD"), SYMS["XAUUSD"]); return {**p, "_cost": c["_cost"], "_minr": c["_minr"]}

def load(path):
    d = pd.read_csv(path)
    d.index = pd.to_datetime(d.t, unit="s", utc=True)
    return d[["o", "h", "l", "c"]].astype(float)

def resample(d, rule):
    return d.resample(rule, label="left", closed="left").agg({"o": "first", "h": "max", "l": "min", "c": "last"}).dropna()

# ---------------------------------------------------------------- Tagesstruktur
def days(d):
    """Teilt in Handelstage (Kalendertag Europe/Bucharest). Liefert Liste von dicts mit Arrays + Tagesgrößen."""
    buc = d.index.tz_convert("Europe/Bucharest"); ny = d.index.tz_convert("America/New_York")
    mny = (ny.hour * 60 + ny.minute).values.astype(int)
    # NY-Minuten relativ zum Bukarest-Tag (Vorabend NY = negativ)
    mny = np.where(ny.date < buc.date, mny - 1440, mny)
    key = buc.date
    out = []; rng_hist = []
    for k in pd.unique(key):
        idx = np.where(key == k)[0]
        if pd.Timestamp(k).weekday() >= 5 or len(idx) < 20:
            continue
        x = d.iloc[idx]
        sig = 0.68 * np.mean(rng_hist[-14:]) if len(rng_hist) >= 5 else np.nan
        out.append(dict(day=str(k), t=d.index[idx].values.astype("datetime64[s]").astype(np.int64), m=mny[idx],
                        o=x.o.values, h=x.h.values, l=x.l.values, c=x.c.values, op=x.o.values[0], sig=sig))
        rng_hist.append(x.h.max() - x.l.min())
    return out

# ---------------------------------------------------------------- Familie sess
def _manage(D, k, dr, e, sl, tp, xend, be, COST=COST):
    h, l, o, c, m = D["h"], D["l"], D["o"], D["c"], D["m"]
    r = dr * (e - sl); stop = sl; moved = False
    for q in range(k, len(c)):
        if m[q] >= xend:
            return (dr * (o[q] - e) - COST) / r, q, "Zeit"
        if (dr > 0 and l[q] <= stop) or (dr < 0 and h[q] >= stop):
            px = min(stop, o[q]) if dr > 0 else max(stop, o[q])
            return (dr * (px - e) - COST) / r, q, ("BE" if moved else "SL")
        if (dr > 0 and h[q] >= tp) or (dr < 0 and l[q] <= tp):
            return (dr * (tp - e) - COST) / r, q, "Ziel"
        if be and not moved and dr * ((h[q] if dr > 0 else l[q]) - e) >= be * r:
            stop = e; moved = True
    return (dr * (c[-1] - e) - COST) / r, len(c) - 1, "Tagesende"

def sess_day(D, p):
    a, rl, win, hold = p["anchor"], p["rl"], p["win"], p["hold"]
    m, h, l, c, o = D["m"], D["h"], D["l"], D["c"], D["o"]
    R = (m >= a) & (m < a + rl)
    if R.sum() < 2 or not (m < a).any() or np.isnan(D["sig"]):
        return None
    H, L = h[R].max(), l[R].min()
    pre = c[np.where(m < a)[0][-1]]
    idx = np.where((m >= a + rl) & (m < a + rl + win))[0]
    for j in idx:
        if j + 1 >= len(c):
            return None
        if c[j] > H or c[j] < L:
            dr = 1 if c[j] > H else -1
            if p.get("ctr") and np.sign(pre - D["op"]) == dr:
                return None
            if (H - L) / D["sig"] >= p.get("maxW", 99):
                return None
            e = o[j + 1]
            sl = (L if dr > 0 else H) if p.get("slm", "opp") == "opp" else (H + L) / 2
            r = dr * (e - sl)
            if r <= p.get("_minr", 0.3):
                return None
            R_, q, why = _manage(D, j + 1, dr, e, sl, e + dr * p["tp"] * r, a + rl + hold, p.get("be", 0), p.get("_cost", COST))
            # MFE bis SL/Exit (für Trailing-Auswertung)
            mfe = 0.0
            for z in range(j + 1, q + 1):
                mfe = max(mfe, dr * ((h[z] if dr > 0 else l[z]) - e) / r)
            return dict(t=int(D["t"][j + 1]), dr=dr, e=float(e), sl=float(sl), r=float(R_), why=why, mfe=float(mfe), tx=int(D["t"][q]))
    return None

def run_sess(DAYS, p):
    return [t for D in DAYS if (t := sess_day(D, p)) is not None]

# ---------------------------------------------------------------- Familie rbo
def feats(d):
    h, l, c = d.h.values, d.l.values, d.c.values
    tr = np.maximum(h - l, np.maximum(abs(h - np.r_[c[0], c[:-1]]), abs(l - np.r_[c[0], c[:-1]])))
    atr = pd.Series(tr).ewm(alpha=1 / 14, adjust=False).mean().values
    H = d.c.resample("60min").last().dropna(); e = H.ewm(span=50, adjust=False).mean()
    st = pd.Series(np.where((H > e) & (e > e.shift(3)), 1, np.where((H < e) & (e < e.shift(3)), -1, 0)), index=H.index + pd.Timedelta("60min"))
    st = st.reindex(d.index, method="ffill").fillna(0).values
    return dict(o=d.o.values, h=h, l=l, c=c, atr=atr, st=st, t=d.index.values.astype("datetime64[s]").astype(np.int64), n=len(d))

def run_rbo(F, p):
    N, body, trend, tp, be, wait, maxb = p["N"], p["body"], p["trend"], p["tp"], p.get("be", 1.0), p.get("wait", 6), p.get("maxb", 96)
    COST, MINR = p.get("_cost", 0.35), p.get("_minr", 0.3)
    o, h, l, c, a, st, n = F["o"], F["h"], F["l"], F["c"], F["atr"], F["st"], F["n"]
    hi = pd.Series(h).rolling(N).max().shift(1).values; lo = pd.Series(l).rolling(N).min().shift(1).values
    out = []; i = 300
    while i < n - 2:
        sig = None
        for dr, lvl in ((1, hi[i]), (-1, lo[i])):
            if dr * (c[i] - lvl) > 0 and abs(c[i] - o[i]) >= body * a[i] and dr * (c[i] - o[i]) > 0 and (not trend or st[i] == dr):
                sig = (dr, lvl, lo[i] if dr > 0 else hi[i]); break
        if not sig:
            i += 1; continue
        dr, lvl, sl = sig; k = None
        for j in range(i + 1, min(n, i + 1 + wait)):
            if (dr > 0 and l[j] <= lvl) or (dr < 0 and h[j] >= lvl):
                k = j; break
        if k is None:
            i += 1; continue
        e = min(lvl, o[k]) if dr > 0 else max(lvl, o[k]); r = abs(e - sl)
        if r <= MINR:
            i += 1; continue
        tpp = e + dr * tp * r; stop = sl; moved = False; res = None
        if (dr > 0 and l[k] <= sl) or (dr < 0 and h[k] >= sl):
            res = ((-r - COST) / r, k, "SL")
        else:
            for q in range(k + 1, min(n, k + maxb)):
                if (dr > 0 and l[q] <= stop) or (dr < 0 and h[q] >= stop):
                    px = min(stop, o[q]) if dr > 0 else max(stop, o[q]); res = ((dr * (px - e) - COST) / r, q, "BE" if moved else "SL"); break
                if (dr > 0 and h[q] >= tpp) or (dr < 0 and l[q] <= tpp):
                    res = ((dr * (tpp - e) - COST) / r, q, "Ziel"); break
                if be and not moved and dr * ((h[q] if dr > 0 else l[q]) - e) >= be * r:
                    stop = e; moved = True
            if res is None:
                q = min(n - 1, k + maxb - 1); res = ((dr * (c[q] - e) - COST) / r, q, "Zeit")
        out.append(dict(t=int(F["t"][k]), dr=dr, e=float(e), sl=float(sl), r=float(res[0]), why=res[2], tx=int(F["t"][res[1]])))
        i = res[1] + 1
    return out

# ---------------------------------------------------------------- Familie swing (Tageskerzen)
def run_swing(d1, p):
    o, h, l, c = d1.o.values, d1.h.values, d1.l.values, d1.c.values; n = len(c)
    s = lambda w: pd.Series(c).rolling(w).mean().values
    s50, s200 = s(50), s(200)
    tr = np.maximum(h - l, np.maximum(abs(h - np.r_[c[0], c[:-1]]), abs(l - np.r_[c[0], c[:-1]])))
    atr = pd.Series(tr).ewm(alpha=1 / 20, adjust=False).mean().values
    hh = pd.Series(h).rolling(p.get("brkN", 55)).max().shift(1).values
    ll = pd.Series(l).rolling(p["exitN"]).min().shift(1).values
    t = d1.index.values.astype("datetime64[s]").astype(np.int64)
    out = []; i = 210
    while i < n - 1:
        trend = c[i] > s200[i] and s50[i] > s200[i]
        ent = False
        if trend and p["entry"] in ("A", "AB") and c[i] > hh[i]: ent = True
        if trend and p["entry"] in ("B", "AB") and min(l[i], l[i-1], l[i-2]) <= max(s50[i], s50[i-1], s50[i-2]) and c[i] > h[i-1]: ent = True
        if ent and p.get("_filt") is not None and not p["_filt"][i]: ent = False   # Zusatzfilter (COT/Zinsen), vorab je Tag berechnet
        if not ent:
            i += 1; continue
        j0 = i + 1; e = o[j0]; R = p["k"] * atr[i]; stop = e - R; ex = None; j = j0
        while j < n:
            if l[j] <= stop: ex = min(stop, o[j]); break
            if j > j0 + 1 and c[j] < ll[j] and j + 1 < n: ex = o[j + 1]; j += 1; break
            j += 1
        if ex is None: ex = c[-1]; j = n - 1
        out.append(dict(t=int(t[j0]), dr=1, e=float(e), sl=float(e - R), r=float((ex - e - p.get("_cost", 0.5)) / R), why="exit", tx=int(t[j])))
        i = j + 1
    return out


# ---------------------------------------------------------------- Swing-Zusatzfilter (v1.5): COMEX-Positionierung (COT) und US-Realzinsen (FRED DFII10)
# cot: DataFrame d (Dienstag des Berichts), net = (mm_l - mm_s) / oi   ·   ry: Series DFII10 mit Datum als Index
# Arten: none · cot80 (Fonds nicht extrem long: Perzentil < 80 % der letzten 3 Jahre) · cotchg (Fonds bauen in 4 Wochen Longs auf)
#        ry20 (Realzins in 20 Handelstagen nicht gestiegen) · rysma (Realzins unter 50-Tage-Schnitt) · cot80ry (cot80 und ry20)
FILTERS = ["none", "cot80", "cotchg", "ry20", "rysma", "cot80ry"]
def cot_feats(cot):
    c = cot.sort_values("d"); net = ((c.mm_l - c.mm_s) / c.oi).values; pct = np.full(len(net), np.nan); chg = np.full(len(net), np.nan)
    for i in range(len(net)):
        w = net[max(0, i - 155): i + 1]
        if len(w) >= 52: pct[i] = (w <= net[i]).mean()
        if i >= 4: chg[i] = net[i] - net[i - 4]
    avail = (pd.to_datetime(c.d).values.astype("datetime64[D]") + np.timedelta64(4, "D")).astype("datetime64[D]")   # Bericht Di, veröffentlicht Fr
    return avail, pct, chg
def swing_filter(dates, kind, cot=None, ry=None):
    """dates: Handelstage (datetime64[D]); gibt bool-Array zurück (True = Einstieg erlaubt). Fehlende Daten = erlaubt."""
    n = len(dates); ok = np.ones(n, bool); dates = np.asarray(dates).astype("datetime64[D]")
    if kind == "none": return ok
    if kind in ("cot80", "cotchg", "cot80ry") and cot is not None and len(cot):
        av, pct, chg = cot_feats(cot); j = np.searchsorted(av, dates, side="right") - 1
        P = np.where(j >= 0, pct[np.clip(j, 0, None)], np.nan); Cg = np.where(j >= 0, chg[np.clip(j, 0, None)], np.nan)
        if kind in ("cot80", "cot80ry"): ok &= ~(P >= 0.8)
        if kind == "cotchg": ok &= ~(Cg <= 0)
    if kind in ("ry20", "rysma", "cot80ry") and ry is not None and len(ry):
        ry = ry.dropna(); rd = ry.index.values.astype("datetime64[D]"); rv = ry.values
        j = np.searchsorted(rd, dates, side="left") - 1   # letzter Wert VOR dem Handelstag (FRED veröffentlicht am Folgetag)
        R = np.where(j >= 0, rv[np.clip(j, 0, None)], np.nan)
        if kind in ("ry20", "cot80ry"):
            d20 = R - np.r_[np.full(20, np.nan), R[:-20]] if n > 20 else np.full(n, np.nan); ok &= ~(d20 > 0)
        if kind == "rysma":
            sma = pd.Series(R).rolling(50).mean().values; ok &= ~(R > sma)
    return ok

# ---------------------------------------------------------------- Kennzahlen
def stats(trades):
    r = np.array([x["r"] for x in trades])
    if len(r) == 0:
        return dict(n=0)
    W, L = r[r > 0], r[r <= 0]
    eq = np.cumsum(r); dd = float((np.maximum.accumulate(np.r_[0, eq])[1:] - eq).max())
    sd = r.std(ddof=1) if len(r) > 1 else np.nan
    return dict(n=int(len(r)), mean=float(r.mean()), win=float((r > 0).mean()), pf=float(W.sum() / -L.sum()) if len(L) and L.sum() < 0 else 99.0,
                sum=float(r.sum()), dd=dd, t=float(r.mean() / sd * np.sqrt(len(r))) if sd and sd > 0 else 0.0)
