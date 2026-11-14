"""Übernimmt Kerzen/Papier-Trades aus D1 (vom Worker wc-hub gesammelt) ins Repo – ohne GitHub-Token im Worker.
Aufruf: python3 hub/ingest.py <datei.json> [<datei.json> …]
Jede Datei: JSON-Liste von Zeilen aus D1, z. B. das "results"-Array von
  SELECT tf, t, o, h, l, c FROM hub_candles WHERE …            (Kerzen, tf = '5m' oder '1d')
  SELECT sid, t, dr, e, sl, r, why, tx, closed FROM hub_trades (Papier-Trades, ersetzt live/trades.json komplett)
Ausgabe: hub/data/live/m5_YYYY-MM.csv (zusammengeführt, ohne Duplikate), hub/data/xauusd_d1.csv, hub/live/trades.json
Zeigt am Ende den Zeitpunkt der letzten 5m-Kerze im Repo (für die nächste Abfrage: WHERE t > <wert>).
"""
import json, os, sys, glob
import pandas as pd

HUB = os.path.dirname(os.path.abspath(__file__))

def last_t():
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
        for r in rows: (c5 if r.get("tf", "5m") == "5m" else d1).append(r)
    if c5:
        df = pd.DataFrame(c5)[["t", "o", "h", "l", "c"]].astype({"t": int})
        df["ym"] = pd.to_datetime(df.t, unit="s").dt.strftime("%Y-%m")
        os.makedirs(os.path.join(HUB, "data/live"), exist_ok=True)
        for ym, g in df.groupby("ym"):
            p = os.path.join(HUB, f"data/live/m5_{ym}.csv")
            old = pd.read_csv(p) if os.path.exists(p) else pd.DataFrame(columns=["t", "o", "h", "l", "c"])
            m = pd.concat([old, g[["t", "o", "h", "l", "c"]]]).drop_duplicates("t", keep="last").sort_values("t")
            m.to_csv(p, index=False); print(p, len(m), "Kerzen")
    if d1:
        p = os.path.join(HUB, "data/xauusd_d1.csv")
        df = pd.DataFrame(d1)[["t", "o", "h", "l", "c"]].astype({"t": int})
        old = pd.read_csv(p) if os.path.exists(p) else df.iloc[:0]
        m = pd.concat([old, df]).drop_duplicates("t", keep="last").sort_values("t"); m.to_csv(p, index=False); print(p, len(m), "Tageskerzen")
    if tr is not None:
        os.makedirs(os.path.join(HUB, "live"), exist_ok=True)
        json.dump(tr, open(os.path.join(HUB, "live/trades.json"), "w")); print("trades.json", len(tr))
    print("letzte 5m-Kerze im Repo: t =", last_t())

if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--last": print(last_t())
    else: main(sys.argv[1:])
