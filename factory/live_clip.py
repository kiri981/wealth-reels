"""Echte Bildschirmaufnahme eines Trades (MetaTrader/TradingView, beliebig lang) -> Reel im Wealth-Club-Look.

python3 live_clip.py aufnahme.mp4 out.mp4 '{"title": "Gold *SELL* live", "symbol": "XAUUSD", "side": "SELL", "max": 32}'

- Zeitraffer: lange Aufnahmen werden automatisch so beschleunigt, dass der Hauptteil max. ~32 s dauert
  (kurze Aufnahmen laufen in Echtzeit). Der Faktor steht sichtbar im Video („Zeitraffer ×8“) – ehrlich.
- Aufbau: 1 s Titelbild (cover.py, kicker LIVE-TRADE) -> Aufnahme in goldenem Rahmen mit Kopf-/Fußzeile -> 2,6 s CTA.
- Ton der Aufnahme wird entfernt, darunter läuft eigene Musik (music.py).
- Erzeugt auch <out>_cover.jpg.
"""
import json, os, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFilter
import lib
from lib import W, H, font, GOLD, WHITE, MUTED, BG

HERE = os.path.dirname(os.path.abspath(__file__))
FPS = 30


def probe(p):
    o = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration",
                        "-of", "json", p], capture_output=True, text=True, check=True).stdout
    j = json.loads(o); s = j["streams"][0]
    return int(s["width"]), int(s["height"]), float(j["format"]["duration"])


def frame_png(path, kicker, sub, speed, box):
    """Hintergrund mit Kopfzeile (Logo + Pille) und Fußzeile; der Bereich box bleibt für das Video frei."""
    im = Image.new("RGB", (W, H), BG)
    g = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(g)
    d.ellipse((-260, -650, W + 260, 520), fill=(70, 52, 20)); d.ellipse((300, 1500, 1400, 2300), fill=(36, 28, 12))
    im = Image.blend(im, g.filter(ImageFilter.GaussianBlur(190)), 0.75); d = ImageDraw.Draw(im)
    lp = os.path.join(HERE, "brand", "logo.png")
    if os.path.exists(lp):
        lg = Image.open(lp).convert("RGBA"); lg = lg.resize((230, int(lg.height * 230 / lg.width)), Image.LANCZOS); im.paste(lg, ((W - lg.width) // 2, 70), lg)
    f = font("Inter-Bold.otf", 34); tw = d.textlength(kicker, font=f)
    d.rounded_rectangle(((W - tw) / 2 - 30, 215, (W + tw) / 2 + 30, 275), radius=30, fill=(46, 34, 12), outline=GOLD, width=2)
    d.text((W / 2, 245), kicker, font=f, fill=GOLD, anchor="mm")
    x0, y0, x1, y1 = box
    d.rounded_rectangle((x0 - 8, y0 - 8, x1 + 8, y1 + 8), radius=26, outline=GOLD, width=5)
    d.text((W / 2, y1 + 60), sub, font=font("Inter-SemiBold.otf", 34), fill=WHITE, anchor="mm")
    if speed > 1.05:
        t = f"⏩ Zeitraffer ×{speed:.0f}" if speed >= 2 else f"⏩ Zeitraffer ×{speed:.1f}".replace(".", ",")
        d.text((W / 2, y1 + 110), t.replace("⏩ ", ""), font=font("Inter-Bold.otf", 30), fill=GOLD, anchor="mm")
    d.text((W / 2, 1850), "Echter Trade · Keine Anlageberatung · Trading birgt Verlustrisiken", font=font("Inter-Medium.otf", 24), fill=(110, 116, 130), anchor="mm")
    im.save(path)


def cta_png(path, title, button):
    im = Image.new("RGB", (W, H), BG)
    g = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(g); d.ellipse((-260, -650, W + 260, 700), fill=(70, 52, 20))
    im = Image.blend(im, g.filter(ImageFilter.GaussianBlur(200)), 0.75); d = ImageDraw.Draw(im)
    lp = os.path.join(HERE, "brand", "logo.png")
    if os.path.exists(lp):
        lg = Image.open(lp).convert("RGBA"); lg = lg.resize((420, int(lg.height * 420 / lg.width)), Image.LANCZOS); im.paste(lg, ((W - lg.width) // 2, 380), lg)
    d.text((W / 2, 820), title, font=font("InterDisplay-Black.otf", 72), fill=GOLD, anchor="mm")
    d.text((W / 2, 920), "Live-Trades & Gold-Ideen auf Telegram", font=font("Inter-SemiBold.otf", 44), fill=WHITE, anchor="mm")
    f = font("InterDisplay-Black.otf", 56); bw = d.textlength(button, font=f) + 120
    d.rounded_rectangle(((W - bw) / 2, 1060, (W + bw) / 2, 1190), radius=65, fill=GOLD); d.text((W / 2, 1125), button, font=f, fill=BG, anchor="mm")
    d.text((W / 2, 1300), "Keine Anlageberatung. Trading birgt Verlustrisiken.", font=font("Inter-Medium.otf", 30), fill=MUTED, anchor="mm")
    im.save(path)


def make(src, out, info):
    import cover as _cv
    title = info.get("title") or "Live-Trade *Gold*"
    kicker = info.get("kicker", "LIVE-TRADE")
    sym = info.get("symbol", "XAUUSD"); side = (info.get("side") or "").upper()
    vw, vh, dur = probe(src)
    trim = float(info.get("start", 0)), float(info.get("end", 0) or dur)
    span = max(1.0, trim[1] - trim[0])
    maxd = float(info.get("max", 32))
    speed = max(1.0, span / maxd)
    main = span / speed
    # Videobereich: so groß wie möglich zwischen Kopf (300) und Fuß (~1700)
    bw, bh = 960, 1300
    k = min(bw / vw, bh / vh); tw, th = int(vw * k) // 2 * 2, int(vh * k) // 2 * 2
    x0, y0 = (W - tw) // 2, 330 + (bh - th) // 2
    tmp = tempfile.mkdtemp()
    fr = os.path.join(tmp, "frame.png"); ct = os.path.join(tmp, "cta.png")
    sub = info.get("sub") or f"{sym} · {side}".strip(" ·")
    frame_png(fr, kicker, sub, speed, (x0, y0, x0 + tw, y0 + th))
    cta_png(ct, info.get("cta_title", "Trading mit Plan."), info.get("button", "Kommentiere GOLD"))
    cp = os.path.splitext(out)[0] + "_cover.jpg"
    _cv.make(kicker, title, cp, info.get("chart", "down" if side == "SELL" else "up"))
    COV, CTA = 1.0, 2.6
    total = COV + main + CTA
    mw = os.path.join(tmp, "music.wav")
    subprocess.run([sys.executable, os.path.join(HERE, "music.py"), info.get("music", "drive"), f"{total + 0.5:.2f}", mw, "11"], check=True, capture_output=True)
    fc = (
        f"[0:v]trim={trim[0]}:{trim[1]},setpts=(PTS-STARTPTS)/{speed:.4f},fps={FPS},scale={tw}:{th}:flags=lanczos,setsar=1[v];"
        f"[1:v][v]overlay={x0}:{y0}:shortest=1,format=yuv420p,setsar=1[mainv];"
        f"[2:v]scale={W}:{H},setsar=1,format=yuv420p[cov];[3:v]scale={W}:{H},setsar=1,format=yuv420p[cta];"
        f"[cov][mainv][cta]concat=n=3:v=1:a=0[outv];[4:a]afade=t=out:st={total - 1.2:.2f}:d=1.2[a]"
    )
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", src,
           "-loop", "1", "-framerate", str(FPS), "-t", f"{main:.3f}", "-i", fr,
           "-loop", "1", "-framerate", str(FPS), "-t", f"{COV}", "-i", cp,
           "-loop", "1", "-framerate", str(FPS), "-t", f"{CTA}", "-i", ct,
           "-i", mw, "-filter_complex", fc, "-map", "[outv]", "-map", "[a]", "-t", f"{total:.2f}",
           "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-r", str(FPS), "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out]
    subprocess.run(cmd, check=True)
    print("ok", out, f"{total:.1f}s", f"Zeitraffer x{speed:.1f}")
    return {"speed": speed, "duration": total}


if __name__ == "__main__":
    make(sys.argv[1], sys.argv[2], json.loads(sys.argv[3]) if len(sys.argv) > 3 else {})
