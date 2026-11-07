"""Sprecherstimme für Reels, Briefing-Videos und Lern-Clips.

synth(text, lang="de") -> (numpy float array, samplerate)

Reihenfolge:
  1. ElevenLabs (Modell eleven_multilingual_v2: natürlich, kann DE/EN/PL/FR mit derselben Stimme).
     Der API-Schlüssel liegt NICHT im Repo: er ist als "Network secret" für api.elevenlabs.io
     (Header xi-api-key) in der Cloud-Umgebung hinterlegt; der Proxy hängt ihn an.
     Optional lokal: Umgebungsvariable ELEVENLABS_API_KEY.
  2. Piper/Thorsten (nur Deutsch) – nur wenn settings.json "voice": true (nicht bei "premium").

settings.json (factory/):
  "voice": "premium"  -> nur ElevenLabs; wenn nicht erreichbar, Reel ohne Stimme
  "voice": true       -> ElevenLabs, sonst Piper
  "voice": false      -> keine Stimme
  "voice_id": "<ElevenLabs-Voice-ID>", "voice_model": "eleven_multilingual_v2"
"""
import json, os, urllib.request
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SETTINGS_PATH = os.path.join(HERE, "..", "factory", "settings.json")
DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb"   # "George" – ruhige, tiefe Erzählerstimme (Premade, kommerziell nutzbar)
SR = 44100
_cache = {}


def settings():
    try: return json.load(open(SETTINGS_PATH, encoding="utf-8"))
    except Exception: return {}


def mode():
    v = settings().get("voice", True)
    return "premium" if v == "premium" else ("off" if v is False else "any")


def _eleven(text, lang, speed):
    s = settings()
    vid = s.get("voice_id") or DEFAULT_VOICE
    body = {"text": text, "model_id": s.get("voice_model", "eleven_multilingual_v2"),
            "voice_settings": {"stability": 0.45, "similarity_boost": 0.8, "style": 0.15, "use_speaker_boost": True,
                               "speed": max(0.7, min(1.2, speed))}}
    if lang and body["model_id"] not in ("eleven_multilingual_v2",): body["language_code"] = lang
    req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{vid}?output_format=pcm_44100",
                                 data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Accept": "audio/pcm"})
    k = os.environ.get("ELEVENLABS_API_KEY")
    if k: req.add_header("xi-api-key", k)
    with urllib.request.urlopen(req, timeout=90) as r:
        pcm = r.read()
    return np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768.0, SR


def available():
    """True, wenn ElevenLabs antwortet (Schlüssel hinterlegt + Host freigegeben)."""
    if "ok" in _cache: return _cache["ok"]
    try:
        req = urllib.request.Request("https://api.elevenlabs.io/v1/user/subscription")
        k = os.environ.get("ELEVENLABS_API_KEY")
        if k: req.add_header("xi-api-key", k)
        with urllib.request.urlopen(req, timeout=15) as r: _cache["ok"] = r.status == 200
    except Exception as e:
        print("ElevenLabs nicht erreichbar:", e); _cache["ok"] = False
    return _cache["ok"]


def synth(text, lang="de", speed=1.0, pause=0.3):
    """Gibt (wave, sr) zurück oder wirft RuntimeError, wenn keine erlaubte Stimme verfügbar ist."""
    m = mode()
    if m == "off": raise RuntimeError("Stimme ausgeschaltet (settings.json)")
    if available():
        w, sr = _eleven(text, lang, speed)
        return np.concatenate([w, np.zeros(int(sr * pause), np.float32)]), sr
    if m == "premium": raise RuntimeError("ElevenLabs nicht verfügbar – Reel ohne Stimme")
    if lang != "de": raise RuntimeError("Piper kann nur Deutsch")
    import sys; sys.path.insert(0, HERE); import piper_tts as P
    # Piper ist langsamer: speed 1.0 ~ length_scale 1.08
    return P.synth(text, length_scale=1.08 / max(0.7, speed), pause=pause)


if __name__ == "__main__":
    import sys
    from scipy.io import wavfile
    t = sys.argv[1] if len(sys.argv) > 1 else "Willkommen im Wealth Club Bootcamp. Heute lernst du, wie ein Liquidity Sweep funktioniert."
    w, sr = synth(t, sys.argv[2] if len(sys.argv) > 2 else "de")
    out = sys.argv[3] if len(sys.argv) > 3 else "voice_test.wav"
    wavfile.write(out, sr, (np.clip(w, -1, 1) * 32767).astype(np.int16)); print("ok", out, f"{len(w)/sr:.1f}s")
