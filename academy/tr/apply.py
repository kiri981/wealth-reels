"""Übersetzte Spec bauen: python3 tr/apply.py specs/ac01_setup.json tr/ac01_en.json en specs/ac01_setup_en.json"""
import json, re, sys
base, ov, lang, out = sys.argv[1:5]
s = json.load(open(base, encoding="utf-8")); o = json.load(open(ov, encoding="utf-8"))
def setp(obj, path, val):
    toks = re.findall(r"\.(\w+)|\[(\d+)\]", path); cur = obj
    for k, (a, b) in enumerate(toks):
        key = a if a else int(b); last = k == len(toks) - 1
        if last: cur[key] = val
        else: cur = cur[key]
for p, v in o.items(): setp(s, p, v)
s["lang"] = lang; s["id"] = s["id"] + "_" + lang; s.pop("desc", None)
json.dump(s, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1); print("ok", out)
