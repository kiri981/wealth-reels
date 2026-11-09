"""Varianten der Screenshot-Werbung (make_ad.py): neue Hook (Sprecher Satz 1 + Überschrift), andere Musik.
WC_CODE=... python3 screens_var.py <lang> <var> "<Hook gesprochen>" "<Überschrift mit *gold*>" <musik> <seed> out.mp4
"""
import json, os, shutil, subprocess, sys, wave
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, "..", "tts"))
import voice as V
lang, var, say, head, mus, seed, out = sys.argv[1:8]
src = os.path.join(HERE, "work", lang); dst = os.path.join(HERE, "work", f"{lang}_{var}")
if not os.path.exists(dst): shutil.copytree(src, dst)
fn = os.path.join(dst, "vo0.wav"); meta = os.path.join(dst, "hook.txt")
if not os.path.exists(meta) or open(meta).read() != say:
    w, sr = V.synth(say, lang, 1.0, 0.0)
    with wave.open(fn, "wb") as f: f.setnchannels(1); f.setsampwidth(2); f.setframerate(sr); f.writeframes((np.clip(w, -1, 1) * 32767).astype("<i2").tobytes())
    open(meta, "w").write(say)
with wave.open(fn) as f: d = round(f.getnframes() / f.getframerate(), 2)
vo = json.load(open(os.path.join(dst, "vo.json"))); vo[0] = d; json.dump(vo, open(os.path.join(dst, "vo.json"), "w"))
env = dict(os.environ, AD_LANG=lang, AD_VAR=var, AD_SEG0=head, AD_MUSIC=mus, AD_SEED=seed)
subprocess.run([sys.executable, os.path.join(HERE, "make_ad.py"), out], check=True, env=env)
print("ok", out, "hook", d, "s")
