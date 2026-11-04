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
    fps = 30; n = int(dur * fps)
    vf = (f"scale=2160:3840,zoompan=z='1+0.07*on/{n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s=1080x1920:fps={fps},"
          f"fade=t=in:st=0:d=0.4,format=yuv420p")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", img, "-i", vw, "-i", mw,
                    "-filter_complex", f"[0:v]{vf}[v];[2:a]volume=0.18[m];[1:a][m]amix=inputs=2:duration=first:normalize=0[a]",
                    "-map", "[v]", "-map", "[a]", "-t", f"{dur:.2f}", "-c:v", "libx264", "-preset", "medium", "-crf", "22",
                    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out], check=True)
    print("ok", out, f"{dur:.1f}s")


if __name__ == "__main__":
    make(*sys.argv[1:4])
