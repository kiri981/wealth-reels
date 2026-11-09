"""Werbe-Anzeige Wealth Club (9:16) aus echten Screenshots + Bootcamp-Aufnahme, Sprecher George.

python3 make_ad.py out.mp4
Eingaben in work/: c_*.jpg (zugeschnittene Screenshots), bc_clip.webm (Bootcamp-Aufnahme), vo0..6.wav + vo.json (Sprecher).
"""
import json, os, re, subprocess, sys
from PIL import Image, ImageDraw, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__)); WK = os.path.join(HERE, "work")
sys.path.insert(0, os.path.join(HERE, "..", "factory"))
from lib import font, GOLD, WHITE, MUTED, BG

W, H, FPS = 1080, 1920, 30
LANG = os.environ.get("AD_LANG", "de")
from ad_texts import TXT
T = TXT[LANG]
VAR = os.environ.get("AD_VAR", "")   # Variante: eigener Sprecher-Ordner work/<lang>_<var> (Hook neu gesprochen), andere Überschrift + Musik
VW = os.path.join(WK, f"{LANG}_{VAR}" if VAR else LANG)   # Sprecher-Dateien je Sprache
VO = json.load(open(os.path.join(VW, "vo.json")))
DUR = [round(v + 0.7, 2) for v in VO]; DUR[-1] = max(DUR[-1], 5.2)
BC = "bc_clip.webm" if LANG == "de" else f"bc_clip_{LANG}.webm"

# Segmente: (Kicker, Überschrift mit *gold*, [(Bild/Video, Anteil der Segmentzeit)])
_IT = [[("c_signal.jpg", .34), ("c_ladder.jpg", .33), ("c_brief.jpg", .33)], [("c_signal.jpg", .5), ("c_ladder.jpg", .5)], [("c_brief.jpg", 1)],
       [("c_sl1.jpg", .45), ("c_sl2.jpg", .55)], [(BC, 1)], [("c_tp.jpg", .5), ("c_mt5.jpg", .5)]]
SEG = [(k, h, it) for (k, h), it in zip(T["seg"], _IT)]
if os.environ.get("AD_SEG0"): SEG[0] = (SEG[0][0], os.environ["AD_SEG0"], SEG[0][2])
CARD_Y0, CARD_Y1, CARD_W = 560, 1700, 900


def background():
    im = Image.new("RGB", (W, H), BG)
    g = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(g)
    d.ellipse((-300, -700, W + 300, 560), fill=(78, 58, 20)); d.ellipse((260, 1500, 1500, 2400), fill=(40, 30, 12))
    im = Image.blend(im, g.filter(ImageFilter.GaussianBlur(200)), 0.8)
    lp = os.path.join(HERE, "..", "factory", "brand", "logo.png")
    if os.path.exists(lp):
        lg = Image.open(lp).convert("RGBA"); lg = lg.resize((200, int(lg.height * 200 / lg.width)), Image.LANCZOS); im.paste(lg, ((W - lg.width) // 2, 70), lg)
    d = ImageDraw.Draw(im)
    d.text((W / 2, 1860), T["disc"], font=font("Inter-Medium.otf", 24), fill=(120, 124, 136), anchor="mm")
    return im


def head(im, kicker, title, a):
    """Kicker-Pille + Überschrift; a = 0..1 Einblendung."""
    d = ImageDraw.Draw(im, "RGBA")
    f = font("Inter-Bold.otf", 30); tw = d.textlength(kicker, font=f)
    al = int(255 * min(1, a * 2))
    d.rounded_rectangle(((W - tw) / 2 - 28, 250, (W + tw) / 2 + 28, 304), radius=27, fill=(46, 34, 12, al), outline=GOLD + (al,), width=2)
    d.text((W / 2, 277), kicker, font=f, fill=GOLD + (al,), anchor="mm")
    parts = [(p, i % 2 == 1) for i, p in enumerate(re.split(r"\*", title)) if p]
    size = 76
    while True:
        ff = font("InterDisplay-Black.otf", size); total = sum(d.textlength(p, font=ff) for p, _ in parts)
        if total <= W - 110 or size <= 50: break
        size -= 4
    # Umbruch in zwei Zeilen, falls nötig
    words = [(w, g) for p, g in parts for w in re.split(r"(\s+)", p) if w]
    lines, cur, cw = [], [], 0
    for w, g in words:
        ww = d.textlength(w, font=ff)
        if cw + ww > W - 120 and cur and w.strip():
            lines.append(cur); cur, cw = [], 0
            if not w.strip(): continue
        cur.append((w, g)); cw += ww
    if cur: lines.append(cur)
    y = 395 if len(lines) == 1 else 360
    dy = int((1 - min(1, a * 1.6)) * 30)
    for ln in lines:
        lw = sum(d.textlength(w, font=ff) for w, _ in ln); x = (W - lw) / 2
        for w, g in ln:
            d.text((x, y + dy), w, font=ff, fill=(GOLD if g else WHITE) + (al,), anchor="lm"); x += d.textlength(w, font=ff)
        y += size + 14


def card_img(src):
    im = Image.open(src).convert("RGB")
    k = CARD_W / im.width; im = im.resize((CARD_W, int(im.height * k)), Image.LANCZOS)
    return im


def paste_card(base, img, t, dur, scroll=True):
    """Karte mit Goldrahmen, Einschweben, langsamer Zoom; zu hohe Bilder scrollen langsam nach unten."""
    maxh = CARD_Y1 - CARD_Y0
    a = min(1, t / 0.35)
    z = 1.0 + 0.035 * (t / max(dur, 0.1))
    view_h = min(img.height, maxh)
    off = 0
    if img.height > maxh and scroll:
        p = max(0, min(1, (t - 0.6) / max(dur - 1.2, 0.5))); p = p * p * (3 - 2 * p)
        off = int((img.height - maxh) * p)
    v = img.crop((0, off, img.width, off + view_h))
    v = v.resize((int(v.width * z), int(v.height * z)), Image.BILINEAR)
    cw, ch = v.size
    mask = Image.new("L", (cw, ch), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, cw - 1, ch - 1), radius=34, fill=255)
    x = (W - cw) // 2; y = CARD_Y0 + (maxh - ch) // 2 + int((1 - a) * 80)
    sh = Image.new("RGBA", (cw + 80, ch + 80), (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle((40, 50, cw + 40, ch + 40), radius=40, fill=(0, 0, 0, int(150 * a)))
    base.paste(sh.filter(ImageFilter.GaussianBlur(22)), (x - 40, y - 40), sh.filter(ImageFilter.GaussianBlur(22)))
    if a < 1:
        bg = base.crop((x, y, x + cw, y + ch)); v = Image.blend(bg, v, a)
    base.paste(v, (x, y), mask)
    ImageDraw.Draw(base).rounded_rectangle((x - 3, y - 3, x + cw + 2, y + ch + 2), radius=37, outline=GOLD, width=5)


def video_frames(path, start, dur):
    tmp = os.path.join(WK, "bcf"); os.makedirs(tmp, exist_ok=True)
    for f in os.listdir(tmp): os.remove(os.path.join(tmp, f))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(start), "-t", str(dur), "-i", path, "-vf", f"fps={FPS},crop=iw:ih*0.62:0:0,scale={CARD_W}:-2",
                    os.path.join(tmp, "f%04d.png")], check=True)
    return sorted(os.path.join(tmp, f) for f in os.listdir(tmp))


def cta_frame(t):
    im = background(); d = ImageDraw.Draw(im, "RGBA")
    lp = os.path.join(HERE, "..", "factory", "brand", "logo.png")
    a = min(1, t / 0.4)
    if os.path.exists(lp):
        lg = Image.open(lp).convert("RGBA"); s = int(420 + 30 * min(1, t / 4)); lg = lg.resize((s, int(lg.height * s / lg.width)), Image.LANCZOS)
        im.paste(lg, ((W - lg.width) // 2, 430), lg)
    al = int(255 * a)
    fb = 84
    while d.textlength(T["cta"], font=font("InterDisplay-Black.otf", fb)) > W - 100: fb -= 4
    d.text((W / 2, 900), T["cta"], font=font("InterDisplay-Black.otf", fb), fill=GOLD + (al,), anchor="mm")
    lines = T["lines"]
    for i, l in enumerate(lines):
        ai = int(255 * max(0, min(1, (t - 0.3 - i * 0.25) / 0.3)))
        fl = 40
        while d.textlength(l, font=font("Inter-SemiBold.otf", fl)) > W - 80: fl -= 2
        d.text((W / 2, 1010 + i * 62), l, font=font("Inter-SemiBold.otf", fl), fill=WHITE + (ai,), anchor="mm")
    f = font("InterDisplay-Black.otf", 60); bw = d.textlength(T["link"], font=f) + 140
    pulse = 1 + 0.03 * abs(((t * 1.6) % 2) - 1)
    bw2, bh = bw * pulse, 130 * pulse
    d.rounded_rectangle(((W - bw2) / 2, 1330 - bh / 2, (W + bw2) / 2, 1330 + bh / 2), radius=bh / 2, fill=GOLD + (al,))
    d.text((W / 2, 1330), T["link"], font=f, fill=BG + (al,), anchor="mm")
    d.text((W / 2, 1460), "Wealth Club · Telegram", font=font("Inter-Medium.otf", 34), fill=MUTED + (al,), anchor="mm")
    return im


def main(out):
    bg = background(); fr = os.path.join(WK, "frames"); os.makedirs(fr, exist_ok=True)
    for f in os.listdir(fr): os.remove(os.path.join(fr, f))
    n = 0
    cache = {}
    for si, (kick, title, items) in enumerate(SEG):
        dur = DUR[si]; nf = int(round(dur * FPS))
        # Zeitabschnitte der Elemente
        bounds, acc = [], 0
        for name, share in items: bounds.append((name, acc, acc + share * dur)); acc += share * dur
        vframes = None
        for name, a0, a1 in bounds:
            if name.endswith(".webm"): vframes = video_frames(os.path.join(WK, name), 1.2, a1 - a0 + 0.2)
        for i in range(nf):
            t = i / FPS
            im = bg.copy()
            for name, a0, a1 in bounds:
                if a0 <= t < a1 or (name == bounds[-1][0] and t >= a0):
                    tt = t - a0
                    if name.endswith(".webm"):
                        img = Image.open(vframes[min(int(tt * FPS), len(vframes) - 1)]).convert("RGB")
                        paste_card(im, img, tt, a1 - a0, scroll=False)
                    else:
                        if name not in cache: cache[name] = card_img(os.path.join(WK, name))
                        paste_card(im, cache[name], tt, a1 - a0)
                    break
            head(im, kick, title, t / 0.5 if si > 0 else 1)
            # Fortschrittsbalken oben
            ImageDraw.Draw(im).rectangle((0, 0, int(W * (n / (sum(DUR) * FPS))), 8), fill=GOLD)
            im.save(os.path.join(fr, f"{n:05d}.jpg"), quality=92); n += 1
    nf = int(round(DUR[-1] * FPS))
    for i in range(nf):
        im = cta_frame(i / FPS); ImageDraw.Draw(im).rectangle((0, 0, int(W * (n / (sum(DUR) * FPS))), 8), fill=GOLD)
        im.save(os.path.join(fr, f"{n:05d}.jpg"), quality=92); n += 1
    total = n / FPS
    # Ton: Sprecher an Segmentanfängen + Musik (gedämpft)
    starts, acc = [], 0
    for d_ in DUR: starts.append(acc + 0.15); acc += d_
    mus = os.path.join(WK, "music.wav")
    subprocess.run([sys.executable, os.path.join(HERE, "..", "factory", "music.py"), os.environ.get("AD_MUSIC", "drive"), f"{total + 1:.2f}", mus, os.environ.get("AD_SEED", "4242")], check=True, capture_output=True)
    ins, flt = [], []
    for i, s in enumerate(starts):
        ins += ["-i", os.path.join(VW, f"vo{i}.wav")]; flt.append(f"[{i + 1}:a]adelay={int(s * 1000)}|{int(s * 1000)},aresample=44100[v{i}]")
    vo_mix = "".join(f"[v{i}]" for i in range(len(starts))) + f"amix=inputs={len(starts)}:normalize=0,volume=1.6[vo]"
    fc = ";".join(flt) + ";" + vo_mix + f";[{len(starts) + 1}:a]volume=0.22,afade=t=out:st={total - 1.5:.2f}:d=1.5[m];[vo][m]amix=inputs=2:normalize=0,alimiter=limit=0.95[a]"
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", os.path.join(fr, "%05d.jpg")] + ins + ["-i", mus,
           "-filter_complex", fc, "-map", "0:v", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "192k", "-t", f"{total:.2f}", "-movflags", "+faststart", out]
    subprocess.run(cmd, check=True)
    print("ok", out, f"{total:.1f}s")


if __name__ == "__main__":
    main(sys.argv[1])
