"""Individuelle Partner-Variante eines Reels: eigene Hook, eigenes Titelbild, eigene Musik, Handle im Bild.

python3 partner_variant.py ../specs/<day>.json ../reels/partner/<day>_<pid>.mp4 '{"handle": "@tom.trades", "hook": "Warum dein Einstieg zu früh ist", "accent": "…", "cover_title": "Dein Einstieg ist *zu früh*", "music": "lofi", "seed": 7}'

- Ersetzt Text (und Sprechtext) der ersten Hook-Szene, setzt Titelbild-Titel und Musik.
- Rendert mit factory2.py und blendet danach den Handle klein unten rechts ein (ab Sekunde 1, nach dem Titelbild).
- Inhaltlich bleibt alles gleich – es geht um echte, sichtbare Unterschiede (Hook, Cover, Musik, Absender), nicht um technische Tricks.
- Erzeugt auch <out>_cover.jpg.
"""
import json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"


def main(spec_path, out, opts):
    spec = json.load(open(spec_path, encoding="utf-8"))
    for sc in spec.get("scenes", []):
        if sc.get("type") == "hook":
            if opts.get("hook"):
                sc["text"] = opts["hook"]
                if "say" in sc: sc["say"] = opts.get("say") or opts["hook"]
            if "accent" in opts: sc["accent"] = opts["accent"]
            break
    if opts.get("cover_title"):
        spec.setdefault("cover", {"kicker": "LERN-REEL", "chart": "up"})["title"] = opts["cover_title"]
    if opts.get("music"): spec["music"] = opts["music"]
    tmp = tempfile.mkdtemp()
    sp = os.path.join(tmp, "spec.json"); json.dump(spec, open(sp, "w", encoding="utf-8"), ensure_ascii=False)
    raw = os.path.join(tmp, "raw.mp4")
    subprocess.run([sys.executable, os.path.join(HERE, "factory2.py"), sp, raw], check=True, cwd=HERE)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    # Titelbild mitnehmen
    rc = os.path.splitext(raw)[0] + "_cover.jpg"
    if os.path.exists(rc): os.replace(rc, os.path.splitext(out)[0] + "_cover.jpg")
    h = (opts.get("handle") or "").strip()
    if h:
        txt = h.replace("\\", "").replace(":", "\\:").replace("'", "")
        vf = (f"drawtext=fontfile={FONT}:text='{txt}':fontsize=34:fontcolor=white@0.85:"
              f"box=1:boxcolor=black@0.35:boxborderw=14:x=w-tw-48:y=h-th-150:enable='gte(t,1)'")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-vf", vf, "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                        "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", out], check=True)
    else:
        os.replace(raw, out)
    for x in os.listdir(os.path.dirname(os.path.abspath(out))):
        if x.endswith(("_voice.wav", "_music.wav", "_v.mp4")): os.remove(os.path.join(os.path.dirname(os.path.abspath(out)), x))
    print("ok", out)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], json.loads(sys.argv[3]) if len(sys.argv) > 3 else {})
