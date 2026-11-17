"""WC Trading Hub – Forschungs-Agent (läuft täglich).

Ablauf:
 1. Daten laden (hub/data/*.csv, vom Worker täglich aus MetaApi ergänzt).
 2. Suche: je Familie neue, noch nie getestete Parameter-Kombinationen (Zufall + Nachbarschaft der Besten).
 3. Prüfung (gegen Zufallsfunde; Papierhandel ist danach der eigentliche Test):
    - genug Trades, positiver Erwartungswert in >= 3 von 4 Zeitblöcken,
    - t-Wert im Entwicklungsteil über max(2, 0.6·sqrt(2·ln K)) (K = Anzahl aller je getesteten Varianten der Familie),
    - positiver Erwartungswert im jüngsten Teil (Holdout, wandert mit den Daten mit),
    - Nachbar-Einstellungen ebenfalls im Schnitt positiv (keine Einzelspitze).
 4. Lebenszyklus: candidate -> paper (läuft live auf Papier im Worker) -> approved (Kandidat für echtes Geld, Freigabe nur durch Kevin)
    -> retired (fällt durch Neu-Bewertung oder Live-Ergebnis).
 5. registry.json + Tagesbericht schreiben.
Aufruf: python3 hub/research.py [--budget 300]
"""
import json, os, sys, time, hashlib, random, datetime as dt
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(__file__))
from engine import load, resample, days, run_sess, feats, run_rbo, run_swing, stats, with_sym, SYMS, swing_filter, FILTERS, run_deriv, fx_cur, run_fxs

HUB = os.path.dirname(os.path.abspath(__file__))
REG = os.path.join(HUB, "registry.json")
MAX_PAPER = 12

# ---------------------------------------------------------------- Grammatik / Suchraum
SPACE = {
    "sess": dict(sym=list(SYMS), anchor=list(range(-360, 961, 15)), rl=[15, 30, 45, 60], win=[30, 60, 120, 180], hold=[120, 240, 360],
                 ctr=[0, 1], maxW=[0.2, 0.27, 0.35, 99], tp=[1.0, 1.5, 2.0, 3.0], slm=["opp", "mid"], be=[0, 1.0], tf=["5m"]),
    "rbo": dict(sym=list(SYMS), N=[12, 24, 36, 48, 72, 96], body=[0.5, 0.75, 1.0, 1.5], trend=[0, 1], tp=[1.5, 2.0, 3.0], be=[0, 1.0], tf=["5m", "15m"]),
    "deriv": dict(sym=["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "BNBUSD", "DOGEUSD", "XAUUSD", "XAGUSD"], sig=["liqL", "liqS", "frHi", "frLo", "oiUpPxDn", "oiUpPxUp"],
                  z=[1.5, 2.0, 2.5], dr=[1, -1], hold=[1, 3, 5, 10], k=[1.5, 2.5], tf=["1d"]),
    "fxs": dict(sym=["FX"], N=[10, 20, 40, 60, 120], H=[5, 10, 20], mode=["rev", "mom"], k=[2, 3], tf=["1d"]),
    "swing": dict(sym=list(SYMS), entry=["A", "B", "AB"], k=[1.5, 2.0, 3.0], exitN=[10, 20, 40], brkN=[20, 55, 100], filt=FILTERS, tf=["1d"]),
}
def key(fam, p): return fam + ":" + hashlib.md5(json.dumps(p, sort_keys=True).encode()).hexdigest()[:10]

def neighbors(fam, p):
    out = []
    for k, vals in SPACE[fam].items():
        if k in ("tf", "sym") or len(vals) < 2: continue
        i = vals.index(p[k]) if p[k] in vals else None
        if i is None: continue
        for j in (i - 1, i + 1):
            if 0 <= j < len(vals): q = dict(p); q[k] = vals[j]; out.append(q)
    return out

# ---------------------------------------------------------------- Daten
class SymData:
    """Daten eines Symbols. Gold: Seed (TradingView) + live/m5_*.csv; andere: live/<sym>_m5_*.csv (vom Worker über MetaApi)."""
    def __init__(self, sym):
        import glob
        lo = sym.lower()
        files = ([os.path.join(HUB, "data/xauusd_m5.csv")] + sorted(glob.glob(os.path.join(HUB, "data/live/m5_*.csv")))) if sym == "XAUUSD" \
            else sorted(glob.glob(os.path.join(HUB, f"data/live/{lo}_m5_*.csv")))
        parts = [load(f) for f in files if os.path.exists(f) and os.path.getsize(f) > 30]
        self.m5 = None
        if parts:
            m5 = pd.concat(parts); m5 = m5[~m5.index.duplicated(keep="last")].sort_index()
            if len(m5) and (m5.index[-1] - m5.index[0]).days >= 30:   # mind. 30 Tage für Intraday-Familien
                self.m5 = m5; self.DAYS = days(m5); self.F = {"5m": feats(m5), "15m": feats(resample(m5, "15min"))}
                self.t0, self.t1 = int(m5.index[0].timestamp()), int(m5.index[-1].timestamp())
        p1 = os.path.join(HUB, f"data/{lo}_d1.csv"); pl = os.path.join(HUB, f"data/{lo}_d1_long.csv")   # long = Futures-Historie seit 2006 (Yahoo), davor angehängt
        d1 = load(p1) if os.path.exists(p1) else None
        if os.path.exists(pl):
            L = load(pl); L["h"] = L[["o", "h", "c"]].max(axis=1); L["l"] = L[["o", "l", "c"]].min(axis=1)
            d1 = L if d1 is None else pd.concat([L[L.index < d1.index[0] - pd.Timedelta(hours=12)], d1])
        self.d1 = d1 if d1 is not None and len(d1) >= 260 else None
        self.filt = {}
        src = self.m5 if self.m5 is not None else self.d1
        self.px = float(src.c.iloc[-8640:].median()) if src is not None else None   # Kurs-Niveau für relative Kosten (Krypto)

class Data:
    def __init__(self):
        self.S = {s: SymData(s) for s in SYMS}
        pc, pm = os.path.join(HUB, "data/cot.csv"), os.path.join(HUB, "data/macro_fred.csv")
        self.cot = pd.read_csv(pc) if os.path.exists(pc) else None
        self.ry = None
        self.FXCUR = None   # v2.5: Währungsstärke – 7 Hauptpaare, lange Historie (seit 2010) + Live-Tageskerzen
        try:
            legs = ["EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDJPY", "USDCAD", "USDCHF"]; cl = {}
            for s in legs:
                parts = [pd.read_csv(os.path.join(HUB, f)) for f in (f"data/{s.lower()}_d1_long.csv", f"data/{s.lower()}_d1.csv") if os.path.exists(os.path.join(HUB, f))]
                if not parts: raise FileNotFoundError(s)
                d = pd.concat(parts); d["day"] = (d.t // 86400) * 86400; d = d.drop_duplicates("day", keep="last").sort_values("day"); d.index = pd.to_datetime(d.day, unit="s"); cl[s] = d.c
            self.FXCUR = fx_cur(cl)
        except Exception as e:
            print("Devisen-Historie fehlt:", e)
        pd_ = os.path.join(HUB, "data/deriv_d.csv"); self.DD = {}   # Coinalyze-Tageshistorie je Basis (BTC, ETH, …, XAU, XAG)
        if os.path.exists(pd_):
            dd = pd.read_csv(pd_)
            for b, g in dd.groupby("sym"):
                g = g.dropna(subset=["o", "h", "l", "c"]).copy(); g.index = pd.to_datetime(g.d); g = g.sort_index()
                if len(g) >= 400: self.DD[b + "USD"] = g
        if os.path.exists(pm):
            m = pd.read_csv(pm); m.index = pd.to_datetime(m.iloc[:, 0]); self.ry = pd.to_numeric(m.get("DFII10"), errors="coerce").dropna() if "DFII10" in m else None
        g = self.S["XAUUSD"]; self.m5, self.DAYS, self.d1 = g.m5, g.DAYS, g.d1
    def has(self, fam, sym):
        if fam == "deriv": return sym in self.DD
        if fam == "fxs": return self.FXCUR is not None and len(self.FXCUR) > 300
        x = self.S[sym]; return (x.d1 is not None) if fam == "swing" else (x.m5 is not None)
    def trades(self, fam, p):
        if fam == "fxs": return run_fxs(self.FXCUR, p) if self.FXCUR is not None else []
        if fam == "deriv":
            sym = p.get("sym"); return run_deriv(self.DD[sym], {**p, "_costp": 0.0006 if sym in ("XAUUSD", "XAGUSD") else SYMS.get(sym, {}).get("_costp", 0.0012)}) if sym in self.DD else []
        x = self.S[p.get("sym", "XAUUSD")]; q = with_sym(p, x.px)
        if not self.has(fam, p.get("sym", "XAUUSD")): return []
        if fam == "sess": return run_sess(x.DAYS, q)
        if fam == "rbo": return run_rbo(x.F[p["tf"]], q)
        if fam == "swing":
            f = p.get("filt", "none"); sym = p.get("sym", "XAUUSD")
            if f != "none" and sym == "BTCUSD": return []   # COT/Realzins-Filter nur für Gold/Silber
            if f not in x.filt:
                cot = self.cot[self.cot.sym == sym] if self.cot is not None else None
                x.filt[f] = swing_filter(x.d1.index.tz_localize(None).values.astype("datetime64[D]"), f, cot, self.ry)
            return run_swing(x.d1, {**q, "_filt": x.filt[f]})
        return []
    def span(self, fam, sym="XAUUSD"):
        if fam == "deriv": g = self.DD[sym]; return int(g.index[0].timestamp()), int(g.index[-1].timestamp())
        if fam == "fxs": return int(self.FXCUR.index[0].timestamp()), int(self.FXCUR.index[-1].timestamp())
        x = self.S[sym]
        if fam == "swing" and x.d1 is not None: return int(x.d1.index[0].timestamp()), int(x.d1.index[-1].timestamp())
        return x.t0, x.t1

def evaluate(D, fam, p, K, cache):
    k = key(fam, p)
    if k in cache: return cache[k]
    tr = D.trades(fam, p); a, b = D.span(fam, p.get("sym", "XAUUSD"))
    r = np.array([x["r"] for x in tr]); t = np.array([x["t"] for x in tr])
    res = dict(n=len(r), ok=False, why="")
    min_n = 15 if fam in ("swing", "deriv", "fxs") else 40
    if len(r) < min_n:
        res["why"] = f"zu wenige Trades ({len(r)})"; cache[k] = res; return res
    cut = a + 0.7 * (b - a)
    dev, hold = r[t < cut], r[t >= cut]
    blocks = [r[(t >= a + i * (b - a) / 4) & (t < a + (i + 1) * (b - a) / 4 + 1)] for i in range(4)]
    bpos = sum(1 for x in blocks if len(x) and x.mean() > 0)
    sd = dev.std(ddof=1) if len(dev) > 2 else np.inf
    tdev = dev.mean() / sd * np.sqrt(len(dev)) if sd > 0 else 0
    thr = max(2.0, 0.6 * np.sqrt(2 * np.log(max(K, 2))))   # Papier-Schwelle: Papierhandel kostet nichts und ist selbst der echte Test
    s = stats(tr)
    res.update(s, tdev=float(tdev), thr=float(thr), hold_mean=float(hold.mean()) if len(hold) else None, hold_n=int(len(hold)),
               blocks_pos=bpos, mfe05=float(np.mean([x.get("mfe", 0) >= 0.5 for x in tr])) if fam == "sess" else None)
    if tdev < thr: res["why"] = f"t {tdev:.1f} < Schwelle {thr:.1f}"
    elif len(hold) < (5 if fam in ("swing", "deriv", "fxs") else 12) or hold.mean() <= 0: res["why"] = "Holdout nicht positiv"
    elif bpos < 3: res["why"] = f"nur {bpos}/4 Zeitblöcke positiv"
    else: res["ok"] = True
    cache[k] = res
    return res

def neighbor_ok(D, fam, p, K, cache):
    ms = []
    for q in neighbors(fam, p):
        tr = D.trades(fam, q)
        if len(tr) >= 10: ms.append(np.mean([x["r"] for x in tr]))
    return (np.mean(ms) > 0 and np.mean(np.array(ms) > 0) >= 0.6) if ms else False

def sample(fam, rng):
    return {k: rng.choice(v) for k, v in SPACE[fam].items()}

def clean(p):  # numpy -> json
    return {k: (v.item() if hasattr(v, "item") else v) for k, v in p.items()}

# ---------------------------------------------------------------- Hauptlauf
def main(budget=300, seed=None):
    t_start = time.time()
    reg = json.load(open(REG)) if os.path.exists(REG) else {"tried": {}, "strategies": [], "log": []}
    tried = reg["tried"]; D = Data(); cache = {}
    today = dt.date.today().isoformat(); rng = random.Random(seed or today)
    live = {}
    lp = os.path.join(HUB, "live/trades.json")
    if os.path.exists(lp):
        for x in json.load(open(lp)): live.setdefault(x["sid"], []).append(x)
    report = [f"# Hub-Forschung {today}", ""]
    for sy, x in D.S.items():
        report.append(f"- {SYMS[sy]['name']}: " + (f"5m {x.m5.index[0].date()} – {x.m5.index[-1].date()} ({len(x.DAYS)} Tage)" if x.m5 is not None else "5m: noch zu wenig Daten (< 30 Tage)") +
                      (f", Tageskerzen ab {x.d1.index[0].date()}" if x.d1 is not None else ", Tageskerzen: keine"))

    # 1) bestehende Strategien neu bewerten
    report += ["", "## Bestehende Strategien"]
    for s in reg["strategies"]:
        if s["status"] == "retired": continue
        fam, p = s["family"], s["params"]
        if fam in ("ibs", "tt", "tbo"):   # v3.0: extern getestet (MT5-Daten, hub/tbo_multi.py / templates_test.py) – hier nur Live-Bilanz pflegen
            born = int(pd.Timestamp(s.get("created", "2000-01-01"), tz="UTC").timestamp()) + 86400
            lr = np.array([x["r"] for x in live.get(s["id"], []) if x.get("closed") and x["t"] >= born]); s["live"] = dict(n=len(lr), mean=float(lr.mean()) if len(lr) else None, win=float((lr > 0).mean()) if len(lr) else None)
            if len(lr) >= 20 and lr[-20:].mean() < -0.15 and s["status"] != "retired":
                s["status"] = "retired"; s["reason"] = f"Live schwach: letzte 20 Papier-Trades Ø {lr[-20:].mean():+.2f}R"; reg["log"].append(dict(d=today, id=s["id"], von="paper", nach="retired", grund=s["reason"]))
            report.append(f"- **{s['name']}** [{s['status']}] Backtest (MT5, 4 J.) Ø {s['backtest'].get('mean', 0):+.2f}R n={s['backtest'].get('n')}, live n={len(lr)}" + (f" Ø {lr.mean():+.2f}R" if len(lr) else ""))
            continue
        K = len([k for k in tried if k.startswith(fam + ":")])
        ev = evaluate(D, fam, p, K, cache)
        born = int(pd.Timestamp(s.get("created", "2000-01-01"), tz="UTC").timestamp()) + 86400   # nur echte Vorwärts-Trades
        L = [x for x in live.get(s["id"], []) if x.get("closed") and x["t"] >= born]
        lr = np.array([x["r"] for x in L]); s["live"] = dict(n=len(lr), mean=float(lr.mean()) if len(lr) else None, win=float((lr > 0).mean()) if len(lr) else None)
        s["backtest"] = {k: ev.get(k) for k in ("n", "mean", "win", "pf", "dd", "tdev", "thr", "hold_mean", "blocks_pos", "mfe05")}
        old = s["status"]
        if not ev["ok"] and ev.get("n", 0) and (ev.get("mean") or 0) <= 0.02:
            s["status"] = "retired"; s["reason"] = "Neubewertung: " + ev["why"]
        elif len(lr) >= 20 and lr[-20:].mean() < -0.15:
            s["status"] = "retired"; s["reason"] = f"Live schwach: letzte 20 Papier-Trades Ø {lr[-20:].mean():+.2f}R"
        elif s["status"] == "paper" and len(lr) >= 30 and lr.mean() > 0.1 and lr.mean() / (lr.std(ddof=1) or 1) * np.sqrt(len(lr)) >= 1.5:
            s["status"] = "approved"; s["reason"] = f"30+ Papier-Trades, live Ø {lr.mean():+.2f}R – Freigabe durch Kevin nötig"
        if s["status"] != old: reg["log"].append(dict(d=today, id=s["id"], von=old, nach=s["status"], grund=s.get("reason", "")))
        report.append(f"- **{s['name']}** [{s['status']}] Backtest Ø {ev.get('mean', 0):+.2f}R (n={ev.get('n')}, Holdout {ev.get('hold_mean') if ev.get('hold_mean') is None else round(ev['hold_mean'], 2)}), live n={len(lr)}" +
                      (f" Ø {lr.mean():+.2f}R" if len(lr) else "") + (f" → {s['status'].upper()}: {s.get('reason')}" if s["status"] != old else ""))

    # 2) Suche nach neuen Strategien
    report += ["", "## Suche nach neuen Strategien"]
    fams = ["sess", "rbo"] + (["swing"] if any(D.has("swing", x) for x in SYMS) else []) + (["deriv"] if D.DD else []) + (["fxs"] if D.has("fxs", "FX") else [])
    found = []
    for fam in fams:
        share = {"sess": 0.5, "rbo": 0.15, "swing": 0.1, "deriv": 0.15, "fxs": 0.1}[fam]
        n_new = int(budget * share); tested = 0; passed = 0; tries = 0
        # Nachbarschaft der aktuell besten Kandidaten zuerst (gezielte Weiterentwicklung)
        seeds = [s["params"] for s in reg["strategies"] if s["family"] == fam and s["status"] in ("paper", "approved")]
        queue = [q for sp in seeds for q in neighbors(fam, sp)]
        rng.shuffle(queue)
        while tested < n_new and tries < n_new * 20:
            tries += 1
            p = clean(queue.pop()) if queue else clean(sample(fam, rng))
            if fam == "sess" and p["anchor"] + p["rl"] + p["win"] + p["hold"] > 1020: continue
            if not D.has(fam, p.get("sym", "XAUUSD")): continue   # für dieses Symbol (noch) keine Daten
            k = key(fam, p)
            if k in tried: continue
            tried[k] = today; tested += 1
            K = len([x for x in tried if x.startswith(fam + ":")])
            ev = evaluate(D, fam, p, K, cache)
            if ev["ok"] and neighbor_ok(D, fam, p, K, cache):
                passed += 1; found.append((fam, p, ev))
        report.append(f"- {fam}: {tested} neue Varianten getestet (insgesamt {len([x for x in tried if x.startswith(fam + ':')])}), bestanden: {passed}")

    # 3) Neue Strategien aufnehmen (Duplikate vermeiden, Obergrenze)
    def similar(a, b):
        if a[0] != b["family"] or a[1].get("sym", "XAUUSD") != b["params"].get("sym", "XAUUSD"): return False
        if a[0] == "sess": return abs(a[1]["anchor"] - b["params"]["anchor"]) <= 30
        if a[0] == "rbo": return a[1]["tf"] == b["params"]["tf"] and abs(a[1]["N"] - b["params"]["N"]) <= 12
        if a[0] == "deriv": return a[1]["sig"] == b["params"]["sig"] and a[1]["dr"] == b["params"]["dr"]
        if a[0] == "fxs": return a[1]["mode"] == b["params"]["mode"]
        return True
    found.sort(key=lambda x: -x[2]["tdev"])
    active = [s for s in reg["strategies"] if s["status"] in ("paper", "approved")]
    added = 0
    for fam, p, ev in found:
        if len(active) >= MAX_PAPER: break
        if any(similar((fam, p), s) for s in active): continue
        sid = key(fam, p)
        name = describe(fam, p)
        s = dict(id=sid, name=name, family=fam, params=p, status="paper", created=today,
                 backtest={k: ev.get(k) for k in ("n", "mean", "win", "pf", "dd", "tdev", "thr", "hold_mean", "blocks_pos", "mfe05")}, live=dict(n=0))
        reg["strategies"].append(s); active.append(s); added += 1
        reg["log"].append(dict(d=today, id=sid, von="neu", nach="paper", grund=f"bestanden: t={ev['tdev']:.1f} > {ev['thr']:.1f}, Holdout Ø {ev['hold_mean']:+.2f}R"))
        report.append(f"- **NEU auf Papier:** {name} – Backtest Ø {ev['mean']:+.2f}R, Treffer {ev['win']:.0%}, n={ev['n']}, Holdout Ø {ev['hold_mean']:+.2f}R")
    if not added: report.append("- Heute keine neue Strategie, die alle Prüfungen besteht.")

    reg["updated"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    reg["log"] = reg["log"][-300:]
    json.dump(reg, open(REG, "w"), indent=1, ensure_ascii=False)
    os.makedirs(os.path.join(HUB, "reports"), exist_ok=True)
    act = [s for s in reg["strategies"] if s["status"] in ("paper", "approved")]
    report += ["", f"## Aktiv: {len(act)} Strategien", *[f"- {s['name']} [{s['status']}]" for s in act], "", f"_Laufzeit {time.time() - t_start:.0f}s_"]
    txt = "\n".join(report)
    open(os.path.join(HUB, "reports", f"{today}.md"), "w").write(txt)
    open(os.path.join(HUB, "reports", "latest.md"), "w").write(txt)
    print(txt)

def hm(m):
    m = int(m); b = (m + 420) % 1440; s = "" if m >= 0 else " Vortag"; m %= 1440
    return f"{b // 60:02d}:{b % 60:02d} Uhr (≈ {m // 60:02d}:{m % 60:02d} NY{s})"

def describe(fam, p):
    return SYMS.get(p.get("sym", "XAUUSD"), {}).get("name", "Devisen") + " · " + _describe(fam, p)

def _describe(fam, p):
    if fam == "sess":
        f = (" gegen Tagesrichtung" if p["ctr"] else "") + (f", Range < {p['maxW']}σ" if p["maxW"] < 99 else "")
        return f"Session-Ausbruch {hm(p['anchor'])}, Range {p['rl']}m, Fenster {p['win']}m, Ziel {p['tp']}R{', BE 1R' if p['be'] else ''}, SL {'Gegenseite' if p['slm'] == 'opp' else 'Mitte'}{f}"
    if fam == "rbo":
        return f"Ausbruch+Retest {p['tf']} N={p['N']}, Körper {p['body']}·ATR{', mit 1h-Trend' if p['trend'] else ''}, Ziel {p['tp']}R{', BE 1R' if p['be'] else ''}"
    if fam == "fxs":
        return f"Währungsstärke ({'schwächste kaufen / stärkste verkaufen' if p['mode'] == 'rev' else 'stärkste kaufen / schwächste verkaufen'}) über {p['N']} Tage, {p['H']} Tage halten, Stop {p['k']}·σ – 28 Kreuzpaare"
    if fam == "deriv":
        S = {"liqL": "nach Welle von Long-Liquidationen", "liqS": "nach Welle von Short-Liquidationen", "frHi": "bei extrem hohem Funding", "frLo": "bei extrem niedrigem Funding",
             "oiUpPxDn": "wenn Open Interest stark steigt und Preis fällt", "oiUpPxUp": "wenn Open Interest stark steigt und Preis steigt"}
        return f"Derivate: {'Long' if p['dr'] > 0 else 'Short'} {S[p['sig']]} (z>{p['z']}), {p['hold']} Tage halten, SL {p['k']}·ATR"
    if fam == "swing":
        F = {"none": "", "cot80": ", nur wenn Fonds nicht extrem long (COT)", "cotchg": ", nur wenn Fonds Longs aufbauen (COT)", "ry20": ", nur wenn Realzins nicht steigt",
             "rysma": ", nur wenn Realzins unter 50-Tage-Schnitt", "cot80ry": ", nur wenn Fonds nicht extrem long und Realzins nicht steigt"}
        return f"Swing Long {p['entry']} (Ausbruch {p['brkN']}T), SL {p['k']}·ATR, Ausstieg {p['exitN']}-Tage-Tief" + F.get(p.get("filt", "none"), "")
    return fam

if __name__ == "__main__":
    b = int(sys.argv[sys.argv.index("--budget") + 1]) if "--budget" in sys.argv else 300
    main(b)
