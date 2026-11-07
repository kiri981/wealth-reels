"""YouTube-Fassung eines Reels: Titel als goldene Leiste unten über die ganze Länge (ab dem Titelbild).

YouTube wählt das Vorschaubild von Shorts selbst aus irgendeinem Bild im Video – mit der Leiste sieht man
im Kanal-Raster bei jedem Bild, worum es geht.

python3 yt_variant.py reels/<day>.mp4 reels/<day>_yt.mp4 "Wie viel *pro Trade* riskieren?" [kicker]
Titel: *Wörter* werden gold, der Rest weiß.
"""
import os, re, subprocess, sys, tempfile
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import W, H, font, GOLD, WHITE

Y0, BH = 1630, 190   # Leiste unterhalb des Risikohinweises (frei in allen Szenen)


def bar_png(path, title, kicker=""):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    x0, x1 = 60, W - 60
    d.rounded_rectangle((x0, Y0, x1, Y0 + BH), radius=34, fill=(14, 12, 8, 235), outline=GOLD + (255,), width=4)
    parts = [(p, i % 2 == 1) for i, p in enumerate(re.split(r"\*", title)) if p]
    size = 64
    while size > 34:
        f = font("InterDisplay-Black.otf", size)
        tw = sum(d.textlength(p, font=f) for p, _ in parts)
        if tw <= x1 - x0 - 80: break
        size -= 4
    f = font("InterDisplay-Black.otf", size)
    tw = sum(d.textlength(p, font=f) for p, _ in parts)
    cy = Y0 + BH / 2 + (14 if kicker else 0)
    x = (W - tw) / 2
    for p, g in parts:
        d.text((x, cy), p, font=f, fill=(GOLD if g else WHITE) + (255,), anchor="lm"); x += d.textlength(p, font=f)
    if kicker:
        d.text((W / 2, Y0 + 34), kicker.upper(), font=font("Inter-Bold.otf", 28), fill=GOLD + (255,), anchor="mm")
    im.save(path)


def make(src, out, title, kicker="", start=1.0):
    tmp = tempfile.mkdtemp(); png = os.path.join(tmp, "bar.png")
    bar_png(png, title.strip(), kicker)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-loop", "1", "-i", png,
                    "-filter_complex", f"[0:v][1:v]overlay=0:0:shortest=1:enable='gte(t,{start})',format=yuv420p[v]",
                    "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-c:a", "copy",
                    "-movflags", "+faststart", out], check=True)
    print("ok", out)


if __name__ == "__main__":
    make(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else "")
