"""Piper-TTS ohne piper-Paket: espeak-ng (IPA) -> phoneme ids -> ONNX."""
import json, subprocess, os, numpy as np, onnxruntime as ort, unicodedata, re
HERE = os.environ.get("TTS_DIR", "/tmp/tts")
ESPEAK = os.path.join(HERE, "espk/bin/espeak-ng"); ENV = dict(os.environ, LD_LIBRARY_PATH=os.path.join(HERE, "espk/lib"), ESPEAK_DATA_PATH=os.path.join(HERE, "espk/share/espeak-ng-data"))
cfg = json.load(open(os.path.join(HERE, "thorsten/m.json"))); pid = cfg["phoneme_id_map"]
sess = ort.InferenceSession(os.path.join(HERE, "thorsten/m.onnx"))
SR = cfg["audio"]["sample_rate"]

def phonemize(text):
    # Satzweise, Satzzeichen behalten (Piper erwartet sie für Pausen/Betonung)
    out = []
    for sent in re.split(r"(?<=[.!?])\s+", text.strip()):
        if not sent: continue
        ipa = subprocess.run([ESPEAK, "-q", "--ipa", "-v", "de", "--sep= ", sent], capture_output=True, text=True, env=ENV).stdout
        ipa = ipa.replace("\n", " ").strip()
        # espeak "--sep" setzt Leerzeichen zwischen Phonemen; Wortgrenzen sind doppelte Leerzeichen
        words = [w.replace(" ", "") for w in re.split(r"\s{2,}", ipa)]
        p = " ".join(words)
        m = re.search(r"[.!?,;:]$", sent); p = p + (m.group(0) if m else ".")
        out.append(unicodedata.normalize("NFD", p))
    return out

def synth(text, length_scale=0.95, noise=0.6, noise_w=0.8, pause=0.25):
    audio = []
    for ph in phonemize(text):
        ids = pid["^"] + pid["_"]
        for ch in ph:
            if ch in pid: ids += pid[ch] + pid["_"]
        ids += pid["$"]
        x = np.array([ids], dtype=np.int64)
        w = sess.run(None, {"input": x, "input_lengths": np.array([x.shape[1]], dtype=np.int64), "scales": np.array([noise, length_scale, noise_w], dtype=np.float32)})[0].squeeze()
        audio += [w, np.zeros(int(SR * pause))]
    return np.concatenate(audio), SR
