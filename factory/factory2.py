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

_LOGO = {}
def logo(width):
    """Wealth-Club-Logo (brand/logo.png, transparent) in gewünschter Breite."""
    if width not in _LOGO:
        p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "brand", "logo.png")
        if not os.path.exists(p): _LOGO[width] = None
        else:
            im = Image.open(p).convert("RGBA"); _LOGO[width] = im.resize((width, int(im.height * width / im.width)), Image.LANCZOS)
    return _LOGO[width]

CHROME = {"logo": True}
def chrome(im, t, total, show_logo=True):
    d = ImageDraw.Draw(im)
    lg = logo(250) if CHROME.get("logo") and show_logo else None
    if lg is not None: im.paste(lg, (int((W - lg.width) / 2), 120), lg)
    elif show_logo:
        f = SB(30); txt = "GOLD  ·  XAUUSD"; w = d.textlength(txt, font=f); x0 = (W - w) / 2 - 26
        d.rounded_rectangle((x0, 150, x0 + w + 52, 204), radius=27, outline=GOLD, width=2)
        d.text((W / 2, 177), txt, font=f, fill=GOLD, anchor="mm")
    d.rectangle((0, 0, W, 8), fill=(30, 34, 44)); d.rectangle((0, 0, int(W * clamp(t / total)), 8), fill=GOLD)
    d.text((W / 2, 1585), CHROME.get("footer", "Keine Anlageberatung · Trading birgt Verlustrisiken"), font=font("Inter-Medium.otf", 24), fill=(98, 104, 118), anchor="mm")

def scaled_text(im, cx, cy, s, fnt, fill, scale=1.0, alpha=1.0, glow=False):
    """Text als Ebene rendern, skalieren (Pop-Effekt), optional mit Leuchten."""
    if alpha <= 0 or scale <= 0.01: return
    d0 = ImageDraw.Draw(Image.new("RGB", (1, 1))); bb = d0.textbbox((0, 0), s, font=fnt)
    asc, desc = fnt.getmetrics()   # einheitliche Höhe je Schrift -> alle Wörter auf derselben Grundlinie (nicht krumm)
    w, h = bb[2] - bb[0] + 40, asc + desc + 40
    lay = Image.new("RGBA", (w, h), (0, 0, 0, 0)); ImageDraw.Draw(lay).text((20 - bb[0], 20), s, font=fnt, fill=fill + (255,))
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
        p = clamp((tl - 0.3) / 0.3); sub = sc.get("sub", "Gold-Ideen live auf Telegram"); text(im, (W / 2, 900), sub, H1(fit(sub, 960, 66, 44, 1)), WHITE, p, dy=int(30 * (1 - p)))
        q = back(clamp((tl - 0.6) / 0.35)); s = q * (1 + 0.04 * math.sin(tl * 7) * (tl > 1))
        if q > 0:
            bw, bh = 640 * s, 130 * s; rrect(im, (W / 2 - bw / 2, 1110 - bh / 2, W / 2 + bw / 2, 1110 + bh / 2), GOLD, 1, r=int(65 * s))
            scaled_text(im, W / 2, 1110, sc.get("button", "Link in Bio"), H1(fit(sc.get("button", "Link in Bio"), 560, 60, 40, 1)), BG, s)
        text(im, (W / 2, 1290), "Keine Anlageberatung. Trading birgt Verlustrisiken.", font("Inter-Medium.otf", 30), MUTED, clamp((tl - 0.9) / 0.3))
    return draw

# ---------- Neue Bausteine (v2.1): Logo, Kerzen-Chart mit Markierungen, Benachrichtigungen ----------
def rich_title(im, s, cy, tl, maxw=940, start=64, mn=40, lines=2, delay=0.0):
    """Titel mit *Hervorhebung* (gold), Wörter ploppen schnell nacheinander auf. Gibt untere Kante zurück."""
    plain = s.replace("*", ""); fnt = H1(fit(plain, maxw, start, mn, lines)); hl, on = set(), False
    for k, w in enumerate(s.split()):
        if w.startswith("*"): on = True
        if on: hl.add(k)
        if w.endswith("*") or w.endswith("*,") or w.endswith("*.") or w.endswith("*?"): on = False
    ws = word_layout(plain, fnt, maxw, cy, 1.15)
    for k, (w, x, y) in enumerate(ws):
        p = (tl - delay - k * 0.05) / 0.22
        if p > 0: scaled_text(im, x, y, w, fnt, GOLD if k in hl else WHITE, 0.85 + 0.15 * back(p), clamp(p * 2))
    return ws[-1][2] + fnt.size * 0.7 if ws else cy

def step_pill(im, s, cy, a):
    if not s or a <= 0: return
    d = ImageDraw.Draw(Image.new("RGB", (1, 1))); f = SB(30); w = d.textlength(s, font=f)
    rrect(im, (W / 2 - w / 2 - 26, cy - 26, W / 2 + w / 2 + 26, cy + 26), (52, 40, 16), a, r=26, outline=GOLD, width=2)
    text(im, (W / 2, cy), s, f, GOLD, a)

def tag(im, x, y, s, c, a, side="right"):
    """Preis-Etikett (z. B. ENTRY, SL, BUY) – Pille an Position x/y."""
    if a <= 0: return
    f = font("Inter-Bold.otf", 26); w = ImageDraw.Draw(im).textlength(s, font=f); x0 = x + 16 if side == "right" else x - w - 52
    x0 = min(max(x0, 70), 1010 - w - 36)
    rrect(im, (x0, y - 22, x0 + w + 36, y + 22), c, a, r=22); text(im, (x0 + 18 + w / 2, y), s, f, BG if c != RED else WHITE, a)

def stamp(im, cx, cy, s, a, scale):
    """Schräger Stempel (z. B. AUSGESTOPPT)."""
    if a <= 0 or scale <= 0.05: return
    f = H1(58); d0 = ImageDraw.Draw(Image.new("RGB", (1, 1))); w = d0.textlength(s, font=f)
    lay = Image.new("RGBA", (int(w + 80), 130), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    d.rounded_rectangle((6, 6, w + 74, 124), radius=22, outline=RED + (255,), width=7, fill=(40, 10, 12, 200))
    d.text(((w + 80) / 2, 65), s, font=f, fill=RED + (255,), anchor="mm")
    lay = lay.rotate(8, expand=True, resample=Image.BICUBIC)
    lay = lay.resize((max(1, int(lay.width * scale)), max(1, int(lay.height * scale))), Image.BICUBIC)
    if a < 1: lay.putalpha(lay.getchannel("A").point(lambda v: int(v * a)))
    im.paste(lay, (int(cx - lay.width / 2), int(cy - lay.height / 2)), lay)

def make_pattern(kind, seed=7):
    """Beispiel-Muster für Lern-Reels (immer als „Beispielhafte Darstellung“ kennzeichnen).
    sweep: Range mit gleichen Tiefs -> Stop-Sweep darunter -> Umkehr nach oben.
    stopped: Long, Stop knapp unter Tief wird abgeholt -> danach läuft der Preis hoch."""
    r = random.Random(seed); cs = []; p = 100.0
    def bar(o, c, wick=0.6):
        h = max(o, c) + r.uniform(0.1, wick); l = min(o, c) - r.uniform(0.1, wick); cs.append([o, h, l, c]); return c
    if kind == "stopped":
        for _ in range(12): p = bar(p, p + r.uniform(0.2, 1.4))
        top = p
        for _ in range(4): p = bar(p, p - r.uniform(0.9, 1.6))
        low = min(c[2] for c in cs[-4:]); entry = cs[-1][3]
        p = bar(p, p - 0.6, 0.3); cs[-1][2] = low - 1.6; sl_i = len(cs) - 1
        for _ in range(7): p = bar(p, p + r.uniform(1.2, 2.4))
        return cs, {"entry": entry, "sl": low - 0.9, "sl_i": sl_i, "entry_i": sl_i - 2}
    # sweep
    for _ in range(7): p = bar(p, p - r.uniform(0.8, 1.8))
    low = min(c[2] for c in cs) ; lows = []
    for k in range(3):
        for _ in range(3): p = bar(p, p + r.uniform(0.6, 1.4))
        for _ in range(3): p = bar(p, p - r.uniform(0.6, 1.4))
        cs[-1][2] = low + r.uniform(0.0, 0.25); lows.append(len(cs) - 1); p = cs[-1][3] = max(cs[-1][3], cs[-1][2] + 0.4)
    p = bar(p, p - 0.4, 0.2); cs[-1][2] = low - 2.4; sweep_i = len(cs) - 1; cs[-1][3] = low + 0.6
    p = cs[-1][3]
    for _ in range(9): p = bar(p, p + r.uniform(1.0, 2.2))
    return cs, {"low": low, "sweep_i": sweep_i, "lows": lows, "entry_i": sweep_i + 1, "entry": cs[sweep_i + 1][3], "sl": low - 2.9}

def make_pattern2(kind, seed=7):
    """Weitere Lern-Muster -> (Kerzen, Deko{levels,tags,zone,lines}). Immer „Beispielhafte Darstellung“."""
    r = random.Random(seed); cs = []; p = [100.0]
    def bar(o, c, wick=0.5):
        h = max(o, c) + r.uniform(0.1, wick); l = min(o, c) - r.uniform(0.1, wick); cs.append([o, h, l, c]); p[0] = c; return c
    up = lambda n, a=0.6, b=1.4: [bar(p[0], p[0] + r.uniform(a, b)) for _ in range(n)]
    dn = lambda n, a=0.6, b=1.4: [bar(p[0], p[0] - r.uniform(a, b)) for _ in range(n)]
    D = {"levels": [], "tags": [], "zone": None, "lines": []}
    if kind == "fvg":                       # Impuls mit Lücke, Rücklauf in die Lücke, Fortsetzung
        up(5, 0.2, 0.8); i1 = len(cs) - 1
        bar(p[0], p[0] + 4.5, 0.2); bar(p[0], p[0] + 1.2, 0.3); i3 = len(cs) - 1
        top_gap, bot_gap = cs[i3][2], cs[i1][1]
        up(2, 0.3, 0.9); dn(4, 0.6, 1.2); cs[-1][2] = (top_gap + bot_gap) / 2; ri = len(cs) - 1
        up(7, 0.9, 1.8)
        D["zone"] = {"from": bot_gap, "to": top_gap, "text": ""}
        D["tags"] = [{"i": i1 + 1, "price": top_gap + 0.3, "text": "FAIR VALUE GAP", "color": "gold"}, {"i": ri, "price": cs[ri][2], "text": "RÜCKLAUF", "color": "white"}]
    elif kind == "orderblock":              # letzte rote Kerze vor dem Impuls = Order Block
        dn(5, 0.4, 1.0); ob = len(cs); bar(p[0], p[0] - 1.0, 0.3)
        up(4, 1.6, 2.6); dn(4, 0.6, 1.1); cs[-1][2] = cs[ob][1] - 0.2; ri = len(cs) - 1; up(6, 1.0, 1.9)
        D["zone"] = {"from": cs[ob][2], "to": cs[ob][1], "text": ""}
        D["tags"] = [{"i": ob, "price": cs[ob][2], "text": "ORDER BLOCK", "color": "gold"}, {"i": ri, "price": cs[ri][2], "text": "REAKTION", "color": "gold"}]
    elif kind in ("bos", "choch"):          # Abwärtstrend (LH/LL) -> Bruch des letzten tieferen Hochs
        dn(3); lh1 = len(cs); up(2, 0.4, 0.9); h1 = cs[-1][1]; dn(4); ll1 = len(cs) - 1
        up(2, 0.4, 0.9); lh2 = len(cs) - 1; h2 = cs[-1][1]; dn(3); ll2 = len(cs) - 1
        up(5, 0.9, 1.6); bi = len(cs) - 1; up(3, 0.3, 1.0)
        D["tags"] = [{"i": lh2, "price": h2, "text": "LH", "color": "white"}, {"i": ll1, "price": cs[ll1][2], "text": "LL", "color": "white"},
                     {"i": ll2, "price": cs[ll2][2], "text": "LL", "color": "white"}, {"i": bi, "price": cs[bi][1], "text": "CHoCH – TRENDWECHSEL" if kind == "choch" else "BREAK OF STRUCTURE", "color": "gold"}]
        D["levels"] = [{"price": h2, "text": "", "color": "gold", "from_i": lh2}]
    elif kind == "trendline":               # Aufwärtstrend, 3 Berührungen, dann Bruch
        lows = []
        for k in range(3):
            up(3, 0.8, 1.5); dn(2, 0.5, 0.9); lows.append(len(cs) - 1)
        base = cs[lows[0]][2]; slope = (cs[lows[2]][2] - base) / (lows[2] - lows[0])
        for j, li in enumerate(lows[1:]): cs[li][2] = base + slope * (li - lows[0]) + 0.05
        up(2, 0.5, 1.0); dn(5, 0.9, 1.6); bi = len(cs) - 1
        D["lines"] = [{"i0": lows[0], "p0": base, "i1": bi, "p1": base + slope * (bi - lows[0]), "color": "gold", "text": "TRENDLINIE"}]
        D["tags"] = [{"i": li, "price": cs[li][2], "text": str(k + 1), "color": "white"} for k, li in enumerate(lows)] + [{"i": bi, "price": cs[bi][2], "text": "BRUCH", "color": "red"}]
    elif kind == "sr":                      # Seitwärts zwischen Unterstützung und Widerstand
        lo, hi = 100.0, 106.0
        for k in range(3):
            while p[0] < hi - 1: bar(p[0], min(hi - 0.3, p[0] + r.uniform(0.8, 1.6)))
            cs[-1][1] = hi + r.uniform(0, 0.3)
            while p[0] > lo + 1: bar(p[0], max(lo + 0.3, p[0] - r.uniform(0.8, 1.6)))
            cs[-1][2] = lo - r.uniform(0, 0.3)
        D["levels"] = [{"price": hi, "text": "WIDERSTAND", "color": "red"}, {"price": lo, "text": "UNTERSTÜTZUNG", "color": "green"}]
    elif kind == "fib":                     # Impuls hoch, Rücksetzer bis 61,8 %, weiter
        a0 = p[0]; up(8, 1.0, 1.8); b0 = max(c[1] for c in cs)
        f618 = b0 - (b0 - a0) * 0.618; f50 = b0 - (b0 - a0) * 0.5; f382 = b0 - (b0 - a0) * 0.382
        while p[0] > f618 + 0.6: bar(p[0], p[0] - r.uniform(0.7, 1.3))
        cs[-1][2] = f618 - 0.2; ri = len(cs) - 1; up(6, 1.0, 1.8)
        D["levels"] = [{"price": f382, "text": "38,2 %", "color": "white"}, {"price": f50, "text": "50 %", "color": "white"}, {"price": f618, "text": "61,8 %", "color": "gold"}]
        D["tags"] = [{"i": ri, "price": cs[ri][2], "text": "REAKTION", "color": "gold"}]
    elif kind == "fakeout":                 # Ausbruch über Widerstand nur mit Docht, dann runter
        hi = 104.0
        for k in range(2):
            while p[0] < hi - 0.8: bar(p[0], min(hi - 0.2, p[0] + r.uniform(0.6, 1.3)))
            dn(3, 0.6, 1.2)
        while p[0] < hi - 0.6: bar(p[0], p[0] + r.uniform(0.6, 1.2))
        bar(p[0], hi - 0.3, 0.2); cs[-1][1] = hi + 2.2; fi = len(cs) - 1; dn(6, 0.8, 1.5)
        D["levels"] = [{"price": hi, "text": "WIDERSTAND", "color": "red"}]
        D["tags"] = [{"i": fi, "price": cs[fi][1], "text": "NUR DOCHT – FAKEOUT", "color": "red"}]
    else:
        return None, None
    return cs, D

def s_candles(sc):
    if sc.get("pattern") and sc["pattern"] not in ("sweep", "stopped"):
        cs, D = make_pattern2(sc["pattern"], sc.get("seed", 7))
        sc = dict(sc); sc["candles"] = cs
        for k in ("levels", "tags", "zone", "lines"): sc.setdefault(k, D[k])
        sc.setdefault("footer", "Beispielhafte Darstellung"); sc.pop("pattern")
    if sc.get("pattern"):
        cs, info = make_pattern(sc["pattern"], sc.get("seed", 7))
        lv, tags, zone, stp = [], [], None, None
        ann = sc.get("show", ["level", "zone", "sweep", "entry"])
        if sc["pattern"] == "sweep":
            if "level" in ann: lv.append({"price": info["low"], "text": "OFFENSICHTLICHES TIEF", "color": "white"})
            if "zone" in ann: zone = {"from": info["low"] - 1.6, "to": info["low"], "text": "LIQUIDITÄT"}
            if "sweep" in ann: tags.append({"i": info["sweep_i"], "price": cs[info["sweep_i"]][2], "text": "SWEEP", "color": "gold"})
            if "entry" in ann:
                tags.append({"i": info["entry_i"], "price": info["entry"], "text": "ENTRY", "color": "white"})
                tags.append({"i": info["entry_i"], "price": info["sl"], "text": "SL UNTER DEM DOCHT", "color": "red"})
        else:
            tags = [{"i": info["entry_i"], "price": info["entry"], "text": "BUY", "color": "white"}, {"i": info["entry_i"], "price": info["sl"], "text": "STOP LOSS", "color": "red"}]
            lv.append({"price": info["sl"], "text": "", "color": "red", "from_i": info["entry_i"]})
            if "stamp" in ann or True: stp = {"i": info["sl_i"], "text": "AUSGESTOPPT"}
        sc = dict(sc); sc.setdefault("levels", lv); sc.setdefault("tags", tags); sc.setdefault("zone", zone); sc.setdefault("stamp", stp)
        sc.setdefault("footer", "Beispielhafte Darstellung")
    else:
        cs = sc["candles"]
    n = len(cs); lo = min(c[2] for c in cs); hi = max(c[1] for c in cs)
    for v in [l["price"] for l in sc.get("levels") or []] + [t["price"] for t in sc.get("tags") or []]: lo, hi = min(lo, v), max(hi, v)
    pad = (hi - lo) * 0.1 or 1; lo -= pad; hi += pad
    X0, X1, Y0, Y1 = 90, 960, 640 if sc.get("title") else 520, 1330
    py = lambda v: Y1 - (v - lo) / (hi - lo) * (Y1 - Y0); cw = (X1 - X0) / n; cx = lambda i: X0 + cw * i + cw / 2
    reveal = sc.get("reveal", float(sc.get("dur", 5)) * 0.55)
    def draw(im, t, tl):
        if sc.get("step"): step_pill(im, sc["step"], 360, clamp(tl / 0.2))
        if sc.get("title"): rich_title(im, sc["title"], 470, tl, 940, 60, 40, 2)
        d = ImageDraw.Draw(im); k = clamp(tl / reveal) * n; full = int(k)
        z = sc.get("zone")
        if z:
            a = clamp((tl - reveal * 0.6) / 0.4)
            if a > 0:
                y1, y2 = py(z["to"]), py(z["from"]); layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
                ImageDraw.Draw(layer).rectangle((X0, y1, X1, y2), fill=GOLD + (int(55 * a),)); im.paste(layer, (0, 0), layer)
                if z.get("text"): tag(im, (X0 + X1) / 2 - 60, (y1 + y2) / 2 + 28, z["text"], GOLD, a)
        for lv in sc.get("levels") or []:
            a = clamp((tl - reveal * 0.45) / 0.35)
            if a <= 0: continue
            c = col(lv.get("color"), "white"); x0 = cx(lv.get("from_i", 0)) - cw / 2
            for x in range(int(x0), int(X1), 24): d.line((x, py(lv["price"]), x + 12, py(lv["price"])), fill=tuple(int(BG[j] + (c[j] - BG[j]) * a) for j in range(3)), width=3)
            if lv.get("text"): text(im, (x0 + 4, py(lv["price"]) + 26), lv["text"], font("Inter-Bold.otf", 22), c, a, anchor="lm")
        for ln in sc.get("lines") or []:
            a = clamp((k - ln["i1"]) / 1.5 + 0.6)
            if a > 0:
                c = col(ln.get("color"), "gold"); x0, y0 = cx(ln["i0"]), py(ln["p0"]); x1, y1 = cx(ln["i1"]), py(ln["p1"])
                x1 = x0 + (x1 - x0) * min(1, a); y1 = y0 + (y1 - y0) * min(1, a)
                d.line((x0, y0, x1, y1), fill=c, width=5)
                if ln.get("text") and a >= 1: text(im, ((x0 + x1) / 2, (y0 + y1) / 2 + 36), ln["text"], font("Inter-Bold.otf", 24), c, 1)
        for i in range(min(n, full + 1)):
            o, h, l, c = cs[i]
            if i == full:
                f = k - full
                if f <= 0: break
                c = o + (c - o) * f; h = max(o, c, o + (h - o) * min(1, f * 1.6)); l = min(o, c, o + (l - o) * min(1, f * 1.6))
            x = cx(i); cc = GREEN if c >= o else RED
            d.line((x, py(h), x, py(l)), fill=cc, width=max(2, int(cw * 0.1)))
            top, bot = py(max(o, c)), py(min(o, c)); d.rectangle((x - cw * 0.3, top, x + cw * 0.3, max(bot, top + 3)), fill=cc)
        for tg in sc.get("tags") or []:
            a = clamp((k - tg["i"] - 1) / 0.8) if tg["i"] < n else 0
            tag(im, cx(tg["i"]), py(tg["price"]), tg["text"], col(tg.get("color"), "white"), back(a) if a < 1 else 1)
        stp = sc.get("stamp")
        if stp:
            a = clamp((k - stp["i"] - 2) / 1.0)
            if a > 0: stamp(im, W / 2 + 150, py(cs[stp["i"]][2]) + 120, stp["text"], clamp(a * 2), 1.4 - 0.4 * back(a))
        if sc.get("caption"):
            p = clamp((tl - reveal - 0.2) / 0.3); cap = sc["caption"].replace("*", "")
            para_y = 1400; fnt = SB(40)
            for j, ln in enumerate(wrap_words(cap.split(), fnt, 900)): text(im, (W / 2, para_y + j * 52), " ".join(ln), fnt, WHITE, p, dy=int(20 * (1 - p)))
        if sc.get("footer"): text(im, (W / 2, 1530), sc["footer"], SB(24), MUTED, clamp(tl / 0.4))
    return draw

def s_notify(sc):
    items = sc["items"][:4]
    def draw(im, t, tl):
        if sc.get("title"): rich_title(im, sc["title"], 430, tl, 940, 66, 44, 2)
        av = logo(70)
        for i, it in enumerate(items):
            q = back(clamp((tl - 0.5 - i * 0.6) / 0.35)); y = 600 + i * 190
            if q <= 0: continue
            shake = 6 * math.sin(tl * 60) * max(0, 1 - (tl - 0.5 - i * 0.6) / 0.25) if q >= 0.9 else 0
            dy = (1 - q) * -120; x0 = 90 + shake
            rrect(im, (x0, y + dy, x0 + 900, y + 160 + dy), (26, 30, 42), clamp(q), r=34, outline=(48, 54, 70))
            rrect(im, (x0 + 26, y + 30 + dy, x0 + 126, y + 130 + dy), (8, 9, 12), clamp(q), r=22)
            if av is not None and q > 0.5:
                sm = av.resize((92, int(av.height * 92 / av.width))); im.paste(sm, (int(x0 + 30), int(y + 80 + dy - sm.height / 2)), sm)
            text(im, (x0 + 150, y + 55 + dy), it.get("app", "Wealth Club"), font("Inter-Bold.otf", 32), WHITE, clamp(q), anchor="lm")
            text(im, (x0 + 870, y + 55 + dy), it.get("time", "jetzt"), SB(26), MUTED, clamp(q), anchor="rm")
            dot = col(it.get("color"), "green"); d = ImageDraw.Draw(im)
            if q > 0.5: d.ellipse((x0 + 150, y + 103 + dy, x0 + 166, y + 119 + dy), fill=dot)
            text(im, (x0 + 180, y + 111 + dy), it["text"], SB(32), (210, 214, 222), clamp(q), anchor="lm")
    return draw

def s_logo(sc):
    """Logo-Intro/-Outro: Logo zoomt sanft rein, Glanz läuft drüber."""
    big = logo(860)
    def draw(im, t, tl):
        if big is None: return
        p = back(clamp(tl / 0.6)); s = 0.85 + 0.15 * p + 0.02 * tl
        lg = big.resize((max(1, int(big.width * s)), max(1, int(big.height * s))), Image.LANCZOS)
        if p < 1: lg.putalpha(lg.getchannel("A").point(lambda v: int(v * clamp(p))))
        sx = (tl - 0.5) / 0.9
        if 0 < sx < 1:   # Glanzstreifen
            sh = Image.new("L", lg.size, 0); dd = ImageDraw.Draw(sh); x = int(-200 + (lg.width + 400) * sx)
            dd.polygon([(x, 0), (x + 90, 0), (x - 60, lg.height), (x - 150, lg.height)], fill=150)
            sh = sh.filter(ImageFilter.GaussianBlur(18))
            white = Image.new("RGBA", lg.size, (255, 255, 255, 0)); white.putalpha(Image.composite(sh, Image.new("L", lg.size, 0), lg.getchannel("A")))
            lg = Image.alpha_composite(lg, white)
        im.paste(lg, (int((W - lg.width) / 2), int(820 - lg.height / 2)), lg)
        if sc.get("sub"): p2 = clamp((tl - 0.9) / 0.3); text(im, (W / 2, 1120), sc["sub"], SB(44), MUTED, p2, dy=int(20 * (1 - p2)))
    draw.no_logo = True
    return draw

BUILD = {"hook": s_hook, "counter": s_counter, "line": s_line, "cards": s_cards, "words": s_words, "cta": s_cta,
         "candles": s_candles, "notify": s_notify, "logo": s_logo}

def render(scenes, out, total):
    import subprocess
    base = os.path.splitext(out)[0]
    if os.environ.get("PREVIEW"):
        t0 = 0.0
        for k, (dur, fn) in enumerate(scenes):
            tl = dur * 0.9; im = background(t0 + tl); fn(im, t0 + tl, tl); chrome(im, t0 + tl, total, not getattr(fn, 'no_logo', False)); im.save(f"{base}_prev{k}.jpg", quality=85); t0 += dur
        return
    tmp = base + "_v.mp4"
    p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                          "-c:v", "libx264", "-crf", os.environ.get("REEL_CRF", "20"), "-preset", "fast", "-pix_fmt", "yuv420p", tmp], stdin=subprocess.PIPE)
    t0 = 0.0
    for k, (dur, fn) in enumerate(scenes):
        n = int(round(dur * FPS))
        for i in range(n):
            tl = i / FPS; tg = t0 + tl; im = background(tg)
            zoom = 1 + 0.03 * math.exp(-tl * 6) if k > 0 else 1 + 0.04 * (1 - ease(tl / 0.5))   # sanfter Zoom beim Szenenwechsel
            fn(im, tg, tl); chrome(im, tg, total, not getattr(fn, 'no_logo', False))
            if zoom > 1.0005:   # Subpixel-genau (kein Wackeln der Schrift durch Rundung auf ganze Pixel)
                cw, ch = W / zoom, H / zoom; x0, y0 = (W - cw) / 2, (H - ch) / 2
                im = im.resize((W, H), Image.BICUBIC, box=(x0, y0, x0 + cw, y0 + ch))
            fade = min(1.0, (dur - tl) / 0.12)
            if fade < 1: im = Image.blend(Image.new("RGB", (W, H), BG), im, max(0, fade))
            p.stdin.write(im.tobytes())
        t0 += dur
    p.stdin.close(); assert p.wait() == 0
    music = os.environ.get("REEL_MUSIC"); fin = base + ".tmp.mp4"
    voice = os.environ.get("REEL_VOICE")
    if voice and os.path.exists(voice):
        mus = ["-stream_loop", "-1", "-i", music] if music and os.path.exists(music) else ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"]
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-i", voice] + mus + ["-filter_complex",
                        f"[2:a]atrim=0:{total},asetpts=N/SR/TB,afade=t=out:st={max(0, total - 1.2)}:d=1.2,volume=0.2[m];[1:a]atrim=0:{total},volume=1.0[v];[m][v]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95[a]",
                        "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-t", str(total), "-movflags", "+faststart", fin], check=True)
        os.remove(voice)
    elif music and os.path.exists(music):
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-stream_loop", "-1", "-i", music, "-filter_complex",
                        f"[1:a]atrim=0:{total},asetpts=N/SR/TB,afade=t=in:d=0.3,afade=t=out:st={max(0, total - 1.2)}:d=1.2,volume=0.8[a]",
                        "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", fin], check=True)
    else:
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-c:v", "copy", "-c:a", "aac", "-shortest", "-movflags", "+faststart", fin], check=True)
    os.replace(fin, out); os.remove(tmp)

# Zentrale Schalter (factory/settings.json), z. B. {"voice": false} = Reels ohne Sprecherstimme
try: SETTINGS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "settings.json"), encoding="utf-8"))
except Exception: SETTINGS = {}

if __name__ == "__main__":
    spec = json.load(open(sys.argv[1], encoding="utf-8")); out = sys.argv[2]
    here = os.path.dirname(os.path.abspath(__file__))
    # Erzählerstimme: Szenen mit "say" bekommen Sprache (Piper/Thorsten), Szenendauer passt sich an
    voice = None
    if any(s.get("say") for s in spec["scenes"]) and not os.environ.get("PREVIEW") and spec.get("voice", SETTINGS.get("voice", True)):
        try:
            import numpy as np
            from scipy.signal import resample_poly
            os.environ.setdefault("TTS_DIR", os.path.join(here, "..", "tts")); sys.path.insert(0, os.environ["TTS_DIR"]); import piper_tts as P
            clips = []
            for sc in spec["scenes"]:
                if sc.get("say"):
                    w, sr = P.synth(sc["say"], length_scale=float(spec.get("voice_speed", 1.08)), pause=0.3)
                    w = resample_poly(w, 44100, sr); clips.append(w)
                    sc["dur"] = round(max(float(sc.get("dur", 3)), len(w) / 44100 + 1.0), 2)
                else: clips.append(None)
            tot = sum(float(sc.get("dur", 3)) for sc in spec["scenes"]) + (0 if spec["scenes"][-1]["type"] == "cta" else 2.6)
            buf = np.zeros(int((tot + 1) * 44100)); t0 = 0.0
            for sc, c in zip(spec["scenes"], clips):
                if c is not None: i = int((t0 + 0.15) * 44100); buf[i:i + len(c)] += c[: len(buf) - i]
                t0 += float(sc.get("dur", 3))
            buf = buf / (np.max(np.abs(buf)) + 1e-9) * 0.95
            from scipy.io import wavfile
            voice = os.path.splitext(out)[0] + "_voice.wav"; wavfile.write(voice, 44100, (buf * 32767).astype(np.int16))
        except Exception as e:
            print("Stimme nicht verfügbar:", e); voice = None
    if voice: os.environ["REEL_VOICE"] = voice
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
