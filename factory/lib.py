import os, subprocess, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS = 1080, 1920, 30
F = "/usr/share/fonts/opentype/inter/"
def font(name, size): return ImageFont.truetype(F + name, size)
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
def mono(size): return ImageFont.truetype(MONO, size)

BG = (10, 12, 18); GOLD = (232, 181, 74); WHITE = (244, 244, 246); MUTED = (150, 156, 170)
RED = (255, 92, 95); GREEN = (43, 214, 123); CARD = (22, 26, 36); LINE = (40, 46, 60)

def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def ease(x): x = clamp(x); return 1 - (1 - x) ** 3
def prog(t, start, dur=0.45): return ease((t - start) / dur)

_bg = None
def background():
    global _bg
    if _bg is None:
        im = Image.new("RGB", (W, H), BG)
        d = ImageDraw.Draw(im)
        # sanfter Goldschimmer oben
        glow = Image.new("RGB", (W, H), BG); g = ImageDraw.Draw(glow)
        g.ellipse((-300, -700, W + 300, 700), fill=(58, 44, 18))
        glow = glow.filter(ImageFilter.GaussianBlur(220))
        im = Image.blend(im, glow, 0.55)
        d = ImageDraw.Draw(im)
        for y in range(0, H, 120): d.line((0, y, W, y), fill=(16, 19, 27), width=1)
        _bg = im
    return _bg.copy()

def chrome(im, t, total):
    """Marke oben + Fortschrittsbalken."""
    d = ImageDraw.Draw(im)
    f = font("Inter-SemiBold.otf", 30)
    txt = "GOLD  ·  XAUUSD"
    w = d.textlength(txt, font=f)
    x0 = (W - w) / 2 - 26
    d.rounded_rectangle((x0, 150, x0 + w + 52, 204), radius=27, outline=GOLD, width=2)
    d.text((W / 2, 177), txt, font=f, fill=GOLD, anchor="mm")
    d.rectangle((0, 0, W, 8), fill=(30, 34, 44))
    d.rectangle((0, 0, int(W * clamp(t / total)), 8), fill=GOLD)
    return im

def text(im, xy, s, fnt, fill, a=1.0, anchor="mm", dy=0):
    if a <= 0: return
    layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((xy[0], xy[1] + dy), s, font=fnt, fill=fill + (int(255 * clamp(a)),), anchor=anchor)
    im.paste(layer, (0, 0), layer)

def wrap(s, fnt, maxw):
    d = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    out, line = [], ""
    for w in s.split(" "):
        tst = (line + " " + w).strip()
        if d.textlength(tst, font=fnt) <= maxw: line = tst
        else: out.append(line); line = w
    out.append(line); return out

def para(im, cx, y, s, fnt, fill, a=1.0, maxw=900, lh=1.18, dy=0):
    lines = wrap(s, fnt, maxw); h = fnt.size * lh
    for i, l in enumerate(lines): text(im, (cx, y + i * h), l, fnt, fill, a, dy=dy)
    return y + len(lines) * h

def pop(im, cx, y, s, fnt, fill, t, start, maxw=900):
    p = prog(t, start)
    return para(im, cx, y, s, fnt, fill, p, maxw, dy=int(40 * (1 - p)))

def rrect(im, box, fill, a=1.0, r=28, outline=None, width=2):
    layer = Image.new("RGBA", im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    al = int(255 * clamp(a))
    d.rounded_rectangle(box, radius=r, fill=fill + (al,), outline=(outline + (al,)) if outline else None, width=width)
    im.paste(layer, (0, 0), layer)

def cta(im, t, start):
    p = prog(t, start)
    pop(im, W / 2, 1010, "Gold-Signale live auf Telegram", font("InterDisplay-Black.otf", 74), WHITE, t, start, 880)
    pp = prog(t, start + 0.5)
    rrect(im, (240, 1250 - 10 * (1 - pp), 840, 1370 - 10 * (1 - pp)), GOLD, pp, r=60)
    text(im, (W / 2, 1310 - 10 * (1 - pp)), "Link in Bio", font("InterDisplay-Black.otf", 60), BG, pp)
    text(im, (W / 2, 1450), "Keine Anlageberatung. Trading birgt Verlustrisiken.", font("Inter-Medium.otf", 30), MUTED, prog(t, start + 0.9))

PREVIEW = os.environ.get("PREVIEW")
def render(scenes, out, total):
    if PREVIEW:
        t0 = 0.0; base = os.path.splitext(out)[0]
        for k, (dur, fn) in enumerate(scenes):
            tl = dur * 0.88; im = background(); fn(im, t0 + tl, tl); chrome(im, t0 + tl, total)
            im.save(f"{base}_prev{k}.jpg", quality=85); t0 += dur
        return
    """scenes: Liste (Dauer, draw(im, t_global, t_lokal)). Je Szene eine Datei, dann concat + stille Tonspur."""
    base = os.path.splitext(out)[0]; parts = []; t0 = 0.0
    for k, (dur, fn) in enumerate(scenes):
        part = f"{base}_s{k}.mp4"; tmp = f"{base}_s{k}.tmp.mp4"
        p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
                              "-i", "-", "-c:v", "libx264", "-crf", os.environ.get("REEL_CRF", "23"), "-preset", "veryfast", "-pix_fmt", "yuv420p", tmp], stdin=subprocess.PIPE)
        n = int(round(dur * FPS))
        for i in range(n):
            tl = i / FPS; tg = t0 + tl
            im = background(); fn(im, tg, tl); chrome(im, tg, total)
            # weiche Ein-/Ausblendung je Szene
            fade = min(1.0, tl / 0.18, (dur - tl) / 0.18) if k not in (0,) else min(1.0, (dur - tl) / 0.18)
            if fade < 1: im = Image.blend(Image.new("RGB", (W, H), BG), im, max(0, fade))
            p.stdin.write(im.tobytes())
        p.stdin.close(); assert p.wait() == 0
        os.replace(tmp, part); parts.append(part); t0 += dur
    lst = base + "_list.txt"
    open(lst, "w").write("".join(f"file '{os.path.abspath(x)}'\n" for x in parts))
    joined = base + "_v.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", joined], check=True)
    tmp = base + ".tmp.mp4"
    music = os.environ.get("REEL_MUSIC")
    if music and os.path.exists(music):   # Hintergrundmusik: auf Videolänge schneiden, ein-/ausblenden
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", joined, "-stream_loop", "-1", "-i", music,
                        "-filter_complex", f"[1:a]atrim=0:{total},asetpts=N/SR/TB,afade=t=in:d=0.4,afade=t=out:st={max(0, total - 1.5)}:d=1.5,volume=0.8[a]",
                        "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", tmp], check=True)
    else:
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", joined, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
                        "-c:v", "copy", "-c:a", "aac", "-shortest", "-movflags", "+faststart", tmp], check=True)
    os.replace(tmp, out)
    for x in parts + [lst, joined]: os.remove(x)
