"""Ad (DE, 9:16): Alle Vorteile von Wealth Club – Trade-Ideen, Briefings, Bootcamp, Fehleranalyse, Sprachen, Support, VIP-Test.
Kein Einzahlungsbonus (in der EU für CFD-Werbung unzulässig). Kein Wort „Signal“.
python3 ad_vorteile.py out.mp4 [preview]   (WC_CODE für die Stimme)
"""
import glob, json, math, os, subprocess, sys, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import promo_lang as P   # noqa: E402  (Helfer: base, headline, caption, emoji, paste, ease, back)
from promo_lang import W, H, FPS, GOLD, WHITE, BG, LOGO, font, ease, back, paste, emoji   # noqa: E402

WK = os.path.join(HERE, "work"); OUT = os.path.join(WK, "vort_pl"); os.makedirs(OUT, exist_ok=True)

SEGS = [
    dict(k="hook", say="Chcesz nauczyć się tradingu złotem – bez drogich kursów i pustych obietnic?"),
    dict(k="ideas", say="W naszej darmowej grupie na Telegramie codziennie dostajesz pomysły tradingowe na złoto – z wejściem, stopem i celami.",
         kick="DARMOWA GRUPA", title="Codzienne *pomysły tradingowe*", img="c_signal.jpg"),
    dict(k="brief", say="Do tego briefingi rynkowe: co jest dziś ważne, które strefy się liczą i kiedy lepiej poczekać.",
         kick="AKTUALNOŚCI", title="Codzienne *briefingi*", img="c_brief.jpg"),
    dict(k="boot", say="W bootcampie uczysz się wszystkiego krok po kroku: pięćdziesiąt pięć lekcji z klipami i quizami.",
         kick="BOOTCAMP", title="*55 lekcji* krok po kroku", vid="vv_over_pl.webm"),
    dict(k="fehler", say="Do tego analiza błędów: dziesięć typowych błędów początkujących – i jak ich unikać.",
         kick="ANALIZA BŁĘDÓW", title="*10 błędów* początkujących", vid="vv_fehler_pl.webm"),
    dict(k="multi", say="Wszystko także w twoim języku: przycisk tłumacza pod każdym postem i bootcamp w siedmiu językach."),
    dict(k="supp", say="Osobiste wsparcie, bot, który pomaga przez całą dobę – a strefę VIP możesz testować przez czternaście dni."),
    dict(k="cta", say="Zacznij teraz za darmo. Link w bio."),
]
CTA_LINE = os.environ.get("CTA_LINE", "")   # leer = Partner-Basis (Handle per ffmpeg)
HOOK = int(os.environ.get("AD_HOOK", "1"))
HK = json.load(open(os.path.join(HERE, "hooks_pl.json")))[HOOK - 1]
SEGS[0]["say"] = HK["say"]
FLAGS = ["🇩🇪", "🇬🇧", "🇵🇱", "🇫🇷", "🇷🇺", "🇪🇸", "🇹🇷"]


def disclaimer(im):
    ImageDraw.Draw(im).text((W / 2, 1880), "To nie porada inwestycyjna · Trading wiąże się z ryzykiem strat · Wybrane przykłady",
                            font=font("Inter-Medium.otf", 23), fill=(150, 150, 156), anchor="ms")


# ---------- Handy-Rahmen mit Screenshot / Bildschirmaufnahme ----------
SX0, SY0, SW, SH = (W - 500) // 2, 590, 500, 996
_mask = Image.new("L", (SW, SH), 0); ImageDraw.Draw(_mask).rounded_rectangle((0, 0, SW, SH), radius=40, fill=255)


def device(im, screen, a, slide):
    y = SY0 + (1 - slide) * 120
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle((SX0 - 14, y + 10, SX0 + SW + 14, y + SH + 40), radius=54, fill=(0, 0, 0, int(190 * a)))
    sh = sh.filter(ImageFilter.GaussianBlur(26)); im.paste(sh, (0, 0), sh)
    d = ImageDraw.Draw(im, "RGBA")
    d.rounded_rectangle((SX0 - 14, y - 14, SX0 + SW + 14, y + SH + 14), radius=54, fill=(28, 26, 22, int(255 * a)), outline=GOLD + (int(150 * a),), width=3)
    m = _mask if a >= 1 else _mask.point(lambda v: int(v * a))
    im.paste(screen.convert("RGB"), (SX0, int(y)), m)


_img = {}
def shot(name, t, dur):
    """Screenshot auf Bildschirmbreite, langsamer Schwenk nach unten falls länger."""
    if name not in _img:
        s = Image.open(os.path.join(WK, name)).convert("RGB"); _img[name] = s.resize((SW, int(s.height * SW / s.width)), Image.LANCZOS)
    s = _img[name]; over = max(0, s.height - SH); off = int(over * ease(max(0, t - .6) / max(dur - 1.2, .5)))
    scr = Image.new("RGB", (SW, SH), (14, 22, 33)); scr.paste(s.crop((0, off, SW, off + min(SH, s.height))), (0, 0 if over else (SH - s.height) // 2))
    return scr


def vid_frames(name):
    d = os.path.join(OUT, name.split(".")[0])
    if not glob.glob(d + "/*.jpg"):
        os.makedirs(d, exist_ok=True)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(WK, name), "-vf", f"crop=432:860:0:0,fps={FPS},scale={SW}:{SH}", "-q:v", "3", d + "/f%04d.jpg"], check=True)
    return sorted(glob.glob(d + "/*.jpg"))


def vid(name, t):
    fr = vid_frames(name); i = min(len(fr) - 1, int((t + .4) * FPS)); return Image.open(fr[i])


# ---------- Szenen ----------
def scene(seg, t, dur, T):
    im = P.base(T); d = ImageDraw.Draw(im, "RGBA"); k = seg["k"]; a = ease(t / .35)
    if k == "hook":
        lo = LOGO.resize((420, int(LOGO.height * 420 / LOGO.width))); paste(im, lo, W / 2, 330, ease(t / .6))
        f = font("InterDisplay-Black.otf", 92)
        for j, (l, g) in enumerate([(a, bool(b)) for a, b in HK["lines"]]):
            e = ease((t - .3 - j * .3) / .4); d.text((W / 2, 680 + j * 108 + (1 - e) * 40), l, font=f, fill=(GOLD if g else WHITE) + (int(255 * e),), anchor="ms")
        chips = ["Pomysły tradingowe", "Briefingi", "Bootcamp", "Analiza błędów", "7 języków", "Wsparcie"]
        fc = font("Inter-Bold.otf", 36)
        for i, c in enumerate(chips):
            e = (t - 1.4 - i * .18) / .35
            if e <= 0: continue
            r, col = divmod(i, 2); cw = 400; cx = W / 2 + (col - .5) * (cw + 30); cy = 1080 + r * 120; s = max(.02, back(e))
            d.rounded_rectangle((cx - cw / 2 * s, cy - 46 * s, cx + cw / 2 * s, cy + 46 * s), radius=46 * s, fill=(26, 22, 14, int(240 * min(1, e * 2))), outline=GOLD + (int(255 * min(1, e * 2)),), width=3)
            if s > .6: d.text((cx, cy + 13), c, font=fc, fill=WHITE + (int(255 * min(1, e * 2)),), anchor="ms")
    elif k in ("ideas", "brief", "boot", "fehler"):
        P.headline(im, seg["kick"], seg["title"], a)
        scr = shot(seg["img"], t, dur) if "img" in seg else vid(seg["vid"], t)
        device(im, scr, a, ease(t / .5))
        if k == "fehler" and t > 1.2:   # roter „Fehler“-Stempel
            e = back((t - 1.2) / .4); fs = font("InterDisplay-Black.otf", int(40 * max(e, .2)))
            d = ImageDraw.Draw(im, "RGBA"); d.rounded_rectangle((W - 330, 610, W - 60, 690), radius=20, fill=(200, 40, 50, int(230 * min(1, e))))
            d.text((W - 195, 664), "✗ → ✓", font=fs, fill=WHITE, anchor="ms")
    elif k == "multi":
        P.headline(im, "WIELOJĘZYCZNIE", "Wszystko w *twoim języku*", a)
        # Translator-Knopf
        e = ease((t - .3) / .4); bx0, bx1, by = 170, W - 170, 640
        d.rounded_rectangle((bx0, by + (1 - e) * 30, bx1, by + 96 + (1 - e) * 30), radius=24, fill=P.TG_BTN + (int(240 * e),))
        if e > 0: P.text_emoji(d, im, W / 2 - 150, by + 62 + (1 - e) * 30, "🌍 Translator", font("Inter-SemiBold.otf", 44), WHITE)
        P.tap(im, W / 2 + 120, by + 48, (t - 1.1) / .6)
        for i, fl in enumerate(FLAGS):
            e = (t - 1.4 - i * .12) / .35
            if e > 0:
                ang = -math.pi / 2 + i / len(FLAGS) * 2 * math.pi + t * .2
                paste(im, emoji(fl, int(104 * back(e))), W / 2 + 300 * math.cos(ang), 1150 + 230 * math.sin(ang), min(1, e * 2))
        e = ease((t - 2.4) / .4)
        d.text((W / 2, 1175), "7", font=font("InterDisplay-Black.otf", 150), fill=GOLD + (int(255 * e),), anchor="ms")
        d.text((W / 2, 1225), "JĘZYKÓW", font=font("Inter-Bold.otf", 34), fill=WHITE + (int(255 * e),), anchor="ms")
    elif k == "supp":
        P.headline(im, "NIE JESTEŚ SAM", "Wsparcie i *test VIP*", a)
        items = [("💬", "Osobiste wsparcie", "bezpośrednio na Telegramie"), ("🤖", "Bot 24/7", "pytania, linki, bootcamp"),
                 ("🧪", "Test VIP 14 dni", "najpierw ćwicz na demo"), ("🎓", "Filmy Academy", "kompletne setupy")]
        for i, (ic, h, s) in enumerate(items):
            e = ease((t - .3 - i * .45) / .4); y = 640 + i * 200
            d.rounded_rectangle((100 + (1 - e) * 60, y, W - 100, y + 170), radius=30, fill=(22, 20, 15, int(240 * e)), outline=(90, 74, 40, int(255 * e)), width=2)
            d.ellipse((130, y + 37, 226, y + 133), fill=GOLD + (int(255 * e),))
            if e > .05: paste(im, emoji(ic, 54), 178, y + 85, e)
            d.text((260, y + 78), h, font=font("Inter-Bold.otf", 46), fill=WHITE + (int(255 * e),), anchor="ls")
            d.text((260, y + 128), s, font=font("Inter-Medium.otf", 34), fill=(190, 186, 176, int(255 * e)), anchor="ls")
    elif k == "cta":
        lo = LOGO.resize((440, int(LOGO.height * 440 / LOGO.width))); paste(im, lo, W / 2, 380, ease(t / .6))
        d.text((W / 2, 640), "Darmowa", font=font("InterDisplay-Black.otf", 90), fill=WHITE + (int(255 * a),), anchor="ms")
        d.text((W / 2, 740), "grupa Gold", font=font("InterDisplay-Black.otf", 90), fill=GOLD + (int(255 * a),), anchor="ms")
        ticks = ["Codzienne pomysły tradingowe", "Briefingi i powtórki", "Bootcamp + analiza błędów", "7 języków · wsparcie"]
        for i, s in enumerate(ticks):
            e = ease((t - .4 - i * .2) / .35); y = 860 + i * 84
            d.rounded_rectangle((250, y, 294, y + 44), radius=10, fill=GOLD + (int(255 * e),))
            d.line((260, y + 22, 270, y + 33, 286, y + 11), fill=(20, 16, 8, int(255 * e)), width=6, joint="curve")
            d.text((320, y + 36), s, font=font("Inter-Bold.otf", 42), fill=WHITE + (int(255 * e),), anchor="ls")
        e = ease((t - 1.3) / .4); s = max(.02, back((t - 1.3) / .5)) * (1 + .03 * math.sin(t * 6))
        bw, bh = 520 * s, 130 * s; cy = 1300
        d.rounded_rectangle((W / 2 - bw / 2, cy - bh / 2, W / 2 + bw / 2, cy + bh / 2), radius=bh / 2, fill=GOLD + (int(255 * e),))
        d.text((W / 2, cy + 18), "Link w bio", font=font("InterDisplay-Black.otf", int(58 * max(s, .3))), fill=(18, 14, 6, int(255 * e)), anchor="ms")
        if CTA_LINE: d.text((W / 2, 1450), CTA_LINE, font=font("Inter-Bold.otf", 38), fill=GOLD + (int(255 * ease((t - 1.8) / .4)),), anchor="ms")
    P.caption(im, seg["say"], t, dur, a)
    disclaimer(im)
    return im


def main():
    out = sys.argv[1]
    import voice as V
    cache = os.path.join(OUT, "vo.json"); C = json.load(open(cache)) if os.path.exists(cache) else {}
    for i, s in enumerate(SEGS):
        fn = os.path.join(OUT, f"vo{i}.wav")
        if C.get(str(i)) != s["say"] or not os.path.exists(fn):
            w, sr = V.synth(s["say"], "pl", 1.0, 0.0)
            with wave.open(fn, "wb") as f: f.setnchannels(1); f.setsampwidth(2); f.setframerate(sr); f.writeframes((np.clip(w, -1, 1) * 32767).astype("<i2").tobytes())
            C[str(i)] = s["say"]; json.dump(C, open(cache, "w"))
        with wave.open(fn) as f: s["vo"] = f.getnframes() / f.getframerate()
        s["wav"] = fn
    mins = {"hook": 3.4, "ideas": 4.0, "brief": 4.0, "boot": 4.5, "fehler": 4.5, "multi": 4.0, "supp": 4.2, "cta": 3.8}
    t = 0
    for s in SEGS: s["t0"] = t; s["dur"] = max(s["vo"] + .5, mins[s["k"]]); t += s["dur"]
    T = t; print("Länge", round(T, 1), "CTA-Start", round(SEGS[-1]["t0"], 2))
    v = os.path.join(OUT, "v.mp4")
    p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                          "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", v], stdin=subprocess.PIPE)
    for i in range(int(T * FPS)):
        tt = i / FPS; s = next((x for x in SEGS if x["t0"] <= tt < x["t0"] + x["dur"]), SEGS[-1])
        im = scene(s, tt - s["t0"], s["dur"], tt)
        if tt - s["t0"] > s["dur"] - .25 and s is not SEGS[-1]: im = Image.blend(im, Image.new("RGB", (W, H), BG), ease((tt - s["t0"] - s["dur"] + .25) / .25) * .6)
        p.stdin.write(im.tobytes())
    p.stdin.close(); p.wait()
    mus = os.path.join(OUT, "music.wav")
    subprocess.run([sys.executable, os.path.join(HERE, "..", "factory", "music.py"), "drive", f"{T + 1:.2f}", mus, str(6 + HOOK)], check=True, capture_output=True)
    ins = ["-i", mus]; flt = ["[1:a]volume=0.22[m]"]; mix = ["[m]"]   # 0 = Video, 1 = Musik, ab 2 = Sprecher
    for i, s in enumerate(SEGS):
        ms = int(s["t0"] * 1000) + 150; ins += ["-i", s["wav"]]; flt.append(f"[{i + 2}:a]aresample=44100,volume=1.6,adelay={ms}|{ms}[v{i}]"); mix.append(f"[v{i}]")
    flt.append("".join(mix) + f"amix=inputs={len(mix)}:normalize=0,atrim=0:{T:.2f},afade=t=out:st={T - 1.2:.2f}:d=1.2[a]")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", v, *ins, "-filter_complex", ";".join(flt), "-map", "0:v", "-map", "[a]",
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", out], check=True)
    print("ok", out)


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[2] == "preview":
        ims = [scene(SEGS[i], tt, 4.5, 1).resize((270, 480)) for i, tt in [(0, 3.0), (1, 2.5), (2, 3.5), (3, 3.0), (4, 3.5), (5, 3.2), (6, 3.0), (7, 2.5)]]
        o = Image.new("RGB", (1080, 960)); [o.paste(x, ((i % 4) * 270, (i // 4) * 480)) for i, x in enumerate(ims)]; o.save(sys.argv[1])
    else: main()
