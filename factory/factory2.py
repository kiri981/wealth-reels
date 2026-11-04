"""Reel-Fabrik 2.0 – mehr Bewegung, kürzer, einheitliches Gold-Design.

python3 factory2.py spec.json out.mp4        (PREVIEW=1 -> Standbilder je Szene)

Szenen (dur in Sekunden, Gesamt ideal 14–20 s):
  {"type":"hook",    "dur":2.2, "text":"Gold fällt 30 $.", "accent":"Und ich kaufe nicht.", "icon":"bolt"}
      icon: bolt | up | down | alert | clock | check
      Wörter ploppen einzeln auf, leichter Zoom + Ruck.
  {"type":"counter", "dur":3.0, "label":"Gold diese Woche", "from":0, "to":1.8, "decimals":1, "prefix":"+", "suffix":" %", "color":"green", "sub":"Wochenhoch 4.081 $"}
      Zahl zählt hoch, Pfeil hüpft.
  {"type":"line",    "dur":3.5, "title":"Gold gestern", "values":[4040,4036,4048,4031,4055], "labels":["8","10","12","14","16"], "color":"gold", "end_label":"4.055 $"}
      Linie zeichnet sich, Punkt pulsiert. NUR echte Kurse.
  {"type":"cards",   "dur":4.0, "title":"Diese Woche wichtig", "items":[{"left":"Mi 20:00","right":"Fed-Zins","hot":true}, ...]}
      Karten fliegen von rechts ein (max. 4).
  {"type":"words",   "dur":3.5, "kicker":"Meine Regel", "text":"Erst der Kerzenschluss zählt – nie der Docht."}
      Satz baut sich Wort für Wort auf, aktuelles Wort leuchtet gold.
  {"type":"cta",     "dur":2.6, "title":"Plan vor der News."}
Optional oben: "music": "auto"|"drive"|"chill"|"lofi"|"none"|Datei aus music/
Farben: gold, white, muted, red, green.
"""
import json, sys, os, math, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import lib
from lib import W, H, FPS, font, mono, clamp, ease, BG, GOLD, WHITE, MUTED, RED, GREEN, CARD, LINE, rrect, text

C = {"gold": GOLD, "white": WHITE, "muted": MUTED, "red": RED, "green": GREEN}
H1 = lambda s: font("InterDisplay-Black.otf", s)
SB = lambda s: font("Inter-SemiBold.otf", s)
col = lambda n, d="gold": C.get(n or d, GOLD)

def back(x):  # Ease-out mit leichtem Überschwingen
    x = clamp(x); c = 1.7
    return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2

# ---------- Hintergrund: wandernder Goldschimmer + aufsteigender Goldstaub ----------
_glow = None
_dust = [(random.Random(i).uniform(0, W), random.Random(i * 7).uniform(0, H), random.Random(i * 13).uniform(1.5, 4.5), random.Random(i * 29).uniform(20, 70)) for i in range(70)]
def background(t):
    global _glow
    if _glow is None:
        g = Image.new("RGB", (W + 400, H), BG); d = ImageDraw.Draw(g)
        d.ellipse((-100, -750, W + 500, 650), fill=(78, 58, 20))
        d.ellipse((300, 1450, 1500, 2500), fill=(40, 30, 12))
        _glow = g.filter(ImageFilter.GaussianBlur(210))
    off = int(200 + 140 * math.sin(t * 0.6))
    im = Image.blend(Image.new("RGB", (W, H), BG), _glow.crop((off, 0, off + W, H)), 0.7)
    d = ImageDraw.Draw(im)
    for x, y, r, v in _dust:
        yy = (y - t * v) % H; a = 0.35 + 0.35 * math.sin(t * 2 + x)
        c = tuple(int(BG[k] + (GOLD[k] - BG[k]) * a * 0.55) for k in range(3))
        d.ellipse((x - r, yy - r, x + r, yy + r), fill=c)
    return im

def chrome(im, t, total):
    d = ImageDraw.Draw(im); f = SB(30); txt = "GOLD  ·  XAUUSD"; w = d.textlength(txt, font=f); x0 = (W - w) / 2 - 26
    d.rounded_rectangle((x0, 150, x0 + w + 52, 204), radius=27, outline=GOLD, width=2)
    d.text((W / 2, 177), txt, font=f, fill=GOLD, anchor="mm")
    d.rectangle((0, 0, W, 8), fill=(30, 34, 44)); d.rectangle((0, 0, int(W * clamp(t / total)), 8), fill=GOLD)

def scaled_text(im, cx, cy, s, fnt, fill, scale=1.0, alpha=1.0, glow=False):
    """Text als Ebene rendern, skalieren (Pop-Effekt), optional mit Leuchten."""
    if alpha <= 0 or scale <= 0.01: return
    d0 = ImageDraw.Draw(Image.new("RGB", (1, 1))); bb = d0.textbbox((0, 0), s, font=fnt)
    w, h = bb[2] - bb[0] + 40, bb[3] - bb[1] + 40
    lay = Image.new("RGBA", (w, h), (0, 0, 0, 0)); ImageDraw.Draw(lay).text((20 - bb[0], 20 - bb[1]), s, font=fnt, fill=fill + (255,))
    if glow:
        g = lay.filter(ImageFilter.GaussianBlur(14)); lay = Image.alpha_composite(g, lay)
    if scale != 1: lay = lay.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.BICUBIC)
    if alpha < 1: lay.putalpha(lay.getchannel("A").point(lambda v: int(v * alpha)))
    im.paste(lay, (int(cx - lay.width / 2), int(cy - lay.height / 2)), lay)

def wrap_words(words, fnt, maxw):
    d = ImageDraw.Draw(Image.new("RGB", (1, 1))); lines, cur = [], []
    for w in words:
        if cur and d.textlength(" ".join(cur + [w]), font=fnt) > maxw: lines.append(cur); cur = [w]
        else: cur.append(w)
    if cur: lines.append(cur)
    return lines

def word_layout(s, fnt, maxw, cy, lh=1.15):
    """Positionen (x_mitte, y) je Wort, zeilenweise zentriert."""
    d = ImageDraw.Draw(Image.new("RGB", (1, 1))); lines = wrap_words(s.split(), fnt, maxw); sp = d.textlength(" ", font=fnt)
    out = []; y0 = cy - (len(lines) - 1) * fnt.size * lh / 2
    for i, ln in enumerate(lines):
        ws = [d.textlength(w, font=fnt) for w in ln]; x = W / 2 - (sum(ws) + sp * (len(ln) - 1)) / 2
        for w, wl in zip(ln, ws): out.append((w, x + wl / 2, y0 + i * fnt.size * lh)); x += wl + sp
    return out

def fit(s, maxw, start, mn, maxlines, f=H1):
    size = start
    while size > mn and (len(wrap_words(s.split(), f(size), maxw)) > maxlines or max(ImageDraw.Draw(Image.new("RGB", (1, 1))).textlength(w, font=f(size)) for w in s.split()) > maxw): size -= 4
    return size


def icon(im, kind, cx, cy, scale, alpha, tl=0.0):
    """Selbst gezeichnete Symbole (keine Emoji-Schrift nötig): bolt, up, down, alert, clock, check."""
    if alpha <= 0 or scale <= 0.02: return
    S = 220; lay = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(lay); g = GOLD + (255,)
    if kind == "bolt": d.polygon([(125, 10), (45, 125), (100, 125), (80, 210), (175, 85), (118, 85), (150, 10)], fill=g)
    elif kind in ("up", "down"):
        c = (GREEN if kind == "up" else RED) + (255,)
        pts = [(110, 20), (30, 110), (80, 110), (80, 200), (140, 200), (140, 110), (190, 110)]
        if kind == "down": pts = [(x, 220 - y) for x, y in pts]
        d.polygon(pts, fill=c)
    elif kind == "alert": d.polygon([(110, 15), (205, 195), (15, 195)], fill=g); d.rectangle((100, 70, 120, 140), fill=BG + (255,)); d.ellipse((99, 155, 121, 177), fill=BG + (255,))
    elif kind == "clock": d.ellipse((20, 20, 200, 200), outline=g, width=16); d.line((110, 110, 110, 55), fill=g, width=14); d.line((110, 110, 150, 135), fill=g, width=14)
    elif kind == "check": d.ellipse((20, 20, 200, 200), fill=GREEN + (255,)); d.line((65, 112, 98, 145, 160, 80), fill=BG + (255,), width=20)
    glow = lay.filter(ImageFilter.GaussianBlur(16)); lay = Image.alpha_composite(glow, lay)
    sz = max(1, int(S * scale * (1 + 0.04 * math.sin(tl * 6)))); lay = lay.resize((sz, sz), Image.BICUBIC)
    if alpha < 1: lay.putalpha(lay.getchannel("A").point(lambda v: int(v * alpha)))
    im.paste(lay, (int(cx - sz / 2), int(cy - sz / 2)), lay)

# ---------- Szenen ----------
def s_hook(sc):
    f1 = H1(fit(sc["text"], 940, 124, 70, 2)); w1 = word_layout(sc["text"], f1, 940, 760)
    acc = sc.get("accent"); f2 = H1(fit(acc, 920, 96, 60, 2)) if acc else None
    w2 = word_layout(acc, f2, 920, 1060) if acc else []
    def draw(im, t, tl):
        if sc.get("icon") or sc.get("emoji"): icon(im, sc.get("icon") or "bolt", W / 2, 520, 1.0 * back(tl / 0.35), clamp(tl / 0.2), tl)
        for k, (w, x, y) in enumerate(w1):
            p = (tl - 0.08 - k * 0.12) / 0.28
            if p > 0: scaled_text(im, x, y, w, f1, WHITE, 0.6 + 0.4 * back(p), clamp(p * 2))
        st = 0.15 + len(w1) * 0.12 + 0.2
        for k, (w, x, y) in enumerate(w2):
            p = (tl - st - k * 0.1) / 0.28
            if p > 0: scaled_text(im, x, y, w, f2, col(sc.get("color"), "gold"), 0.6 + 0.4 * back(p), clamp(p * 2), glow=True)
    return draw

def s_counter(sc):
    a, b, dec = float(sc.get("from", 0)), float(sc["to"]), int(sc.get("decimals", 0)); c = col(sc.get("color"), "green")
    up = b >= a
    def fmt(v): return (sc.get("prefix", "") + f"{v:,.{dec}f}".replace(",", "X").replace(".", ",").replace("X", ".") + sc.get("suffix", ""))
    big = H1(fit(fmt(b), 960, 220, 110, 1))
    def draw(im, t, tl):
        p = clamp(tl / 0.25); text(im, (W / 2, 560), sc.get("label", ""), H1(64), WHITE, p, dy=int(30 * (1 - p)))
        k = ease(clamp((tl - 0.3) / 1.4)); v = a + (b - a) * k
        scaled_text(im, W / 2, 860, fmt(v), big, c, 1 + 0.08 * math.exp(-max(0, tl - 1.7) * 6) * (tl > 1.7), clamp((tl - 0.25) / 0.2), glow=True)
        bounce = abs(math.sin(tl * 5)) * 18 * (tl > 0.3)
        ay = 1040 - bounce if up else 1040 + bounce; d = ImageDraw.Draw(im); al = clamp((tl - 0.4) / 0.3)
        if al > 0:
            pts = [(W / 2, ay - 40), (W / 2 - 40, ay + 10), (W / 2 + 40, ay + 10)] if up else [(W / 2, ay + 40), (W / 2 - 40, ay - 10), (W / 2 + 40, ay - 10)]
            d.polygon(pts, fill=tuple(int(BG[i] + (c[i] - BG[i]) * al) for i in range(3)))
        if sc.get("sub"): p = clamp((tl - 1.6) / 0.3); text(im, (W / 2, 1170), sc["sub"], SB(46), MUTED, p, dy=int(30 * (1 - p)))
    return draw

def s_line(sc):
    vals = sc["values"]; n = len(vals); lo, hi = min(vals), max(vals); pad = (hi - lo) * 0.15 or 1; lo -= pad; hi += pad
    X0, X1, Y0, Y1 = 120, 960, 520, 1300; c = col(sc.get("color"), "gold")
    px = lambda i: X0 + (X1 - X0) * i / (n - 1); py = lambda v: Y1 - (v - lo) / (hi - lo) * (Y1 - Y0)
    def draw(im, t, tl):
        p = clamp(tl / 0.25); text(im, (W / 2, 380), sc.get("title", ""), H1(fit(sc.get("title", ""), 940, 66, 44, 1)), WHITE, p, dy=int(30 * (1 - p)))
        rrect(im, (60, 470, 1020, 1400), CARD, clamp(tl / 0.3), r=40)
        d = ImageDraw.Draw(im)
        for g in range(4): yy = Y0 + (Y1 - Y0) * g / 3; d.line((X0, yy, X1, yy), fill=LINE, width=1)
        k = ease(clamp((tl - 0.3) / (sc.get("dur", 3.5) * 0.55))) * (n - 1)
        pts = [(px(i), py(vals[i])) for i in range(int(k) + 1)]
        if int(k) < n - 1: f = k - int(k); i = int(k); pts.append((px(i) + (px(i + 1) - px(i)) * f, py(vals[i]) + (py(vals[i + 1]) - py(vals[i])) * f))
        if len(pts) > 1:
            gl = Image.new("RGBA", im.size, (0, 0, 0, 0)); ImageDraw.Draw(gl).line(pts, fill=c + (170,), width=22, joint="curve")
            im.paste(gl.filter(ImageFilter.GaussianBlur(12)), (0, 0), gl.filter(ImageFilter.GaussianBlur(12)))
            d.line(pts, fill=c, width=8, joint="curve")
            ex, ey = pts[-1]; r = 14 + 5 * math.sin(tl * 8); d.ellipse((ex - r, ey - r, ex + r, ey + r), fill=WHITE)
        for i, lab in enumerate(sc.get("labels", [])[:n]): text(im, (px(i), Y1 + 50), lab, SB(28), MUTED, clamp(tl / 0.4))
        if sc.get("end_label") and k >= n - 1.01:
            p = clamp((tl - 0.3 - sc.get("dur", 3.5) * 0.55) / 0.3); ex, ey = pts[-1]
            fnt = H1(46); tw = d.textlength(sc["end_label"], font=fnt); bx = min(ex - tw / 2 - 24, 1000 - tw - 48)
            rrect(im, (bx, ey - 110, bx + tw + 48, ey - 40), c, p, r=34); text(im, (bx + 24 + tw / 2, ey - 75), sc["end_label"], fnt, BG, p)
        if sc.get("footer"): text(im, (W / 2, 1450), sc["footer"], SB(26), MUTED, clamp(tl / 0.4))
    return draw

def s_cards(sc):
    items = sc["items"][:4]; step = 190
    def draw(im, t, tl):
        p = clamp(tl / 0.25); text(im, (W / 2, 420), sc.get("title", ""), H1(fit(sc.get("title", ""), 940, 70, 44, 1)), WHITE, p, dy=int(30 * (1 - p)))
        for i, it in enumerate(items):
            q = back(clamp((tl - 0.3 - i * 0.35) / 0.4)); y = 540 + i * step; dx = (1 - q) * 700
            if q <= 0: continue
            hot = it.get("hot"); pulse = 0.5 + 0.5 * math.sin(tl * 6) if hot else 0
            rrect(im, (80 + dx, y, 1000 + dx, y + 160), CARD, clamp(q), r=34, outline=GOLD if hot else LINE, width=3 if hot else 2)
            if hot: rrect(im, (80 + dx, y, 96 + dx, y + 160), GOLD, 0.6 + 0.4 * pulse, r=8)
            text(im, (130 + dx, y + 80), it.get("left", ""), mono(42), GOLD, clamp(q), anchor="lm")
            fs = 44
            while fs > 28 and ImageDraw.Draw(im).textlength(it.get("right", ""), font=SB(fs)) > 520: fs -= 2
            text(im, (430 + dx, y + 80), it.get("right", ""), SB(fs), WHITE, clamp(q), anchor="lm")
    return draw

def s_words(sc):
    fnt = H1(fit(sc["text"], 900, 92, 56, 4)); ws = word_layout(sc["text"], fnt, 900, 860, 1.18)
    def draw(im, t, tl):
        if sc.get("kicker"): p = clamp(tl / 0.25); scaled_text(im, W / 2, 560, sc["kicker"], H1(64), GOLD, 0.8 + 0.2 * back(p), p)
        span = max(0.8, sc.get("dur", 3.5) - 1.2); per = span / max(1, len(ws))
        for k, (w, x, y) in enumerate(ws):
            st = 0.35 + k * per; p = (tl - st) / 0.18
            if p <= 0: continue
            active = st <= tl < st + per * 1.6
            scaled_text(im, x, y, w, fnt, GOLD if active else WHITE, 0.85 + 0.15 * back(p), clamp(p * 2), glow=active)
    return draw

def s_cta(sc):
    def draw(im, t, tl):
        if sc.get("title"): scaled_text(im, W / 2, 640, sc["title"], H1(fit(sc["title"], 920, 84, 56, 1)), GOLD, 0.8 + 0.2 * back(tl / 0.35), clamp(tl / 0.2), glow=True)
        p = clamp((tl - 0.3) / 0.3); text(im, (W / 2, 900), "Gold-Ideen live auf Telegram", H1(66), WHITE, p, dy=int(30 * (1 - p)))
        q = back(clamp((tl - 0.6) / 0.35)); s = q * (1 + 0.04 * math.sin(tl * 7) * (tl > 1))
        if q > 0:
            bw, bh = 640 * s, 130 * s; rrect(im, (W / 2 - bw / 2, 1110 - bh / 2, W / 2 + bw / 2, 1110 + bh / 2), GOLD, 1, r=int(65 * s))
            scaled_text(im, W / 2, 1110, "Link in Bio 👆".replace(" 👆", ""), H1(60), BG, s)
        text(im, (W / 2, 1290), "Keine Anlageberatung. Trading birgt Verlustrisiken.", font("Inter-Medium.otf", 30), MUTED, clamp((tl - 0.9) / 0.3))
    return draw

BUILD = {"hook": s_hook, "counter": s_counter, "line": s_line, "cards": s_cards, "words": s_words, "cta": s_cta}

def render(scenes, out, total):
    import subprocess
    base = os.path.splitext(out)[0]
    if os.environ.get("PREVIEW"):
        t0 = 0.0
        for k, (dur, fn) in enumerate(scenes):
            tl = dur * 0.9; im = background(t0 + tl); fn(im, t0 + tl, tl); chrome(im, t0 + tl, total); im.save(f"{base}_prev{k}.jpg", quality=85); t0 += dur
        return
    tmp = base + "_v.mp4"
    p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                          "-c:v", "libx264", "-crf", os.environ.get("REEL_CRF", "23"), "-preset", "veryfast", "-pix_fmt", "yuv420p", tmp], stdin=subprocess.PIPE)
    t0 = 0.0
    for k, (dur, fn) in enumerate(scenes):
        n = int(round(dur * FPS))
        for i in range(n):
            tl = i / FPS; tg = t0 + tl; im = background(tg)
            zoom = 1 + 0.05 * math.exp(-tl * 5) if k > 0 else 1 + 0.06 * (1 - ease(tl / 0.5))   # Ruck/Zoom beim Szenenwechsel
            fn(im, tg, tl); chrome(im, tg, total)
            if zoom > 1.001:
                zw, zh = int(W * zoom), int(H * zoom); im = im.resize((zw, zh), Image.BILINEAR).crop(((zw - W) // 2, (zh - H) // 2, (zw - W) // 2 + W, (zh - H) // 2 + H))
            fade = min(1.0, (dur - tl) / 0.12)
            if fade < 1: im = Image.blend(Image.new("RGB", (W, H), BG), im, max(0, fade))
            p.stdin.write(im.tobytes())
        t0 += dur
    p.stdin.close(); assert p.wait() == 0
    music = os.environ.get("REEL_MUSIC"); fin = base + ".tmp.mp4"
    if music and os.path.exists(music):
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-stream_loop", "-1", "-i", music, "-filter_complex",
                        f"[1:a]atrim=0:{total},asetpts=N/SR/TB,afade=t=in:d=0.3,afade=t=out:st={max(0, total - 1.2)}:d=1.2,volume=0.8[a]",
                        "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", fin], check=True)
    else:
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-c:v", "copy", "-c:a", "aac", "-shortest", "-movflags", "+faststart", fin], check=True)
    os.replace(fin, out); os.remove(tmp)

if __name__ == "__main__":
    spec = json.load(open(sys.argv[1], encoding="utf-8")); out = sys.argv[2]
    scenes = [(float(s.get("dur", 3)), BUILD[s["type"]](s)) for s in spec["scenes"]]
    if spec["scenes"][-1]["type"] != "cta": scenes.append((2.6, s_cta({})))
    total = sum(d for d, _ in scenes)
    here = os.path.dirname(os.path.abspath(__file__)); import glob, subprocess as sp
    choice = spec.get("music", "auto"); rnd = random.Random(abs(hash(out)) % 10000); track = None
    own = sorted(glob.glob(os.path.join(here, "..", "music", "*.mp3")) + glob.glob(os.path.join(here, "..", "music", "*.wav")) + glob.glob(os.path.join(here, "..", "music", "*.m4a")))
    if choice not in ("none", "") and not os.environ.get("PREVIEW"):
        if choice == "auto": choice = rnd.choice(own) if own and rnd.random() < 0.5 else rnd.choice(["drive", "chill", "lofi"])
        if choice in ("drive", "chill", "lofi"):
            track = os.path.splitext(out)[0] + "_music.wav"; sp.run([sys.executable, os.path.join(here, "music.py"), choice, str(total + 1), track, str(rnd.randint(0, 9999))], check=True, capture_output=True)
        else:
            cand = os.path.join(here, "..", "music", os.path.basename(choice)); track = cand if os.path.exists(cand) else None
    if track: os.environ["REEL_MUSIC"] = track
    render(scenes, out, total)
    if track and track.endswith("_music.wav") and os.path.exists(track): os.remove(track)
    print("ok", out, f"{total:.1f}s", "musik:", os.path.basename(str(choice)) if track else "keine")
