// Aufruf: node hub/tools/learn_eval.mjs <5m.csv> <params.json> → Trades (gleiche Funktion runLearn wie im Worker) als JSON auf stdout
import fs from "fs"; import { runLearn } from "../worker/src/learn.js";
const [, , inp, pp] = process.argv; const p = JSON.parse(fs.readFileSync(pp, "utf8"));
const L = fs.readFileSync(inp, "utf8").trim().split("\n"); const H = L[0].split(",");
const C5 = L.slice(1).map((l) => { const c = l.split(","); const o = {}; H.forEach((h, i) => (o[h] = +c[i])); return o; }).sort((a, b) => a.t - b.t);
process.stdout.write(JSON.stringify(runLearn(C5, p)));
