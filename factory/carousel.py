"""Instagram-Karussell (Slideshow) im Wealth-Club-Look: 1080x1350 JPGs.

python3 carousel.py spec.json out_dir/
spec.json:
{
  "slides": [
    {"type": "cover", "pill": "FREITAG · 14:30 UHR", "title": "NFP-Freitag: So *schützt* du dein Konto", "sub": "5 Regeln …", "chart": "spike"},
    {"type": "text",  "title": "Was ist *NFP*?", "body": "Der US-Arbeitsmarktbericht …"},
    {"type": "step",  "n": 1, "title": "Kein Trade *vor* der Zahl", "body": "…", "chart": "spike|sweep|trend|range"},
    {"type": "list",  "title": "Merke dir", "items": ["…", "…"]},
    {"type": "cta",   "title": "Willst du meine *Gold-Setups*?", "body": "…", "button": "Kommentiere GOLD"}
  ]
}
Titel: *Wort* = gold hervorgehoben. Charts sind beispielhafte Darstellungen (keine echten Kurse).
"""
import json, os, random, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1080, 1350
F = "/usr/share/fonts/opentype/inter/"
BLACK = lambda s: ImageFont.truetype(F + "InterDisplay-Black.otf", s)
BOLD = lambda s: ImageFont.truetype(F + "Inter-Bold.otf", s)
SEMI = lambda s: ImageFont.truetype(F + "Inter-SemiBold.otf", s)
MED = lambda s: ImageFont.truetype(F + "Inter-Medium.otf", s)
BG = (10, 10, 12); GOLD = (232, 181, 74); GOLD2 = (168, 118, 31); WHITE = (245, 244, 240); MUTED = (150, 146, 138)
CARD = (20, 20, 24); LINE = (44, 44, 52); GREEN = (43, 214, 123); RED = (255, 92, 95)
HERE = os.path.dirname(os.path.abspath(__file__))


def background():
    im = Image.new("RGB", (W, H), BG)
    g = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(g)
    d.ellipse((-300, -700, W + 300, 500), fill=(64, 48, 18)); d.ellipse((500, 1000, 1500, 1900), fill=(36, 28, 12))
    im = Image.blend(im, g.filter(ImageFilter.GaussianBlur(180)), 0.7)
    d = ImageDraw.Draw(im)
    for x in range(0, W, 90): d.line((x, 0, x, H), fill=(18, 18, 22))       # dezentes Raster wie ein Chart
    for y in range(0, H, 90): d.line((0, y, W, y), fill=(18, 18, 22))
    return im


def wrap(d, words, fnt, maxw):
    lines, cur = [], []
    for w in words:
        t = " ".join(x for x, _ in cur + [(w, 0)])
        if cur and d.textlength(t.replace("*", ""), font=fnt) > maxw: lines.append(cur); cur = []
        cur.append((w, 0))
    if cur: lines.append(cur)
    return [[w for w, _ in l] for l in lines]


def rich(d, x, y, s, size, maxw, maxlines=4, center=False, color=WHITE, lh=1.12):
    """Titel mit *Hervorhebung*; schrumpft, bis er passt. Gibt untere Kante zurück."""
    while True:
        fnt = BLACK(size); lines = wrap(d, s.split(), fnt, maxw)
        if len(lines) <= maxlines or size <= 40: break
        size -= 4
    on = False
    for ln in lines:
        plain = " ".join(ln).replace("*", ""); lw = d.textlength(plain, font=fnt)
        cx = (W - lw) / 2 if center else x
        for w in ln:
            st = w.startswith("*"); en = w.rstrip(".,!?:").endswith("*")
            if st: on = True
            t = w.replace("*", "")
            d.text((cx, y), t, font=fnt, fill=GOLD if on else color)
            cx += d.textlength(t + " ", font=fnt)
            if en: on = False
        y += size * lh
    return y


def para(d, x, y, s, fnt, maxw, color=MUTED, center=False, lh=1.4):
    for ln in wrap(d, s.split(), fnt, maxw):
        t = " ".join(ln).replace("*", "")
        d.text(((W - d.textlength(t, font=fnt)) / 2 if center else x, y), t, font=fnt, fill=color); y += fnt.size * lh
    return y


def candles(kind, n=22, seed=4):
    r = random.Random(seed); p = 100.0; out = []
    for i in range(n):
        if kind == "spike": drift = 0.05 if i < n - 6 else (2.6 if i < n - 2 else -0.6)
        elif kind == "sweep": drift = -0.5 if i < 9 else (-1.8 if i == 11 else (1.2 if i > 11 else 0.05))
        elif kind == "trend": drift = 0.9 if i % 6 < 4 else -0.7
        else: drift = 1.0 if (i // 4) % 2 == 0 else -1.0
        o = p; c = o + drift + r.uniform(-0.45, 0.45)
        h = max(o, c) + r.uniform(0.1, 0.7); l = min(o, c) - r.uniform(0.1, 0.7)
        if kind == "sweep" and i == 11: l -= 1.8
        if kind == "spike" and i == n - 3: h += 1.5
        out.append((o, h, l, c)); p = c
    return out


def chart_card(im, box, kind, tag=None):
    d = ImageDraw.Draw(im); x0, y0, x1, y1 = box
    d.rounded_rectangle(box, radius=28, fill=CARD, outline=LINE, width=2)
    cs = candles(kind); lo = min(c[2] for c in cs); hi = max(c[1] for c in cs)
    px0, px1, py0, py1 = x0 + 40, x1 - 40, y0 + 50, y1 - 40
    py = lambda v: py1 - (v - lo) / (hi - lo) * (py1 - py0); cw = (px1 - px0) / len(cs)
    for i, (o, h, l, c) in enumerate(cs):
        cx = px0 + cw * i + cw / 2; col = GREEN if c >= o else RED
        d.line((cx, py(h), cx, py(l)), fill=col, width=3)
        d.rectangle((cx - cw * 0.3, py(max(o, c)), cx + cw * 0.3, max(py(min(o, c)), py(max(o, c)) + 3)), fill=col)
    if tag:
        i = len(cs) - 3 if kind == "spike" else 11; cx = px0 + cw * i + cw / 2
        f = BOLD(30); tw = d.textlength(tag, font=f)
        ty = py(cs[i][1]) - 52 if kind != "sweep" else py(cs[i][2]) + 14
        bx = min(max(cx - tw / 2 - 18, x0 + 16), x1 - tw - 52)
        d.rounded_rectangle((bx, ty, bx + tw + 36, ty + 46), radius=23, fill=RED if kind == "spike" else GOLD)
        d.text((bx + 18, ty + 23), tag, font=f, fill=WHITE if kind == "spike" else BG, anchor="lm")


def chrome(im, i, n, last):
    d = ImageDraw.Draw(im)
    lp = os.path.join(HERE, "brand", "logo.png")
    if os.path.exists(lp):
        lg = Image.open(lp).convert("RGBA"); lg = lg.resize((150, int(lg.height * 150 / lg.width)), Image.LANCZOS); im.paste(lg, (64, 44), lg)
    d.text((W - 64, 70), f"{i}/{n}", font=SEMI(30), fill=MUTED, anchor="rm")
    d.text((64, H - 60), "Keine Anlageberatung · Beispielhafte Darstellung", font=MED(24), fill=(110, 106, 98), anchor="lm")
    if not last: d.text((W - 64, H - 60), "WISCHEN →", font=BLACK(32), fill=GOLD, anchor="rm")


def pill(d, x, y, s):
    f = BOLD(28); w = d.textlength(s, font=f)
    d.rounded_rectangle((x, y, x + w + 48, y + 54), radius=27, fill=(46, 34, 12), outline=GOLD2, width=2)
    d.text((x + 24, y + 27), s, font=f, fill=GOLD, anchor="lm")


def slide(sp, i, n):
    im = background(); d = ImageDraw.Draw(im); t = sp.get("type", "text"); M = 64; MW = W - 2 * M
    if t == "cover":
        y = 230
        if sp.get("pill"): pill(d, M, y, sp["pill"]); y += 90
        y = rich(d, M, y, sp["title"], 92, MW, 4) + 20
        if sp.get("sub"): y = para(d, M, y, sp["sub"], MED(38), MW) + 30
        if sp.get("chart"): chart_card(im, (M, max(y, 760), W - M, 1200), sp["chart"], sp.get("tag"))
    elif t == "step":
        f = BLACK(64); n_ = str(sp.get("n", i - 1))
        d.ellipse((M, 230, M + 110, 340), fill=GOLD); d.text((M + 55, 285), n_, font=f, fill=BG, anchor="mm")
        d.text((M + 140, 285), f"SCHRITT {n_}".replace("SCHRITT", sp.get("label", "REGEL")), font=BLACK(34), fill=GOLD, anchor="lm")
        y = rich(d, M, 400, sp["title"], 80, MW, 3) + 24
        y = para(d, M, y, sp.get("body", ""), MED(40), MW, WHITE if not sp.get("chart") else MUTED) + 30
        if sp.get("chart"): chart_card(im, (M, max(y, 820), W - M, 1200), sp["chart"], sp.get("tag"))
        else:   # große, blasse Zahl als Blickfang im leeren Bereich
            wm = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ImageDraw.Draw(wm).text((W - 40, H - 90), n_, font=BLACK(560), fill=GOLD + (34,), anchor="rb")
            im.paste(wm, (0, 0), wm); d = ImageDraw.Draw(im)
            if sp.get("quote"):
                qy = max(y + 40, 900); d.rounded_rectangle((M, qy, W - M, qy + 170), radius=26, fill=(36, 28, 12), outline=GOLD2, width=2)
                para(d, M + 40, qy + 40, sp["quote"], SEMI(40), MW - 80, GOLD, lh=1.25)
    elif t == "list":
        y = rich(d, M, 240, sp["title"], 80, MW, 2) + 40
        for it in sp.get("items", [])[:6]:
            d.rounded_rectangle((M, y, W - M, y + 120), radius=24, fill=CARD, outline=LINE, width=2)
            d.ellipse((M + 34, y + 46, M + 62, y + 74), fill=GOLD)
            para(d, M + 90, y + 34, it, SEMI(38), MW - 130, WHITE, lh=1.2); y += 140
    elif t == "cta":
        y = rich(d, M, 360, sp["title"], 88, MW, 3, center=True) + 30
        y = para(d, M, y, sp.get("body", ""), MED(40), MW - 60, MUTED, center=True) + 70
        b = sp.get("button", "Kommentiere GOLD"); f = BLACK(52); bw = d.textlength(b, font=f) + 120
        d.rounded_rectangle(((W - bw) / 2, y, (W + bw) / 2, y + 130), radius=65, fill=GOLD); d.text((W / 2, y + 65), b, font=f, fill=BG, anchor="mm")
        para(d, M, y + 190, sp.get("note", "Link zur kostenlosen Gold-Community per Nachricht"), MED(32), MW, MUTED, center=True)
    else:  # text
        y = rich(d, M, 470, sp["title"], 96, MW, 3, center=True) + 30
        para(d, M + 30, y, sp.get("body", ""), MED(42), MW - 60, WHITE, center=True)
    chrome(im, i, n, i == n)
    return im


if __name__ == "__main__":
    spec = json.load(open(sys.argv[1], encoding="utf-8")); out = sys.argv[2]; os.makedirs(out, exist_ok=True)
    n = len(spec["slides"])
    for i, sp in enumerate(spec["slides"], 1):
        slide(sp, i, n).save(os.path.join(out, f"{i:02d}.jpg"), quality=92)
    print("ok", n, "Folien ->", out)
