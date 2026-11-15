"""Lernende Handelslogik – nächtliches Training (Familie „learn“). Aufruf: python3 hub/learn.py   (nach research.py)

Für jedes Symbol mit ≥ 60 Tagen 5-Min.-Daten:
  1. Merkmale + Trade-Ergebnisse kommen aus hub/worker/src/learn.js (über node) – identisch zum Live-Papierhandel.
  2. Je Richtung (Long/Short) und Stil (Scalp k=1/H=8 = 2 Std., Intraday k=2/H=32 = 8 Std.): logistische Regression auf den
     ersten 60 % trainiert, Schwelle auf den nächsten 15 % (Validierung) gewählt, dann auf den letzten 25 % GETESTET – mit der echten
     Handelsfunktion runLearn (ein Trade zur Zeit, Kosten, Stop/Ziel). Das Testfenster hat das Modell nie gesehen.
  3. Aufnahme auf Papier nur, wenn: Validierung Ø > 0, Test Ø > +0,05R, Test ≥ 30 Trades, t-Wert im Test ≥ 1,5.
     Bestehende learn-Strategien werden jede Nacht so neu gelernt und geprüft; fällt eine durch, wird sie aussortiert.
  Höchstens 4 learn-Strategien gleichzeitig. Echtgeld nie automatisch.
"""
import json, os, sys, glob, subprocess, hashlib, datetime as dt, tempfile
import numpy as np, pandas as pd
from sklearn.linear_model import LogisticRegression
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from engine import SYMS

HUB = os.path.dirname(os.path.abspath(__file__)); REG = os.path.join(HUB, "registry.json")
JS = os.path.join(HUB, "worker/src/learn.js"); FEATS = os.path.join(HUB, "tools/learn_feats.mjs"); EVAL = os.path.join(HUB, "tools/learn_eval.mjs")
STYLES = [(1, 8, "Scalp 2 Std."), (2, 32, "Intraday 8 Std.")]
MAX_LEARN = 4

def m5(sym):
    lo = sym.lower()
    fs = ([os.path.join(HUB, "data/xauusd_m5.csv")] + sorted(glob.glob(os.path.join(HUB, "data/live/m5_*.csv")))) if sym == "XAUUSD" else sorted(glob.glob(os.path.join(HUB, f"data/live/{lo}_m5_*.csv")))
    fs = [f for f in fs if os.path.exists(f) and os.path.getsize(f) > 30]
    if not fs: return None
    d = pd.concat([pd.read_csv(f) for f in fs]).drop_duplicates("t").sort_values("t")
    return d if len(d) and (d.t.iloc[-1] - d.t.iloc[0]) >= 60 * 86400 else None

def cost_of(sym, d):
    c = SYMS.get(sym, {}); return c["_cost"] if "_cost" in c else c.get("_costp", 0.0012) * float(d.c.tail(8640).median())

def run_sym(sym, d, tmp):
    csv = os.path.join(tmp, sym + ".csv"); d.to_csv(csv, index=False); cost = cost_of(sym, d)
    fj = os.path.join(tmp, sym + "_f.json"); subprocess.run(["node", FEATS, csv, fj, str(cost)], check=True, capture_output=True)
    D = json.load(open(fj)); idx = [i for i, f in enumerate(D["F"]) if f is not None]; T = np.array(D["t"])
    X = np.array([D["F"][i] for i in idx], float); n = len(idx); a, b = int(n * .6), int(n * .75)
    res = []
    for k, H, label in STYLES:
        for side in ("L", "S"):
            r = np.array([np.nan if D["R"][f"k{k}_{side}"][i] is None else D["R"][f"k{k}_{side}"][i] for i in idx])
            ok = ~np.isnan(r); tr = np.arange(0, a - H); va = np.arange(a, b - H); tr, va = tr[ok[tr]], va[ok[va]]
            mu, sd = X[tr].mean(0), X[tr].std(0) + 1e-9
            m = LogisticRegression(C=0.05, max_iter=3000).fit((X[tr] - mu) / sd, (r[tr] > 0).astype(int))
            pv = m.predict_proba((X[va] - mu) / sd)[:, 1]; best = None
            for th in np.arange(0.30, 0.80, 0.025):
                s = pv >= th
                if s.sum() < 40: continue
                if best is None or r[va][s].mean() > best[1]: best = (float(th), float(r[va][s].mean()), int(s.sum()))
            if best is None: continue
            model = dict(mu=[float(x) for x in mu], sd=[float(x) for x in sd], w=[float(x) for x in m.coef_[0]], b=float(m.intercept_[0]))
            p = dict(sym=sym, tf="15m", k=k, H=H, thr=round(best[0], 3), side=side, mL=model if side == "L" else None, mS=model if side == "S" else None, trained=int(T[idx[b - 1]]))
            pj = os.path.join(tmp, "p.json"); json.dump({**p, "_cost": cost}, open(pj, "w"))
            tr_ = json.loads(subprocess.run(["node", EVAL, csv, pj], check=True, capture_output=True, text=True).stdout)
            test = np.array([x["r"] for x in tr_ if x["t"] > p["trained"] and not x.get("open")])
            tt = float(test.mean() / test.std(ddof=1) * np.sqrt(len(test))) if len(test) > 2 and test.std() > 0 else 0.0
            ok_ = best[1] > 0 and len(test) >= 30 and test.mean() > 0.05 and tt >= 1.5
            res.append(dict(p=p, label=label, val=best, n=len(test), mean=float(test.mean()) if len(test) else None, t=tt, ok=ok_))
    return res

def name(p, label): return f"{SYMS.get(p['sym'], {}).get('name', p['sym'])} · Lernmodell {'Long' if p['side'] == 'L' else 'Short'} {label} (Struktur, Kerzen, Momentum, Session) ≥ {p['thr']:.2f}"

def main():
    reg = json.load(open(REG)) if os.path.exists(REG) else {"strategies": [], "log": [], "tried": {}}
    today = dt.date.today().isoformat(); rep = [f"## Lernmodelle {today}"]
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        found = []
        for sym in SYMS:
            d = m5(sym)
            if d is None: rep.append(f"- {SYMS[sym]['name']}: noch zu wenig 5-Min.-Daten (< 60 Tage)"); continue
            for x in run_sym(sym, d, tmp):
                rep.append(f"- {SYMS[sym]['name']} {('Long' if x['p']['side'] == 'L' else 'Short')} {x['label']}: Validierung Ø {x['val'][1]:+.2f}R · TEST {x['n']} Trades Ø {x['mean'] if x['mean'] is None else round(x['mean'], 2)}R, t {x['t']:.1f} → {'BESTANDEN' if x['ok'] else 'nein'}")
                found.append(x)
    # bestehende learn-Strategien: neu gelernt ersetzen oder aussortieren
    act = {(s["params"]["sym"], s["params"]["side"], s["params"]["k"]): s for s in reg["strategies"] if s["family"] == "learn" and s["status"] in ("paper", "approved")}
    for x in found:
        key = (x["p"]["sym"], x["p"]["side"], x["p"]["k"])
        if key in act:
            s = act[key]
            if x["ok"]: s["params"] = x["p"]; s["name"] = name(x["p"], x["label"]); s["backtest"] = dict(n=x["n"], mean=x["mean"], tdev=x["t"], val=x["val"][1])
            else: s["status"] = "retired"; s["reason"] = f"Neu gelernt: Test Ø {x['mean']}R, t {x['t']:.1f}"; reg["log"].append(dict(d=today, id=s["id"], von="paper", nach="retired", grund=s["reason"]))
    n_act = sum(1 for s in reg["strategies"] if s["family"] == "learn" and s["status"] in ("paper", "approved"))
    for x in sorted([x for x in found if x["ok"]], key=lambda x: -x["t"]):
        key = (x["p"]["sym"], x["p"]["side"], x["p"]["k"])
        if key in act or n_act >= MAX_LEARN: continue
        sid = "learn:" + hashlib.md5(json.dumps(key).encode()).hexdigest()[:10]
        reg["strategies"] = [s for s in reg["strategies"] if s["id"] != sid]
        reg["strategies"].append(dict(id=sid, name=name(x["p"], x["label"]), family="learn", params=x["p"], status="paper", created=today, backtest=dict(n=x["n"], mean=x["mean"], tdev=x["t"], val=x["val"][1]), live=dict(n=0)))
        reg["log"].append(dict(d=today, id=sid, von="neu", nach="paper", grund=f"Lernmodell: Test {x['n']} Trades Ø {x['mean']:+.2f}R, t {x['t']:.1f}")); n_act += 1
        rep.append(f"- **NEU auf Papier:** {name(x['p'], x['label'])}")
    json.dump(reg, open(REG, "w"), indent=1, ensure_ascii=False)
    p = os.path.join(HUB, "reports/latest.md")
    if os.path.exists(p): open(p, "a").write("\n\n" + "\n".join(rep) + "\n")
    print("\n".join(rep))

if __name__ == "__main__":
    main()
