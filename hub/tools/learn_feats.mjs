// Aufruf: node hub/tools/learn_feats.mjs <5m.csv> <out.json> <cost>  – Merkmale + Ergebnisse (beide Richtungen, Scalp k1/H8 und Intraday k2/H32) aus learn.js
import fs from "fs"; import { resample, features, outcome } from "../worker/src/learn.js";
const [, , inp, outp, costS] = process.argv; const cost = +costS || 0.35;
const L = fs.readFileSync(inp, "utf8").trim().split("\n"); const H = L[0].split(",");
const C5 = L.slice(1).map((l) => { const c = l.split(","); const o = {}; H.forEach((h, i) => (o[h] = +c[i])); return o; }).sort((a, b) => a.t - b.t);
const C = resample(C5, 900); const { F, A } = features(C);
const R = {}; for (const [k, h] of [[1, 8], [2, 32]]) for (const dr of [1, -1]) R[`k${k}_${dr > 0 ? "L" : "S"}`] = C.map((_, i) => (F[i] ? outcome(C, A, i, dr, k, h, cost)?.r ?? null : null));
fs.writeFileSync(outp, JSON.stringify({ t: C.map((x) => x.t), F, R }));
console.log(C.length, "Kerzen (15m),", F.filter(Boolean).length, "mit Merkmalen");
