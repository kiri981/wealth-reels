// WC Trading Hub – Auswertung von Kevins Markt-Ausblicken (v2.8)
// Der Bot speichert jeden Ausblick (Bias, Zonen, Liquidität, Plan A/B) in der Tabelle outlooks. Hier wird er mit den echten
// Gold-5-Min.-Kerzen geprüft: Stimmte der Bias? Wurde jede Zone erreicht – hat sie gehalten oder ist sie gebrochen?
// Wurde die Liquidität geholt? Kam Plan A (Zone → Ziel) oder wurde er ungültig (Plan B)?
// Daraus entsteht Kevins eigene Trefferstatistik nach Zonen-Art (OB/FVG, Zeitebene, ⭐ Konfluenz, Supply/Demand) – sie zeigt,
// welche seiner Werkzeuge wirklich funktionieren. Reine Auswertung, keine Anlageberatung.

const num = (s) => +String(s).replace(",", ".");
function tzOff(day) {   // Stunden Abstand Europe/Bucharest zu UTC an diesem Tag (2 im Winter, 3 im Sommer)
  try { return +new Date(day + "T12:00:00Z").toLocaleString("en-US", { timeZone: "Europe/Bucharest", hour12: false, hour: "2-digit" }) - 12; } catch (e) { return 2; }
}
function period(o) {   // Bewertungszeitraum: ab Veröffentlichung bis Ende des Plantags (Wochenausblick: bis Freitag)
  const P = o.p, off = tzOff(P.day);
  const endDay = new Date(P.day + "T00:00:00Z"); if (P.kind === "woche") { const wd = endDay.getUTCDay(); endDay.setUTCDate(endDay.getUTCDate() + ((5 - wd + 7) % 7)); }
  const end = Math.floor(endDay.getTime() / 1000) + 86400 - off * 3600;
  return { from: o.created, to: end };
}
function planA(t) {   // „Pullback in die 15m FVG 3881.85 – 3882.60 → … → Short mit Ziel PDL 3865.54.“
  if (!t) return null;
  const dir = /\bshort\b|verkauf/i.test(t) ? -1 : /\blong\b|kauf/i.test(t) ? 1 : 0;
  const z = t.match(/(\d{3,}(?:\.\d+)?)\s*[–-]\s*(\d{3,}(?:\.\d+)?)/), g = t.match(/Ziel\s*(?:[A-Z]{2,4}\s*)?(\d{3,}(?:\.\d+)?)/i);
  if (!dir || !g) return null;
  return { dir, lo: z ? Math.min(num(z[1]), num(z[2])) : null, hi: z ? Math.max(num(z[1]), num(z[2])) : null, tgt: num(g[1]) };
}
function planB(t) {   // „Schließt eine 1H-Kerze über 3905.86, ist das bärische Bild ungültig → dann eher Richtung PDH 3923.08.“
  if (!t) return null;
  const m = t.match(/(über|unter|above|below)\s*(\d{3,}(?:\.\d+)?)/i); if (!m) return null;
  const g = t.match(/Richtung\s*(?:[A-Z]{2,4}\s*)?(\d{3,}(?:\.\d+)?)/i);
  return { side: /über|above/i.test(m[1]) ? 1 : -1, lvl: num(m[2]), tgt: g ? num(g[1]) : null, h1: /1H|Stunde/i.test(t) };
}
const zkind = (l) => (/FVG/i.test(l) ? "FVG" : /OB|Order/i.test(l) ? "OB" : /EQ|Range/i.test(l) ? "EQ" : "andere");
const ztf = (l) => ((l.match(/\b(\d+[mHhDW])\b/) || [])[1] || "?").toUpperCase().replace("M", "m");

export function evalOutlook(o, C, now) {   // C: 5-Min.-Kerzen {t,o,h,l,c} aufsteigend im Zeitraum
  const P = o.p, { from, to } = period(o), done = now > to + 600 && (C.length && C[C.length - 1].t >= to - 3 * 86400);
  const K = C.filter((k) => k.t >= from && k.t < to); if (!K.length) return { state: "keine Kurse", done: now > to + 3 * 86400 };
  const start = K[0].o, last = K[K.length - 1].c, hi = Math.max(...K.map((k) => k.h)), lo = Math.min(...K.map((k) => k.l));
  const bdir = /bär|bear|short/i.test(P.bias || "") ? -1 : /bull|long/i.test(P.bias || "") ? 1 : 0;
  const E = { from, to, done, start, last, hi, lo, move: last - start, bias: P.bias, biasOk: bdir ? Math.sign(last - start) === bdir : null, zones: [], liq: [], a: null, b: null };
  // Zonen: erreicht? gehalten (Reaktion ≥ max(Zonenhöhe, 0,15 % Kurs) in Zonenrichtung, bevor ein 5-Min.-Schluss jenseits der Zone kam) oder gebrochen?
  for (const z of P.zones || []) {
    const side = z.side === "supply" ? -1 : 1, m = Math.max(z.hi - z.lo, start * 0.0015);
    const i = K.findIndex((k) => k.l <= z.hi && k.h >= z.lo); let res = "nicht erreicht", t = null;
    if (i >= 0) {
      t = K[i].t; res = "offen";
      for (let j = i; j < K.length; j++) {
        const k = K[j];
        if (side < 0 ? k.c > z.hi + 1 : k.c < z.lo - 1) { res = "gebrochen"; break; }
        if (side < 0 ? k.l <= z.lo - m : k.h >= z.hi + m) { res = "gehalten"; break; }
      }
      if (res === "offen" && done) res = "unklar";
    }
    E.zones.push({ side: z.side, label: z.label, kind: zkind(z.label), tf: ztf(z.label), star: !!z.star, lo: z.lo, hi: z.hi, res, t });
  }
  for (const l of P.liq || []) E.liq.push({ ...l, swept: l.dir === "up" ? hi >= l.px : lo <= l.px });
  // Plan A: Zone erreicht → was kam zuerst: Ziel oder Ungültigkeit (Plan B)?
  const A = planA((P.plan || [])[0]), B = planB((P.plan || [])[1]);
  const invAt = (k) => B && (B.side > 0 ? k.c > B.lvl : k.c < B.lvl) && (!B.h1 || (k.t + 300) % 3600 === 0);   // 1H-Schluss = letzte 5-Min.-Kerze der Stunde
  if (A) {
    let i = A.lo != null ? K.findIndex((k) => k.l <= A.hi && k.h >= A.lo) : 0, res = i < 0 ? "Zone nicht erreicht" : "offen", e = i >= 0 ? (A.lo != null ? (A.dir < 0 ? Math.max(K[i].o, A.lo) : Math.min(K[i].o, A.hi)) : K[0].o) : null;
    if (i >= 0) for (let j = i; j < K.length; j++) { const k = K[j]; if (invAt(k)) { res = "ungültig"; break; } if (A.dir < 0 ? k.l <= A.tgt : k.h >= A.tgt) { res = "Ziel erreicht"; break; } }
    if (res === "offen" && done) res = "Ziel nicht erreicht";
    E.a = { ...A, res, e, pts: e != null ? A.dir * (A.tgt - e) : null };
  }
  if (B) {
    const i = K.findIndex(invAt); let res = i < 0 ? "nicht ausgelöst" : "ausgelöst";
    if (i >= 0 && B.tgt != null) { res = "ausgelöst, Ziel offen"; for (let j = i; j < K.length; j++) if (B.side > 0 ? K[j].h >= B.tgt : K[j].l <= B.tgt) { res = "ausgelöst, Ziel erreicht"; break; } if (res === "ausgelöst, Ziel offen" && done) res = "ausgelöst, Ziel nicht erreicht"; }
    E.b = { ...B, res };
  }
  return E;
}

export function olStats(rows) {   // Gesamtbild über alle ausgewerteten Ausblicke
  const S = { n: 0, bias: [0, 0], a: {}, b: {}, zones: {}, liq: [0, 0] };
  const inc = (o, k, ok) => { o[k] ||= { held: 0, broke: 0, miss: 0 }; o[k][ok]++; };
  for (const r of rows) {
    const E = r.E; if (!E || !E.done) continue; S.n++;
    if (E.biasOk != null) { S.bias[1]++; if (E.biasOk) S.bias[0]++; }
    if (E.a) S.a[E.a.res] = (S.a[E.a.res] || 0) + 1;
    if (E.b) S.b[E.b.res] = (S.b[E.b.res] || 0) + 1;
    for (const z of E.zones) {
      const ok = z.res === "gehalten" ? "held" : z.res === "gebrochen" ? "broke" : z.res === "nicht erreicht" ? "miss" : null; if (!ok) continue;
      for (const k of ["alle", z.kind, z.tf + " " + z.kind, z.star ? "⭐ Konfluenz" : "ohne ⭐", z.side === "supply" ? "Supply" : "Demand"]) inc(S.zones, k, ok);
    }
    for (const l of E.liq) { S.liq[1]++; if (l.swept) S.liq[0]++; }
  }
  return S;
}

export async function olTick(env, say, kvGet, kvPut) {
  let R; try { R = (await env.DB.prepare("SELECT id, day, kind, created, parsed, eval FROM outlooks ORDER BY created DESC LIMIT 200").all()).results; }
  catch (e) {
    if (/no such column: eval/.test(e.message)) { await env.DB.prepare("ALTER TABLE outlooks ADD COLUMN eval TEXT").run(); return "Ausblicke: Spalte eval angelegt"; }
    if (/no such table/.test(e.message)) return "Ausblicke: noch keine"; throw e;
  }
  const now = Math.floor(Date.now() / 1000); let n = 0; const fin = [];
  for (const r of R) {
    const old = r.eval ? JSON.parse(r.eval) : null; if (old?.done) continue;
    const o = { ...r, p: JSON.parse(r.parsed || "{}") }; if (!o.p.day) continue;
    const { from, to } = period(o); if (now < from + 600) continue;
    const C = (await env.DB.prepare("SELECT t, o, h, l, c FROM hub_candles WHERE tf = '5m' AND t >= ? AND t < ? ORDER BY t").bind(from - 300, to).all()).results;
    const E = evalOutlook(o, C, now);
    await env.DB.prepare("UPDATE outlooks SET eval = ? WHERE id = ?").bind(JSON.stringify(E), r.id).run(); n++;
    if (E.done && E.zones) fin.push({ o, E });
  }
  // Fertig ausgewertete Ausblicke kurz melden
  for (const { o, E } of fin) {
    const z = E.zones.filter((x) => x.res !== "nicht erreicht");
    await say(env, `🧭 Dein ${o.p.kind === "woche" ? "Wochen" : "Tages"}ausblick ${o.p.day.slice(8, 10)}.${o.p.day.slice(5, 7)}. – Auswertung\n` +
      `Bias ${o.p.bias || "?"}: ${E.biasOk == null ? "–" : E.biasOk ? "✅ richtig" : "❌ falsch"} (Gold ${E.start.toFixed(2)} → ${E.last.toFixed(2)}, ${E.move >= 0 ? "+" : ""}${E.move.toFixed(2)} $)\n` +
      (E.a ? `Plan A: ${E.a.res}\n` : "") + (E.b ? `Plan B: ${E.b.res}\n` : "") +
      `Zonen: ${z.length ? z.map((x) => `${x.label} ${x.side === "supply" ? "Supply" : "Demand"} ${x.res === "gehalten" ? "✅" : x.res === "gebrochen" ? "❌" : "➖"}`).join(" · ") : "keine erreicht"}\n` +
      `Liquidität geholt: ${E.liq.filter((l) => l.swept).map((l) => l.label).join(", ") || "keine"}`);
  }
  // Gesamtstatistik (für Kommandozentrum + sonntags als Bericht)
  const all = (await env.DB.prepare("SELECT eval FROM outlooks WHERE eval IS NOT NULL").all()).results.map((r) => ({ E: JSON.parse(r.eval) }));
  const S = olStats(all); await kvPut(env, "ol_stats", JSON.stringify(S));
  const wk = "ol_week_" + new Date().toISOString().slice(0, 10);
  if (new Date().getUTCDay() === 0 && new Date().getUTCHours() === 17 && S.n && !(await kvGet(env, wk))) {
    await kvPut(env, wk, "1");
    const pc = (o) => { const t = o.held + o.broke; return t ? Math.round((o.held / t) * 100) + " % (" + o.held + "/" + t + ")" : "–"; };
    const zl = Object.entries(S.zones).filter(([, v]) => v.held + v.broke >= 2).sort((a, b) => b[1].held + b[1].broke - (a[1].held + a[1].broke)).slice(0, 8).map(([k, v]) => `${k}: ${pc(v)}`);
    await say(env, `🧭 Deine Ausblick-Bilanz (${S.n} ausgewertet)\nBias richtig: ${S.bias[1] ? Math.round((S.bias[0] / S.bias[1]) * 100) + " % (" + S.bias[0] + "/" + S.bias[1] + ")" : "–"}\n` +
      `Plan A: ${Object.entries(S.a).map(([k, v]) => k + " " + v).join(" · ") || "–"}\nZonen gehalten (wenn erreicht):\n· ${zl.join("\n· ") || "noch zu wenig"}\nLiquidität geholt: ${S.liq[1] ? Math.round((S.liq[0] / S.liq[1]) * 100) + " %" : "–"}\n` +
      `Daraus lernen: Zonen-Arten mit hoher Haltequote stärker gewichten, schwache nur mit zusätzlicher Bestätigung handeln.`);
  }
  return `Ausblicke: ${n} geprüft, ${S.n} fertig ausgewertet`;
}
