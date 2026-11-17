"""Persönliches Reel (Kevin oder Partner vor der Kamera) -> fertig bearbeitetes Reel im Wealth-Club-Look.

python3 personal_edit.py roh.mp4 words.json out.mp4 '<json>'

words.json: {"words": [{"word": "Hallo", "start": 0.31, "end": 0.62}, ...]}  (Spracherkennung über den Bot: POST /stt)
<json>: {
  "hook": "Gold *fällt* – und keiner merkt's",   # Einblendung oben in den ersten ~2,6 s (*Wort* = gold), optional
  "points": [{"at": 6.5, "text": "1. Zone abwarten"}, ...], # Einblendungen oben (Zeit in Sekunden des FERTIGEN Videos), optional
  "cta": "Kommentiere GOLD", "cta_sub": "für meine kostenlose Gold-Gruppe",  # End-Karte (Partner: "Link in Bio")
  "handle": "@name",                                # klein unten rechts (Partner), optional
  "music": "chill" | "drive" | "lofi" | "none",
  "disclaimer": "Keine Anlageberatung."
}
Was passiert:
- Anfang/Ende ohne Sprache wird abgeschnitten, lange Pausen (> 0,7 s) werden auf 0,25 s gekürzt (Jump-Cuts).
- Hochformat 1080×1920 (zugeschnitten, nicht verzerrt).
- Untertitel Wort für Wort (2–3 Wörter je Zeile, aktuelles Wort gold), mittig im unteren Drittel.
- Hook- und Punkt-Einblendungen oben, Logo klein oben links, Handle unten rechts.
- 2,4 s End-Karte mit CTA; leise Musik unter der Stimme (Stimme bleibt klar verständlich).
- Erzeugt auch <out>_cover.jpg (Bild bei 0,8 s mit Hook).
"""
import json, os, re, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFilter
import lib
from lib import W, H, font, GOLD, WHITE, MUTED, BG

HERE = os.path.dirname(os.path.abspath(__file__))
FONTDIR = "/usr/share/fonts/opentype/inter"
END = 2.4


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: raise RuntimeError(" ".join(cmd[:4]) + " … " + r.stderr[-800:])
    return r.stdout


def probe(p):
    j = json.loads(run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height:stream_tags=rotate:format=duration", "-of", "json", p]))
    v = [s for s in j["streams"] if s["codec_type"] == "video"][0]
    return v["width"], v["height"], float(j["format"]["duration"]), any(s["codec_type"] == "audio" for s in j["streams"])


def keep_intervals(words, dur, gap=0.7, pad=0.25):
    """Sprech-Abschnitte; Pausen > gap werden auf pad gekürzt."""
    if not words: return [(0, dur)]
    iv, s, e = [], max(0, words[0]["start"] - pad), words[0]["end"]
    for w in words[1:]:
        if w["start"] - e > gap: iv.append((s, min(dur, e + pad / 2))); s = max(0, w["start"] - pad / 2)
        e = w["end"]
    iv.append((s, min(dur, e + 0.45)))
    return iv


def remap(t, iv):
    """Zeit im Rohvideo -> Zeit im geschnittenen Video."""
    acc = 0.0
    for a, b in iv:
        if t < a: return acc
        if t <= b: return acc + (t - a)
        acc += b - a
    return acc


def ass_time(t):
    t = max(0, t); h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def esc(s): return str(s).replace("\\", "").replace("{", "(").replace("}", ")")


def stars(s, base="&H00F6F4F4", hi="&H004AB5E8"):   # *Wort* -> gold (ASS-Farben sind BGR)
    return re.sub(r"\*(.+?)\*", lambda m: "{\\c" + hi + "}" + esc(m.group(1)) + "{\\c" + base + "}", esc(s))


def phrases(words, maxw=3, maxc=20):
    out, cur = [], []
    for w in words:
        txt = w["word"].strip()
        if not txt: continue
        if cur and (len(cur) >= maxw or len(" ".join(x["word"].strip() for x in cur + [w])) > maxc or w["start"] - cur[-1]["end"] > 0.45):
            out.append(cur); cur = []
        cur.append(w)
        if re.search(r"[.!?]$", txt): out.append(cur); cur = []
    if cur: out.append(cur)
    return out


def build_ass(words, cfg, total):
    st = ("[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\n\n[V4+ Styles]\n"
          "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
          "Style: Cap,Inter Black,92,&H00F6F4F4,&H00F6F4F4,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,7,3,2,60,60,560,1\n"
          "Style: Hook,Inter Black,78,&H00F6F4F4,&H00F6F4F4,&H00120C0A,&HB4120C0A,0,0,0,0,100,100,0,0,3,26,0,8,70,70,260,1\n"
          "Style: Pt,Inter ExtraBold,58,&H00120C0A,&H00120C0A,&H004AB5E8,&H004AB5E8,0,0,0,0,100,100,0,0,3,20,0,8,90,90,300,1\n"
          "Style: Hdl,Inter Bold,34,&H90F6F4F4,&H90F6F4F4,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,3,40,40,70,1\n\n"
          "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
    ev = []
    body_end = total - END
    for ph in phrases(words):
        for i, w in enumerate(ph):
            a = w["start"]; b = ph[i + 1]["start"] if i + 1 < len(ph) else max(w["end"], a + 0.2)
            if a >= body_end: continue
            txt = "\\h".join(("{\\c&H004AB5E8&\\fscx108\\fscy108}" + esc(x["word"].strip()).upper() + "{\\c&H00F6F4F4&\\fscx100\\fscy100}") if j == i else esc(x["word"].strip()).upper() for j, x in enumerate(ph))
            ev.append(f"Dialogue: 1,{ass_time(a)},{ass_time(min(b, body_end))},Cap,,0,0,0,,{{\\fad(40,0)}}{txt}")
    if cfg.get("hook"):
        ev.append(f"Dialogue: 2,{ass_time(0)},{ass_time(min(2.8, body_end))},Hook,,0,0,0,,{{\\fad(120,180)}}{stars(cfg['hook'])}")
    for p in cfg.get("points") or []:
        a = float(p.get("at", 0))
        if 3.0 <= a < body_end - 1: ev.append(f"Dialogue: 2,{ass_time(a)},{ass_time(min(a + 2.6, body_end))},Pt,,0,0,0,,{{\\fad(120,150)}}{esc(p.get('text', ''))}")
    if cfg.get("handle"):
        ev.append(f"Dialogue: 0,{ass_time(0)},{ass_time(body_end)},Hdl,,0,0,0,,{esc(cfg['handle'])}")
    return st + "\n".join(ev) + "\n"


def end_card(path, cfg):
    im = lib.background() if hasattr(lib, "background") else Image.new("RGB", (W, H), BG)
    im = im.convert("RGB"); d = ImageDraw.Draw(im)
    lp = os.path.join(HERE, "brand", "logo.png")
    if os.path.exists(lp):
        lg = Image.open(lp).convert("RGBA"); lg = lg.resize((300, int(lg.height * 300 / lg.width)), Image.LANCZOS); im.paste(lg, ((W - lg.width) // 2, 520), lg)
    f1 = font("InterDisplay-Black.otf", 84) if os.path.exists(os.path.join(lib.F, "InterDisplay-Black.otf")) else font("Inter-Black.otf", 84)
    cta = cfg.get("cta") or "Kommentiere GOLD"; tw = d.textlength(cta, font=f1)
    bw = max(640, tw + 120)
    d.rounded_rectangle(((W - bw) / 2, 900, (W + bw) / 2, 1050), radius=75, fill=GOLD)
    d.text((W / 2, 975), cta, font=f1, fill=BG, anchor="mm")
    sub = cfg.get("cta_sub") or "für meine kostenlose Gold-Gruppe"
    d.text((W / 2, 1140), sub, font=font("Inter-Bold.otf", 46), fill=WHITE, anchor="mm")
    d.text((W / 2, 1290), cfg.get("disclaimer") or "Keine Anlageberatung.", font=font("Inter-Medium.otf", 32), fill=MUTED, anchor="mm")
    if cfg.get("handle"): d.text((W / 2, 1720), cfg["handle"], font=font("Inter-Bold.otf", 40), fill=GOLD, anchor="mm")
    im.save(path)


def main(src, words_path, out, cfg):
    tmp = tempfile.mkdtemp()
    w0, h0, dur, has_audio = probe(src)
    if not has_audio: raise RuntimeError("Video hat keine Tonspur")
    W_ = json.load(open(words_path)); words = [w for w in (W_.get("words") if isinstance(W_, dict) else W_) if w.get("word", "").strip() and w.get("end", 0) > w.get("start", 0) - 0.01]
    words.sort(key=lambda w: w["start"])
    iv = keep_intervals(words, dur)
    body = sum(b - a for a, b in iv)
    if body < 5: raise RuntimeError(f"zu wenig Sprache erkannt ({body:.1f} s)")
    # Wörter auf die geschnittene Zeitachse
    words2 = [{"word": w["word"], "start": remap(w["start"], iv), "end": remap(w["end"], iv)} for w in words]
    total = body + END
    # 1) Schnitt + Hochformat
    parts, labels = [], []
    for i, (a, b) in enumerate(iv):
        parts.append(f"[0:v]trim={a:.3f}:{b:.3f},setpts=PTS-STARTPTS,scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps=30,setsar=1[v{i}];"
                     f"[0:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS[a{i}];")
        labels.append(f"[v{i}][a{i}]")
    fc = "".join(parts) + "".join(labels) + f"concat=n={len(iv)}:v=1:a=1[vc][ac]"
    cut = os.path.join(tmp, "cut.mp4")
    run(["ffmpeg", "-y", "-v", "error", "-i", src, "-filter_complex", fc, "-map", "[vc]", "-map", "[ac]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "160k", cut])
    # 2) End-Karte als Video anhängen
    ec = os.path.join(tmp, "end.png"); end_card(ec, cfg)
    endv = os.path.join(tmp, "end.mp4")
    run(["ffmpeg", "-y", "-v", "error", "-loop", "1", "-t", str(END), "-i", ec, "-f", "lavfi", "-t", str(END), "-i", "anullsrc=r=48000:cl=stereo",
         "-vf", "fps=30,format=yuv420p,setsar=1", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-shortest", endv])
    joined = os.path.join(tmp, "joined.mp4")
    run(["ffmpeg", "-y", "-v", "error", "-i", cut, "-i", endv, "-filter_complex", "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]", "-map", "[v]", "-map", "[a]",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "160k", joined])
    # 3) Untertitel/Einblendungen + Logo + Musik
    ass = os.path.join(tmp, "subs.ass"); open(ass, "w").write(build_ass(words2, cfg, total))
    lp = os.path.join(HERE, "brand", "logo.png")
    music = cfg.get("music", "chill")
    inputs = ["-i", joined]; vf = f"[0:v]ass={ass}:fontsdir={FONTDIR}[s]"
    if os.path.exists(lp):
        inputs += ["-i", lp]; vf += f";[1:v]scale=170:-1,format=rgba,colorchannelmixer=aa=0.92[lg];[s][lg]overlay=46:70:enable='lt(t,{total - END:.2f})'[vo]"
    else: vf += ";[s]copy[vo]"
    af = "[0:a]loudnorm=I=-15:TP=-1.5:LRA=11[voice]"
    if music != "none":
        mw = os.path.join(tmp, "music.wav")
        run([sys.executable, os.path.join(HERE, "music.py"), music, str(int(total) + 2), mw])
        inputs += ["-i", mw]; mi = len([x for x in inputs if x == "-i"]) - 1
        af += f";[{mi}:a]volume=0.13,afade=t=out:st={total - 1.2:.2f}:d=1.2[mus];[voice][mus]amix=inputs=2:duration=first:normalize=0[ao]"
    else: af += ";[voice]anull[ao]"
    run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", vf + ";" + af, "-map", "[vo]", "-map", "[ao]", "-t", f"{total:.2f}",
         "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out])
    cover = re.sub(r"\.mp4$", "", out) + "_cover.jpg"
    run(["ffmpeg", "-y", "-v", "error", "-ss", "0.9", "-i", out, "-frames:v", "1", "-q:v", "3", cover])
    print(json.dumps({"out": out, "cover": cover, "dur": round(total, 1), "cuts": len(iv)}))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3], json.loads(sys.argv[4]) if len(sys.argv) > 4 else {})
