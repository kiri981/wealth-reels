"""YouTube-Tutorial (16:9): Ultima-Konto eröffnen – eigene Version (eigener Text, Kevins Screenshots, ohne Bonus).
python3 tut/konto.py out.mp4 [preview]   (WC_CODE für die Stimme)
"""
import json, math, os, subprocess, sys, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "factory")); sys.path.insert(0, os.path.join(HERE, "..", "ad")); sys.path.insert(0, os.path.join(HERE, "..", "tts"))
from lib import font                     # noqa: E402
from boxes import BOX                    # noqa: E402

W, H, FPS = 1920, 1080, 25
GOLD = (232, 181, 74); WHITE = (245, 245, 245); BG = (12, 12, 14); MUTED = (170, 166, 158)
LOGO = Image.open(os.path.join(HERE, "..", "factory", "brand", "logo.png")).convert("RGBA")
WK = os.path.join(HERE, "work"); os.makedirs(WK, exist_ok=True)
IMG = {k: Image.open(os.path.join(HERE, "img", k + ".png")).convert("RGB") for k in BOX}
CH = ["Registrieren", "Bestätigen", "Konto eröffnen", "Verifizieren"]

S = [  # k: card | shot ; img, boxes (nacheinander), lab: Beschriftung, ch: Kapitel
    dict(k="intro", say="In diesem Video eröffnest du dein Konto bei unserem Partnerbroker Ultima – Schritt für Schritt, in etwa zehn Minuten. Wichtig: Öffne die Seite über unseren Link in der Videobeschreibung. Nur so wird dein Konto uns zugeordnet."),
    dict(k="shot", ch=0, img="register", boxes=[], focus=(150, 80, 740, 905), say="Über den Link landest du auf dieser Seite: Live-Konto eröffnen."),
    dict(k="shot", ch=0, img="register", boxes=["land", "vorname"], lab=["Wohnsitzland", "Vorname"], say="Wähle dein Wohnsitzland und trag deinen Vornamen ein."),
    dict(k="shot", ch=0, img="register", boxes=["email", "pass"], lab=["E-Mail", "Passwort"], say="Dann deine E-Mail-Adresse und ein sicheres Passwort, das du dir gut merken kannst."),
    dict(k="shot", ch=0, img="register", boxes=["empf"], lab=["Code aus der Videobeschreibung"], hot=True, say="Ganz wichtig ist das Feld Empfehler. Hier muss unser Code stehen. Du findest ihn in der Videobeschreibung."),
    dict(k="shot", ch=0, img="register", boxes=["indiv", "checks", "erstellen"], lab=["Individuum", "Beide Häkchen", "Konto erstellen"], say="Wähle Individuum, setz die beiden Häkchen und tippe auf Konto erstellen."),
    dict(k="verify", ch=1, say="Jetzt bestätigst du deine E-Mail-Adresse und deine Telefonnummer – jeweils mit dem Code, den du zugeschickt bekommst. Beides ist Pflicht."),
    dict(k="shot", ch=2, img="nav", boxes=["konten", "eroeffnen"], lab=["Konten", "Konto eröffnen"], say="Im Kundenbereich gehst du oben auf Konten und dann rechts auf Konto eröffnen."),
    dict(k="shot", ch=2, img="open1", boxes=["echt", "demo"], lab=["Echtgeldkonto", "Zum Üben: Demokonto"], say="Wähle Echtgeldkonto. Neu im Trading? Dann kannst du hier auch zuerst ein Demokonto eröffnen und in Ruhe üben."),
    dict(k="shot", ch=2, img="open1", boxes=["mt5", "std"], lab=["MetaTrader 5", "Standard STP"], hot=True, say="Als Plattform nimmst du MetaTrader 5. Und beim Kontotyp wählst du Standard STP."),
    dict(k="shot", ch=2, img="open2", boxes=["eur", "check", "absenden"], lab=["Euro", "Häkchen setzen", "Absenden"], say="Als Kontowährung Euro. Dann das Häkchen setzen, die Bedingungen kurz lesen und auf Absenden."),
    dict(k="idcard", ch=3, say="Für das Live-Konto bestätigst du zum Schluss deine Identität mit deinem Ausweis. Das dauert etwa fünf bis zehn Minuten und ist bei Brokern Standard."),
    dict(k="outro", say="Fertig! Im nächsten Video verbindest du dein Konto mit MetaTrader 5. Und wenn du so weit bist, schick deine UID an unseren Telegram-Bot – dann schalten wir dich frei."),
]


def ease(x): x = max(0.0, min(1.0, x)); return 1 - (1 - x) ** 3
def back(x): x = max(0.0, min(1.0, x)); c = 1.7; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2


def wrap(d, txt, f, maxw):
    out, line = [], ""
    for w in txt.split():
        t = (line + " " + w).strip()
        if d.textlength(t, font=f) > maxw and line: out.append(line); line = w
        else: line = t
    return out + ([line] if line else [])


_bg = None
def base():
    global _bg
    if _bg is None:
        g = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(g)
        d.ellipse((-500, -700, 1100, 500), fill=(46, 36, 16)); d.ellipse((1200, 600, 2400, 1700), fill=(30, 24, 12))
        _bg = g.filter(ImageFilter.GaussianBlur(220))
    return _bg.copy()


def chrome(im, seg, a=1.0):
    d = ImageDraw.Draw(im, "RGBA")
    lo = LOGO.resize((150, int(LOGO.height * 150 / LOGO.width))); im.paste(lo, (60, 34), lo)
    if "ch" in seg:
        x = 1860
        for i in reversed(range(len(CH))):
            f = font("Inter-Bold.otf" if i == seg["ch"] else "Inter-Medium.otf", 24); tw = d.textlength(f"{i + 1}  {CH[i]}", font=f)
            on = i == seg["ch"]; x -= tw + 44
            d.rounded_rectangle((x, 40, x + tw + 32, 84), radius=22, fill=(GOLD + (255,)) if on else (40, 38, 34, 220))
            d.text((x + 16, 71), f"{i + 1}  {CH[i]}", font=f, fill=(20, 16, 8) if on else MUTED, anchor="ls"); x -= 8


def subtitle(im, txt, t, dur):
    d = ImageDraw.Draw(im, "RGBA"); f = font("Inter-SemiBold.otf", 36)
    lines = wrap(d, txt, f, 1500); n = len(lines)
    # Zeilenweise passend zur Sprechzeit einblenden (max. 2 Zeilen gleichzeitig)
    per = max(dur - .4, .5) / max(1, math.ceil(n / 2)); k = min(int(t / per), math.ceil(n / 2) - 1)
    show = lines[k * 2: k * 2 + 2]; y = 1010 - 52 * len(show)
    w = max(d.textlength(l, font=f) for l in show)
    d.rounded_rectangle((W / 2 - w / 2 - 30, y - 18, W / 2 + w / 2 + 30, y + 52 * len(show) + 4), radius=18, fill=(0, 0, 0, 175))
    for i, l in enumerate(show): d.text((W / 2, y + 40 + i * 52), l, font=f, fill=WHITE, anchor="ms")


# ---------- Screenshot mit Kamerafahrt ----------
WX0, WY0, WW, WH = 210, 160, 1500, 690   # Browserfenster (Inhaltsbereich unter der Titelleiste)


def view_for(img, rect):
    x0, y0, x1, y1 = rect; iw, ih = IMG[img].size
    pad = 0.9; bw, bh = (x1 - x0), (y1 - y0)
    z = min(WW / (bw / pad), WH / (bh / pad), 2.2)
    z = max(z, min(WW / iw, WH / ih))   # nie kleiner als ganzes Bild
    return ((x0 + x1) / 2, (y0 + y1) / 2, z)


def union(img, keys):
    rs = [BOX[img][k] for k in keys]; return (min(r[0] for r in rs) - 40, min(r[1] for r in rs) - 60, max(r[2] for r in rs) + 40, max(r[3] for r in rs) + 60)


def render_shot(im, img, cx, cy, z):
    src = IMG[img]; iw, ih = src.size
    vw, vh = WW / z, WH / z
    cx = min(max(cx, vw / 2), iw - vw / 2) if vw < iw else iw / 2
    cy = min(max(cy, vh / 2), ih - vh / 2) if vh < ih else ih / 2
    l, t = cx - vw / 2, cy - vh / 2
    canvas = Image.new("RGB", (WW, WH), (255, 255, 255))
    cl, ct = max(0, l), max(0, t); cr, cb = min(iw, l + vw), min(ih, t + vh)
    part = src.crop((int(cl), int(ct), int(math.ceil(cr)), int(math.ceil(cb))))
    part = part.resize((max(1, int(part.width * z)), max(1, int(part.height * z))), Image.LANCZOS)
    canvas.paste(part, (int((cl - l) * z), int((ct - t) * z)))
    # Fenster
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle((WX0 - 6, WY0 - 50, WX0 + WW + 6, WY0 + WH + 18), radius=22, fill=(0, 0, 0, 200))
    sh = sh.filter(ImageFilter.GaussianBlur(24)); im.paste(sh, (0, 0), sh)
    d = ImageDraw.Draw(im); d.rounded_rectangle((WX0, WY0 - 44, WX0 + WW, WY0 + WH), radius=18, fill=(232, 230, 226))
    for i, c in enumerate([(236, 96, 90), (238, 190, 80), (110, 200, 100)]): d.ellipse((WX0 + 22 + i * 30, WY0 - 30, WX0 + 38 + i * 30, WY0 - 14), fill=c)
    d.rounded_rectangle((WX0 + 140, WY0 - 36, WX0 + 760, WY0 - 8), radius=14, fill=(250, 250, 250))
    d.text((WX0 + 160, WY0 - 14), "🔒 Ultima – Kundenbereich", font=font("Inter-Medium.otf", 18), fill=(110, 110, 110), anchor="ls")
    m = Image.new("L", (WW, WH), 0); ImageDraw.Draw(m).rounded_rectangle((0, -20, WW, WH), radius=18, fill=255)
    im.paste(canvas, (WX0, WY0), m)
    return lambda x, y: (WX0 + (x - l) * z, WY0 + (y - t) * z)


def shot_scene(im, seg, prev, t, dur):
    img = seg["img"]; boxes = seg["boxes"]; nb = max(1, len(boxes))
    per = (dur - .3) / nb; idx = min(int(max(t - .2, 0) / per), nb - 1) if boxes else 0
    full = seg.get("focus", (0, 0) + IMG[img].size)
    together = not seg.get("solo") and boxes and max(BOX[img][x][2] for x in boxes) - min(BOX[img][x][0] for x in boxes) < 900 and max(BOX[img][x][3] for x in boxes) - min(BOX[img][x][1] for x in boxes) < 330
    def tv(j): return view_for(img, full if not boxes else union(img, boxes if together else [boxes[j]]))
    tgt = tv(idx)
    if idx == 0 or together:
        src = prev[1:] if prev and prev[0] == img else tgt; k = ease(t / .9)
    else:
        src = tv(idx - 1); k = ease((t - .2 - idx * per) / .7)
    cx = src[0] + (tgt[0] - src[0]) * k; cy = src[1] + (tgt[1] - src[1]) * k; z = src[2] + (tgt[2] - src[2]) * k
    to = render_shot(im, img, cx, cy, z)
    L = Image.new("RGBA", (W, H), (0, 0, 0, 0))   # Markierungen auf eigener Ebene, aufs Fenster begrenzt
    for i, b in enumerate(boxes):
        st = .35 + i * per
        if t < st or (not together and i != idx): continue
        if not together and idx > 0 and t < .2 + idx * per + .55: continue   # erst nach der Kamerafahrt einblenden
        if not together and idx > 0: st = .2 + idx * per + .55
        e = back((t - st) / .45); r = BOX[img][b]; (x0, y0), (x1, y1) = to(r[0], r[1]), to(r[2], r[3])
        pad = 8 * e; hot = seg.get("hot") and i == len(boxes) - 1
        glow = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ImageDraw.Draw(glow).rounded_rectangle((x0 - pad - 6, y0 - pad - 6, x1 + pad + 6, y1 + pad + 6), radius=16, outline=GOLD + (int(150 + 60 * math.sin(t * 5)),), width=14)
        L.alpha_composite(glow.filter(ImageFilter.GaussianBlur(9)))
        d = ImageDraw.Draw(L, "RGBA"); d.rounded_rectangle((x0 - pad, y0 - pad, x1 + pad, y1 + pad), radius=14, outline=GOLD, width=5)
        lab = (seg.get("lab") or [None] * 9)[i]
        if lab:
            f = font("Inter-Bold.otf", 30); tw = d.textlength(lab, font=f); lx = min(max(x0, WX0 + 10), WX0 + WW - tw - 50)
            ly = y0 - pad - 58 if y0 - pad - 58 > WY0 + 4 else y1 + pad + 12
            a = int(255 * min(1, (t - st) / .3))
            d.rounded_rectangle((lx, ly, lx + tw + 40, ly + 48), radius=24, fill=((210, 60, 60) if hot else GOLD) + (a,))
            d.text((lx + 20, ly + 35), lab, font=f, fill=(255, 255, 255, a) if hot else (20, 16, 8, a), anchor="ls")
    m = Image.new("L", (W, H), 0); ImageDraw.Draw(m).rectangle((WX0, WY0, WX0 + WW, WY0 + WH), fill=255)
    from PIL import ImageChops
    L.putalpha(ImageChops.multiply(L.getchannel("A"), m)); im.paste(L, (0, 0), L)
    return (img, cx, cy, z)


def card(im, seg, t):
    d = ImageDraw.Draw(im, "RGBA"); a = ease(t / .5); k = seg["k"]
    if k == "intro":
        lo = LOGO.resize((420, int(LOGO.height * 420 / LOGO.width))); lo.putalpha(lo.getchannel("A").point(lambda v: int(v * a))); im.paste(lo, (W // 2 - 210, 150), lo)
        d.text((W / 2, 520), "Ultima-Konto eröffnen", font=font("InterDisplay-Black.otf", 110), fill=WHITE + (int(255 * a),), anchor="ms")
        d.text((W / 2, 610), "Schritt für Schritt · ca. 10 Minuten", font=font("Inter-SemiBold.otf", 44), fill=GOLD + (int(255 * a),), anchor="ms")
        for i, c in enumerate(CH):
            e = ease((t - .8 - i * .25) / .4); x = W / 2 + (i - 1.5) * 380
            d.rounded_rectangle((x - 170, 690 + (1 - e) * 30, x + 170, 770 + (1 - e) * 30), radius=40, fill=(40, 36, 28, int(230 * e)), outline=GOLD + (int(255 * e),), width=3)
            d.text((x, 742 + (1 - e) * 30), f"{i + 1}  {c}", font=font("Inter-Bold.otf", 32), fill=WHITE + (int(255 * e),), anchor="ms")
        e = ease((t - 3.5) / .5)
        d.rounded_rectangle((W / 2 - 520, 815, W / 2 + 520, 875), radius=30, fill=(210, 60, 60, int(235 * e)))
        d.text((W / 2, 856), "Wichtig: nur über unseren Link (Beschreibung) registrieren", font=font("Inter-Bold.otf", 30), fill=(255, 255, 255, int(255 * e)), anchor="ms")
    elif k in ("verify", "idcard"):
        items = [("✉️", "E-Mail bestätigen", "Code aus der Mail eingeben"), ("📱", "Telefonnummer bestätigen", "Code per SMS eingeben")] if k == "verify" else \
                [("🪪", "Ausweis hochladen", "Personalausweis oder Reisepass"), ("⏱️", "Ca. 5–10 Minuten", "Danach ist dein Live-Konto aktiv")]
        d.text((W / 2, 250), "Bestätigen" if k == "verify" else "Identität verifizieren", font=font("InterDisplay-Black.otf", 84), fill=WHITE + (int(255 * a),), anchor="ms")
        for i, (ic, h, s) in enumerate(items):
            e = ease((t - .4 - i * .5) / .45); x = W / 2 + (i - .5) * 760
            d.rounded_rectangle((x - 340, 360 + (1 - e) * 40, x + 340, 760 + (1 - e) * 40), radius=34, fill=(28, 26, 22, int(240 * e)), outline=GOLD + (int(255 * e),), width=3)
            d.ellipse((x - 70, 410 + (1 - e) * 40, x + 70, 550 + (1 - e) * 40), fill=GOLD + (int(255 * e),))
            ef = emoji(ic, 80)
            if e > .05: ef.putalpha(ef.getchannel("A").point(lambda v: int(v * e))); im.paste(ef, (int(x - ef.width / 2), int(480 + (1 - e) * 40 - ef.height / 2)), ef)
            d.text((x, 640 + (1 - e) * 40), h, font=font("Inter-Bold.otf", 46), fill=WHITE + (int(255 * e),), anchor="ms")
            d.text((x, 700 + (1 - e) * 40), s, font=font("Inter-Medium.otf", 32), fill=MUTED + (int(255 * e),), anchor="ms")
            if t > 1.6 + i * .5:
                c = back((t - 1.6 - i * .5) / .4); cx, cy = x + 250, 400
                d.ellipse((cx - 34 * c, cy - 34 * c, cx + 34 * c, cy + 34 * c), fill=(90, 190, 110)); d.line((cx - 14 * c, cy, cx - 3 * c, cy + 12 * c, cx + 16 * c, cy - 12 * c), fill=WHITE, width=7)
    elif k == "outro":
        lo = LOGO.resize((380, int(LOGO.height * 380 / LOGO.width))); im.paste(lo, (W // 2 - 190, 140), lo)
        d.text((W / 2, 470), "Konto eröffnet ✓", font=font("InterDisplay-Black.otf", 100), fill=WHITE + (int(255 * a),), anchor="ms")
        steps = [("Nächstes Video", "MT5 verbinden"), ("Dann", "UID an unseren Bot"), ("Fragen?", "Schreib uns im Bot")]
        for i, (h, s) in enumerate(steps):
            e = ease((t - .6 - i * .3) / .4); x = W / 2 + (i - 1) * 520
            d.rounded_rectangle((x - 230, 560, x + 230, 720), radius=30, fill=(28, 26, 22, int(240 * e)), outline=GOLD + (int(255 * e),), width=3)
            d.text((x, 625), h, font=font("Inter-Medium.otf", 30), fill=MUTED + (int(255 * e),), anchor="ms")
            d.text((x, 680), s, font=font("Inter-Bold.otf", 40), fill=WHITE + (int(255 * e),), anchor="ms")


_EMO = {}
def emoji(ch, size):
    from PIL import ImageFont
    if ch not in _EMO:
        f = ImageFont.truetype("/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf", 109)
        e = Image.new("RGBA", (160, 160), (0, 0, 0, 0)); ImageDraw.Draw(e).text((80, 80), ch, font=f, embedded_color=True, anchor="mm"); _EMO[ch] = e.crop(e.getbbox())
    e = _EMO[ch]; s = size / max(e.size); return e.resize((int(e.width * s), int(e.height * s)), Image.LANCZOS)


def frame(seg, t, dur, prev):
    im = base(); st = prev
    if seg["k"] == "shot": st = shot_scene(im, seg, prev, t, dur)
    else: card(im, seg, t)
    chrome(im, seg); subtitle(im, seg["say"], t, dur)
    ImageDraw.Draw(im).text((W - 40, H - 14), "Schematische Anleitung · Keine Anlageberatung", font=font("Inter-Medium.otf", 18), fill=(120, 116, 108), anchor="rs")
    return im, st


def main(out):
    import voice as V
    cf = os.path.join(WK, "vo.json"); C = json.load(open(cf)) if os.path.exists(cf) else {}
    for i, s in enumerate(S):
        fn = os.path.join(WK, f"vo{i}.wav")
        if C.get(str(i)) != s["say"] or not os.path.exists(fn):
            w, sr = V.synth(s["say"], "de", 1.0, 0.0)
            with wave.open(fn, "wb") as f: f.setnchannels(1); f.setsampwidth(2); f.setframerate(sr); f.writeframes((np.clip(w, -1, 1) * 32767).astype("<i2").tobytes())
            C[str(i)] = s["say"]; json.dump(C, open(cf, "w"))
        with wave.open(fn) as f: s["vo"] = f.getnframes() / f.getframerate()
        s["wav"] = fn
    t = 0
    for s in S: s["t0"] = t; s["dur"] = max(s["vo"] + .7, 3.5 + 1.2 * len(s.get("boxes", []))); t += s["dur"]
    T = t; print("Länge", round(T, 1))
    v = os.path.join(WK, "v.mp4")
    p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", v], stdin=subprocess.PIPE)
    prev = None
    for i in range(int(T * FPS)):
        tt = i / FPS; s = next((x for x in S if x["t0"] <= tt < x["t0"] + x["dur"]), S[-1])
        im, prev = frame(s, tt - s["t0"], s["dur"], prev if s["k"] == "shot" else None)
        fade = min(1, (tt - s["t0"]) / .25)
        if s["k"] != "shot" or (S.index(s) > 0 and S[S.index(s) - 1].get("img") != s.get("img")):
            if fade < 1: im = Image.blend(Image.new("RGB", (W, H), BG), im, fade)
        p.stdin.write(im.tobytes())
    p.stdin.close(); p.wait()
    mus = os.path.join(WK, "music.wav")
    subprocess.run([sys.executable, os.path.join(HERE, "..", "factory", "music.py"), "drive", f"{T + 1:.2f}", mus, "11"], check=True, capture_output=True)
    ins = ["-i", mus]; flt = ["[1:a]volume=0.10[m]"]; mix = ["[m]"]
    for i, s in enumerate(S):
        ms = int(s["t0"] * 1000) + 200; ins += ["-i", s["wav"]]; flt.append(f"[{i + 2}:a]aresample=44100,volume=1.6,adelay={ms}|{ms}[v{i}]"); mix.append(f"[v{i}]")
    flt.append("".join(mix) + f"amix=inputs={len(mix)}:normalize=0,atrim=0:{T:.2f},afade=t=out:st={T - 1.5:.2f}:d=1.5[a]")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", v, *ins, "-filter_complex", ";".join(flt), "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", out], check=True)
    print("ok", out)


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[2] == "preview":
        picks = [(0, 4.5), (1, 2.0), (2, 3.5), (4, 3.0), (5, 4.5), (6, 3.0), (7, 3.5), (9, 4.0), (10, 5.0), (11, 3.0), (12, 3.0)]
        ims = []
        for i, tt in picks:
            s = S[i]; s["dur"] = 3.5 + 1.2 * len(s.get("boxes", [])) + 1.5
            prev = None
            if s["k"] == "shot":
                for q in range(0, int(tt * FPS) + 1, 5): _, prev = frame(s, q / FPS, s["dur"], prev)
            ims.append(frame(s, tt, s["dur"], prev)[0].resize((480, 270)))
        o = Image.new("RGB", (1440, 270 * math.ceil(len(ims) / 3))); [o.paste(x, ((i % 3) * 480, (i // 3) * 270)) for i, x in enumerate(ims)]; o.save(sys.argv[1])
    else: main(sys.argv[1])
