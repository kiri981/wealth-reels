# Chart-Replay (echte Kerzen, TradingView-Look)
Hochformat-Reel 1080×1920: Markt vor dem Einstieg → Trade Kerze für Kerze → Ergebnis. Bibliothek: TradingView Lightweight Charts 4.2.0 (Apache-2.0, TV-Logo im Chart = Pflicht-Hinweis, nicht entfernen).

    cd factory/chartreplay && npm i --silent && node render2.js trade.json out.mp4

trade.json: title (HTML, <b> = gold), sub, src (Datenquelle, z. B. "Echte Kurse (30 Min.)."), candles [[unix,o,h,l,c],…] (≈25–40 Kerzen VOR dem Einstieg + alle bis zum Ausstieg),
dir (1 Buy / -1 Sell), entry, sl, exit, entryBar/exitBar (Kerzen-Zeitstempel), R, resultText (z. B. "+3.225 $ · +2,0 R"), info (eine Zeile), barSpacing (8–22, so dass alles passt).
Zeiten im Chart = Europe/Bucharest (+2 h fest, Winterzeit). Musik: danach mit ffmpeg unterlegen (factory/music/…), optional.
