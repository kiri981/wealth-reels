"""YouTube-Tutorial 2 (16:9): Ultima-Konto mit MetaTrader 5 verbinden – Handy-Ansicht, persönliche Daten verpixelt.
Nutzt den Renderer aus konto.py (Kamerafahrt, Markierungen, Untertitel) mit Handy-Rahmen statt Browser.
python3 tut/mt5.py out.mp4 [preview]
"""
import math, os, sys
from PIL import Image, ImageDraw, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import konto as K   # noqa: E402
from boxes import BOX   # noqa: E402

K.WK = os.path.join(HERE, "work_mt5"); os.makedirs(K.WK, exist_ok=True)
K.IMG = {k: Image.open(os.path.join(HERE, "img", k + ".png")).convert("RGB") for k in ["mail", "settings", "konten", "broker", "login"]}
K.CH = ["Zugangsdaten", "App öffnen", "Broker wählen", "Einloggen"]
K.WX0, K.WY0, K.WW, K.WH = 1090, 140, 520, 880   # Handy-Bildschirm
W, H = K.W, K.H; GOLD, WHITE, MUTED = K.GOLD, K.WHITE, K.MUTED; font = K.font

K.S = [
    dict(k="intro", say="In diesem Video verbindest du dein Ultima-Konto mit der MetaTrader-5-App. Du brauchst dafür nur drei Dinge: deinen Login, dein Passwort und den Server."),
    dict(k="shot", ch=0, img="mail", boxes=["login", "pass", "server"], lab=["MT5 Login", "MT5 Passwort", "MT5 Server"], title="Die Zugangs-E-Mail",
         pts=["Kommt nach der Kontoeröffnung", "Login = Kontonummer", "Passwort & Server notieren"],
         say="Nach der Kontoeröffnung bekommst du von Ultima eine E-Mail mit deinen Zugangsdaten: MT5-Login, MT5-Passwort und MT5-Server. Genau diese drei brauchst du gleich."),
    dict(k="shot", ch=1, img="settings", boxes=["tab", "konto"], lab=["Einstellungen", "Konten"], title="MetaTrader 5 öffnen",
         pts=["App aus dem App Store / Play Store", "Unten rechts: Einstellungen", "Oben: dein Konto antippen"],
         say="Öffne die MetaTrader-5-App. Tippe unten rechts auf Einstellungen und dann ganz oben auf dein Konto."),
    dict(k="shot", ch=1, img="konten", boxes=["plus"], lab=["Neues Konto"], title="Konto hinzufügen",
         pts=["Übersicht aller Konten", "Oben rechts aufs Plus"],
         say="Jetzt siehst du die Übersicht deiner Konten. Tippe oben rechts auf das Plus."),
    dict(k="shot", ch=2, img="broker", boxes=["suche", "ultima"], lab=["Ultima suchen", "Ultima Markets Ltd"], title="Broker auswählen",
         pts=["„Ultima“ ins Suchfeld", "Ultima Markets Ltd antippen"],
         say="Gib oben im Suchfeld Ultima ein und wähle Ultima Markets Ltd aus."),
    dict(k="shot", ch=3, img="login", boxes=["server"], lab=["Server aus der E-Mail"], hot=True, title="Server wählen",
         pts=["Genau den Server aus der Mail", "z. B. UltimaMarkets-Live 2", "Live 1 ≠ Live 2!"],
         say="Wichtig ist der Server: Tippe drauf und wähle genau den Server aus deiner E-Mail – zum Beispiel UltimaMarkets-Live 2. Live 1 und Live 2 sind nicht dasselbe."),
    dict(k="shot", ch=3, img="login", boxes=["login", "pass", "btn"], lab=["MT5 Login (Zahl)", "MT5 Passwort", "Login"], title="Login & Passwort",
         pts=["Login = Nummer aus der Mail", "Passwort genau abtippen", "Dann auf Login"],
         say="Bei Login trägst du die Nummer aus MT5 Login ein, bei Passwort das MT5-Passwort aus der Mail – achte auf Groß- und Kleinschreibung. Dann unten auf Login."),
    dict(k="outro", say="Geschafft – dein Konto ist jetzt mit MetaTrader 5 verbunden. Ganz wichtig: Gib dein Passwort niemals weiter, auch nicht an uns. Für den VIP-Zugang brauchen wir nur deine UID."),
]


def render_phone(im, img, cx, cy, z):
    src = K.IMG[img]; iw, ih = src.size; WW, WH, WX0, WY0 = K.WW, K.WH, K.WX0, K.WY0
    vw, vh = WW / z, WH / z
    cx = min(max(cx, vw / 2), iw - vw / 2) if vw < iw else iw / 2
    cy = min(max(cy, vh / 2), ih - vh / 2) if vh < ih else ih / 2
    l, t = cx - vw / 2, cy - vh / 2
    canvas = Image.new("RGB", (WW, WH), (0, 0, 0))
    cl, ct = max(0, l), max(0, t); cr, cb = min(iw, l + vw), min(ih, t + vh)
    part = src.crop((int(cl), int(ct), int(math.ceil(cr)), int(math.ceil(cb)))).resize((max(1, int((cr - cl) * z)), max(1, int((cb - ct) * z))), Image.LANCZOS)
    canvas.paste(part, (int((cl - l) * z), int((ct - t) * z)))
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle((WX0 - 22, WY0 - 10, WX0 + WW + 22, WY0 + WH + 30), radius=66, fill=(0, 0, 0, 210))
    sh = sh.filter(ImageFilter.GaussianBlur(26)); im.paste(sh, (0, 0), sh)
    d = ImageDraw.Draw(im); d.rounded_rectangle((WX0 - 18, WY0 - 18, WX0 + WW + 18, WY0 + WH + 18), radius=60, fill=(26, 26, 28), outline=(90, 86, 78), width=3)
    m = Image.new("L", (WW, WH), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, WW, WH), radius=44, fill=255)
    im.paste(canvas, (WX0, WY0), m)
    return lambda x, y: (WX0 + (x - l) * z, WY0 + (y - t) * z)


def view_for(img, rect):
    x0, y0, x1, y1 = rect; iw, ih = K.IMG[img].size
    z = min(K.WW / ((x1 - x0) / .92), K.WH / ((y1 - y0) / .7), 1.9)
    z = max(z, K.WW / iw)   # Breite immer füllen
    return ((x0 + x1) / 2, (y0 + y1) / 2, z)


_card = K.card
def card(im, seg, t):
    if seg["k"] not in ("intro", "outro"): return _card(im, seg, t)
    d = ImageDraw.Draw(im, "RGBA"); a = K.ease(t / .5)
    lo = K.LOGO.resize((380, int(K.LOGO.height * 380 / K.LOGO.width))); im.paste(lo, (W // 2 - 190, 130), lo)
    if seg["k"] == "intro":
        d.text((W / 2, 500), "MetaTrader 5 verbinden", font=font("InterDisplay-Black.otf", 104), fill=WHITE + (int(255 * a),), anchor="ms")
        d.text((W / 2, 585), "Ultima-Konto in 2 Minuten in der App", font=font("Inter-SemiBold.otf", 42), fill=GOLD + (int(255 * a),), anchor="ms")
        for i, (h, s) in enumerate([("1", "Login"), ("2", "Passwort"), ("3", "Server")]):
            e = K.ease((t - .8 - i * .3) / .4); x = W / 2 + (i - 1) * 380
            d.rounded_rectangle((x - 160, 660 + (1 - e) * 30, x + 160, 760 + (1 - e) * 30), radius=30, fill=(32, 28, 20, int(235 * e)), outline=GOLD + (int(255 * e),), width=3)
            d.ellipse((x - 140, 682 + (1 - e) * 30, x - 84, 738 + (1 - e) * 30), fill=GOLD + (int(255 * e),))
            d.text((x - 112, 724 + (1 - e) * 30), h, font=font("InterDisplay-Black.otf", 36), fill=(20, 16, 8, int(255 * e)), anchor="ms")
            d.text((x + 30, 724 + (1 - e) * 30), s, font=font("Inter-Bold.otf", 40), fill=WHITE + (int(255 * e),), anchor="ms")
    else:
        d.text((W / 2, 470), "Verbunden ✓", font=font("InterDisplay-Black.otf", 104), fill=WHITE + (int(255 * a),), anchor="ms")
        e = K.ease((t - .8) / .5)
        d.rounded_rectangle((W / 2 - 560, 560, W / 2 + 560, 650), radius=45, fill=(200, 55, 55, int(235 * e)))
        d.text((W / 2, 620), "Passwort niemals weitergeben – auch nicht an uns", font=font("Inter-Bold.otf", 38), fill=(255, 255, 255, int(255 * e)), anchor="ms")
        e = K.ease((t - 1.6) / .5)
        d.text((W / 2, 730), "Für den VIP-Zugang brauchen wir nur deine UID → im Telegram-Bot senden", font=font("Inter-SemiBold.otf", 36), fill=GOLD + (int(255 * e),), anchor="ms")


def side(im, seg, t):   # linke Seite: Schrittname + Stichpunkte
    if seg["k"] != "shot": return
    d = ImageDraw.Draw(im, "RGBA"); a = K.ease(t / .45)
    d.text((160, 330), f"Schritt {seg['ch'] + 1}", font=font("Inter-Bold.otf", 34), fill=GOLD + (int(255 * a),), anchor="ls")
    d.text((160, 410), seg["title"], font=font("InterDisplay-Black.otf", 70), fill=WHITE + (int(255 * a),), anchor="ls")
    for i, p in enumerate(seg.get("pts", [])):
        e = K.ease((t - .5 - i * .35) / .4); y = 500 + i * 76
        d.ellipse((160, y - 26, 192, y + 6), fill=GOLD + (int(255 * e),))
        d.text((214, y), p, font=font("Inter-SemiBold.otf", 38), fill=(225, 222, 214, int(255 * e)), anchor="ls")


def subtitle(im, txt, t, dur):   # Untertitel links unter den Stichpunkten (rechts ist das Handy)
    d = ImageDraw.Draw(im, "RGBA"); f = font("Inter-SemiBold.otf", 32)
    lines = K.wrap(d, txt, f, 860); n = len(lines)
    per = max(dur - .4, .5) / max(1, math.ceil(n / 2)); k = min(int(t / per), math.ceil(n / 2) - 1)
    show = lines[k * 2: k * 2 + 2]; y = 1000 - 46 * len(show); w = max(d.textlength(l, font=f) for l in show)
    d.rounded_rectangle((140, y - 16, 160 + w + 30, y + 46 * len(show) + 6), radius=16, fill=(0, 0, 0, 170))
    for i, l in enumerate(show): d.text((160, y + 34 + i * 46), l, font=f, fill=WHITE, anchor="ls")


_sub_full = K.subtitle
def sub_switch(im, txt, t, dur):
    seg = CUR[0]
    return subtitle(im, txt, t, dur) if seg and seg["k"] == "shot" else _sub_full(im, txt, t, dur)


CUR = [None]
_frame = K.frame
def frame(seg, t, dur, prev):
    CUR[0] = seg; im, st = _frame(seg, t, dur, prev)
    return im, st


_chrome = K.chrome
def chrome(im, seg, a=1.0):
    _chrome(im, seg, a); side(im, seg, CUR_T[0])


CUR_T = [0.0]
def frame2(seg, t, dur, prev):
    CUR_T[0] = t; return frame(seg, t, dur, prev)


K.render_shot = render_phone; K.view_for = view_for; K.card = card; K.subtitle = sub_switch; K.chrome = chrome; K.frame = frame2
K.S[0]["k"] = "intro"
for _s in K.S:
    if _s["k"] == "shot": _s["solo"] = True

if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[2] == "preview":
        picks = [(0, 3.5), (1, 6.0), (2, 4.5), (3, 3.0), (4, 4.5), (5, 4.0), (6, 5.5), (7, 3.0)]
        ims = []
        for i, tt in picks:
            s = K.S[i]; s["dur"] = 3.5 + 1.2 * len(s.get("boxes", [])) + 2.5; prev = None
            if s["k"] == "shot":
                for q in range(0, int(tt * K.FPS) + 1, 5): _, prev = K.frame(s, q / K.FPS, s["dur"], prev)
            ims.append(K.frame(s, tt, s["dur"], prev)[0].resize((480, 270)))
        o = Image.new("RGB", (1440, 270 * math.ceil(len(ims) / 3))); [o.paste(x, ((i % 3) * 480, (i // 3) * 270)) for i, x in enumerate(ims)]; o.save(sys.argv[1])
    else: K.main(sys.argv[1])
