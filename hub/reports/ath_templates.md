# AlgoTradingHub-Vorlagen – Nachtest auf MT5-Daten (Aug. 2022 – Nov. 2026)

Genaue Regeln sind nicht öffentlich → je Vorlage mehrere naheliegende Fassungen. Bestanden = Entwicklung UND Holdout im Plus, t ≥ 2 über alle Märkte.

## Daily Range Breakout
72 Fassungen getestet, Schwelle t ≥ 2.00 · bestanden: 0
- · {'N': 4, 'start': 0, 'tgt': 0, 'sl': 'opp'} · Entw. Ø +0.008R t=0.4 (n=2914) · Holdout Ø +0.028R (n=1250) · Märkte im Plus 2/4 · USDJPY +0.04 (n=1042), EURUSD -0.01 (n=1070), XAUUSD -0.02 (n=1046), GER40 +0.05 (n=1006)
- · {'N': 4, 'start': 2, 'tgt': 0, 'sl': 'opp'} · Entw. Ø +0.001R t=0.1 (n=2714) · Holdout Ø +0.002R (n=1165) · Märkte im Plus 2/4 · USDJPY -0.01 (n=982), EURUSD -0.04 (n=1010), XAUUSD +0.03 (n=996), GER40 +0.02 (n=891)
- · {'N': 4, 'start': 2, 'tgt': 2.0, 'sl': 'opp'} · Entw. Ø -0.002R t=-0.1 (n=2714) · Holdout Ø -0.005R (n=1165) · Märkte im Plus 2/4 · USDJPY -0.02 (n=982), EURUSD -0.04 (n=1010), XAUUSD +0.03 (n=996), GER40 +0.02 (n=891)

## ATR Expansion
24 Fassungen getestet, Schwelle t ≥ 2.00 · bestanden: 0
- · {'k': 1.5, 'tgt': 3.0, 'maxh': 24} · Entw. Ø +0.024R t=0.9 (n=2790) · Holdout Ø +0.060R (n=1197) · Märkte im Plus 4/4 · XAUUSD +0.02 (n=919), NAS100 +0.09 (n=1035), BTCUSD +0.01 (n=1075), GER40 +0.01 (n=958)
- · {'k': 1.8, 'tgt': 3.0, 'maxh': 24} · Entw. Ø +0.022R t=0.8 (n=2485) · Holdout Ø +0.076R (n=1067) · Märkte im Plus 4/4 · XAUUSD +0.04 (n=802), NAS100 +0.08 (n=965), BTCUSD +0.01 (n=939), GER40 +0.01 (n=846)
- · {'k': 2.2, 'tgt': 3.0, 'maxh': 24} · Entw. Ø +0.022R t=0.8 (n=2014) · Holdout Ø +0.092R (n=865) · Märkte im Plus 3/4 · XAUUSD -0.02 (n=617), NAS100 +0.10 (n=854), BTCUSD +0.01 (n=754), GER40 +0.07 (n=654)

## Turnaround Tuesday
4 Fassungen getestet, Schwelle t ≥ 2.00 · bestanden: 1
- ✅ {'mode': 'high', 'drop': 0.005} · Entw. Ø +0.428% t=2.1 (n=93) · Holdout Ø +0.206% (n=40) · Märkte im Plus 4/4 · GER40 +0.19 (n=38), NAS100 +0.47 (n=37), SP500 +0.68 (n=26), DJ30 +0.17 (n=32)

## TJR Asian Sweep
24 Fassungen getestet, Schwelle t ≥ 2.00 · bestanden: 0
- · {'a0': 18, 'a1': 24, 'w0': 3, 'w1': 11.5, 'tgt': 'opp'} · Entw. Ø -0.036R t=-0.6 (n=2631) · Holdout Ø -0.233R (n=1130) · Märkte im Plus 1/4 · NAS100 +0.07 (n=978), SP500 -0.16 (n=977), XAUUSD -0.13 (n=907), GER40 -0.17 (n=899)
- · {'a0': 18, 'a1': 26, 'w0': 3, 'w1': 11.5, 'tgt': 'opp'} · Entw. Ø -0.075R t=-1.1 (n=2726) · Holdout Ø -0.290R (n=1169) · Märkte im Plus 1/4 · NAS100 +0.14 (n=1019), SP500 -0.21 (n=1006), XAUUSD -0.21 (n=927), GER40 -0.30 (n=943)
- · {'a0': 18, 'a1': 24, 'w0': 8, 'w1': 11.5, 'tgt': 'opp'} · Entw. Ø -0.078R t=-1.1 (n=2007) · Holdout Ø -0.081R (n=864) · Märkte im Plus 0/4 · NAS100 -0.02 (n=792), SP500 -0.06 (n=804), XAUUSD -0.03 (n=722), GER40 -0.26 (n=553)

## 4H FU Retest
12 Fassungen getestet, Schwelle t ≥ 2.00 · bestanden: 0
- · {'tgt': 'opp', 'w0': 9.5, 'w1': 12} · Entw. Ø -0.010R t=-0.3 (n=2345) · Holdout Ø -0.085R (n=1006) · Märkte im Plus 1/4 · SP500 -0.04 (n=885), NAS100 +0.05 (n=898), DJ30 -0.07 (n=860), XAUUSD -0.09 (n=708)
- · {'tgt': 'opp', 'w0': 9.5, 'w1': 16} · Entw. Ø -0.035R t=-1.2 (n=4179) · Holdout Ø -0.120R (n=1791) · Märkte im Plus 0/4 · SP500 -0.03 (n=1617), NAS100 -0.00 (n=1570), DJ30 -0.09 (n=1580), XAUUSD -0.14 (n=1203)
- · {'tgt': '1.5', 'w0': 9.5, 'w1': 12} · Entw. Ø -0.035R t=-1.4 (n=2345) · Holdout Ø -0.086R (n=1006) · Märkte im Plus 1/4 · SP500 -0.04 (n=885), NAS100 +0.01 (n=898), DJ30 -0.08 (n=860), XAUUSD -0.11 (n=708)

