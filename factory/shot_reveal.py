"""Echter Trade-Screenshot -> Replay-Reel: der Chart wird im Schnelldurchlauf von links nach rechts „aufgedeckt“.

python3 shot_reveal.py screenshot.jpg out.mp4 '{"title": "Gold *SELL* +344 $", "result": "+344 USD", "sub": "XAUUSD · SELL", "side": "SELL"}'

Am Screenshot wird nichts verändert (keine Zahlen, keine Kerzen) – er wird nur abgedunkelt gezeigt und dann
Stück für Stück in voller Helligkeit freigelegt. Unten steht klar: „Replay aus Screenshot · ausgewählter Trade“.
Aufbau: 1 s Titelbild -> 1 s Screenshot abgedunkelt -> ~9 s Aufdecken -> 3 s Ergebnis (leichter Zoom) -> 2,6 s CTA.
Erzeugt auch <out>_cover.jpg.
"""
import json, os, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
from lib import W, H, font, GOLD, WHITE, MUTED, BG, GREEN, RED

HERE = os.path.dirname(os.path.abspath(__file__))
FPS = 30


def ease(x): x = max(0.0, min(1.0, x)); return x * x * (3 - 2 * x)


def base_bg():
    im = Image.new("RGB", (W, H), BG)
    g = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(g)
    d.ellipse((-260, -650, W + 260, 520), fill=(70, 52, 20)); d.ellipse((300, 1500, 1400, 2300), fill=(36, 28, 12))
    im = Image.blend(im, g.filter(ImageFilter.GaussianBlur(190)), 0.75)
    lp = os.path.join(HERE, "brand", "logo.png")
    if os.path.exists(lp):
        lg = Image.open(lp).convert("RGBA"); lg = lg.resize((230, int(lg.height * 230 / lg.width)), Image.LANCZOS); im.paste(lg, ((W - lg.width) // 2, 70), lg)
    return im


def pill(d, cy, s, col=GOLD):
    f = font("Inter-Bold.otf", 34); tw = d.textlength(s, font=f)
    d.rounded_rectangle(((W - tw) / 2 - 30, cy - 30, (W + tw) / 2 + 30, cy + 30), radius=30, fill=(46, 34, 12), outline=col, width=2)
    d.text((W / 2, cy), s, font=f, fill=col, anchor="mm")


def analyse(img):
    """Findet im Screenshot: Preisachse rechts (bleibt hell), waagerechte Linien (Entry/SL/TP – bleiben sichtbar)
    und den Kerzenabstand (für das Aufdecken Kerze für Kerze)."""
    import numpy as np
    a = np.asarray(img).astype(int); h, w, _ = a.shape
    vals, cnt = np.unique((a // 8).reshape(-1, 3), axis=0, return_counts=True); bgc = vals[cnt.argmax()] * 8 + 4
    diff = np.abs(a - bgc).sum(2) > 60
    colfrac = diff[int(h * .05):int(h * .95)].mean(0)
    axis = [x for x in range(int(w * .55), w) if colfrac[x] > 0.75]
    right = min(axis) if axis else int(w * .86)
    rowfrac = diff[:, :right].mean(1)
    lines = rowfrac > 0.2                       # Level-Linien / Rahmen über die ganze Breite
    act = diff[:, :right].copy(); act[lines] = False
    act[: int(h * 0.12)] = False; act[int(h * 0.97):] = False   # Kopfzeile (Symbole, Menü) und Zeitachse ignorieren
    # Kerzen = senkrechte Striche: längster senkrechter Lauf je Spalte (gestrichelte Waagerechte zählen so nicht)
    run = np.zeros(act.shape[1], int); cur = np.zeros(act.shape[1], int)
    for row in act:
        cur = np.where(row, cur + 1, 0); run = np.maximum(run, cur)
    colact = run
    xs = [x for x in range(right) if colact[x] >= 3]
    left = xs[0] if xs else 0
    sig = (colact[left:right] >= 3).astype(float); sig -= sig.mean()
    pitch = 8
    if len(sig) > 40:
        ac = [float((sig[:-L] * sig[L:]).sum()) for L in range(3, 41)]
        pitch = 3 + int(np.argmax(ac))
    last = xs[-1] + 2 if xs else right
    return {"bg": tuple(int(v) for v in bgc), "right": right, "lines": lines, "left": left, "last": min(right, last), "pitch": max(3, pitch)}


def make(shot, out, info):
    import cover as _cv
    side = (info.get("side") or "").upper()
    src = Image.open(shot).convert("RGB")
    # Bildbereich für den Screenshot
    bw, bh = 960, 1260
    k = min(bw / src.width, bh / src.height); tw, th = int(src.width * k), int(src.height * k)
    img = src.resize((tw, th), Image.LANCZOS)
    A = analyse(img); R, LW, PITCH = A["right"], A["left"], A["pitch"]
    import numpy as np
    dim_full = Image.new("RGB", img.size, (28, 30, 36))   # noch nicht gelaufener Bereich: neutral dunkel (keine Kerzen-Vorschau)
    dim = img.copy(); dim.paste(dim_full.crop((0, 0, R, th)), (0, 0))   # nur der Chartbereich wird abgedunkelt, Preisachse bleibt
    keep = np.asarray(A["lines"])                                       # Entry/SL/TP-Linien bleiben von Anfang an sichtbar
    if keep.any():
        dn = np.asarray(dim).copy(); im_np = np.asarray(img)
        dn[keep, :R] = im_np[keep, :R]; dim = Image.fromarray(dn)
    LAST = A["last"]; steps = max(1, (LAST - LW) // PITCH)   # nur bis zur letzten Kerze aufdecken (leerer Bereich rechts kostet keine Zeit)
    x0, y0 = (W - tw) // 2, 330 + (bh - th) // 2
    bg = base_bg(); d = ImageDraw.Draw(bg)
    pill(d, 245, info.get("kicker", "TRADE-REPLAY"))
    d.text((W / 2, 1850), "Replay aus Screenshot · ausgewählter Trade · Keine Anlageberatung", font=font("Inter-Medium.otf", 24), fill=(110, 116, 130), anchor="mm")
    sub = info.get("sub", "")
    res = info.get("result", "")
    rc = RED if res.strip().startswith(("-", "−")) else GREEN

    cp = os.path.splitext(out)[0] + "_cover.jpg"
    _cv.make(info.get("kicker", "REPLAY"), info.get("title") or "Gold *Replay*", cp, "down" if side == "SELL" else "up")
    cover = Image.open(cp).convert("RGB")

    T_COV, T_DIM, T_REV, T_RES, T_CTA = 1.0, 1.0, float(info.get("reveal", 9)), 3.2, 2.6
    total = T_COV + T_DIM + T_REV + T_RES + T_CTA
    tmp = tempfile.mkdtemp(); mw = os.path.join(tmp, "music.wav")
    subprocess.run([sys.executable, os.path.join(HERE, "music.py"), info.get("music", "drive"), f"{total + 0.5:.2f}", mw, "13"], check=True, capture_output=True)
    p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                          "-i", mw, "-filter_complex", f"[1:a]afade=t=out:st={total - 1.2:.2f}:d=1.2[a]", "-map", "0:v", "-map", "[a]", "-t", f"{total:.2f}",
                          "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out],
                         stdin=subprocess.PIPE)
    fsub = font("Inter-SemiBold.otf", 36); fres = font("InterDisplay-Black.otf", 88)
    n = int(total * FPS)
    for i in range(n):
        t = i / FPS
        if t < T_COV:
            fr = cover
        elif t < T_COV + T_DIM + T_REV + T_RES:
            fr = bg.copy(); dd = ImageDraw.Draw(fr)
            tr = t - T_COV - T_DIM
            q = min(1.0, tr / T_REV) if tr > 0 else 0.0
            c = int(q * steps)                                   # Kerze für Kerze
            cut = R if q >= 1 else min(LAST, LW + (c + 1) * PITCH) if tr > 0 else LW
            layer = dim.copy()
            if cut > 0: layer.paste(img.crop((0, 0, cut, th)), (0, 0))
            if q >= 1: layer = img.copy()
            if tr >= T_REV:   # Ergebnis: sanfter Zoom auf das ganze Bild
                z = 1 + 0.035 * ease((tr - T_REV) / T_RES)
                zw, zh = int(tw * z), int(th * z); layer = img.resize((zw, zh), Image.LANCZOS).crop(((zw - tw) // 2, (zh - th) // 2, (zw - tw) // 2 + tw, (zh - th) // 2 + th))
            fr.paste(layer, (x0, y0))
            dd.rounded_rectangle((x0 - 8, y0 - 8, x0 + tw + 8, y0 + th + 8), radius=26, outline=GOLD, width=5)
            if 0 < q < 1:   # leuchtende Kurs-„Zeitlinie“
                lx = x0 + cut
                glow = Image.new("RGBA", (40, th), (0, 0, 0, 0)); gd = ImageDraw.Draw(glow); gd.rectangle((17, 0, 23, th), fill=GOLD + (255,))
                glow = glow.filter(ImageFilter.GaussianBlur(6)); fr.paste(glow, (lx - 20, y0), glow)
                dd.line((lx, y0, lx, y0 + th), fill=GOLD, width=3)
            if sub: dd.text((W / 2, y0 + th + 62), sub, font=fsub, fill=WHITE, anchor="mm")
            if res and tr >= T_REV:
                a = ease((tr - T_REV) / 0.4)
                lay = Image.new("RGBA", (W, 160), (0, 0, 0, 0)); ld = ImageDraw.Draw(lay)
                ld.rounded_rectangle((W / 2 - 330, 10, W / 2 + 330, 150), radius=40, fill=(10, 12, 18, int(225 * a)), outline=rc + (int(255 * a),), width=4)
                ld.text((W / 2, 80), res, font=fres, fill=rc + (int(255 * a),), anchor="mm")
                fr.paste(lay, (0, y0 + th - 190), lay)   # unten im Bild, Chart-Mitte bleibt frei
        else:
            if i == int((total - T_CTA) * FPS) or "ctaimg" not in locals():
                ctaimg = base_bg(); cd = ImageDraw.Draw(ctaimg)
                cd.text((W / 2, 760), info.get("cta_title", "Trading mit Plan."), font=font("InterDisplay-Black.otf", 76), fill=GOLD, anchor="mm")
                cd.text((W / 2, 860), "Gold-Ideen & Live-Trades auf Telegram", font=font("Inter-SemiBold.otf", 44), fill=WHITE, anchor="mm")
                b = info.get("button", "Kommentiere GOLD"); fb = font("InterDisplay-Black.otf", 56); bwid = cd.textlength(b, font=fb) + 120
                cd.rounded_rectangle(((W - bwid) / 2, 1000, (W + bwid) / 2, 1130), radius=65, fill=GOLD); cd.text((W / 2, 1065), b, font=fb, fill=BG, anchor="mm")
                cd.text((W / 2, 1240), "Keine Anlageberatung. Trading birgt Verlustrisiken.", font=font("Inter-Medium.otf", 30), fill=MUTED, anchor="mm")
            fr = ctaimg
        p.stdin.write(fr.tobytes())
    p.stdin.close(); p.wait()
    print("ok", out, f"{total:.1f}s")


if __name__ == "__main__":
    make(sys.argv[1], sys.argv[2], json.loads(sys.argv[3]) if len(sys.argv) > 3 else {})
