"""Reel-Fabrik: baut ein 9:16-Reel (1080x1920, MP4) aus einer JSON-Beschreibung.

Aufruf:  python3 factory.py spec.json out.mp4      (PREVIEW=1 -> nur Standbilder je Szene)

spec.json:
{
  "scenes": [
    {"type": "hook",  "dur": 3.0, "lines": [{"text": "Gold vor der Fed.", "color": "gold"}, {"text": "3 Termine, die zählen", "color": "white"}]},
    {"type": "list",  "dur": 7.0, "title": "Diese Woche", "items": [{"left": "Mi 20:00", "right": "Fed-Zinsentscheid", "hot": true}, ...]},
    {"type": "chart", "dur": 7.0, "title": "Gold gestern (1h)", "candles": [[o,h,l,c], ...], "labels": ["08:00", ...],
                      "levels": [{"price": 4028, "text": "24h-Tief", "color": "red"}], "notes": [{"i": 6, "price": 4030, "text": "Fehlausbruch", "color": "red"}],
                      "footer": "Kursdaten: echte Stundenkerzen"},
    {"type": "rule",  "dur": 6.0, "kicker": "Meine Regel", "title": "Erst der Kerzenschluss zählt.", "body": "Ein Docht ist noch kein Einstieg ..."},
    {"type": "stat",  "dur": 5.0, "kicker": "Bot seit Montag", "value": "+1,4 R", "color": "green", "sub": "4 Trades · 2 Gewinner · 1 BE · 1 Verlust"},
    {"type": "cta",   "dur": 4.0, "title": "Weniger Trades. Bessere Trades."}
  ]
}
Farben: gold, white, muted, red, green.  Gesamtlänge ideal 18–30 s.
Optional "music": "auto" (Standard) | "drive" | "chill" | "lofi" | "none" | Dateiname aus music/ (eigene lizenzfreie Tracks).
"""
import json, sys, os
from lib import *

C = {"gold": GOLD, "white": WHITE, "muted": MUTED, "red": RED, "green": GREEN}
H1 = lambda s: font("InterDisplay-Black.otf", s)
B = lambda s: font("Inter-SemiBold.otf", s)
R = lambda s: font("Inter-Medium.otf", s)
col = lambda name, d="white": C.get(name or d, WHITE)


def fit_size(s, maxw, start, minimum, maxlines, f=H1):
    """größte Schrift, bei der der Text in maxlines Zeilen passt"""
    size = start
    while size > minimum and len(wrap(s, f(size), maxw)) > maxlines: size -= 4
    return size


def scene_hook(sc):
    lines = sc["lines"]
    def draw(im, t, tl):
        y = 560 if len(lines) > 2 else 680
        for k, ln in enumerate(lines):
            size = fit_size(ln["text"], 920, 110 if k == 0 else 92, 56, 2)
            y = pop(im, W / 2, y, ln["text"], H1(size), col(ln.get("color")), tl, 0.15 + k * 0.75, 920) + 60
    return draw


def scene_list(sc):
    items = sc["items"][:6]
    def draw(im, t, tl):
        pop(im, W / 2, 330, sc.get("title", ""), H1(fit_size(sc.get("title", ""), 940, 68, 44, 1)), WHITE, tl, 0.0, 950)
        step = min(190, 1250 / max(1, len(items)))
        for i, it in enumerate(items):
            p = prog(tl, 0.6 + i * 0.7); y = 450 + i * step
            if p <= 0: continue
            hot = it.get("hot")
            rrect(im, (80, y + 20 * (1 - p), 1000, y + step - 26 + 20 * (1 - p)), CARD, p, r=30, outline=GOLD if hot else LINE)
            text(im, (120, y + (step - 26) / 2), it.get("left", ""), mono(40), GOLD, p, anchor="lm")
            rf = B(fit_size(it.get("right", ""), 560, 42, 28, 1, B))
            text(im, (400, y + (step - 26) / 2), it.get("right", ""), rf, WHITE if not it.get("muted") else MUTED, p, anchor="lm")
    return draw


def scene_rule(sc):
    def draw(im, t, tl):
        pop(im, W / 2, 520, sc.get("kicker", ""), H1(72), GOLD, tl, 0.0)
        y = pop(im, W / 2, 680, sc["title"], H1(fit_size(sc["title"], 900, 84, 56, 3)), WHITE, tl, 0.5, 900)
        if sc.get("body"): pop(im, W / 2, y + 90, sc["body"], B(fit_size(sc["body"], 860, 48, 34, 5, B)), MUTED, tl, 1.8, 860)
    return draw


def scene_stat(sc):
    def draw(im, t, tl):
        pop(im, W / 2, 560, sc.get("kicker", ""), H1(64), WHITE, tl, 0.0, 940)
        p = prog(tl, 0.6, 0.6)
        text(im, (W / 2, 860), sc["value"], H1(fit_size(sc["value"], 960, 230, 120, 1)), col(sc.get("color"), "gold"), p, dy=int(50 * (1 - p)))
        if sc.get("sub"): pop(im, W / 2, 1080, sc["sub"], B(44), MUTED, tl, 1.4, 880)
        if sc.get("note"): pop(im, W / 2, 1260, sc["note"], B(40), WHITE, tl, 2.4, 880)
    return draw


def scene_chart(sc):
    cs = sc["candles"]; n = len(cs)
    lo = min(c[2] for c in cs); hi = max(c[1] for c in cs)
    for lv in sc.get("levels", []): lo = min(lo, lv["price"]); hi = max(hi, lv["price"])
    pad = (hi - lo) * 0.12 or 1; lo -= pad; hi += pad
    X0, X1, Y0, Y1 = 100, 880, 470, 1400
    py = lambda p: Y1 - (p - lo) / (hi - lo) * (Y1 - Y0)
    cw = (X1 - X0) / n
    step = max(1, round((hi - lo) / 4 / 5) * 5)
    grid = [g for g in range(int(lo // step * step), int(hi) + 1, int(step)) if lo < g < hi]
    reveal = max(2.0, sc.get("dur", 7) * 0.55)
    def draw(im, t, tl):
        d = ImageDraw.Draw(im)
        pop(im, W / 2, 330, sc.get("title", ""), H1(fit_size(sc.get("title", ""), 940, 62, 40, 1)), WHITE, tl, 0.0, 950)
        rrect(im, (60, 430, 1020, 1500), CARD, 1, r=36)
        for g in grid:
            d.line((X0, py(g), X1, py(g)), fill=LINE, width=1)
            text(im, (X1 + 14, py(g)), f"{g:,}".replace(",", "."), R(24), MUTED, anchor="lm")
        for lv in sc.get("levels", []):
            c = col(lv.get("color"), "gold")
            for x in range(X0, int(X1), 26): d.line((x, py(lv["price"]), x + 14, py(lv["price"])), fill=c, width=3)
            text(im, (X1 - 6, py(lv["price"]) - 24), lv.get("text", ""), font("Inter-Bold.otf", 26), c, anchor="rm")
        k = clamp(tl / reveal) * n; full = int(k)
        for i in range(min(n, full + 1)):
            o, h, l, c = cs[i]
            if i == full:
                f = k - full
                if f <= 0: break
                c = o + (c - o) * f; h = max(o, c, o + (h - o) * min(1, f * 1.6)); l = min(o, c, o + (l - o) * min(1, f * 1.6))
            x = X0 + cw * i + cw / 2; cc = GREEN if c >= o else RED
            d.line((x, py(h), x, py(l)), fill=cc, width=max(2, int(cw * 0.12)))
            top, bot = py(max(o, c)), py(min(o, c))
            d.rectangle((x - cw * 0.32, top, x + cw * 0.32, max(bot, top + 3)), fill=cc)
        labels = sc.get("labels") or []
        every = max(1, n // 5)
        for i, lab in enumerate(labels[:n]):
            if i % every == 0: text(im, (X0 + cw * i + cw / 2, Y1 + 60), lab, R(22), MUTED)
        for j, nt in enumerate(sc.get("notes", [])):
            a = prog(tl, reveal + 0.3 + j * 0.8)
            if a <= 0: continue
            x = X0 + cw * nt["i"] + cw / 2; f = font("Inter-Bold.otf", 34); tw = d.textlength(nt["text"], font=f)
            bx = min(max(x - tw / 2 - 22, 80), 1000 - tw - 44); y = py(nt["price"])
            rrect(im, (bx, y - 34, bx + tw + 44, y + 34), col(nt.get("color"), "gold"), a, r=20)
            text(im, (bx + 22 + tw / 2, y), nt["text"], f, BG, a)
        if sc.get("footer"): text(im, (W / 2, 1560), sc["footer"], R(26), MUTED)
    return draw


def scene_cta(sc):
    def draw(im, t, tl):
        if sc.get("title"): pop(im, W / 2, 600, sc["title"], H1(fit_size(sc["title"], 900, 84, 56, 2)), GOLD, tl, 0.0, 900)
        cta(im, tl, 1.0)
    return draw


BUILD = {"hook": scene_hook, "list": scene_list, "rule": scene_rule, "stat": scene_stat, "chart": scene_chart, "cta": scene_cta}

if __name__ == "__main__":
    spec = json.load(open(sys.argv[1], encoding="utf-8")); out = sys.argv[2]
    scenes = [(float(s.get("dur", 5)), BUILD[s["type"]](s)) for s in spec["scenes"]]
    if not spec["scenes"] or spec["scenes"][-1]["type"] != "cta": scenes.append((4.0, scene_cta({})))
    total = sum(d for d, _ in scenes)
    # Musik: "music" in der Spec = drive | chill | lofi | none | Dateiname aus ../music/ ; Standard: automatisch
    import glob, random, subprocess as sp
    here = os.path.dirname(os.path.abspath(__file__))
    choice = spec.get("music", "auto"); seed = abs(hash(out)) % 10000; rnd = random.Random(seed)
    own = sorted(glob.glob(os.path.join(here, "..", "music", "*.mp3")) + glob.glob(os.path.join(here, "..", "music", "*.wav")) + glob.glob(os.path.join(here, "..", "music", "*.m4a")))
    track = None
    if choice not in ("none", ""):
        if choice == "auto": choice = rnd.choice(own) if own and rnd.random() < 0.5 else rnd.choice(["drive", "chill", "lofi"])
        if choice in ("drive", "chill", "lofi"):
            track = os.path.splitext(out)[0] + "_music.wav"
            sp.run([sys.executable, os.path.join(here, "music.py"), choice, str(total + 1), track, str(seed)], check=True, capture_output=True)
        else:
            cand = choice if os.path.isabs(choice) else os.path.join(here, "..", "music", os.path.basename(choice))
            track = cand if os.path.exists(cand) else None
    if track: os.environ["REEL_MUSIC"] = track
    render(scenes, out, total)
    if track and track.endswith("_music.wav") and os.path.exists(track): os.remove(track)
    print("musik:", os.path.basename(str(choice)) if track else "keine")
    print("ok", out)
