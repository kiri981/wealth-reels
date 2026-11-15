"""Übernimmt Kerzen/Papier-Trades aus D1 (vom Worker wc-hub gesammelt) ins Repo – ohne GitHub-Token im Worker.
Aufruf: python3 hub/ingest.py <datei.json> [<datei.json> …]   ·   python3 hub/ingest.py --last [XAGUSD|BTCUSD]
Symbole: in hub_candles.tf steht "5m"/"1d" für Gold, "XAGUSD:5m", "BTCUSD:1d" usw. für die anderen.
Jede Datei: JSON-Liste von Zeilen aus D1, z. B. das "results"-Array von
  SELECT tf, t, o, h, l, c FROM hub_candles WHERE …            (Kerzen, tf = '5m' oder '1d')
  SELECT sid, t, dr, e, sl, r, why, tx, closed FROM hub_trades (Papier-Trades, ersetzt live/trades.json komplett)
Zusatzdaten: Zeilen aus hub_cot / hub_etf / hub_deriv / hub_events / hub_news werden erkannt und nach hub/data/<art>.csv zusammengeführt.
Ausgabe: hub/data/live/m5_YYYY-MM.csv (zusammengeführt, ohne Duplikate), hub/data/xauusd_d1.csv, hub/live/trades.json
Zeigt am Ende den Zeitpunkt der letzten 5m-Kerze im Repo (für die nächste Abfrage: WHERE t > <wert>).
"""
import json, os, sys, glob
import pandas as pd

HUB = os.path.dirname(os.path.abspath(__file__))

def last_t(sym="XAUUSD"):
    if sym != "XAUUSD":
        fs = sorted(glob.glob(os.path.join(HUB, f"data/live/{sym.lower()}_m5_*.csv")))
        ts = [int(pd.read_csv(f).t.max()) for f in fs if os.path.getsize(f) > 20]
        return max(ts) if ts else 0
    fs = sorted(glob.glob(os.path.join(HUB, "data/live/m5_*.csv")))
    ts = [int(pd.read_csv(f).t.max()) for f in fs if os.path.getsize(f) > 20]
    seed = int(pd.read_csv(os.path.join(HUB, "data/xauusd_m5.csv")).t.max())
    return max(ts + [seed])

def main(files):
    c5, d1, tr = [], [], None
    for f in files:
        rows = json.load(open(f))
        if isinstance(rows, dict): rows = rows.get("results", [])
        if rows and "sid" in rows[0]: tr = rows; continue
        if rows and any(k in rows[0] for k in ("mm_l", "tonnes", "fr", "liq_l", "impact", "score")):   # Zusatzdaten (COT, ETF, Derivate, Termine, Nachrichten)
            kind = "cot" if "mm_l" in rows[0] else "etf" if "tonnes" in rows[0] else "deriv" if ("fr" in rows[0] or "liq_l" in rows[0]) else "events" if "impact" in rows[0] else "news"
            key = {"cot": ["sym", "d"], "etf": ["sym", "d"], "deriv": ["sym", "t"], "events": ["id"], "news": ["id"]}[kind]
            p = os.path.join(HUB, f"data/{kind}.csv"); df = pd.DataFrame(rows)
            old = pd.read_csv(p) if os.path.exists(p) else df.iloc[:0]
            m = pd.concat([old, df]).drop_duplicates(key, keep="last"); m.to_csv(p, index=False); print(p, len(m), "Zeilen"); continue
        for r in rows:
            tf = str(r.get("tf", "5m")); sym = tf.split(":")[0] if ":" in tf else "XAUUSD"; r["sym"] = sym
            (c5 if tf.endswith("5m") else d1).append(r)
    if c5:
        df = pd.DataFrame(c5)[["sym", "t", "o", "h", "l", "c"]].astype({"t": int})
        df["ym"] = pd.to_datetime(df.t, unit="s").dt.strftime("%Y-%m")
        os.makedirs(os.path.join(HUB, "data/live"), exist_ok=True)
        for (sym, ym), g in df.groupby(["sym", "ym"]):
            p = os.path.join(HUB, f"data/live/m5_{ym}.csv" if sym == "XAUUSD" else f"data/live/{sym.lower()}_m5_{ym}.csv")
            old = pd.read_csv(p) if os.path.exists(p) else pd.DataFrame(columns=["t", "o", "h", "l", "c"])
            m = pd.concat([old, g[["t", "o", "h", "l", "c"]]]).drop_duplicates("t", keep="last").sort_values("t")
            m.to_csv(p, index=False); print(p, len(m), "Kerzen")
    if d1:
        dd = pd.DataFrame(d1)
        for sym, g in dd.groupby("sym"):
            p = os.path.join(HUB, f"data/{sym.lower()}_d1.csv")
            df = g[["t", "o", "h", "l", "c"]].astype({"t": int})
            old = pd.read_csv(p) if os.path.exists(p) else df.iloc[:0]
            m = pd.concat([old, df]).drop_duplicates("t", keep="last").sort_values("t"); m.to_csv(p, index=False); print(p, len(m), "Tageskerzen")
    if tr is not None:
        os.makedirs(os.path.join(HUB, "live"), exist_ok=True)
        json.dump(tr, open(os.path.join(HUB, "live/trades.json"), "w")); print("trades.json", len(tr))
    print("letzte 5m-Kerze im Repo: t =", last_t())

if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "--last": print(last_t(sys.argv[2] if len(sys.argv) > 2 else "XAUUSD"))
    else: main(sys.argv[1:])
