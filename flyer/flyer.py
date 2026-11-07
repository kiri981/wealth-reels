import random, sys, os
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, "/home/claude/wealth-reels/factory")
from lib import font
W, H = 1080, 1920
GOLD = (232, 181, 74); GOLD2 = (255, 214, 120); WHITE = (255, 255, 255)
HEAD = sys.argv[1] if len(sys.argv) > 1 else "WILLST DU GOLD|TRADEN LERNEN?"
L1, L2, HANDLE, OUT = (sys.argv[2:6] + ["", "", "", ""])[:4] if len(sys.argv) > 2 else ("SCHREIB MIR", "AUF TELEGRAM", "Link in Bio", "flyer_de.png")
random.seed(7)

def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

# --- Hintergrund: Nacht-Büro mit Fensterfront ---
bg = Image.new("RGB", (W, H)); d = ImageDraw.Draw(bg)
for y in range(H): d.line((0, y, W, y), fill=lerp((10, 16, 30), (22, 18, 12), y / H))
city = Image.new("RGBA", (W, H), (0, 0, 0, 0)); dc = ImageDraw.Draw(city)
for _ in range(420):   # Stadtlichter
    x = random.randint(0, W); y = random.randint(380, 1250); r = random.choice([3, 4, 5, 7, 10])
    c = random.choice([(255, 200, 120), (255, 170, 80), (180, 200, 255), (255, 230, 170)])
    dc.ellipse((x - r, y - r, x + r, y + r), fill=c + (random.randint(60, 170),))
for i in range(14):    # Hochhaus-Silhouetten
    x0 = random.randint(-50, W); w = random.randint(60, 150); top = random.randint(520, 900)
    dc.rectangle((x0, top, x0 + w, 1300), fill=(14, 20, 36, 200))
    for yy in range(top + 20, 1280, 28):
        for xx in range(x0 + 10, x0 + w - 10, 22):
            if random.random() < .35: dc.rectangle((xx, yy, xx + 8, yy + 12), fill=(255, 200, 120, random.randint(80, 200)))
bg.paste(city.filter(ImageFilter.GaussianBlur(6)), (0, 0), city.filter(ImageFilter.GaussianBlur(6)))
d = ImageDraw.Draw(bg, "RGBA")
for x in (0, 360, 720, 1080): d.rectangle((x - 9, 0, x + 9, 1350), fill=(8, 10, 16, 235))   # Fensterrahmen
d.rectangle((0, 0, W, 60), fill=(8, 10, 16, 235))
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ImageDraw.Draw(glow).ellipse((380, 600, 1300, 1300), fill=(232, 181, 74, 70))
bg.paste(glow.filter(ImageFilter.GaussianBlur(160)), (0, 0), glow.filter(ImageFilter.GaussianBlur(160)))

# --- Monitore mit Gold-Charts ---
def monitor(x, y, w, h, seed):
    random.seed(seed); m = Image.new("RGBA", (w + 20, h + 70), (0, 0, 0, 0)); dm = ImageDraw.Draw(m)
    dm.rounded_rectangle((0, 0, w + 20, h + 20), radius=10, fill=(20, 22, 26, 255))
    dm.rectangle((10, 10, w + 10, h + 10), fill=(9, 13, 22, 255))
    for gy in range(10, h, 40): dm.line((10, 10 + gy, w + 10, 10 + gy), fill=(40, 48, 66, 255))
    p = h * .6; n = 34; cw = (w - 40) / n; pts = []
    for i in range(n):
        o = p; p += random.uniform(-h * .07, h * .055) - h * .006; p = max(h * .15, min(h * .9, p))
        hi = min(o, p) - random.uniform(4, 18); lo = max(o, p) + random.uniform(4, 18); cx = 25 + i * cw
        col = (52, 199, 120) if p < o else (232, 80, 80)
        dm.line((cx + cw / 2, 10 + hi, cx + cw / 2, 10 + lo), fill=col, width=2)
        dm.rectangle((cx + 2, 10 + min(o, p), cx + cw - 2, 10 + max(o, p) + 1), fill=col); pts.append((cx + cw / 2, 10 + p))
    dm.line(pts, fill=GOLD + (255,), width=3)
    dm.rectangle((w / 2 - 8, h + 20, w / 2 + 28, h + 55), fill=(30, 30, 34, 255)); dm.rectangle((w / 2 - 50, h + 55, w / 2 + 70, h + 65), fill=(30, 30, 34, 255))
    return m
for (x, y, w, h, s) in [(600, 720, 440, 290, 3), (640, 1080, 380, 230, 9)]:
    m = monitor(x, y, w, h, s); bg.paste(m, (x, y), m)
lg = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ImageDraw.Draw(lg).rectangle((580, 700, 1060, 1330), fill=(120, 160, 255, 40))
bg.paste(lg.filter(ImageFilter.GaussianBlur(60)), (0, 0), lg.filter(ImageFilter.GaussianBlur(60)))

# --- Kevin ---
k = Image.open("cut.png").convert("RGBA"); k = k.crop(k.getbbox())
s = 1340 / k.height; k = k.resize((int(k.width * s), 1340), Image.LANCZOS)
kx, ky = -60, 560
sh = Image.new("RGBA", (W, H), (0, 0, 0, 0)); sh.paste((0, 0, 0, 170), (kx + 25, ky + 20), k)
bg.paste(sh.filter(ImageFilter.GaussianBlur(30)), (0, 0), sh.filter(ImageFilter.GaussianBlur(30)))
rim = Image.new("RGBA", k.size, GOLD + (0,)); rim.putalpha(k.getchannel("A").filter(ImageFilter.MaxFilter(9)))   # goldene Kontur-Licht
rim = rim.filter(ImageFilter.GaussianBlur(10)); ra = rim.getchannel("A").point(lambda v: int(v * .55)); rim.putalpha(ra)
bg.paste(rim, (kx, ky), rim); bg.paste(k, (kx, ky), k)

# --- Tisch vorne ---
d = ImageDraw.Draw(bg, "RGBA")
for y in range(1700, H): d.line((0, y, W, y), fill=lerp((58, 56, 54), (24, 22, 20), (y - 1700) / (H - 1700)) + (255,))
d.line((0, 1700, W, 1700), fill=(140, 130, 115, 255), width=3)
d.polygon([(700, 1760), (1020, 1760), (1060, 1800), (660, 1800)], fill=(70, 72, 78, 255)); d.rounded_rectangle((640, 1798, 1080, 1812), radius=5, fill=(40, 42, 46, 255))   # Laptop
d.rounded_rectangle((60, 1745, 300, 1795), radius=6, fill=(30, 26, 22, 255), outline=(70, 60, 50, 255), width=2)   # Notizbuch

# --- Rahmen-Ecken („REEL“) ---
def corners(c=(255, 255, 255, 110)):
    L = 70; m = 40
    for (x, y, dx, dy) in [(m, m + 40, 1, 1), (W - m, m + 40, -1, 1), (m, H - m, 1, -1), (W - m, H - m, -1, -1)]:
        d.line((x, y, x + dx * L, y), fill=c, width=4); d.line((x, y, x, y + dy * L), fill=c, width=4)
corners()

# --- Text (kursiv, gold/weiß, mit Schatten) ---
def slant(txt, f, fill, cx, cy, grad=None):
    tw = int(ImageDraw.Draw(bg).textlength(txt, font=f)) + 80; th = f.size + 60
    t = Image.new("RGBA", (tw, th), (0, 0, 0, 0)); dt = ImageDraw.Draw(t); dt.text((40, 30), txt, font=f, fill=fill + (255,), anchor="lt")
    if grad:
        g = Image.new("RGBA", (tw, th)); dg = ImageDraw.Draw(g)
        for y in range(th): dg.line((0, y, tw, y), fill=lerp(grad[0], grad[1], y / th) + (255,))
        g.putalpha(t.getchannel("A")); t = g
    t = t.transform(t.size, Image.AFFINE, (1, 0.18, -th * .09, 0, 1, 0), Image.BICUBIC)
    shd = Image.new("RGBA", t.size, (0, 0, 0, 0)); shd.putalpha(t.getchannel("A").point(lambda v: int(v * .8)))
    shd = shd.filter(ImageFilter.GaussianBlur(10))
    x, y = int(cx - tw / 2), int(cy - th / 2); bg.paste(shd, (x + 6, y + 10), shd); bg.paste(t, (x, y), t)

def fit(txt, name, size, maxw):
    while ImageDraw.Draw(bg).textlength(txt, font=font(name, size)) > maxw: size -= 4
    return font(name, size)

h1, h2 = HEAD.split("|")
slant(h1, fit(h1, "InterDisplay-Black.otf", 128, 940), WHITE, W / 2, 230, grad=(GOLD2, (196, 140, 40)))
slant(h2, fit(h2, "InterDisplay-Black.otf", 128, 940), WHITE, W / 2, 365, grad=((255, 255, 255), (200, 205, 215)))

# CTA-Block
d = ImageDraw.Draw(bg, "RGBA")
f1 = fit(L1, "InterDisplay-Black.otf", 96, 700); w1 = d.textlength(L1, font=f1)
d.polygon([(W / 2 - w1 / 2 - 50, 1385), (W / 2 + w1 / 2 + 60, 1385), (W / 2 + w1 / 2 + 40, 1505), (W / 2 - w1 / 2 - 70, 1505)], fill=(16, 14, 10, 225))
slant(L1, f1, WHITE, W / 2, 1445, grad=(GOLD2, (200, 145, 45)))
f2 = fit(L2, "InterDisplay-Black.otf", 62, 820); w2 = d.textlength(L2, font=f2)
d.polygon([(W / 2 - w2 / 2 - 40, 1515), (W / 2 + w2 / 2 + 50, 1515), (W / 2 + w2 / 2 + 34, 1592), (W / 2 - w2 / 2 - 56, 1592)], fill=(8, 8, 10, 235))
slant(L2, f2, WHITE, W / 2, 1553)
# Telegram-Pille
fh = fit(HANDLE, "InterDisplay-Black.otf", 84, 620); wh = d.textlength(HANDLE, font=fh)
bw = wh + 210; x0 = W / 2 - bw / 2 + 30; y0, y1 = 1615, 1730
d.polygon([(x0, y0), (x0 + bw, y0), (x0 + bw - 22, y1), (x0 - 22, y1)], fill=(20, 40, 90, 235), outline=(90, 170, 255, 255))
gl = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ImageDraw.Draw(gl).polygon([(x0, y0), (x0 + bw, y0), (x0 + bw - 22, y1), (x0 - 22, y1)], outline=(90, 170, 255, 255), width=8)
bg.paste(gl.filter(ImageFilter.GaussianBlur(10)), (0, 0), gl.filter(ImageFilter.GaussianBlur(10)))
cx, cy, r = x0 - 10, (y0 + y1) / 2, 78
d = ImageDraw.Draw(bg, "RGBA")
d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(42, 171, 238, 255), outline=WHITE + (255,), width=5)
d.polygon([(cx - 42, cy + 2), (cx + 40, cy - 34), (cx + 26, cy + 40), (cx + 2, cy + 20)], fill=WHITE + (255,))
d.polygon([(cx - 6, cy + 14), (cx + 26, cy - 18), (cx + 4, cy + 22), (cx - 2, cy + 40)], fill=(200, 225, 245, 255))
slant(HANDLE, fh, WHITE, x0 + 78 + wh / 2 + 40, cy, grad=(GOLD2, (210, 150, 50)))

# Logo klein oben
lp = "/home/claude/wealth-reels/factory/brand/logo.png"
if os.path.exists(lp):
    lo = Image.open(lp).convert("RGBA"); lo = lo.resize((150, int(lo.height * 150 / lo.width)), Image.LANCZOS); bg.paste(lo, ((W - lo.width) // 2, 70), lo)
d = ImageDraw.Draw(bg, "RGBA")
d.text((W / 2, 1862), sys.argv[6] if len(sys.argv) > 6 else "Keine Anlageberatung · Trading birgt Verlustrisiken", font=font("Inter-Medium.otf", 22), fill=(170, 170, 175), anchor="mm")
bg.convert("RGB").save(OUT, quality=95); print("ok", OUT)
