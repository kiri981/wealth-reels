# Hub-Forschung 2026-11-17

- Gold: 5m 2026-02-15 – 2026-11-17 (179 Tage), Tageskerzen ab 2006-01-03
- Silber: 5m 2026-09-28 – 2026-11-17 (37 Tage), Tageskerzen ab 2006-01-03
- Bitcoin: 5m 2026-09-28 – 2026-11-17 (37 Tage), Tageskerzen ab 2020-08-09
- Ethereum: 5m: noch zu wenig Daten (< 30 Tage), Tageskerzen ab 2021-01-01
- Solana: 5m: noch zu wenig Daten (< 30 Tage), Tageskerzen ab 2021-01-01
- EUR/USD: 5m 2026-10-01 – 2026-11-17 (34 Tage), Tageskerzen ab 2010-01-01
- GBP/USD: 5m 2026-10-01 – 2026-11-17 (34 Tage), Tageskerzen ab 2010-01-01
- AUD/USD: 5m 2026-10-01 – 2026-11-17 (34 Tage), Tageskerzen ab 2010-01-01
- NZD/USD: 5m 2026-10-01 – 2026-11-17 (34 Tage), Tageskerzen ab 2010-01-01
- USD/JPY: 5m 2026-10-01 – 2026-11-17 (34 Tage), Tageskerzen ab 2010-01-01
- USD/CAD: 5m 2026-10-01 – 2026-11-17 (34 Tage), Tageskerzen ab 2010-01-01
- USD/CHF: 5m 2026-10-01 – 2026-11-17 (34 Tage), Tageskerzen ab 2010-01-01
- EUR/JPY: 5m 2026-10-01 – 2026-11-17 (34 Tage), Tageskerzen ab 2023-01-05
- GBP/JPY: 5m 2026-10-07 – 2026-11-17 (30 Tage), Tageskerzen ab 2023-01-05
- EUR/GBP: 5m: noch zu wenig Daten (< 30 Tage), Tageskerzen ab 2023-01-05
- XRP: 5m: noch zu wenig Daten (< 30 Tage), Tageskerzen ab 2021-01-01
- BNB: 5m: noch zu wenig Daten (< 30 Tage), Tageskerzen ab 2021-01-01
- Dogecoin: 5m: noch zu wenig Daten (< 30 Tage), Tageskerzen ab 2021-01-01

## Bestehende Strategien
- **Gold · Session-Ausbruch 03:15 Uhr (≈ 20:15 NY Vortag), Range 30m, Fenster 30m, Ziel 3.0R, SL Mitte, Range < 0.35σ** [paper] Backtest Ø +0.40R (n=122, Holdout 0.13), live n=1 Ø -1.04R
- **Gold · Session-Ausbruch 02:15 Uhr (≈ 19:15 NY Vortag), Range 60m, Fenster 120m, Ziel 2.0R, SL Gegenseite gegen Tagesrichtung** [paper] Backtest Ø +0.35R (n=79, Holdout 0.33), live n=0
- **Gold · Ausbruch+Retest 5m N=36, Körper 0.5·ATR, Ziel 3.0R, BE 1R** [paper] Backtest Ø +0.09R (n=535, Holdout 0.01), live n=3 Ø -0.58R
- **Solana · Derivate: Long wenn Open Interest stark steigt und Preis steigt (z>1.5), 5 Tage halten, SL 2.5·ATR** [paper] Backtest Ø +0.15R (n=53, Holdout 0.02), live n=0
- **Nasdaq 100 · IBS: Kauf, wenn Schluss im unteren 20 % der Tagesspanne; raus bei Schluss > Vortageshoch (max. 5 Tage)** [paper] Backtest (MT5, 4 J.) Ø +0.13R n=142, live n=0
- **S&P 500 · IBS: Kauf, wenn Schluss im unteren 20 % der Tagesspanne; raus bei Schluss > Vortageshoch (max. 5 Tage)** [paper] Backtest (MT5, 4 J.) Ø +0.16R n=134, live n=0
- **Dow Jones · IBS: Kauf, wenn Schluss im unteren 20 % der Tagesspanne; raus bei Schluss > Vortageshoch (max. 5 Tage)** [paper] Backtest (MT5, 4 J.) Ø +0.13R n=138, live n=0
- **DAX · IBS: Kauf, wenn Schluss im unteren 20 % der Tagesspanne; raus bei Schluss > Vortageshoch (max. 5 Tage)** [paper] Backtest (MT5, 4 J.) Ø +0.06R n=129, live n=0
- **Nasdaq 100 · Turnaround Tuesday: Montag ≥ 0,5 % im Minus → Kauf; raus bei Schluss > Vortageshoch (max. 4 Tage)** [paper] Backtest (MT5, 4 J.) Ø +0.14R n=38, live n=0
- **S&P 500 · Turnaround Tuesday: Montag ≥ 0,5 % im Minus → Kauf; raus bei Schluss > Vortageshoch (max. 4 Tage)** [paper] Backtest (MT5, 4 J.) Ø +0.14R n=25, live n=0
- **Dow Jones · Turnaround Tuesday: Montag ≥ 0,5 % im Minus → Kauf; raus bei Schluss > Vortageshoch (max. 4 Tage)** [paper] Backtest (MT5, 4 J.) Ø +0.08R n=28, live n=0
- **Bitcoin · TBO Trend-Breakout 1 Std.: 30-Kerzen-Ausbruch mit EMA 200, SL 2·ATR, Ziel 2R, max. 48 Std.** [paper] Backtest (MT5, 4 J.) Ø +0.09R n=810, live n=0
- **Ethereum · TBO Trend-Breakout 1 Std.: 30-Kerzen-Ausbruch mit EMA 200, SL 2·ATR, Ziel 2R, max. 48 Std.** [paper] Backtest (MT5, 4 J.) Ø +0.03R n=807, live n=0
- **Gold · TBO Trend-Breakout 1 Std.: 30-Kerzen-Ausbruch mit EMA 200, SL 2·ATR, Ziel 2R, max. 48 Std.** [paper] Backtest (MT5, 4 J.) Ø +0.07R n=673, live n=0
- **Nasdaq 100 · TBO Trend-Breakout 1 Std.: 30-Kerzen-Ausbruch mit EMA 200, SL 2·ATR, Ziel 2R, max. 48 Std.** [paper] Backtest (MT5, 4 J.) Ø +0.07R n=704, live n=0

## Suche nach neuen Strategien
- sess: 1500 neue Varianten getestet (insgesamt 8600), bestanden: 0
- rbo: 450 neue Varianten getestet (insgesamt 1476), bestanden: 0
- swing: 300 neue Varianten getestet (insgesamt 681), bestanden: 0
- deriv: 450 neue Varianten getestet (insgesamt 900), bestanden: 1
- fxs: 0 neue Varianten getestet (insgesamt 60), bestanden: 0
- Heute keine neue Strategie, die alle Prüfungen besteht.

## Aktiv: 15 Strategien
- Gold · Session-Ausbruch 03:15 Uhr (≈ 20:15 NY Vortag), Range 30m, Fenster 30m, Ziel 3.0R, SL Mitte, Range < 0.35σ [paper]
- Gold · Session-Ausbruch 02:15 Uhr (≈ 19:15 NY Vortag), Range 60m, Fenster 120m, Ziel 2.0R, SL Gegenseite gegen Tagesrichtung [paper]
- Gold · Ausbruch+Retest 5m N=36, Körper 0.5·ATR, Ziel 3.0R, BE 1R [paper]
- Solana · Derivate: Long wenn Open Interest stark steigt und Preis steigt (z>1.5), 5 Tage halten, SL 2.5·ATR [paper]
- Nasdaq 100 · IBS: Kauf, wenn Schluss im unteren 20 % der Tagesspanne; raus bei Schluss > Vortageshoch (max. 5 Tage) [paper]
- S&P 500 · IBS: Kauf, wenn Schluss im unteren 20 % der Tagesspanne; raus bei Schluss > Vortageshoch (max. 5 Tage) [paper]
- Dow Jones · IBS: Kauf, wenn Schluss im unteren 20 % der Tagesspanne; raus bei Schluss > Vortageshoch (max. 5 Tage) [paper]
- DAX · IBS: Kauf, wenn Schluss im unteren 20 % der Tagesspanne; raus bei Schluss > Vortageshoch (max. 5 Tage) [paper]
- Nasdaq 100 · Turnaround Tuesday: Montag ≥ 0,5 % im Minus → Kauf; raus bei Schluss > Vortageshoch (max. 4 Tage) [paper]
- S&P 500 · Turnaround Tuesday: Montag ≥ 0,5 % im Minus → Kauf; raus bei Schluss > Vortageshoch (max. 4 Tage) [paper]
- Dow Jones · Turnaround Tuesday: Montag ≥ 0,5 % im Minus → Kauf; raus bei Schluss > Vortageshoch (max. 4 Tage) [paper]
- Bitcoin · TBO Trend-Breakout 1 Std.: 30-Kerzen-Ausbruch mit EMA 200, SL 2·ATR, Ziel 2R, max. 48 Std. [paper]
- Ethereum · TBO Trend-Breakout 1 Std.: 30-Kerzen-Ausbruch mit EMA 200, SL 2·ATR, Ziel 2R, max. 48 Std. [paper]
- Gold · TBO Trend-Breakout 1 Std.: 30-Kerzen-Ausbruch mit EMA 200, SL 2·ATR, Ziel 2R, max. 48 Std. [paper]
- Nasdaq 100 · TBO Trend-Breakout 1 Std.: 30-Kerzen-Ausbruch mit EMA 200, SL 2·ATR, Ziel 2R, max. 48 Std. [paper]

_Laufzeit 8s_

## Lernmodelle 2026-11-17
- Gold Long Scalp 2 Std.: Validierung Ø -0.05R · TEST 84 Trades Ø 0.0R, t 0.0 → nein
- Gold Short Scalp 2 Std.: Validierung Ø +0.02R · TEST 918 Trades Ø 0.0R, t 0.0 → nein
- Gold Long Intraday 8 Std.: Validierung Ø +0.01R · TEST 108 Trades Ø 0.11R, t 0.8 → nein
- Gold Short Intraday 8 Std.: Validierung Ø +0.21R · TEST 230 Trades Ø 0.02R, t 0.2 → nein
- Silber: noch zu wenig 5-Min.-Daten (< 60 Tage)
- Bitcoin: noch zu wenig 5-Min.-Daten (< 60 Tage)
- Ethereum: noch zu wenig 5-Min.-Daten (< 60 Tage)
- Solana: noch zu wenig 5-Min.-Daten (< 60 Tage)
- EUR/USD: noch zu wenig 5-Min.-Daten (< 60 Tage)
- GBP/USD: noch zu wenig 5-Min.-Daten (< 60 Tage)
- AUD/USD: noch zu wenig 5-Min.-Daten (< 60 Tage)
- NZD/USD: noch zu wenig 5-Min.-Daten (< 60 Tage)
- USD/JPY: noch zu wenig 5-Min.-Daten (< 60 Tage)
- USD/CAD: noch zu wenig 5-Min.-Daten (< 60 Tage)
- USD/CHF: noch zu wenig 5-Min.-Daten (< 60 Tage)
- EUR/JPY: noch zu wenig 5-Min.-Daten (< 60 Tage)
- GBP/JPY: noch zu wenig 5-Min.-Daten (< 60 Tage)
- EUR/GBP: noch zu wenig 5-Min.-Daten (< 60 Tage)
- XRP: noch zu wenig 5-Min.-Daten (< 60 Tage)
- BNB: noch zu wenig 5-Min.-Daten (< 60 Tage)
- Dogecoin: noch zu wenig 5-Min.-Daten (< 60 Tage)

## Hinweise des Forschungs-Agents
- research.py: Familie `tt` (Turnaround Tuesday, extern getestet) fehlte in der Ausnahme für extern geprüfte Familien (`ibs`/`tbo`) → KeyError 'NAS100'. Behoben (nur Live-Bilanz, keine Prüfregel geändert).
- Papier-Trades: D1 `hub_trades` enthielt nur noch 6 Zeilen (ab 16.11.); die 8 älteren abgeschlossenen Trades aus live/trades.json wurden beibehalten statt überschrieben (jetzt 14).
- Plausibilität: keine neu aufgenommene Strategie (1 deriv-Fund bestanden, aber Papier-Limit erreicht) – nichts zurückgezogen.
