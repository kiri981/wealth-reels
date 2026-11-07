"""Wortwahl (rechtlich): nie „Signal/Signale" in Reels – stattdessen „Trade-Idee(n)".
clean(obj) ersetzt in allen Texten eines Specs (Bild, Sprecher, Caption) – Schlüssel wie "type" bleiben unberührt."""
import re

_R = [  # (Muster, Ersatz) – Reihenfolge: lange/zusammengesetzte Formen zuerst
    (r"Live-Signalen?", "Live-Trade-Ideen"), (r"Gold-Signalen?", "Gold-Trade-Ideen"), (r"Gold-Signal", "Gold-Trade-Idee"),
    (r"ORIGINAL-SIGNAL", "ORIGINAL-TRADE-IDEE"), (r"Original-Signal", "Original-Trade-Idee"),
    (r"\bdas Signal\b", "die Trade-Idee"), (r"\bDas Signal\b", "Die Trade-Idee"), (r"\bein Signal\b", "eine Trade-Idee"), (r"\bEin Signal\b", "Eine Trade-Idee"),
    (r"\bdem Signal\b", "der Trade-Idee"), (r"\bdes Signals\b", "der Trade-Idee"), (r"\bkein Signal\b", "kein Einstieg"),
    (r"Signalgruppe(n?)", r"Trading-Gruppe\1"), (r"Signal-Gruppe(n?)", r"Trading-Gruppe\1"),
    (r"Kaufsignal(e?)", r"Kaufmuster"), (r"Verkaufssignal(e?)", r"Verkaufsmuster"), (r"Einstiegssignal(e?)", r"Einstiegspunkt\1"), (r"Warnsignal(e?)", r"Warnzeichen"),
    (r"\bSignale\b", "Trade-Ideen"), (r"\bSignalen\b", "Trade-Ideen"), (r"\bSignals\b(?=\s|$|[.,!?])", "Trade-Ideen"), (r"\bSignal\b", "Trade-Idee"),
    (r"\bSIGNALE\b", "TRADE-IDEEN"), (r"\bSIGNALS\b", "TRADE IDEAS"), (r"\bSIGNAL\b", "TRADE-IDEE"),
    # Englisch
    (r"\bsignal groups?\b", "trading groups"), (r"\btrading signals\b", "trade ideas"), (r"\bsignals\b", "trade ideas"), (r"\bsignal\b", "trade idea"),
    # Polnisch
    (r"\bsygnały\b", "pomysły tradingowe"), (r"\bSygnały\b", "Pomysły tradingowe"), (r"\bsygnałów\b", "pomysłów tradingowych"),
    (r"\bsygnał\b", "pomysł tradingowy"), (r"\bSygnał\b", "Pomysł tradingowy"), (r"\bsygnał(u|em|e)\b", "pomysłu tradingowego"),
    # Französisch
    (r"\bsignaux\b", "idées de trade"), (r"\bun signal\b", "une idée de trade"), (r"\ble signal\b", "l'idée de trade"),
]
_SKIP = {"type", "image", "src", "music", "font", "icon", "color", "cover", "handle"}


def text(s):
    for p, r in _R: s = re.sub(p, r, s)
    return s


def clean(o, key=None):
    if isinstance(o, str): return o if key in _SKIP or o.startswith(("http", "/")) else text(o)
    if isinstance(o, list): return [clean(x, key) for x in o]
    if isinstance(o, dict): return {k: clean(v, k) for k, v in o.items()}
    return o


if __name__ == "__main__":
    import sys; print(text(" ".join(sys.argv[1:])))
