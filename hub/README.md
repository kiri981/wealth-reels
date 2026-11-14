# WC Trading Hub

- `engine.py` / `worker/src/engine.js` – identische Backtest-/Live-Engine (Familien: sess, rbo, swing)
- `research.py` – Forschungs-Agent, läuft jede Nacht (geplante Aufgabe), pflegt `registry.json` + `reports/`
- `worker/` – Cloudflare-Worker `wc-hub`: Kerzen über MetaApi, Papierhandel, Dashboard, täglicher Export nach `data/live/`
- `data/` – Kerzen (Seed aus TradingView-Exporten + täglich vom Worker)
- `live/trades.json` – Papier-Trades (vom Worker)

Lebenszyklus: candidate → paper → approved (Freigabe für Echtgeld nur durch Kevin) → retired.
Lern-/Testzwecke, keine Anlageberatung.
