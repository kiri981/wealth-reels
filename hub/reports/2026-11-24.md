# Hub-Forschung 2026-11-24

- Gold: 5m 2026-02-15 – 2026-11-19 (181 Tage), Tageskerzen ab 2006-01-03
- Silber: 5m 2026-09-28 – 2026-11-19 (39 Tage), Tageskerzen ab 2006-01-03
- Bitcoin: 5m 2026-09-28 – 2026-11-19 (39 Tage), Tageskerzen ab 2020-08-09
- Ethereum: 5m: noch zu wenig Daten (< 30 Tage), Tageskerzen ab 2021-01-01
- Solana: 5m: noch zu wenig Daten (< 30 Tage), Tageskerzen ab 2021-01-01
- EUR/USD: 5m 2026-10-01 – 2026-11-19 (36 Tage), Tageskerzen ab 2010-01-01
- GBP/USD: 5m 2026-10-01 – 2026-11-19 (36 Tage), Tageskerzen ab 2010-01-01
- AUD/USD: 5m 2026-10-01 – 2026-11-19 (36 Tage), Tageskerzen ab 2010-01-01
- NZD/USD: 5m 2026-10-01 – 2026-11-19 (36 Tage), Tageskerzen ab 2010-01-01
- USD/JPY: 5m 2026-10-01 – 2026-11-19 (36 Tage), Tageskerzen ab 2010-01-01
- USD/CAD: 5m 2026-10-01 – 2026-11-19 (36 Tage), Tageskerzen ab 2010-01-01
- USD/CHF: 5m 2026-10-01 – 2026-11-19 (36 Tage), Tageskerzen ab 2010-01-01
- EUR/JPY: 5m 2026-10-01 – 2026-11-19 (36 Tage), Tageskerzen ab 2023-01-05
- GBP/JPY: 5m 2026-10-07 – 2026-11-19 (32 Tage), Tageskerzen ab 2023-01-05
- EUR/GBP: 5m: noch zu wenig Daten (< 30 Tage), Tageskerzen ab 2023-01-05
- XRP: 5m: noch zu wenig Daten (< 30 Tage), Tageskerzen ab 2021-01-01
- BNB: 5m: noch zu wenig Daten (< 30 Tage), Tageskerzen ab 2021-01-01
- Dogecoin: 5m: noch zu wenig Daten (< 30 Tage), Tageskerzen ab 2021-01-01

## Bestehende Strategien
- **Gold · Session-Ausbruch 03:15 Uhr (≈ 20:15 NY Vortag), Range 30m, Fenster 30m, Ziel 3.0R, SL Mitte, Range < 0.35σ** [paper] Backtest Ø +0.42R (n=123, Holdout 0.25), live n=2 Ø +0.95R
- **Gold · Session-Ausbruch 02:15 Uhr (≈ 19:15 NY Vortag), Range 60m, Fenster 120m, Ziel 2.0R, SL Gegenseite gegen Tagesrichtung** [paper] Backtest Ø +0.35R (n=80, Holdout 0.31), live n=1 Ø -0.04R
- **Gold · Ausbruch+Retest 5m N=36, Körper 0.5·ATR, Ziel 3.0R, BE 1R** [paper] Backtest Ø +0.09R (n=543, Holdout 0.02), live n=11 Ø +0.00R
- **Solana · Derivate: Long wenn Open Interest stark steigt und Preis steigt (z>1.5), 5 Tage halten, SL 2.5·ATR** [paper] Backtest Ø +0.15R (n=53, Holdout 0.02), live n=0
- **Nasdaq 100 · IBS: Kauf, wenn Schluss im unteren 20 % der Tagesspanne; raus bei Schluss > Vortageshoch (max. 5 Tage)** [paper] Backtest (MT5, 4 J.) Ø +0.13R n=142, live n=0
- **S&P 500 · IBS: Kauf, wenn Schluss im unteren 20 % der Tagesspanne; raus bei Schluss > Vortageshoch (max. 5 Tage)** [paper] Backtest (MT5, 4 J.) Ø +0.16R n=134, live n=0
- **Dow Jones · IBS: Kauf, wenn Schluss im unteren 20 % der Tagesspanne; raus bei Schluss > Vortageshoch (max. 5 Tage)** [paper] Backtest (MT5, 4 J.) Ø +0.13R n=138, live n=0
- **DAX · IBS: Kauf, wenn Schluss im unteren 20 % der Tagesspanne; raus bei Schluss > Vortageshoch (max. 5 Tage)** [paper] Backtest (MT5, 4 J.) Ø +0.06R n=129, live n=0
- **Nasdaq 100 · Turnaround Tuesday: Montag ≥ 0,5 % im Minus → Kauf; raus bei Schluss > Vortageshoch (max. 4 Tage)** [paper] Backtest (MT5, 4 J.) Ø +0.14R n=38, live n=0
- **S&P 500 · Turnaround Tuesday: Montag ≥ 0,5 % im Minus → Kauf; raus bei Schluss > Vortageshoch (max. 4 Tage)** [paper] Backtest (MT5, 4 J.) Ø +0.14R n=25, live n=0
- **Dow Jones · Turnaround Tuesday: Montag ≥ 0,5 % im Minus → Kauf; raus bei Schluss > Vortageshoch (max. 4 Tage)** [paper] Backtest (MT5, 4 J.) Ø +0.08R n=28, live n=0
- **Bitcoin · TBO Trend-Breakout 1 Std.: 30-Kerzen-Ausbruch mit EMA 200, SL 2·ATR, Ziel 2R, max. 48 Std.** [paper] Backtest (MT5, 4 J.) Ø +0.09R n=810, live n=1 Ø -1.02R
- **Ethereum · TBO Trend-Breakout 1 Std.: 30-Kerzen-Ausbruch mit EMA 200, SL 2·ATR, Ziel 2R, max. 48 Std.** [paper] Backtest (MT5, 4 J.) Ø +0.03R n=807, live n=4 Ø -0.30R
- **Gold · TBO Trend-Breakout 1 Std.: 30-Kerzen-Ausbruch mit EMA 200, SL 2·ATR, Ziel 2R, max. 48 Std.** [paper] Backtest (MT5, 4 J.) Ø +0.07R n=673, live n=1 Ø +1.99R
- **Nasdaq 100 · TBO Trend-Breakout 1 Std.: 30-Kerzen-Ausbruch mit EMA 200, SL 2·ATR, Ziel 2R, max. 48 Std.** [paper] Backtest (MT5, 4 J.) Ø +0.07R n=704, live n=0
- **Gold · VIP-Zonen A: Einstieg erst bei CHoCH-Bestätigung aus dem VIP-Kanal, SL/Ziele wie angesagt (je 1/3), nach Ziel 1 Einstand** [paper] Backtest Ø +0.00R (n=0, Holdout None), live n=0
- **Gold · VIP-Zonen B (Vergleich): Einstieg sofort bei Zonenberührung, SL wie angesagt, ganzes Ziel 1** [paper] Backtest Ø +0.00R (n=0, Holdout None), live n=0
- **Gold · Kevins VIP-Trade-Ideen (Einstieg/SL/Ziele wie gepostet, Management wie angesagt)** [paper] Backtest Ø +0.00R (n=0, Holdout None), live n=0
- **Gold · Lernmodell Short Intraday 8 Std. (Struktur, Kerzen, Momentum, Session) ≥ 0.38** [paper] Backtest Ø +0.00R (n=0, Holdout None), live n=0

## Suche nach neuen Strategien
- sess: 1500 neue Varianten getestet (insgesamt 17600), bestanden: 0
- rbo: 450 neue Varianten getestet (insgesamt 4176), bestanden: 0
- swing: 300 neue Varianten getestet (insgesamt 2481), bestanden: 0
- deriv: 0 neue Varianten getestet (insgesamt 1728), bestanden: 0
- fxs: 0 neue Varianten getestet (insgesamt 60), bestanden: 0
- Heute keine neue Strategie, die alle Prüfungen besteht.

## Aktiv: 19 Strategien
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
- Gold · VIP-Zonen A: Einstieg erst bei CHoCH-Bestätigung aus dem VIP-Kanal, SL/Ziele wie angesagt (je 1/3), nach Ziel 1 Einstand [paper]
- Gold · VIP-Zonen B (Vergleich): Einstieg sofort bei Zonenberührung, SL wie angesagt, ganzes Ziel 1 [paper]
- Gold · Kevins VIP-Trade-Ideen (Einstieg/SL/Ziele wie gepostet, Management wie angesagt) [paper]
- Gold · Lernmodell Short Intraday 8 Std. (Struktur, Kerzen, Momentum, Session) ≥ 0.38 [paper]

_Laufzeit 10s_

## Lernmodelle 2026-11-24
- Gold Long Scalp 2 Std.: Validierung Ø -0.00R · TEST 87 Trades Ø 0.0R, t 0.0 → nein
- Gold Short Scalp 2 Std.: Validierung Ø +0.02R · TEST 257 Trades Ø 0.06R, t 1.0 → nein
- Gold Long Intraday 8 Std.: Validierung Ø +0.26R · TEST 14 Trades Ø 0.58R, t 1.4 → nein
- Gold Short Intraday 8 Std.: Validierung Ø +0.16R · TEST 352 Trades Ø 0.23R, t 2.9 → BESTANDEN
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

## Plausibilität / Datenlage
- Keine neue Strategie aufgenommen → nichts auszusortieren.
- ⚠️ Datenlücke: In D1 enden die 5m- und Tageskerzen für Gold, Silber, Bitcoin und alle Devisenpaare am 19.11.2026 18:30 UTC (MetaApi-Abruf steht seit ~5 Tagen). Nur ETH/SOL/XRP/BNB/DOGE (Coinalyze) laufen weiter. Neubewertungen für die betroffenen Symbole beruhen daher auf Daten bis 19.11.
- COT, ETF, Termine: nichts Neues; Coinalyze-Tageshistorie (hub_deriv_d) endet ebenfalls am 18.11.
