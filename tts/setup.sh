#!/bin/bash
# Richtet die Erzählerstimme (Piper „Thorsten“, Deutsch) ein. Einmal pro Sitzung ausführen.
# Danach: export TTS_DIR=<repo>/tts
set -e
D="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$D/thorsten"
B=https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/high
[ -s "$D/thorsten/m.onnx" ] || curl -sSL -m 600 -o "$D/thorsten/m.onnx" "$B/de_DE-thorsten-high.onnx"
[ -s "$D/thorsten/m.json" ] || curl -sSL -m 60 -o "$D/thorsten/m.json" "$B/de_DE-thorsten-high.onnx.json"
chmod +x "$D/espk/bin/espeak-ng"
python3 -c "import onnxruntime" 2>/dev/null || pip install --break-system-packages -q onnxruntime
ESPEAK_DATA_PATH="$D/espk/share/espeak-ng-data" "$D/espk/bin/espeak-ng" -q --ipa -v de "Test" >/dev/null
echo "Stimme bereit: export TTS_DIR=$D"
