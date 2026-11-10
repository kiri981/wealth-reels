cd /home/claude/wealth-reels/academy
for f in ac01_setup_en ac01_setup_pl ac02_marktstruktur_en ac02_marktstruktur_pl; do
  id=$(echo $f | sed -E 's/^(ac[0-9]+)_[a-z]+_([a-z]+)$/\1_\2/')
  WC_CODE=bde1fac9 python3 academy.py specs/$f.json out/$id long 2>&1 | grep -E "^ok|Traceback|Error|Länge" | grep -v "ElevenLabs direkt"
done
echo ALLDONE
