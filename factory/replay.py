"""Trade-Replay-Reel aus einem echten Signal (Tabelle trades in D1).

python3 replay.py trade.json ../specs/<day>_replay.json      -> schreibt nur die Spec (danach factory2.py rendern)
trade.json = Zeile aus D1: {id, symbol, side, setup, entry, sl, tp, exit, r, opened, closed, tf, candles:"[[t,o,h,l,c],...]"}
Die Kerzen sind echte Kurse (Kraken). Das Reel kennzeichnet den Trade klar als ausgewählt / nicht repräsentativ.
"""
import json, sys
from datetime import datetime, timezone, timedelta

NAMES = {"BTCUSD": "Bitcoin", "ETHUSD": "Ethereum", "XAUUSD": "Gold", "GOLD": "Gold", "XAGUSD": "Silber", "NAS100": "Nasdaq", "NASDAQ": "Nasdaq", "US100": "Nasdaq", "USTEC": "Nasdaq", "US500": "S&P 500", "SPX500": "S&P 500", "SP500": "S&P 500", "US30": "Dow Jones"}
ONES = ["null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn"]


def r_words(r):
    """3.0 -> 'drei', 2.5 -> 'zwei Komma fünf' (für die Sprecherstimme)"""
    r = round(abs(r), 1); i = int(r); d = int(round((r - i) * 10))
    base = ONES[i] if i < len(ONES) else str(i)
    return base if d == 0 else f"{base} Komma {ONES[d]}"


def dur_text(sec):
    h = sec / 3600
    if h < 1: return f"{max(1, round(sec / 60))} Minuten"
    if h < 48: return f"{round(h)} Stunde" + ("" if round(h) == 1 else "n")
    return f"{round(h / 24)} Tagen"


def make_spec(t):
    cs = json.loads(t["candles"]) if isinstance(t["candles"], str) else t["candles"]
    name = NAMES.get(t["symbol"], t["symbol"]); side = t["side"]; r = float(t.get("r") or 0)
    setup = (t.get("setup") or "Breakout").replace("–", "").strip()
    ts = [c[0] for c in cs]
    ei = min(range(len(ts)), key=lambda i: abs(ts[i] - t["opened"]))
    xi = min(range(len(ts)), key=lambda i: abs(ts[i] - (t.get("closed") or ts[-1])))
    ohlc = [[c[1], c[2], c[3], c[4]] for c in cs]
    fmt = lambda v: f"{v:,.0f}".replace(",", ".") if v >= 1000 else f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    tz = timezone(timedelta(hours=2))
    when = datetime.fromtimestamp(t["opened"], tz).strftime("%d.%m.")
    rs = f"+{r:.1f}".replace(".", ",") + " R"
    return {
        "music": "drive",
        "scenes": [
            {"type": "logo", "dur": 1.4},
            {"type": "hook", "dur": 2.6, "text": f"{name}: {rs}", "accent": "So lief der Trade.", "icon": "up" if side == "BUY" else "down",
             "say": f"{name}. Plus {r_words(r)} R. So lief der Trade."},
            {"type": "candles", "dur": 7.5, "candles": ohlc, "step": f"REPLAY · {t['symbol']} · {t.get('tf', 15)}M · {when}",
             "title": f"{setup}: *{side}*",
             "levels": [{"price": t["entry"], "text": "ENTRY " + fmt(t["entry"]), "color": "white", "from_i": ei},
                        {"price": t["sl"], "text": "STOP " + fmt(t["sl"]), "color": "red", "from_i": ei},
                        {"price": t["tp"], "text": "FULL TP " + fmt(t["tp"]), "color": "green", "from_i": ei}],
             "tags": [{"i": ei, "price": t["entry"], "text": side, "color": "white"},
                      {"i": xi, "price": t.get("exit") or t["tp"], "text": "ZIEL ERREICHT", "color": "green"}],
             "footer": f"Echte Kurse ({t.get('source') or 'Kraken'}) · ausgewählter Trade",
             "say": f"Einstieg bei {round(t['entry'])}. Stopp bei {round(t['sl'])}. Ziel bei {round(t['tp'])}."},
            {"type": "words", "dur": 3.0, "kicker": "ERGEBNIS", "text": f"{rs} in {dur_text((t.get('closed') or ts[-1]) - t['opened'])}.",
             "say": f"Ziel erreicht: plus {r_words(r)} R in {dur_text((t.get('closed') or ts[-1]) - t['opened'])}."},
            {"type": "words", "dur": 3.0, "kicker": "WICHTIG", "text": "Ausgewählter Trade – nicht jeder Trade geht auf.",
             "say": "Wichtig: Das ist ein ausgewählter Trade. Nicht jeder geht auf."},
            {"type": "cta", "dur": 2.8, "title": f"{name}. Mit Plan.", "button": "Kommentiere VIP", "sub": "Live-Signale im VIP-Kanal",
             "say": "Live-Signale im VIP. Kommentiere VIP für Infos."},
        ],
    }


def caption(t):
    name = NAMES.get(t["symbol"], t["symbol"]); r = float(t.get("r") or 0)
    return (f"📼 Replay: {name} {t['side']} – {(t.get('setup') or 'Breakout').strip()} (+{r:.1f} R)\n\n"
            f"Einstieg, Stopp und Ziel standen vorher fest – der Plan hat gehalten.\n\n"
            f"💬 Kommentiere VIP für Infos zu den Live-Signalen.\n\n"
            f"Ausgewählter Trade, nicht repräsentativ. Verluste gehören dazu. Keine Anlageberatung.\n\n"
            f"#{name.lower()} #trading #{t['symbol'].lower()} #krypto #tradingdeutsch")


if __name__ == "__main__":
    t = json.load(open(sys.argv[1], encoding="utf-8"))
    json.dump(make_spec(t), open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(caption(t))
