"""Promo (EN, 9:16): Mehrsprachigkeit – Translator-Knopf unter jedem Beitrag, Sprachauswahl, Sofort-Übersetzung.
python3 promo_lang.py out.mp4   (WC_CODE für die Stimme)
"""
import json, math, os, subprocess, sys, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "factory")); sys.path.insert(0, os.path.join(HERE, "..", "tts"))
from lib import font   # noqa: E402

W, H, FPS = 1080, 1920, 25
GOLD = (232, 181, 74); WHITE = (245, 245, 245); BG = (10, 10, 12)
TG_BG = (14, 22, 33); TG_BUB = (24, 37, 51); TG_BTN = (43, 82, 120); TG_HEAD = (23, 33, 43); TG_TXT = (232, 236, 240); TG_DIM = (122, 138, 153)
WORK = os.path.join(HERE, "work", "promo"); os.makedirs(WORK, exist_ok=True)
EMO = ImageFont.truetype("/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf", 109)
LOGO = Image.open(os.path.join(HERE, "..", "factory", "brand", "logo.png")).convert("RGBA")

FLAGS = ["🇬🇧", "🇩🇪", "🇵🇱", "🇫🇷", "🇷🇴", "🇪🇸", "🇮🇹", "🇷🇺", "🇺🇦", "🇹🇷", "🇳🇱", "🇸🇦"]
LANGS = ["English", "Deutsch", "Polski", "Français", "Română", "Español", "Italiano", "Русский", "Українська", "Türkçe", "Nederlands", "Arabic"]

POST_DE = ("📊 GOLD-BRIEFING\n\nGold startet ruhig in die neue Woche. Wichtige Zone: 4.050 – 4.060 $. "
           "Erst bei einem Kerzenschluss darüber rechne ich mit einer Fortsetzung nach oben.\n\n"
           "Heute um 14:30 Uhr kommen US-Daten – vorher kein Einstieg.\n\nKeine Anlageberatung.")
POST_EN = ("📊 GOLD BRIEFING\n\nGold starts the new week quietly. Key zone: $4,050 – 4,060. "
           "Only after a candle close above it do I expect a continuation to the upside.\n\n"
           "US data is released today at 2:30 pm – no entry before that.\n\nNot financial advice.")

SEGS = [
    dict(k="hook", say="Can't read trading posts in another language? We fixed that."),
    dict(k="post", say="Every post in our free gold group now comes with a Translator button."),
    dict(k="pick", say="Tap it and choose your language."),
    dict(k="trans", say="And you instantly get the post in your language – right in your chat."),
    dict(k="multi", say="Trade ideas, the daily gold briefing, our bootcamp and support: everything is available in multiple languages – and more are on the way."),
    dict(k="cta", say="Join our free gold group today. Link in bio."),
]


def ease(x): x = max(0.0, min(1.0, x)); return 1 - (1 - x) ** 3
def back(x): x = max(0.0, min(1.0, x)); c = 1.7; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2


_ec = {}
def emoji(ch, size):
    key = (ch, size)
    if key not in _ec:
        im = Image.new("RGBA", (150, 150), (0, 0, 0, 0)); ImageDraw.Draw(im).text((75, 75), ch, font=EMO, embedded_color=True, anchor="mm")
        im = im.crop(im.getbbox() or (0, 0, 150, 150)); s = size / max(im.size); _ec[key] = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
    return _ec[key]


def paste(im, sp, cx, cy, a=1.0):
    if a < 1: sp = sp.copy(); sp.putalpha(sp.getchannel("A").point(lambda v: int(v * a)))
    im.paste(sp, (int(cx - sp.width / 2), int(cy - sp.height / 2)), sp)


def text_emoji(d, im, x, y, s, f, fill):
    """Text mit führendem Emoji (z. B. '📊 GOLD…', '🌍 Translator')."""
    if s and ord(s[0]) > 0x2000 and s[0] not in "–—":
        ch = s[:2] if len(s) > 1 and 0x1F1E6 <= ord(s[0]) <= 0x1F1FF else s[0]
        e = emoji(ch, int(f.size * 1.05)); im.paste(e, (int(x), int(y - f.size * .82)), e); x += e.width + 10; s = s[len(ch):].lstrip()
    d.text((x, y), s, font=f, fill=fill, anchor="ls"); return x + d.textlength(s, font=f)


def wrap(d, txt, f, maxw):
    out = []
    for para in txt.split("\n"):
        if not para: out.append(""); continue
        cur = ""
        for w in para.split(" "):
            t = (cur + " " + w).strip()
            if d.textlength(t, font=f) > maxw and cur: out.append(cur); cur = w
            else: cur = t
        out.append(cur)
    return out


def base(t):
    im = Image.new("RGB", (W, H), BG); g = Image.new("RGB", (W, H), (0, 0, 0))
    ImageDraw.Draw(g).ellipse((W * .1 + 120 * math.sin(t * .3), -300, W * .9, H * .45), fill=(60, 45, 15))
    return Image.blend(im, g.filter(ImageFilter.GaussianBlur(220)), .7)


def headline(im, kicker, title, a=1.0):
    d = ImageDraw.Draw(im, "RGBA"); lo = LOGO.resize((230, int(LOGO.height * 230 / LOGO.width))); paste(im, lo, W / 2, 120, a)
    f = font("Inter-Bold.otf", 30); tw = d.textlength(kicker, font=f)
    d.rounded_rectangle((W / 2 - tw / 2 - 26, 222, W / 2 + tw / 2 + 26, 274), radius=26, outline=GOLD + (int(255 * a),), width=3)
    d.text((W / 2, 258), kicker, font=f, fill=GOLD + (int(255 * a),), anchor="ms")
    parts = title.split("*"); fb = font("InterDisplay-Black.otf", 74)
    lines = [[]]; cur = 0
    for i, p in enumerate(parts):
        for w in p.split(" "):
            if not w: continue
            ww = d.textlength(w + " ", font=fb)
            if cur + ww > W - 120 and lines[-1]: lines.append([]); cur = 0
            lines[-1].append((w + " ", i % 2 == 1)); cur += ww
    for j, ln in enumerate(lines):
        x = W / 2 - sum(d.textlength(w, font=fb) for w, _ in ln) / 2
        for w, g in ln: d.text((x, 370 + j * 88), w, font=fb, fill=(GOLD if g else WHITE) + (int(255 * a),), anchor="ls"); x += d.textlength(w, font=fb)
    return 370 + len(lines) * 88


def phone(im, y0, h, title, sub):
    d = ImageDraw.Draw(im, "RGBA"); x0, x1 = 70, W - 70
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle((x0, y0 + 20, x1, y0 + h + 20), radius=44, fill=(0, 0, 0, 170))
    im.paste(sh.filter(ImageFilter.GaussianBlur(24)), (0, 0), sh.filter(ImageFilter.GaussianBlur(24)))
    d.rounded_rectangle((x0, y0, x1, y0 + h), radius=44, fill=TG_BG, outline=(60, 58, 52), width=3)
    d.rounded_rectangle((x0, y0, x1, y0 + 120), radius=44, fill=TG_HEAD); d.rectangle((x0, y0 + 80, x1, y0 + 120), fill=TG_HEAD)
    av = LOGO.resize((70, int(LOGO.height * 70 / LOGO.width))); d.ellipse((x0 + 30, y0 + 22, x0 + 106, y0 + 98), fill=(20, 18, 14), outline=GOLD, width=2); paste(im, av, x0 + 68, y0 + 60)
    d.text((x0 + 130, y0 + 56), title, font=font("Inter-Bold.otf", 34), fill=TG_TXT, anchor="ls")
    d.text((x0 + 130, y0 + 94), sub, font=font("Inter-Medium.otf", 26), fill=TG_DIM, anchor="ls")
    return x0, x1


def bubble(im, x, y, w, lines, f, reveal=1.0, mine=False):
    d = ImageDraw.Draw(im, "RGBA"); lh = f.size * 1.36; h = lh * len(lines) + 50
    d.rounded_rectangle((x, y, x + w, y + h), radius=26, fill=TG_BUB)
    total = sum(len(l) for l in lines); show = int(total * reveal); c = 0
    for i, l in enumerate(lines):
        if c >= show: break
        part = l[:max(0, show - c)]; c += len(l)
        text_emoji(d, im, x + 30, y + 30 + lh * (i + .8), part, f, TG_TXT)
    return y + h


def tg_button(im, x, y, w, label, press=0.0, a=1.0):
    d = ImageDraw.Draw(im, "RGBA"); h = 82
    col = tuple(int(c + (255 - c) * .18 * press) for c in TG_BTN)
    d.rounded_rectangle((x, y, x + w, y + h), radius=20, fill=col + (int(235 * a),))
    f = font("Inter-SemiBold.otf", 34); tw = d.textlength(label[2:], font=f) + 52
    text_emoji(d, im, x + w / 2 - tw / 2, y + h / 2 + 12, label, f, WHITE)
    return (x, y, x + w, y + h)


def tap(im, cx, cy, p):
    if p <= 0 or p >= 1: return
    d = ImageDraw.Draw(im, "RGBA"); r = 30 + 70 * p
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(255, 255, 255, int(200 * (1 - p))), width=6)
    d.ellipse((cx - 26, cy - 26, cx + 26, cy + 26), fill=(255, 255, 255, int(160 * (1 - p))))


def caption(im, txt, t, dur, a=1.0):
    d = ImageDraw.Draw(im, "RGBA"); f = font("Inter-SemiBold.otf", 42); lines = wrap(d, txt, f, W - 160)
    tot = sum(len(l) + 1 for l in lines); cut = (t - .15) / max(dur - .4, .1) * tot; c = 0; y = 1790 - 58 * len(lines)
    d.rounded_rectangle((50, y - 60, W - 50, y - 60 + 58 * len(lines) + 40), radius=24, fill=(8, 8, 10, int(190 * a)))
    for j, l in enumerate(lines):
        x = W / 2 - d.textlength(l, font=f) / 2
        for w in l.split(" "):
            d.text((x, y + j * 58), w, font=f, fill=(WHITE if c < cut else (120, 120, 128)) + (int(255 * a),), anchor="ls"); x += d.textlength(w + " ", font=f); c += len(w) + 1


def disclaimer(im):
    ImageDraw.Draw(im).text((W / 2, 1880), "Not financial advice · Trading involves risk of loss", font=font("Inter-Medium.otf", 24), fill=(150, 150, 156), anchor="ms")


def scene(seg, t, dur, T):
    im = base(T); d = ImageDraw.Draw(im, "RGBA"); k = seg["k"]; a = ease(t / .35)
    if k == "hook":
        lo = LOGO.resize((420, int(LOGO.height * 420 / LOGO.width))); paste(im, lo, W / 2, 330, ease(t / .6))
        f = font("InterDisplay-Black.otf", 88)
        for j, (l, g) in enumerate([("ONE GROUP.", False), ("EVERY", False), ("LANGUAGE.", True)]):
            e = ease((t - .3 - j * .25) / .4); d.text((W / 2, 640 + j * 100 + (1 - e) * 40), l, font=f, fill=(GOLD if g else WHITE) + (int(255 * e),), anchor="ms")
        for i, fl in enumerate(FLAGS):   # Flaggen ploppen im Kreis auf
            e = (t - .6 - i * .09) / .35
            if e <= 0: continue
            ang = -math.pi / 2 + i / len(FLAGS) * 2 * math.pi + t * .25; r = 300
            cx, cy = W / 2 + r * math.cos(ang), 1240 + r * .62 * math.sin(ang)
            paste(im, emoji(fl, int(96 * back(e))), cx, cy, min(1, e * 2))
        d.text((W / 2, 1268), "12", font=font("InterDisplay-Black.otf", 110), fill=GOLD + (int(255 * ease((t - 1.6) / .4)),), anchor="ms")
        d.text((W / 2, 1320), "LANGUAGES", font=font("Inter-Bold.otf", 34), fill=WHITE + (int(255 * ease((t - 1.8) / .4)),), anchor="ms")
    elif k == "post":
        headline(im, "TRANSLATOR", "Every post. *Your language.*", a)
        x0, x1 = phone(im, 600, 960, "Wealth Club Gold", "free gold group")
        f = font("Inter-Regular.otf", 30) if os.path.exists("/usr/share/fonts/opentype/inter/Inter-Regular.otf") else font("Inter-Medium.otf", 30)
        lines = wrap(d, POST_DE, f, x1 - x0 - 140)
        yb = bubble(im, x0 + 30, 750, x1 - x0 - 60, lines, f, ease(t / .8))
        e = ease((t - 1.0) / .4); pr = ease((t - 2.4) / .25) * (1 - ease((t - 2.8) / .3))
        if e > 0:
            bx = tg_button(im, x0 + 30, yb + 12 + (1 - e) * 20, x1 - x0 - 60, "🌍 Translator", pr, e)
            if t > 1.4: d.rounded_rectangle((bx[0] - 6, bx[1] - 6, bx[2] + 6, bx[3] + 6), radius=24, outline=GOLD + (int(255 * (0.5 + 0.5 * math.sin(t * 6))),), width=4)
            tap(im, (bx[0] + bx[2]) / 2 + 120, (bx[1] + bx[3]) / 2, (t - 2.4) / .6)
    elif k == "pick":
        headline(im, "STEP 2", "Pick *your language*", a)
        x0, x1 = phone(im, 600, 960, "Wealth Club Bot", "bot")
        f = font("Inter-Medium.otf", 30)
        yb = bubble(im, x0 + 30, 750, x1 - x0 - 60, ["🌍 Which language should I", "translate the post into?"], f)
        cw = (x1 - x0 - 60 - 20) / 3; sel = 0
        for i, (fl, ln) in enumerate(zip(FLAGS, LANGS)):
            e = ease((t - .2 - i * .06) / .3)
            if e <= 0: continue
            r, c = divmod(i, 3); bx, by = x0 + 30 + c * (cw + 10), yb + 20 + r * 92
            hl = i == sel and t > 1.6
            d.rounded_rectangle((bx, by, bx + cw, by + 80), radius=18, fill=(GOLD if hl else TG_BTN) + (int(235 * e),))
            paste(im, emoji(fl, 38), bx + 36, by + 40, e)
            ff = font("Inter-SemiBold.otf", 26 if len(ln) < 10 else 22)
            d.text((bx + 64, by + 50), ln, font=ff, fill=((20, 16, 8) if hl else WHITE) + (int(255 * e),), anchor="ls")
        tap(im, x0 + 30 + cw / 2, yb + 60, (t - 1.5) / .6)
    elif k == "trans":
        headline(im, "STEP 3", "Instantly *translated*", a)
        x0, x1 = phone(im, 600, 960, "Wealth Club Bot", "bot")
        f = font("Inter-Medium.otf", 29)
        lines = ["🌍 Translation (English):", ""] + wrap(d, POST_EN, f, x1 - x0 - 140)
        if t > .3: d.text((x0 + 40, 790), "typing…", font=font("Inter-Medium.otf", 26), fill=TG_DIM if t < 1.0 else TG_BG)
        if t > 1.0: bubble(im, x0 + 30, 750, x1 - x0 - 60, lines, f, ease((t - 1.0) / 2.6))
    elif k == "multi":
        headline(im, "ALL IN YOUR LANGUAGE", "Everything. *Multilingual.*", a)
        items = ["Trade ideas", "Daily gold briefing", "Bootcamp", "Support in the bot"]
        for i, it in enumerate(items):
            e = ease((t - .4 - i * .5) / .4); y = 640 + i * 130
            d.rounded_rectangle((120 + (1 - e) * 40, y, W - 120, y + 104), radius=24, fill=(20, 19, 16, int(240 * e)), outline=(70, 60, 40, int(255 * e)), width=2)
            d.rounded_rectangle((150, y + 30, 194, y + 74), radius=10, fill=GOLD + (int(255 * e),))
            d.line((160, y + 52, 170, y + 63, 186, y + 41), fill=(20, 16, 8, int(255 * e)), width=6, joint="curve")
            d.text((222, y + 66), it, font=font("Inter-Bold.otf", 44), fill=WHITE + (int(255 * e),), anchor="ls")
        for i, fl in enumerate(FLAGS):
            e = (t - 2.4 - i * .07) / .3
            if e > 0: paste(im, emoji(fl, int(70 * back(e))), 150 + (i % 6) * 156, 1180 + (i // 6) * 105, min(1, e * 2))
        e = ease((t - 3.6) / .5); d.text((W / 2, 1420), "+ more languages coming", font=font("Inter-SemiBold.otf", 40), fill=GOLD + (int(255 * e),), anchor="ms")
    elif k == "cta":
        lo = LOGO.resize((460, int(LOGO.height * 460 / LOGO.width))); paste(im, lo, W / 2, 520, ease(t / .6))
        d.text((W / 2, 820), "Free gold group", font=font("InterDisplay-Black.otf", 84), fill=WHITE + (int(255 * a),), anchor="ms")
        d.text((W / 2, 910), "in your language.", font=font("InterDisplay-Black.otf", 84), fill=GOLD + (int(255 * a),), anchor="ms")
        e = ease((t - .8) / .4); s = back((t - .8) / .5)
        bw, bh = 440 * s, 120 * s; d.rounded_rectangle((W / 2 - bw / 2, 1080 - bh / 2, W / 2 + bw / 2, 1080 + bh / 2), radius=bh / 2, fill=GOLD + (int(255 * e),))
        d.text((W / 2, 1080 + 16), "Link in bio", font=font("InterDisplay-Black.otf", int(54 * max(s, .3))), fill=(18, 14, 6, int(255 * e)), anchor="ms")
        row = FLAGS[:8]
        for i, fl in enumerate(row): paste(im, emoji(fl, 60), W / 2 - 3.5 * 110 + i * 110, 1290, ease((t - 1.2 - i * .05) / .3))
    caption(im, seg["say"], t, dur, a)
    disclaimer(im)
    return im


def main():
    out = sys.argv[1]
    import voice as V
    cache = os.path.join(WORK, "vo.json"); C = json.load(open(cache)) if os.path.exists(cache) else {}
    for i, s in enumerate(SEGS):
        fn = os.path.join(WORK, f"vo{i}.wav")
        if C.get(str(i)) != s["say"] or not os.path.exists(fn):
            w, sr = V.synth(s["say"], "en", 1.0, 0.0)
            with wave.open(fn, "wb") as f: f.setnchannels(1); f.setsampwidth(2); f.setframerate(sr); f.writeframes((np.clip(w, -1, 1) * 32767).astype("<i2").tobytes())
            C[str(i)] = s["say"]; json.dump(C, open(cache, "w"))
        with wave.open(fn) as f: s["vo"] = f.getnframes() / f.getframerate()
        s["wav"] = fn
    mins = {"hook": 3.2, "post": 3.6, "pick": 2.8, "trans": 4.2, "multi": 4.6, "cta": 3.6}
    t = 0
    for s in SEGS: s["t0"] = t; s["dur"] = max(s["vo"] + .6, mins[s["k"]]); t += s["dur"]
    T = t; print("Länge", round(T, 1))
    v = os.path.join(WORK, "v.mp4")
    p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                          "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", v], stdin=subprocess.PIPE)
    for i in range(int(T * FPS)):
        tt = i / FPS; s = next(x for x in SEGS if x["t0"] <= tt < x["t0"] + x["dur"]) if tt < T else SEGS[-1]
        im = scene(s, tt - s["t0"], s["dur"], tt)
        if tt - s["t0"] > s["dur"] - .25 and s is not SEGS[-1]: im = Image.blend(im, Image.new("RGB", (W, H), BG), ease((tt - s["t0"] - s["dur"] + .25) / .25) * .6)
        p.stdin.write(im.tobytes())
    p.stdin.close(); p.wait()
    mus = os.path.join(WORK, "music.wav")
    subprocess.run([sys.executable, os.path.join(HERE, "..", "factory", "music.py"), "drive", f"{T + 1:.2f}", mus, "5"], check=True, capture_output=True)
    ins = ["-i", mus]; flt = ["[1:a]volume=0.22[m]"]; mix = ["[m]"]   # Eingang 0 = Video, 1 = Musik, ab 2 = Sprecher
    for i, s in enumerate(SEGS):
        ms = int(s["t0"] * 1000) + 150; ins += ["-i", s["wav"]]; flt.append(f"[{i + 2}:a]aresample=44100,volume=1.6,adelay={ms}|{ms}[v{i}]"); mix.append(f"[v{i}]")
    flt.append("".join(mix) + f"amix=inputs={len(mix)}:normalize=0,atrim=0:{T:.2f},afade=t=out:st={T - 1.2:.2f}:d=1.2[a]")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", v, *ins, "-filter_complex", ";".join(flt), "-map", "0:v", "-map", "[a]",
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", out], check=True)
    print("ok", out)


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[2] == "preview":
        for s in SEGS: s["dur"] = 4.0
        ims = [scene(SEGS[i], tt, 4.0, 1).resize((270, 480)) for i, tt in [(0, 2.6), (1, 2.6), (2, 1.8), (3, 3.5), (4, 4.0), (5, 2.0)]]
        o = Image.new("RGB", (1620, 480)); [o.paste(x, (i * 270, 0)) for i, x in enumerate(ims)]; o.save(sys.argv[1])
    else: main()
