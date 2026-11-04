"""Kurzes Briefing-Video (9:16) aus der Story: langsamer Zoom aufs Story-Bild + Sprecher + leise Musik.

python3 brief_video.py stories/<datum>.json stories/<datum>.jpg reels/<datum>_brief.mp4
Die Stimme liest Schlagzeile, Punkte und die Termine (ohne Uhrzeiten, weil das Publikum in verschiedenen Zeitzonen sitzt).
"""
import json, os, subprocess, sys, tempfile
import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly

here = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault("TTS_DIR", os.path.join(here, "..", "tts")); sys.path.insert(0, os.environ["TTS_DIR"])
import piper_tts as P

SR = 44100


def script(spec):
    parts = [f"Gold-Briefing für {spec.get('date', 'heute')}.", spec["headline"].replace("$", "Dollar") + "."]
    parts += [p.replace("$", "Dollar").replace("~", "rund ").rstrip(".") + "." for p in spec.get("points", [])[:3]]
    tm = [t["text"] for t in spec.get("termine", [])[:3]]
    if tm: parts.append("Heute wichtig: " + (", ".join(tm[:-1]) + " und " + tm[-1] if len(tm) > 1 else tm[0]) + ".")
    parts.append("Mehr in der kostenlosen Telegram-Gruppe. Kommentiere GOLD für den Link.")
    return parts


def make(spec_path, img, out):
    spec = json.load(open(spec_path, encoding="utf-8"))
    clips = []
    for s in script(spec):
        w, sr = P.synth(s, length_scale=1.08, pause=0.3)
        clips.append(resample_poly(w, SR, sr)); clips.append(np.zeros(int(0.25 * SR)))
    voice = np.concatenate([np.zeros(int(0.4 * SR))] + clips)
    dur = len(voice) / SR + 1.2
    voice = np.pad(voice, (0, int(dur * SR) - len(voice)))
    voice = voice / (np.max(np.abs(voice)) + 1e-9) * 0.95
    tmp = tempfile.mkdtemp()
    vw = os.path.join(tmp, "voice.wav"); wavfile.write(vw, SR, (voice * 32767).astype(np.int16))
    mw = os.path.join(tmp, "music.wav")
    subprocess.run([sys.executable, os.path.join(here, "music.py"), "lofi", str(dur), mw, "7"], check=True, capture_output=True)
    # Zoom selbst rendern (ffmpeg-zoompan rundet auf ganze Pixel -> Schrift wackelt). PIL mit Subpixel-Box = ruhig.
    from PIL import Image
    fps = 30; n = int(dur * fps); W, H = 1080, 1920
    src = Image.open(img).convert("RGB").resize((W * 2, H * 2), Image.LANCZOS)
    p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-",
                          "-i", vw, "-i", mw, "-filter_complex", "[2:a]volume=0.18[m];[1:a][m]amix=inputs=2:duration=first:normalize=0[a]",
                          "-map", "0:v", "-map", "[a]", "-t", f"{dur:.2f}", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
                          "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out], stdin=subprocess.PIPE)
    for i in range(n):
        t = i / max(1, n - 1); e = t * t * (3 - 2 * t)          # sanft ein- und ausblenden
        z = 1 + 0.05 * e; cw, ch = W * 2 / z, H * 2 / z
        x0, y0 = (W * 2 - cw) / 2, (H * 2 - ch) * 0.35         # leicht nach oben (Logo + Schlagzeile)
        fr = src.resize((W, H), Image.BICUBIC, box=(x0, y0, x0 + cw, y0 + ch))
        if i < 12: fr = Image.blend(Image.new("RGB", (W, H)), fr, i / 12)
        p.stdin.write(fr.tobytes())
    p.stdin.close(); p.wait()
    print("ok", out, f"{dur:.1f}s")


if __name__ == "__main__":
    make(*sys.argv[1:4])
