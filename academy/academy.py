"""Academy-Videos v2: lange YouTube-Erklärvideos (16:9) + Hochformat-Clips je Kapitel (9:16).

python3 academy.py specs/ac01_setup.json out/ac01 [all|long|short|thumb|preview]
-> out/ac01.mp4, _thumb.jpg, .vtt, _desc.txt, _meta.json, _k1.mp4 … (Hochformat je Kapitel)

Design (nach Vorbild „Smart Money Circle“): links Chart, rechts Checkliste/Schritte, Karaoke-Untertitel,
Pills mit Pop-&-Glow, aufziehende Zonen, sich zeichnende Linien und Bogenpfeile, Agenda-, „Merke dir“- und
Zusammenfassungs-Szenen, Kapitel-Einblender mit Lichtkante, Fortschrittsbalken mit Kapitel-Abschnitten.
Kapiteltypen: intro | chart | remember | summary | outro. Stimme: George (tts/voice.py). Nie „Signal“ (wording).
"""
import hashlib, json, math, os, re, subprocess, sys, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "factory")); sys.path.insert(0, os.path.join(HERE, "..", "tts"))
from lib import font   # noqa: E402
import wording   # noqa: E402

FPS = 25
GOLD = (232, 181, 74); GOLD2 = (255, 214, 120); WHITE = (245, 244, 240); GREY = (128, 128, 136)
BG = (10, 10, 12); PANEL = (17, 17, 21); EDGE = (44, 42, 38); GRID = (30, 30, 36)
GREEN = (52, 199, 123); RED = (229, 83, 75)
COL = {"gold": GOLD, "red": RED, "green": GREEN, "blue": (90, 160, 255), "white": WHITE}
CLIPS = json.load(open(os.path.join(HERE, "clips.json")))
LBL = CLIPS["LABELS"]["de"]
# Bildschirmtexte je Sprache (spec "lang": de | en | pl | fr) – für die Partner-Fassungen
UI = {
 "de": dict(kap="KAPITEL", learn="Das lernst du heute", disc=["Bildungsinhalt – *keine Anlageberatung*.", "Trading birgt Verlustrisiken.", "Neue Strategien zuerst im *Demokonto* üben."],
            grp="Kostenlose *Gold-Gruppe*", perks=["Täglich *Trade-Ideen* auf Gold", "Jeden Morgen das *Gold-Briefing*", "*Bootcamp* mit 55 Lektionen"], link="Link in der Beschreibung  →",
            rem="Merke dir", whole="Das ganze Video:", yt="auf YouTube – Link in Bio", intro="Einleitung", chap="Kapitel", dgrp="🔗 Kostenlose Gold-Gruppe auf Telegram (Trade-Ideen, Gold-Briefing, Bootcamp mit 55 Lektionen):",
            ddisc="⚠️ Bildungsinhalt, keine Anlageberatung. Trading birgt Verlustrisiken."),
 "en": dict(kap="CHAPTER", learn="What you'll learn today", disc=["Educational content – *not investment advice*.", "Trading involves risk of loss.", "Practise new strategies on a *demo account* first."],
            grp="Free *Gold Group*", perks=["Daily *trade ideas* on gold", "*Gold briefing* every morning", "*Bootcamp* with 55 lessons"], link="Link in the description  →",
            rem="Remember", whole="Full video:", yt="on YouTube – link in bio", intro="Intro", chap="Chapters", dgrp="🔗 Free gold group on Telegram (trade ideas, gold briefing, bootcamp with 55 lessons):",
            ddisc="⚠️ Educational content, not investment advice. Trading involves risk of loss."),
 "pl": dict(kap="ROZDZIAŁ", learn="Czego się dziś nauczysz", disc=["Treści edukacyjne – *nie porada inwestycyjna*.", "Trading wiąże się z ryzykiem strat.", "Nowe strategie najpierw ćwicz na *koncie demo*."],
            grp="Darmowa *grupa o złocie*", perks=["Codziennie *pomysły tradingowe*", "Co rano *briefing złota*", "*Bootcamp* z 55 lekcjami"], link="Link w opisie  →",
            rem="Zapamiętaj", whole="Cały film:", yt="na YouTube – link w bio", intro="Wstęp", chap="Rozdziały", dgrp="🔗 Darmowa grupa o złocie na Telegramie (pomysły tradingowe, briefing złota, bootcamp z 55 lekcjami):",
            ddisc="⚠️ Treści edukacyjne, nie porada inwestycyjna. Trading wiąże się z ryzykiem strat."),
 "fr": dict(kap="CHAPITRE", learn="Ce que tu vas apprendre", disc=["Contenu éducatif – *pas un conseil en investissement*.", "Le trading comporte un risque de perte.", "Teste d'abord les stratégies sur un *compte démo*."],
            grp="*Groupe Or* gratuit", perks=["Des *idées de trading* sur l'or chaque jour", "Le *briefing or* chaque matin", "*Bootcamp* de 55 leçons"], link="Lien dans la description  →",
            rem="À retenir", whole="La vidéo complète :", yt="sur YouTube – lien en bio", intro="Introduction", chap="Chapitres", dgrp="🔗 Groupe or gratuit sur Telegram (idées de trading, briefing or, bootcamp de 55 leçons) :",
            ddisc="⚠️ Contenu éducatif, pas un conseil en investissement. Le trading comporte un risque de perte."),
}
T_ = UI["de"]
LOGO = os.path.join(HERE, "..", "factory", "brand", "logo.png")
GROUP = "https://t.me/+EY-ONXT6pq80OGJi"
VO_DELAY = 0.15


def ease(x): x = max(0.0, min(1.0, x)); return 1 - (1 - x) ** 3
def back(x):   # Überschwinger für „Pop“
    x = max(0.0, min(1.0, x)); c = 1.9; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2
def lab(t): return LBL.get(t, t) if t else ""
from functools import lru_cache
@lru_cache(maxsize=512)
def _F(name, size): return font(name, size)
def F(name, size): return _F(name, max(6, int(size)))
BLACK = "InterDisplay-Black.otf"; BOLD = "Inter-Bold.otf"; SEMI = "Inter-SemiBold.otf"


# ---------------------------------------------------------------- Sprecher (Cache nach Text)
def tts_all(spec, work):
    import voice as V
    os.makedirs(work, exist_ok=True); cpath = os.path.join(work, "vo2.json")
    cache = json.load(open(cpath)) if os.path.exists(cpath) else {}
    for ch in spec["chapters"]:
        for sg in ch["segs"]:
            h = hashlib.sha1(sg["say"].encode()).hexdigest()[:12]; fn = os.path.join(work, f"v_{h}.wav")
            if h in cache and os.path.exists(fn): sg["dur"] = cache[h]; sg["wav"] = fn; continue
            w, sr = V.synth(sg["say"], spec.get("lang", "de"), 1.0, 0.0)
            with wave.open(fn, "wb") as f:
                f.setnchannels(1); f.setsampwidth(2); f.setframerate(sr); f.writeframes((np.clip(w, -1, 1) * 32767).astype("<i2").tobytes())
            sg["dur"] = cache[h] = len(w) / sr; sg["wav"] = fn; json.dump(cache, open(cpath, "w"))
            print("VO", round(sg["dur"], 1), sg["say"][:50], flush=True)


# ---------------------------------------------------------------- Zeitplan
TITLE_CARD = 2.8
PAD = 0.5


def timeline(spec):
    t = 0.0; scenes = []
    for ci, ch in enumerate(spec["chapters"]):
        ch["t0"] = t
        if ch["kind"] in ("chart", "summary", "remember"):
            scenes.append(dict(kind="title", ch=ci, t0=t, t1=t + TITLE_CARD)); t += TITLE_CARD
        ch["c0"] = t
        for sg in ch["segs"]:
            extra = 0.0
            if ch["kind"] == "chart" and sg.get("step", -1) >= 0:
                st = CLIPS["CLIPS"][ch["clip"]]["steps"]; k = sg["step"]; prev = st[k - 1]["to"] if k > 0 else 0
                extra = max(0.0, (st[k]["to"] - prev) * 0.11 + 0.9 - sg["dur"])
            sg["t0"] = t; sg["t1"] = t + sg["dur"] + PAD + extra; t = sg["t1"]
        if ch["kind"] in ("chart", "summary", "remember"): ch["segs"][-1]["t1"] += 1.0; t += 1.0
        scenes.append(dict(kind=ch["kind"], ch=ci, t0=ch["c0"], t1=t)); ch["t1"] = t
    return scenes, t


# ---------------------------------------------------------------- Hilfsmittel
class Canvas:
    def __init__(self, W, H):
        self.W, self.H = W, H; self.v = H > W
        base = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(base)
        step = 72 if not self.v else 80
        for x in range(0, W, step): d.line((x, 0, x, H), fill=(15, 15, 18))
        for y in range(0, H, step): d.line((0, y, W, y), fill=(15, 15, 18))
        vig = Image.new("L", (W, H), 0); ImageDraw.Draw(vig).ellipse((-W * .25, -H * .25, W * 1.25, H * 1.25), fill=255)
        vig = vig.filter(ImageFilter.GaussianBlur(min(W, H) * .18))
        self.base = Image.composite(base, Image.new("RGB", (W, H), (4, 4, 5)), vig)
        g = Image.new("RGB", (W * 2, H * 2), (0, 0, 0)); ImageDraw.Draw(g).ellipse((W * .55, H * .2, W * 1.45, H * 1.2), fill=(70, 52, 18))
        self.glow = g.filter(ImageFilter.GaussianBlur(min(W, H) * .25))
        self.logo = Image.open(LOGO).convert("RGBA") if os.path.exists(LOGO) else None
        self._sprite = {}

    def bg(self, t):
        ox = int(self.W * (.5 + .18 * math.sin(t * .07))); oy = int(self.H * (.62 + .1 * math.cos(t * .05)))
        gl = self.glow.crop((ox, oy, ox + self.W, oy + self.H))
        return Image.fromarray(np.minimum(255, np.asarray(self.base, dtype=np.uint16) + (np.asarray(gl, dtype=np.uint16) * 3 // 4)).astype(np.uint8))

    def glowdot(self, im, cx, cy, r, color, a):
        key = (r, color)
        if key not in self._sprite:
            s = Image.new("RGBA", (r * 4, r * 4), color + (0,)); m = Image.new("L", (r * 4, r * 4), 0)
            ImageDraw.Draw(m).ellipse((r, r, r * 3, r * 3), fill=200); s.putalpha(m.filter(ImageFilter.GaussianBlur(r * .5))); self._sprite[key] = s
        s = self._sprite[key]
        if a < 1: s = s.copy(); s.putalpha(s.getchannel("A").point(lambda v: int(v * a)))
        im.paste(s, (int(cx - r * 2), int(cy - r * 2)), s)

    def logo_at(self, im, cx, cy, w, alpha=1.0):
        if not self.logo or alpha <= 0: return
        lo = self.logo.resize((int(w), int(self.logo.height * w / self.logo.width)), Image.LANCZOS)
        if alpha < 1: lo.putalpha(lo.getchannel("A").point(lambda v: int(v * alpha)))
        im.paste(lo, (int(cx - lo.width / 2), int(cy - lo.height / 2)), lo)


def parts(text): return [(p, i % 2 == 1) for i, p in enumerate(re.split(r"\*", text)) if p]
def rw(d, text, f): return sum(d.textlength(p, font=f) for p, _ in parts(text))


def rich(d, x, y, text, f, a=1.0, anchor="l", base=WHITE, hi=GOLD):
    if anchor == "m": x -= rw(d, text, f) / 2
    for p, g in parts(text):
        d.text((x, y), p, font=f, fill=(hi if g else base) + (int(255 * a),), anchor="ls"); x += d.textlength(p, font=f)


def fitf(d, text, name, size, maxw):
    while size > 18 and rw(d, text, F(name, size)) > maxw: size -= 2
    return F(name, size)


def wrap(d, text, f, maxw):
    out, cur = [], ""
    for w in text.split():
        t = (cur + " " + w).strip()
        if rw(d, t, f) > maxw and cur: out.append(cur); cur = w
        else: cur = t
    if cur: out.append(cur)
    return out


def pill(cv, im, x, y, text, kind="gold", a=1.0, pop=1.0, size=24, anchor="m"):
    """Beschriftung als Pill; kind gold|white|red|green|dark. pop<1 während des Aufploppens."""
    if a <= 0: return
    d = ImageDraw.Draw(im, "RGBA"); f = F(BOLD, size * pop); tw = d.textlength(text, font=f)
    h = size * 1.55 * pop; w = tw + size * 1.1 * pop
    x0 = {"m": x - w / 2, "l": x, "r": x - w}[anchor]; y0 = y - h / 2
    fill, txt = {"gold": (GOLD, (18, 14, 6)), "white": ((236, 236, 232), (18, 18, 20)), "red": (RED, WHITE), "green": (GREEN, (8, 22, 14)),
                 "dark": ((14, 14, 17), GOLD)}[kind]
    d.rounded_rectangle((x0, y0, x0 + w, y0 + h), radius=h / 2, fill=fill + (int(240 * a),), outline=(GOLD + (int(220 * a),)) if kind == "dark" else None, width=2)
    d.text((x0 + w / 2, y0 + h / 2 + 1), text, font=f, fill=txt + (int(255 * a),), anchor="mm")
    return (x0, y0, x0 + w, y0 + h)


def pill_kind(t):
    u = t.upper()
    if u.startswith("SL") or "STOP" in u: return "red"
    if u.startswith("TP") or u.startswith("ENTRY") or "ZIEL" in u: return "green"
    if u in ("HH", "LH"): return "white"
    if u in ("HL", "LL"): return "gold"
    if "BOS" in u or "CHOCH" in u or "SWEEP" in u: return "gold"
    return "dark"


# ---------------------------------------------------------------- Chart
def chart_layers(clip, step):
    steps = clip["steps"]; acc = {"a": [], "l": [], "z": [], "tl": []}; born = {}
    for k in range(0, step + 1):
        for key, v in steps[k]["add"].items():
            for x in v: acc[key].append(x); born[id(x)] = k
    return acc, born


def draw_chart(cv, im, box, ch, seg, t, bpad=40):
    clip = CLIPS["CLIPS"][ch["clip"]]; d = ImageDraw.Draw(im, "RGBA"); x0, y0, x1, y1 = box
    d.rounded_rectangle(box, radius=26, fill=PANEL + (235,), outline=EDGE + (255,), width=2)
    step = seg.get("step", -1) if seg else len(clip["steps"]) - 1
    intro = step < 0; step = max(step, 0)
    # Startzeit je Schritt (für Animation): Segment, das den Schritt zuerst zeigt
    sst = {}
    for sg in ch["segs"]:
        k = sg.get("step", -1)
        if k >= 0 and k not in sst: sst[k] = sg["t0"]
    tt = lambda k: (t - sst.get(k, -99)) if not intro else 99
    c = clip["c"]; allp = [p for k in c for p in k[1:3]]
    for s in clip["steps"]:
        for a in s["add"].get("a", []): allp.append(a[1])
        for z in s["add"].get("z", []): allp += [z[2], z[3]]
        for l in s["add"].get("l", []): allp.append(l[0])
    lo, hi = min(allp), max(allp); pad = (hi - lo) * .12; lo -= pad; hi += pad
    cp, cr = 44, 150 if not cv.v else 40
    n = len(c); cw = (x1 - x0 - cp - cr) / n
    X = lambda i: x0 + cp + cw * (i + .5)
    Y = lambda p: y1 - bpad - (p - lo) / (hi - lo) * (y1 - y0 - 40 - bpad)
    for g in range(6):
        yy = y0 + 40 + g * (y1 - y0 - 40 - bpad) / 5; d.line((x0 + 24, yy, x1 - 24, yy), fill=GRID + (255,), width=1)
    acc, born = chart_layers(clip, step)
    steps = clip["steps"]; to = steps[step]["to"]
    newk = lambda x: born[id(x)]
    def appear(x):   # Sekunden seit Erscheinen dieser Markierung (nach den neuen Kerzen)
        k = newk(x); prev = steps[k - 1]["to"] if k > 0 else 0
        return tt(k) - ((steps[k]["to"] - prev) * .11 + .25)
    fs = 22 if not cv.v else 28
    # Zonen: fahren von links auf
    for z in acc["z"]:
        e = appear(z); g = ease(e / .6)
        if g <= 0: continue
        cc = COL.get(z[5], GOLD); xa = X(z[0]) - cw / 2; xb = min(x1 - 24, X(z[1]) + cw / 2); xb = xa + (xb - xa) * g
        d.rectangle((xa, Y(z[3]), xb, Y(z[2])), fill=cc + (46,)); d.line((xa, Y(z[3]), xb, Y(z[3])), fill=cc + (200,), width=2); d.line((xa, Y(z[2]), xb, Y(z[2])), fill=cc + (200,), width=2)
        if g > .9: pill(cv, im, xb - 12, (Y(z[2]) + Y(z[3])) / 2, lab(z[4]).upper(), "dark", ease((e - .5) / .3), size=fs - 4, anchor="r")
    # Linien: zeichnen sich von links nach rechts
    for l in acc["l"]:
        e = appear(l); g = ease(e / .7)
        if g <= 0: continue
        cc = COL.get(l[2], GOLD); yy = Y(l[0]); xa = x0 + cp; xe = xa + (x1 - 24 - xa) * g; xx = xa
        while xx < xe: d.line((xx, yy, min(xx + 16, xe), yy), fill=cc + (230,), width=3); xx += 26
        if lab(l[1]) and g > .95: pill(cv, im, x1 - 30, yy - 22, lab(l[1]).upper(), "red" if l[2] == "red" else "dark", ease((e - .6) / .3), size=fs - 5, anchor="r")
    for tl in acc["tl"]:
        e = appear(tl); g = ease(e / .7)
        if g > 0: d.line((X(tl[0]), Y(tl[1]), X(tl[0]) + (X(tl[2]) - X(tl[0])) * g, Y(tl[1]) + (Y(tl[3]) - Y(tl[1])) * g), fill=COL.get(tl[5], GOLD) + (255,), width=4)
    # Kerzen: wachsen nacheinander
    prev = steps[step - 1]["to"] if step > 0 else 0
    bw = min(30, cw * .6)
    for i, k in enumerate(c[:to]):
        g = 1.0
        if i >= prev and not intro: g = ease((tt(step) - (i - prev) * .11) / .28)
        if g <= 0: continue
        o, h, lw, cl = k; cc = GREEN if cl >= o else RED; xm = X(i); mid = (Y(o) + Y(cl)) / 2; sy = lambda v: mid + (v - mid) * g
        d.line((xm, sy(Y(h)), xm, sy(Y(lw))), fill=cc + (255,), width=3)
        a_, b_ = sorted((sy(Y(o)), sy(Y(cl)))); d.rounded_rectangle((xm - bw / 2, a_, xm + bw / 2, max(b_, a_ + 3)), radius=3, fill=cc + (255,))
    # Bogenpfeile (erwartete Bewegung)
    for sg in ch["segs"]:
        if not sg.get("arrow") or sg["t0"] > t: continue
        i0, p0, i1, p1 = sg["arrow"]; g = ease((t - sg["t0"] - .3) / 1.0)
        if g <= 0: continue
        ax, ay, bx, by = X(i0), Y(p0), X(i1), Y(p1); mx, my = (ax + bx) / 2, min(ay, by) - abs(bx - ax) * .45
        pts = [((1 - u) ** 2 * ax + 2 * (1 - u) * u * mx + u * u * bx, (1 - u) ** 2 * ay + 2 * (1 - u) * u * my + u * u * by) for u in np.linspace(0, g, 40)]
        for j in range(0, len(pts) - 1, 2): d.line((*pts[j], *pts[j + 1]), fill=WHITE + (230,), width=4)
        if g > .97:
            (px, py), (qx, qy) = pts[-3], pts[-1]; ang = math.atan2(qy - py, qx - px)
            d.polygon([(qx, qy), (qx - 18 * math.cos(ang - .45), qy - 18 * math.sin(ang - .45)), (qx - 18 * math.cos(ang + .45), qy - 18 * math.sin(ang + .45))], fill=WHITE + (240,))
    # Pills mit Pop & Glow (ohne Überlappung, innerhalb des Panels)
    placed = []
    for x in acc["a"]:
        e = appear(x)
        if e <= 0: continue
        i, p, t_ = x; k = c[i] if i < len(c) else None; top = p >= (k[1] + k[2]) / 2 if k else True
        txt = lab(t_); kind = pill_kind(txt); pw = d.textlength(txt, font=F(BOLD, fs)) + fs * 1.1; ph = fs * 1.55
        xx = min(max(X(i), x0 + pw / 2 + 16), x1 - pw / 2 - 16); yy = Y(p) + (-22 if top else 26)
        for _ in range(4):
            hit = next((r for r in placed if abs(r[0] - xx) < (r[2] + pw) / 2 + 4 and abs(r[1] - yy) < ph + 4), None)
            if not hit: break
            yy = hit[1] + (ph + 6) * (1 if not top else -1)
        placed.append((xx, yy, pw))
        if e < .9: cv.glowdot(im, xx, yy, 46, COL["red"] if kind == "red" else COL["green"] if kind == "green" else GOLD, (1 - e / .9) * .9)
        pill(cv, im, xx, yy, txt, kind, ease(e / .2), pop=max(.35, back(e / .45)), size=fs)
    if intro: ImageDraw.Draw(im, "RGBA").rounded_rectangle(box, radius=26, fill=(6, 6, 8, 120))


# ---------------------------------------------------------------- Bausteine
def header(cv, im, num, title, a=1.0):
    d = ImageDraw.Draw(im, "RGBA")
    if not cv.v:
        d.text((80, 78), f"{T_['kap']} {num:02d}", font=F(BOLD, 26), fill=GOLD + (int(255 * a),), anchor="ls")
        rich(d, 80, 140, title, F(BLACK, 54), a)
        cv.logo_at(im, cv.W - 150, 92, 170, .95 * a)
    else:
        cv.logo_at(im, cv.W / 2, 140, 250, a)
        d.text((cv.W / 2, 300), f"{T_['kap']} {num:02d}", font=F(BOLD, 34), fill=GOLD + (int(255 * a),), anchor="ms")
        rich(d, cv.W / 2, 395, title, fitf(d, title, BLACK, 86, cv.W - 100), a, anchor="m")


def check_icon(d, x, y, s, a, on=True):
    d.rounded_rectangle((x, y, x + s, y + s), radius=s * .22, fill=(GOLD if on else (40, 38, 34)) + (int(255 * a),))
    if on: d.line((x + s * .24, y + s * .52, x + s * .43, y + s * .7, x + s * .78, y + s * .3), fill=(20, 16, 8, int(255 * a)), width=max(3, int(s * .12)), joint="curve")


def side_points(cv, im, ch, t, box):
    d = ImageDraw.Draw(im, "RGBA"); x0, y0, x1, y1 = box; items = [s for s in ch["segs"] if s.get("point") and s["t0"] <= t]
    f = F(BOLD, 34 if not cv.v else 38); y = y0 + (60 if not cv.v else 20)
    for s in items:
        e = ease((t - s["t0"] - .2) / .45)
        if e <= 0: continue
        lines = wrap(d, s["point"], f, x1 - x0 - 80); dx = (1 - e) * 40
        check_icon(d, x0 + dx, y - 4, 44, e)
        for j, l in enumerate(lines): rich(d, x0 + 66 + dx, y + 32 + j * 44, l, f, e)
        y += 44 * len(lines) + 46


def side_steps(cv, im, ch, seg, t, box):
    d = ImageDraw.Draw(im, "RGBA"); x0, y0, x1, y1 = box; hl = seg.get("hl", -1) if seg else 3
    f = F(BOLD, 32 if not cv.v else 36); h = 96 if not cv.v else 104
    for i, it in enumerate(ch["side_items"]):
        y = y0 + 20 + i * (h + 22); on = i <= hl; cur = i == hl
        d.rounded_rectangle((x0, y, x1, y + h), radius=22, fill=(26, 22, 14, 240) if cur else (18, 18, 22, 230), outline=(GOLD + (255,)) if cur else (48, 46, 42, 255), width=3 if cur else 2)
        d.ellipse((x0 + 22, y + h / 2 - 24, x0 + 70, y + h / 2 + 24), fill=(GOLD if on else (60, 58, 52)) + (255,))
        if on and not cur: d.line((x0 + 34, y + h / 2 + 2, x0 + 43, y + h / 2 + 11, x0 + 59, y + h / 2 - 9), fill=(20, 16, 8, 255), width=5, joint="curve")
        else: d.text((x0 + 46, y + h / 2 + 2), str(i + 1), font=F(BLACK, 30), fill=(20, 16, 8, 255), anchor="mm")
        rich(d, x0 + 92, y + h / 2 + 12, it, fitf(d, it, BOLD, f.size, x1 - x0 - 110), 1.0 if on else .55)


def karaoke(cv, im, seg, t, box):
    """Untertitel: gesprochene Wörter weiß, kommende grau (Zeit anteilig nach Zeichen)."""
    if not seg: return
    d = ImageDraw.Draw(im, "RGBA"); x0, y0, x1, y1 = box
    words = seg["say"].split(); tot = sum(len(w) + 1 for w in words); dur = seg["dur"]
    f = F(SEMI, 38 if not cv.v else 44); maxw = x1 - x0
    # in Zeilenpaare (max. 2 Zeilen) aufteilen und das aktuelle Paar zeigen
    lines = wrap(d, seg["say"], f, maxw); chunks = [lines[i:i + 2] for i in range(0, len(lines), 2)]
    k = (t - seg["t0"] - VO_DELAY) / max(dur, .1); cut = k * tot
    pos = 0; ci = 0; acc = 0
    for i, c in enumerate(chunks):
        n = sum(len(w) + 1 for l in c for w in l.split())
        if cut < acc + n or i == len(chunks) - 1: ci = i; pos = acc; break
        acc += n
    show = chunks[ci]; a = ease((t - seg["t0"]) / .25)
    lh = f.size * 1.35; yb = y1 - lh * len(show)
    c = pos
    for j, l in enumerate(show):
        x = (x0 + x1) / 2 - d.textlength(l, font=f) / 2
        for w in l.split():
            lit = c < cut; c += len(w) + 1
            d.text((x, yb + lh * (j + .8)), w, font=f, fill=(WHITE if lit else (110, 110, 118)) + (int(255 * a),), anchor="ls"); x += d.textlength(w + " ", font=f)


def progress(cv, im, spec, t):
    if cv.v: return
    d = ImageDraw.Draw(im, "RGBA"); T = spec["_T"]; W, H = cv.W, cv.H
    for ch in spec["chapters"]:
        xa = W * ch["t0"] / T + 3; xb = W * ch["t1"] / T - 3
        d.rectangle((xa, H - 7, xb, H - 2), fill=(50, 48, 44, 255))
        if t > ch["t0"]: d.rectangle((xa, H - 7, xa + (xb - xa) * min(1, (t - ch["t0"]) / (ch["t1"] - ch["t0"])), H - 2), fill=GOLD + (255,))


def title_card(cv, im, ch, num, lt, dur):
    d = ImageDraw.Draw(im, "RGBA"); W, H = cv.W, cv.H
    a = ease(lt / .5) * (1 - ease((lt - dur + .45) / .45))
    d.text((W / 2, H / 2 - 70), f"{T_['kap']} {num:02d}", font=F(BOLD, 40), fill=GOLD + (int(255 * a),), anchor="ms")
    f = fitf(d, ch["title"], BLACK, 120 if not cv.v else 104, W - 140); y = H / 2 + 60 + (1 - ease(lt / .6)) * 40
    rich(d, W / 2, y, ch["title"], f, a, anchor="m")
    g = ease((lt - .3) / .8); wl = 260 * g
    d.line((W / 2 - wl / 2, y + 48, W / 2 + wl / 2, y + 48), fill=GOLD + (int(255 * a),), width=5)
    # Lichtkante, die über den Titel streicht
    cv.glowdot(im, W / 2, y + 48, 70, GOLD, .5 * a)


def agenda(cv, im, items, t0, t, cy):
    d = ImageDraw.Draw(im, "RGBA"); W = cv.W; bw = 760 if not cv.v else 900; h = 92
    d.text((W / 2, cy - 70), T_["learn"], font=F(BLACK, 58 if not cv.v else 64), fill=WHITE + (int(255 * ease((t - t0) / .4)),), anchor="ms")
    for i, it in enumerate(items):
        e = ease((t - t0 - .4 - i * .45) / .45)
        if e <= 0: continue
        x0 = W / 2 - bw / 2 + (1 - e) * 60; y = cy + i * (h + 18)
        d.rounded_rectangle((x0, y, x0 + bw, y + h), radius=20, fill=(18, 18, 22, int(235 * e)), outline=(70, 60, 40, int(255 * e)), width=2)
        d.text((x0 + 44, y + h / 2 + 2), f"{i + 1:02d}", font=F(BLACK, 34), fill=GOLD + (int(255 * e),), anchor="lm")
        d.text((x0 + 120, y + h / 2 + 2), it, font=F(BOLD, 38), fill=WHITE + (int(255 * e),), anchor="lm")


def disclaimer_box(cv, im, a, cy):
    d = ImageDraw.Draw(im, "RGBA"); W = cv.W; bw, bh = (1060, 250) if not cv.v else (940, 300); x0 = (W - bw) / 2; y0 = cy
    d.rounded_rectangle((x0, y0, x0 + bw, y0 + bh), radius=24, fill=(20, 17, 11, int(240 * a)), outline=GOLD + (int(220 * a),), width=3)
    d.text((W / 2, y0 + 66), "⚠  Wichtig", font=F(BLACK, 46), fill=GOLD + (int(255 * a),), anchor="ms")
    for i, l in enumerate(T_["disc"]):
        rich(d, W / 2, y0 + 128 + i * 44, l, F(SEMI, 32), a, anchor="m", base=(215, 215, 220))


# ---------------------------------------------------------------- Frame
def chapter_num(spec, ci): return sum(1 for c in spec["chapters"][:ci + 1] if c["kind"] in ("chart", "summary", "remember"))


def frame(cv, spec, scenes, t):
    W, H = cv.W, cv.H; im = cv.bg(t)
    sc = next((s for s in scenes if s["t0"] <= t < s["t1"]), scenes[-1]); ch = spec["chapters"][sc["ch"]]; num = chapter_num(spec, sc["ch"])
    lt = t - sc["t0"]; seg = next((s for s in ch["segs"] if s.get("t0", 1e9) <= t < s.get("t1", -1)), None)
    fade = ease(lt / .35) * (1 - ease((t - sc["t1"] + .3) / .3)) if sc["kind"] != "title" else 1.0
    layer = im.copy() if fade < 1 else im
    d = ImageDraw.Draw(layer, "RGBA"); V = cv.v
    if sc["kind"] == "title":
        title_card(cv, layer, ch, num, lt, sc["t1"] - sc["t0"])
    elif sc["kind"] in ("intro", "outro"):
        if sc["kind"] == "intro":
            s0, s1, s2 = ch["segs"][:3]
            if t < s1["t0"]:
                cv.logo_at(layer, W / 2, H * .3, 400 if not V else 520, ease(lt / .8))
                rich(d, W / 2, H * (.5 if not V else .46), spec["title"], fitf(d, spec["title"], BLACK, 80, W - 140), ease((lt - .3) / .6), anchor="m")
            elif t < s2["t0"]: agenda(cv, layer, s1["agenda"], s1["t0"], t, H * (.3 if not V else .36))
            else:
                cv.logo_at(layer, W / 2, H * .25, 340, 1)
                rich(d, W / 2, H * .45, spec["title"], fitf(d, spec["title"], BLACK, 70, W - 140), 1, anchor="m")
                disclaimer_box(cv, layer, ease((t - s2["t0"]) / .5), H * (.53 if not V else .52))
        else:
            cv.logo_at(layer, W / 2, H * .28, 420 if not V else 520, ease(lt / .8))
            rich(d, W / 2, H * .5, T_["grp"], fitf(d, T_["grp"], BLACK, 84, W - 140), ease((lt - .3) / .5), anchor="m")
            for i, l in enumerate(T_["perks"]):
                e = ease((lt - .8 - i * .35) / .4); y = H * .58 + i * 64
                check_icon(d, W / 2 - 330, y - 4, 40, e); rich(d, W / 2 - 270, y + 28, l, F(BOLD, 36), e)
            pill(cv, layer, W / 2, H * .85, T_["link"], "gold", ease((lt - 2) / .4), size=34)
        karaoke(cv, layer, seg, t, (W * .1, 0, W * .9, H - 40) if not V else (60, 0, W - 60, H - 120))
    elif sc["kind"] == "chart":
        header(cv, layer, num, ch["title"])
        side = ch.get("side")
        if not V:
            box = (80, 180, 1240 if (side or any(s.get("point") for s in ch["segs"])) else W - 80, 900)
            draw_chart(cv, layer, box, ch, seg, t)
            if side == "steps": side_steps(cv, layer, ch, seg, t, (1290, 200, W - 80, 900))
            else: side_points(cv, layer, ch, t, (1290, 200, W - 80, 900))
            karaoke(cv, layer, seg, t, (160, 0, W - 160, H - 30))
        else:
            box = (40, 470, W - 40, 1250); draw_chart(cv, layer, box, ch, seg, t, bpad=40)
            if side == "steps": side_steps(cv, layer, ch, seg, t, (60, 1290, W - 60, 1700)) if False else None
            karaoke(cv, layer, seg, t, (60, 0, W - 60, 1560))
    elif sc["kind"] == "remember":
        header(cv, layer, num, ch["title"]) if V else d.text((W / 2, H * .24), T_["rem"], font=F(BLACK, 64), fill=WHITE + (int(255 * ease(lt / .4)),), anchor="ms")
        hl = seg.get("card", 1) if seg else 1
        for i, (big, small) in enumerate(ch["cards"]):
            e = ease((lt - .2 - i * .3) / .45); on = hl == i or hl < 0
            if not V: x0 = W / 2 - 640 + i * 660; y0 = H * .32; w, h = 620, 330
            else: x0 = 90; y0 = 520 + i * 480; w, h = W - 180, 420
            d.rounded_rectangle((x0, y0 + (1 - e) * 40, x0 + w, y0 + h + (1 - e) * 40), radius=28, fill=(22, 20, 15, int(240 * e)) if on else (16, 16, 19, int(200 * e)),
                                outline=(GOLD + (int(255 * e),)) if hl == i else (50, 48, 44, int(255 * e)), width=3)
            aa = e * (1 if on else .35)
            d.text((x0 + w / 2, y0 + h * .45), big, font=F(BLACK, 96), fill=(GREEN if i == 0 else GOLD) + (int(255 * aa),), anchor="ms")
            rich(d, x0 + w / 2, y0 + h * .72, small, F(BOLD, 40), aa, anchor="m")
            if hl == i: cv.glowdot(layer, x0 + w / 2, y0 + h * .4, 90, GOLD, .25)
        karaoke(cv, layer, seg, t, (160, 0, W - 160, H - 30) if not V else (60, 0, W - 60, 1560))
    elif sc["kind"] == "summary":
        header(cv, layer, num, ch["title"])
        items = [s for s in ch["segs"] if s.get("bullet") and s["t0"] <= t]
        for i, s in enumerate(items):
            e = ease((t - s["t0"] - .1) / .45); cur = s is seg
            if not V: x0, y, w, h = 280, 230 + i * 128, W - 560, 104
            else: x0, y, w, h = 70, 520 + i * 160, W - 140, 132
            x0 += (1 - e) * 50
            d.rounded_rectangle((x0, y, x0 + w, y + h), radius=24, fill=(24, 21, 14, int(240 * e)) if cur else (18, 18, 22, int(230 * e)), outline=(GOLD if cur else (54, 50, 44)) + (int(255 * e),), width=3 if cur else 2)
            d.ellipse((x0 + 26, y + h / 2 - 28, x0 + 82, y + h / 2 + 28), fill=GOLD + (int(255 * e),))
            d.text((x0 + 54, y + h / 2 + 2), str(i + 1), font=F(BLACK, 32), fill=(20, 16, 8, int(255 * e)), anchor="mm")
            d.text((x0 + 112, y + h / 2 + 2), s["bullet"], font=fitf(d, s["bullet"], BOLD, 42 if not V else 44, w - 140), fill=WHITE + (int(255 * e),), anchor="lm")
        karaoke(cv, layer, seg, t, (160, 0, W - 160, H - 30) if not V else (60, 0, W - 60, 1560))
    if fade < 1: im = Image.blend(im, layer, fade)
    else: im = layer
    progress(cv, im, spec, t)
    return im


# ---------------------------------------------------------------- Ausgabe
def render(spec, out, W, H, t0, t1, scenes, extra=None, tmax=None):
    cv = Canvas(W, H)
    p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                          "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-tune", "animation", "-pix_fmt", "yuv420p", out], stdin=subprocess.PIPE)
    for i in range(int((t1 - t0) * FPS)):
        t = t0 + i / FPS; im = frame(cv, spec, scenes, min(t, tmax) if tmax else t)
        if extra: im = extra(cv, im, t - t0, t1 - t0)
        p.stdin.write(im.tobytes())
    p.stdin.close(); p.wait()


def audio(spec, out, t0, t1, work, seed=7):
    dur = t1 - t0; mus = os.path.join(work, f"music_{int(dur)}_{seed}.wav")
    if not os.path.exists(mus):
        subprocess.run([sys.executable, os.path.join(HERE, "..", "factory", "music.py"), "lofi", f"{dur + 1:.2f}", mus, str(seed)], check=True, capture_output=True)
    ins = ["-i", mus]; flt = ["[0:a]volume=0.12,aresample=44100[m]"]; mix = ["[m]"]; k = 1
    for ch in spec["chapters"]:
        for sg in ch["segs"]:
            if sg["t1"] <= t0 or sg["t0"] >= t1: continue
            ms = int((sg["t0"] - t0 + VO_DELAY) * 1000)
            ins += ["-i", sg["wav"]]; flt.append(f"[{k}:a]aresample=44100,volume=1.6,adelay={ms}|{ms}[v{k}]"); mix.append(f"[v{k}]"); k += 1
    flt.append("".join(mix) + f"amix=inputs={len(mix)}:normalize=0,atrim=0:{dur:.2f},afade=t=out:st={max(0, dur - 1.5):.2f}:d=1.5[a]")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *ins, "-filter_complex", ";".join(flt), "-map", "[a]", "-ac", "2", out], check=True)


def mux(v, a, out):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", v, "-i", a, "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", out], check=True)


def ts(x): return f"{int(x // 60)}:{int(x % 60):02d}"


def vtt(spec, out):
    def f(x): return f"{int(x // 3600):02d}:{int(x % 3600 // 60):02d}:{x % 60:06.3f}"
    L = ["WEBVTT", ""]
    for ch in spec["chapters"]:
        for sg in ch["segs"]: L += [f"{f(sg['t0'])} --> {f(sg['t1'])}", sg["say"], ""]
    open(out, "w").write("\n".join(L))


def thumb(spec, out):
    W, H = 1280, 720; cv = Canvas(W, H); im = cv.bg(3.0); d = ImageDraw.Draw(im, "RGBA")
    ch = next((c for c in spec["chapters"] if c.get("clip") == spec.get("thumb_clip", "setup-kombi")), None) or next(c for c in spec["chapters"] if c["kind"] == "chart")
    draw_chart(cv, im, (600, 120, 1250, 690), ch, ch["segs"][-1], ch["segs"][-1]["t0"] + 99)
    l1, l2 = spec["thumb"]
    d.text((48, 330), l1, font=fitf(d, l1, BLACK, 120, 530), fill=GOLD, anchor="ls"); d.text((48, 420), l2, font=fitf(d, l2, BLACK, 74, 530), fill=WHITE, anchor="ls")
    pill(cv, im, 48, 495, "XAUUSD", "gold", size=34, anchor="l"); cv.logo_at(im, 140, 90, 200)
    im.save(out, quality=92)


def vertical_extra(hook, title):
    def f(cv, im, t, dur):
        d = ImageDraw.Draw(im, "RGBA"); W, H = cv.W, cv.H
        d.rounded_rectangle((60, 1740, W - 60, 1840), radius=24, fill=(230, 33, 23, 235))
        d.text((W / 2, 1805), "▶  Ganzes Video auf YouTube", font=F(BLACK, 44), fill=WHITE, anchor="ms")
        if t < 2.3:
            a = 1 - ease((t - 1.9) / .4); d.rectangle((0, 0, W, H), fill=(8, 8, 10, int(215 * a)))
            ff = F(BLACK, 98); lines = wrap(d, hook, ff, W - 120)
            for i, l in enumerate(lines): d.text((W / 2, H / 2 - 40 + i * ff.size * 1.15), l, font=ff, fill=(GOLD if i == 0 else WHITE) + (int(255 * a),), anchor="ms")
        if t > dur - 2.4:
            a = ease((t - (dur - 2.4)) / .4); d.rectangle((0, 0, W, H), fill=(8, 8, 10, int(228 * a)))
            d.text((W / 2, H / 2 - 40), T_["whole"], font=F(BOLD, 52), fill=WHITE + (int(255 * a),), anchor="ms")
            tt = title.replace("*", ""); ff = fitf(d, tt, BLACK, 72, W - 120)
            d.text((W / 2, H / 2 + 60), tt, font=ff, fill=GOLD + (int(255 * a),), anchor="ms")
            d.text((W / 2, H / 2 + 160), T_["yt"], font=F(SEMI, 46), fill=WHITE + (int(255 * a),), anchor="ms")
        return im
    return f


def main():
    spec = wording.clean(json.load(open(sys.argv[1], encoding="utf-8"))); out = sys.argv[2]
    global LBL, T_
    lang = spec.get("lang", "de"); LBL = CLIPS["LABELS"].get(lang, CLIPS["LABELS"]["de"]); T_ = UI.get(lang, UI["en"])
    for ch in spec["chapters"]:   # eigene Charts im Spec: {"clip": "name", "clip_data": {"c": [[o,h,l,c],…], "steps": [{"to": n, "add": {"a": [[i,p,"Text"]], "l": [[p,"Text","gold"]], "z": [[i0,i1,lo,hi,"Text","gold"]]}}]}}
        if ch.get("clip_data"): CLIPS["CLIPS"][ch["clip"]] = ch["clip_data"]
    only = sys.argv[3] if len(sys.argv) > 3 else "all"
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True); work = out + "_work"
    if only == "preview":   # ohne Sprecher, geschätzte Längen
        for ch in spec["chapters"]:
            for sg in ch["segs"]: sg["dur"] = len(sg["say"]) / 14
    else: tts_all(spec, work)
    scenes, T = timeline(spec); spec["_T"] = T; print(f"Länge {ts(T)}", flush=True)
    if only == "preview": return spec, scenes
    marks = ["0:00 " + T_["intro"]] + [f"{ts(c['t0'])} {c['title'].replace('*', '')}" for c in spec["chapters"] if c["kind"] in ("chart", "summary", "remember")]
    desc = (spec.get("desc", spec["yt_title"]) + "\n\n" + T_["dgrp"] + "\n" + GROUP +
            "\n\n" + T_["chap"] + ":\n" + "\n".join(marks) + "\n\n" + T_["ddisc"] + "\n\n" + " ".join("#" + re.sub(r"\W", "", x) for x in spec.get("tags", [])[:6]))
    open(out + "_desc.txt", "w").write(wording.text(desc)); vtt(spec, out + ".vtt")
    if only in ("all", "thumb", "long"): thumb(spec, out + "_thumb.jpg")
    if only in ("all", "long"):
        render(spec, out + "_v.mp4", 1920, 1080, 0, T, scenes); audio(spec, out + "_a.wav", 0, T, work); mux(out + "_v.mp4", out + "_a.wav", out + ".mp4")
        os.remove(out + "_v.mp4"); print("ok", out + ".mp4", flush=True)
    if only in ("all", "short"):
        k = 0
        for ci, ch in enumerate(spec["chapters"]):
            if ch["kind"] not in ("chart", "summary"): continue
            k += 1; o = f"{out}_k{k}"; t0, t1 = ch["c0"], ch["t1"] + 2.4
            render(spec, o + "_v.mp4", 1080, 1920, t0, t1, scenes, vertical_extra(ch.get("hook", ch["title"].replace("*", "")), spec["title"]), tmax=ch["t1"] - .05)
            audio(spec, o + "_a.wav", t0, t1, work, seed=ci + 11); mux(o + "_v.mp4", o + "_a.wav", o + ".mp4"); os.remove(o + "_v.mp4")
            print("ok", o + ".mp4", round(t1 - t0, 1), flush=True)
    json.dump({"T": T, "title": spec["yt_title"], "chapters": [{"title": c["title"], "t0": c["t0"], "hook": c.get("hook")} for c in spec["chapters"]]}, open(out + "_meta.json", "w"), ensure_ascii=False)


if __name__ == "__main__":
    main()
