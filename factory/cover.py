"""Einheitliches Titelbild (Cover) für Reels: 1080x1920 JPG.
Das Instagram-Raster zeigt die Mitte im Format 3:4 (1080x1440) – alles Wichtige liegt dort.

python3 cover.py "LERN-REEL" "Fair Value Gap *erklärt*" out.jpg [chart: up|down|sweep|range]
Kicker-Vorschläge: LERN-REEL · MARKT · REPLAY · BRIEFING · PSYCHOLOGIE · RISIKO
"""
import os, random, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1080, 1920
F = "/usr/share/fonts/opentype/inter/"
BLACK = lambda s: ImageFont.truetype(F + "InterDisplay-Black.otf", s)
BOLD = lambda s: ImageFont.truetype(F + "Inter-Bold.otf", s)
BG = (10, 10, 12); GOLD = (232, 181, 74); GOLD2 = (168, 118, 31); WHITE = (245, 244, 240); GREEN = (43, 214, 123); RED = (255, 92, 95)
HERE = os.path.dirname(os.path.abspath(__file__))
KICK_COL = {"REPLAY": GREEN, "MARKT": GOLD, "BRIEFING": GOLD, "LERN-REEL": GOLD, "PSYCHOLOGIE": (150, 170, 255), "RISIKO": RED}


def make(kicker, title, out, chart="up"):
    im = Image.new("RGB", (W, H), BG)
    g = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(g)
    d.ellipse((-260, 120, W + 260, 1000), fill=(70, 52, 20)); d.ellipse((300, 1250, 1400, 2100), fill=(34, 26, 10))
    im = Image.blend(im, g.filter(ImageFilter.GaussianBlur(170)), 0.75); d = ImageDraw.Draw(im)
    for x in range(0, W, 90): d.line((x, 240, x, 1680), fill=(18, 18, 22))
    for y in range(240, 1681, 90): d.line((0, y, W, y), fill=(18, 18, 22))
    # Logo
    lp = os.path.join(HERE, "brand", "logo.png")
    if os.path.exists(lp):
        lg = Image.open(lp).convert("RGBA"); lg = lg.resize((330, int(lg.height * 330 / lg.width)), Image.LANCZOS); im.paste(lg, ((W - lg.width) // 2, 300), lg)
    # Kicker-Pille
    kc = KICK_COL.get(kicker.upper(), GOLD); f = BOLD(40); kw = d.textlength(kicker.upper(), font=f)
    d.rounded_rectangle(((W - kw) / 2 - 34, 520, (W + kw) / 2 + 34, 590), radius=35, outline=kc, width=3, fill=(24, 20, 12))
    d.text((W / 2, 555), kicker.upper(), font=f, fill=kc, anchor="mm")
    # Titel (gold hervorgehoben mit *…*), max. 3 Zeilen, zentriert
    size = 118
    while True:
        fnt = BLACK(size); lines, cur = [], []
        for w in title.split():
            t = " ".join(cur + [w]).replace("*", "")
            if cur and d.textlength(t, font=fnt) > 940: lines.append(cur); cur = []
            cur.append(w)
        lines.append(cur)
        if len(lines) <= 3 or size <= 70: break
        size -= 6
    y = 680 + (3 - len(lines)) * size * 0.5; on = False
    for ln in lines:
        x = (W - d.textlength(" ".join(ln).replace("*", ""), font=fnt)) / 2
        for w in ln:
            if w.startswith("*"): on = True
            t = w.replace("*", ""); d.text((x, y), t, font=fnt, fill=GOLD if on else WHITE); x += d.textlength(t + " ", font=fnt)
            if w.rstrip(".,!?:").endswith("*"): on = False
        y += size * 1.08
    # Mini-Chart unten im sichtbaren Bereich
    r = random.Random(len(title)); p = 0; cs = []
    for i in range(18):
        dr = {"up": 0.9, "down": -0.9, "sweep": (-0.8 if i < 9 else 1.3), "range": (1 if (i // 3) % 2 else -1)}.get(chart, 0.9)
        o = p; c = o + dr + r.uniform(-0.6, 0.6); cs.append((o, max(o, c) + r.uniform(0.1, 0.6), min(o, c) - r.uniform(0.1, 0.6), c)); p = c
    lo = min(c[2] for c in cs); hi = max(c[1] for c in cs); X0, X1, Y0, Y1 = 200, 880, 1250, 1560
    py = lambda v: Y1 - (v - lo) / (hi - lo) * (Y1 - Y0); cw = (X1 - X0) / len(cs)
    for i, (o, h, l, c) in enumerate(cs):
        cx = X0 + cw * i + cw / 2; col = GREEN if c >= o else RED
        d.line((cx, py(h), cx, py(l)), fill=col, width=3); d.rectangle((cx - cw * 0.3, py(max(o, c)), cx + cw * 0.3, max(py(min(o, c)), py(max(o, c)) + 3)), fill=col)
    im.save(out, quality=92)
    return out


if __name__ == "__main__":
    make(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else "up")
    print("ok", sys.argv[3])
