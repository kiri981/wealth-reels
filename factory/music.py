"""Originale Hintergrundmusik für Reels – komplett synthetisch, daher frei von Rechten Dritter.

python3 music.py <stil> <sekunden> <out.wav> [seed]
Stile: drive (treibend, 118 BPM), chill (entspannt, 100 BPM), lofi (ruhig, 84 BPM)
"""
import sys, numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 44100

def lp(x, f, o=2): return sosfilt(butter(o, f, "low", fs=SR, output="sos"), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, "high", fs=SR, output="sos"), x)
def bp(x, a, b, o=2): return sosfilt(butter(o, [a, b], "band", fs=SR, output="sos"), x)
def hz(m): return 440.0 * 2 ** ((m - 69) / 12)

STYLES = {
    "drive": dict(bpm=118, prog=[[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], swing=0.0, kick=[0, 2, 2.75], snare=[1, 3], hat=0.5, lead=True, bright=4200),
    "chill": dict(bpm=100, prog=[[50, 53, 57, 60], [55, 58, 62, 65], [48, 52, 55, 59], [53, 57, 60, 64]], swing=0.08, kick=[0, 2.5], snare=[1, 3], hat=0.5, lead=True, bright=3000),
    "lofi":  dict(bpm=84,  prog=[[52, 55, 59, 62], [57, 60, 64, 67], [50, 53, 57, 60], [55, 59, 62, 65]], swing=0.12, kick=[0, 1.75, 2.5], snare=[1, 3], hat=0.25, lead=False, bright=1800),
}

def env(n, a, d):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)
    return e

def kick(n):
    t = np.arange(n) / SR
    f = 45 + 80 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7) * 0.9

def snare(n, rng):
    t = np.arange(n) / SR
    noise = bp(rng.standard_normal(n), 1200, 6000) * np.exp(-t * 18)
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 25) * 0.4
    return (noise * 0.6 + body) * 0.55

def hat(n, rng):
    t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 7000) * np.exp(-t * 60) * 0.18

def saw(f, t, rng, det=0.0):
    ph = (f * (1 + det) * t + rng.random()) % 1.0
    return 2 * ph - 1

def make(style, seconds, seed=0):
    s = STYLES[style]; rng = np.random.default_rng(seed)
    beat = 60 / s["bpm"]; bar = beat * 4
    transpose = int(rng.integers(-2, 3))
    prog = [[m + transpose for m in ch] for ch in s["prog"]]
    if rng.random() < 0.5: prog = prog[2:] + prog[:2]
    N = int(seconds * SR) + SR; out = np.zeros(N); drums = np.zeros(N)
    nbars = int(seconds / bar) + 2
    # Pad + Bass
    for b in range(nbars):
        ch = prog[b % len(prog)]; i0 = int(b * bar * SR); n = int(bar * SR)
        if i0 >= N: break
        n = min(n, N - i0); t = np.arange(n) / SR
        pad = sum(saw(hz(m), t, rng, 0.004) + saw(hz(m), t, rng, -0.004) for m in ch) / (2 * len(ch))
        e = np.minimum(1, t / 0.35) * np.minimum(1, (bar - t) / 0.25)
        out[i0:i0 + n] += lp(pad, s["bright"]) * e * 0.22
        root = ch[0] - 12
        for k in range(8):
            j0 = i0 + int(k * beat / 2 * SR); m = min(int(beat / 2 * SR), N - j0)
            if m <= 0: continue
            tt = np.arange(m) / SR
            bs = lp(saw(hz(root), tt, rng), 400) * env(m, 0.005, 0.18)
            out[j0:j0 + m] += bs * 0.28
        # Lead-Arpeggio
        if s["lead"] and b % 4 in (1, 3):
            notes = [ch[x % len(ch)] + 12 for x in rng.permutation(8)]
            for k, mnote in enumerate(notes):
                j0 = i0 + int(k * beat / 2 * SR); m = min(int(beat / 2 * SR), N - j0)
                if m <= 0: continue
                tt = np.arange(m) / SR
                out[j0:j0 + m] += np.sin(2 * np.pi * hz(mnote) * tt) * env(m, 0.003, 0.12) * 0.12
    # Drums (erste Takt nur Pad = sanfter Einstieg)
    for b in range(1, nbars):
        for q in range(16):
            pos = b * bar + q * beat / 4 + (s["swing"] * beat / 4 if q % 2 else 0)
            i = int(pos * SR)
            if i >= N - 2000: continue
            qb = q / 4
            if qb in s["kick"]: k = kick(min(int(0.4 * SR), N - i)); drums[i:i + len(k)] += k
            if qb in s["snare"]: k = snare(min(int(0.3 * SR), N - i), rng); drums[i:i + len(k)] += k
            if (q % int(s["hat"] * 4) == 0) and not (b % 8 == 7 and q > 12):
                k = hat(min(int(0.08 * SR), N - i), rng); drums[i:i + len(k)] += k * (1.0 if q % 4 else 0.7)
    # Sidechain-Ducking auf Pad/Bass bei der Kick
    duck = np.ones(N)
    for b in range(1, nbars):
        for kb in s["kick"]:
            i = int((b * bar + kb * beat) * SR)
            if i < N:
                m = min(int(0.25 * SR), N - i); duck[i:i + m] = np.minimum(duck[i:i + m], 0.45 + 0.55 * (np.arange(m) / m))
    mix = out * duck * 1.6 + drums * 0.5
    mix = np.tanh(mix * 1.4) / np.tanh(1.4)
    mix = mix[: int(seconds * SR)]
    fade = int(1.2 * SR); mix[-fade:] *= np.linspace(1, 0, fade); mix[: int(0.3 * SR)] *= np.linspace(0, 1, int(0.3 * SR))
    mix = mix / (np.max(np.abs(mix)) + 1e-9) * 0.85
    stereo = np.stack([mix, np.roll(mix, int(0.012 * SR)) * 0.96], axis=1)
    return (stereo * 32767).astype(np.int16)

if __name__ == "__main__":
    style, secs, out = sys.argv[1], float(sys.argv[2]), sys.argv[3]
    seed = int(sys.argv[4]) if len(sys.argv) > 4 else 0
    wavfile.write(out, SR, make(style, secs, seed))
    print("ok", out)
