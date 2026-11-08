import sys, os
sys.path.insert(0, "../factory")
from lib import font
from PIL import Image, ImageDraw, ImageFilter
LOGO = Image.open("../factory/brand/logo.png").convert("RGBA")
def thumb(out, kick, t1, t2, shot, box=None):
    W, H = 1280, 720; im = Image.new("RGB", (W, H), (12, 12, 14)); g = Image.new("RGB", (W, H), (0, 0, 0)); d = ImageDraw.Draw(g)
    d.ellipse((-300, -400, 700, 400), fill=(70, 52, 18)); im = Image.blend(im, g.filter(ImageFilter.GaussianBlur(160)), .8)
    s = Image.open(shot).convert("RGB")
    if box: s = s.crop(box)
    s.thumbnail((520, 600)); m = Image.new("L", s.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0) + s.size, radius=26, fill=255)
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0)); x, y = W - s.width - 60, (H - s.height) // 2
    ImageDraw.Draw(sh).rounded_rectangle((x - 10, y + 10, x + s.width + 10, y + s.height + 30), radius=30, fill=(0, 0, 0, 200)); sh = sh.filter(ImageFilter.GaussianBlur(20)); im.paste(sh, (0, 0), sh)
    im.paste(s, (x, y), m); d = ImageDraw.Draw(im)
    d.rounded_rectangle((x - 4, y - 4, x + s.width + 4, y + s.height + 4), radius=28, outline=(232, 181, 74), width=5)
    lo = LOGO.resize((210, int(LOGO.height * 210 / LOGO.width))); im.paste(lo, (60, 50), lo)
    d.rounded_rectangle((60, 250, 60 + d.textlength(kick, font=font("Inter-Bold.otf", 34)) + 44, 304), radius=27, fill=(232, 181, 74))
    d.text((82, 290), kick, font=font("Inter-Bold.otf", 34), fill=(20, 16, 8), anchor="ls")
    d.text((60, 420), t1, font=font("InterDisplay-Black.otf", 92), fill=(245, 245, 245), anchor="ls")
    d.text((60, 520), t2, font=font("InterDisplay-Black.otf", 92), fill=(232, 181, 74), anchor="ls")
    d.text((60, 600), "Schritt für Schritt erklärt", font=font("Inter-SemiBold.otf", 36), fill=(200, 196, 186), anchor="ls")
    im.save(out, quality=92)
thumb("thumb_konto.jpg", "TUTORIAL 1", "Ultima-Konto", "eröffnen", "img/register.png", (180, 70, 710, 900))
thumb("thumb_mt5.jpg", "TUTORIAL 2", "MetaTrader 5", "verbinden", "img/login.png", (0, 0, 591, 760))
print("ok")
