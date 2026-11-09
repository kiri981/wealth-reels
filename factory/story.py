"""Instagram-Story (1080x1920 JPG) aus dem Gold-Briefing.

python3 story.py story.json out.jpg
story.json:
{
  "date": "Mittwoch, 4. November",
  "headline": "Gold wartet auf die Fed",           # kurz, max. ~40 Zeichen
  "price": "4.052 $",                              # optional, nur echter Kurs mit Quelle
  "change": "+0,4 %",                              # optional
  "points": ["Dollar schwächer nach ...", "..."],  # 2–3 kurze Punkte
  "termine": [{"zeit": "14:30", "text": "US-Arbeitsmarkt (ADP)", "hot": true}],   # Bukarest-Zeit
  "levels": {"oben": "4.075", "unten": "4.028"},   # optional
  "termine_label": "DIESE WOCHE (Bukarest)"        # optional, Standard "TERMINE HEUTE (Bukarest)"
}
"""
import json, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1080, 1920
F = "/usr/share/fonts/opentype/inter/"
f = lambda n, s: ImageFont.truetype(F + n, s)
H1 = lambda s: f("InterDisplay-Black.otf", s); SB = lambda s: f("Inter-SemiBold.otf", s); MD = lambda s: f("Inter-Medium.otf", s)
MONO = lambda s: ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", s)
BG = (10, 12, 18); GOLD = (232, 181, 74); WHITE = (244, 244, 246); MUTED = (150, 156, 170); CARD = (22, 26, 36)
GREEN = (43, 214, 123); RED = (255, 92, 95); LINE = (44, 50, 66)


def wrap(d, s, fnt, maxw):
    out, line = [], ""
    for w in s.split():
        t = (line + " " + w).strip()
        if d.textlength(t, font=fnt) <= maxw: line = t
        else: out.append(line); line = w
    out.append(line); return [l for l in out if l]


def block(d, x, y, s, fnt, fill, maxw, lh=1.25, maxlines=9):
    for l in wrap(d, s, fnt, maxw)[:maxlines]:
        d.text((x, y), l, font=fnt, fill=fill); y += fnt.size * lh
    return y


def make(spec, out):
    im = Image.new("RGB", (W, H), BG)
    glow = Image.new("RGB", (W, H), BG); g = ImageDraw.Draw(glow)
    g.ellipse((-350, -800, W + 350, 650), fill=(70, 52, 20)); g.ellipse((500, 1500, 1500, 2400), fill=(40, 32, 14))
    im = Image.blend(im, glow.filter(ImageFilter.GaussianBlur(200)), 0.6)
    d = ImageDraw.Draw(im)
    # Kopf (Platz für Instagram-Profilzeile oben frei lassen)
    import os
    lp = os.path.join(os.path.dirname(os.path.abspath(__file__)), "brand", "logo.png")
    if os.path.exists(lp):   # Wealth-Club-Logo oben, wie in den Reels
        lg = Image.open(lp).convert("RGBA"); lg = lg.resize((300, int(lg.height * 300 / lg.width)), Image.LANCZOS)
        im.paste(lg, (int((W - lg.width) / 2), 150), lg)
    pill = "☀ GOLD-BRIEFING"
    pw = d.textlength(pill, font=SB(30))
    d.rounded_rectangle((80, 330, 80 + pw + 50, 388), radius=29, fill=(52, 40, 16), outline=GOLD, width=2)
    d.text((105, 359), pill, font=SB(30), fill=GOLD, anchor="lm")
    d.text((80 + pw + 80, 359), spec.get("date", ""), font=MD(34), fill=MUTED, anchor="lm")
    y = 425
    size = 92
    while size > 56 and (len(wrap(d, spec["headline"], H1(size), 920)) > 2 or max(d.textlength(l, font=H1(size)) for l in wrap(d, spec["headline"], H1(size), 920)) > 920): size -= 4
    y = block(d, 80, y, spec["headline"], H1(size), WHITE, 920, 1.08, 2) + 30
    if spec.get("price"):
        d.text((80, y), spec["price"], font=H1(120), fill=GOLD)
        if spec.get("change"):
            ch = spec["change"]; c = GREEN if ch.strip().startswith("+") else RED if ch.strip().startswith(("-", "−")) else MUTED
            px = 80 + d.textlength(spec["price"], font=H1(120)) + 30
            d.rounded_rectangle((px, y + 40, px + d.textlength(ch, font=SB(44)) + 40, y + 108), radius=34, fill=c)
            d.text((px + 20, y + 74), ch, font=SB(44), fill=BG, anchor="lm")
        y += 165
    # Punkte
    for p in spec.get("points", [])[:3]:
        d.ellipse((84, y + 16, 104, y + 36), fill=GOLD)
        y = block(d, 130, y, p, SB(42), WHITE, 870, 1.25, 3) + 22
    y += 20
    # Termine
    tm = spec.get("termine", [])[:4]
    if tm:
        d.text((80, y), spec.get("termine_label", "TERMINE HEUTE (Bukarest)"), font=SB(30), fill=MUTED); y += 55
        for t in tm:
            hot = t.get("hot")
            d.rounded_rectangle((80, y, 1000, y + 96), radius=26, fill=CARD, outline=GOLD if hot else LINE, width=2)
            d.text((115, y + 48), t["zeit"], font=MONO(40), fill=GOLD, anchor="lm")
            fs = 38
            while fs > 26 and d.textlength(t["text"], font=SB(fs)) > 620: fs -= 2
            d.text((290, y + 48), t["text"], font=SB(fs), fill=WHITE, anchor="lm")
            y += 114
    # Levels
    lv = spec.get("levels")
    if lv and y < 1500:
        y += 10
        for lab, val, c in (("Widerstand", lv.get("oben"), RED), ("Unterstützung", lv.get("unten"), GREEN)):
            if not val: continue
            d.text((80, y), lab, font=SB(36), fill=MUTED); d.text((1000, y), val, font=MONO(40), fill=c, anchor="ra"); y += 62
    # Fuß: Aufforderung + Hinweis (unten Platz für Instagram-Antwortfeld lassen)
    d.rounded_rectangle((140, 1590, 940, 1700), radius=55, fill=GOLD)
    d.text((W / 2, 1645), "Live-Trade-Ideen: Link im Profil", font=H1(42), fill=BG, anchor="mm")
    d.text((W / 2, 1745), "Keine Anlageberatung. Trading birgt Verlustrisiken.", font=MD(28), fill=MUTED, anchor="mm")
    im.save(out, quality=90)


if __name__ == "__main__":
    make(json.load(open(sys.argv[1], encoding="utf-8")), sys.argv[2])
    print("ok", sys.argv[2])
