// WC Trading Hub – Hyperliquid-Trader beobachten (v3.3, Kevin 17.11.)
// Hyperliquid ist eine Perp-Börse auf der Blockchain: Positionen jedes Kontos sind öffentlich (kostenlose Info-Schnittstelle, kein Schlüssel).
// Ausgewählt wurden Konten aus der öffentlichen Bestenliste nach Beständigkeit (viele Plus-Monate, kleiner größter Rückgang, kein
// Hochfrequenz-/Market-Maker-Volumen) – nicht nach dem höchsten Gewinn.
// Alle 5 Min.: Positionen lesen → neue Position = Papier-Kopie zum aktuellen Mittelkurs (fester Einsatz 1.000 $ OHNE deren Hebel),
// geschlossen/gedreht = Papier-Kopie schließen. Dazu „Konsens“: wie viele der beobachteten Profis sind gerade long/short je Coin.
// Nur Beobachtung und Papier – kein echter Handel, keine Anlageberatung.
const API = "https://api.hyperliquid.xyz/info";
const NOTIONAL = 1000, FEE = 0.0009;   // 0,045 % je Seite (Hyperliquid Taker)
const post = (body) => fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const nm = (c) => ({ "xyz:GOLD": "Gold", "xyz:SILVER": "Silber", "xyz:SP500": "S&P 500", "xyz:XYZ100": "Nasdaq 100" }[c] || c.replace(/^xyz:/, ""));
const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);

async function schema(env) {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_hl_wallet (addr TEXT PRIMARY KEY, label TEXT, status TEXT DEFAULT 'probe', added TEXT, stats TEXT, note TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_hl_pos (addr TEXT, coin TEXT, szi REAL, entry REAL, lev REAL, val REAL, t INTEGER, PRIMARY KEY (addr, coin))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_hl_trade (id INTEGER PRIMARY KEY AUTOINCREMENT, addr TEXT, coin TEXT, dr INTEGER, t_open INTEGER, px_open REAL, lev REAL, val REAL, t_close INTEGER, px_close REAL, pnl REAL, why TEXT)"),
  ]);
}

export async function hlTick(env, say, kvGet, kvPut) {
  await schema(env);
  const W = (await env.DB.prepare("SELECT addr, label, status FROM hub_hl_wallet WHERE status != 'off'").all()).results;
  if (!W.length) return "Hyperliquid: keine Konten";
  // Haupt-Börse (Krypto) + „xyz“-Börse (HIP-3: Gold, Silber, S&P 500, Nasdaq, Einzelaktien – Coins heißen dort z. B. „xyz:GOLD“)
  const DEX = ["", "xyz"];
  const M = await Promise.all(DEX.map((d) => post(d ? { type: "allMids", dex: d } : { type: "allMids" })));
  if (!M[0]) return "Hyperliquid: Kurse nicht erreichbar";
  const mids = Object.assign({}, ...M.filter(Boolean));
  const now = Math.floor(Date.now() / 1000); let opened = 0, closed = 0, seen = 0;
  const cons = {};
  for (const w of W) {
    const ST = await Promise.all(DEX.map((d) => post(d ? { type: "clearinghouseState", user: w.addr, dex: d } : { type: "clearinghouseState", user: w.addr })));
    if (!ST[0] || (M[1] && !ST[1])) continue; seen++;   // nur vergleichen, wenn beide Börsen gelesen wurden (sonst sähe es wie „geschlossen“ aus)
    const cur = {};
    for (const a of ST.flatMap((st) => st?.assetPositions || [])) { const p = a.position; const szi = +p.szi; if (!szi) continue;
      cur[p.coin] = { szi, entry: +p.entryPx, lev: +(p.leverage?.value || 0), val: Math.abs(+p.positionValue || 0) }; }
    const old = Object.fromEntries((await env.DB.prepare("SELECT coin, szi FROM hub_hl_pos WHERE addr = ?").bind(w.addr).all()).results.map((r) => [r.coin, r.szi]));
    const first = !(await kvGet(env, "hl_init_" + w.addr));
    // geschlossene oder gedrehte Positionen → Papier-Kopie schließen
    for (const [coin, szi] of Object.entries(old)) {
      const n = cur[coin];
      if (!n || Math.sign(n.szi) !== Math.sign(szi)) {
        const px = +mids[coin]; const tr = await env.DB.prepare("SELECT id, dr, px_open FROM hub_hl_trade WHERE addr = ? AND coin = ? AND t_close IS NULL").bind(w.addr, coin).first();
        if (tr && px) { const pnl = NOTIONAL * (tr.dr * (px / tr.px_open - 1) - FEE);
          await env.DB.prepare("UPDATE hub_hl_trade SET t_close = ?, px_close = ?, pnl = ?, why = ? WHERE id = ?").bind(now, px, pnl, n ? "gedreht" : "geschlossen", tr.id).run(); closed++;
          if (w.status === "copy") await say(env, `📡 HL-Trader ${w.label || short(w.addr)}: ${nm(coin)} ${tr.dr > 0 ? "Long" : "Short"} geschlossen – Papier-Kopie ${pnl >= 0 ? "+" : ""}${pnl.toFixed(0)} $ (auf 1.000 $ ohne Hebel).`).catch(() => {}); }
        await env.DB.prepare("DELETE FROM hub_hl_pos WHERE addr = ? AND coin = ?").bind(w.addr, coin).run();
      }
    }
    // neue Positionen → Papier-Kopie öffnen (beim allerersten Lesen nur merken, nicht kopieren – die liefen schon vorher)
    for (const [coin, p] of Object.entries(cur)) {
      const isNew = old[coin] == null || Math.sign(old[coin]) !== Math.sign(p.szi);
      await env.DB.prepare("INSERT INTO hub_hl_pos (addr, coin, szi, entry, lev, val, t) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(addr, coin) DO UPDATE SET szi = excluded.szi, entry = excluded.entry, lev = excluded.lev, val = excluded.val")
        .bind(w.addr, coin, p.szi, p.entry, p.lev, p.val, now).run();
      if (isNew && !first && +mids[coin]) {
        await env.DB.prepare("INSERT INTO hub_hl_trade (addr, coin, dr, t_open, px_open, lev, val) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(w.addr, coin, Math.sign(p.szi), now, +mids[coin], p.lev, p.val).run(); opened++;
        if (w.status === "copy") await say(env, `📡 HL-Trader ${w.label || short(w.addr)}: neu ${p.szi > 0 ? "LONG" : "SHORT"} ${nm(coin)} bei ${p.entry} (${p.lev}× Hebel, ${Math.round(p.val).toLocaleString("de-DE")} $). Papier-Kopie läuft.`).catch(() => {});
      }
      const c = (cons[coin] ||= { long: 0, short: 0, lv: 0, sv: 0 }); if (p.szi > 0) { c.long++; c.lv += p.val; } else { c.short++; c.sv += p.val; }
    }
    if (first) await kvPut(env, "hl_init_" + w.addr, String(now));
  }
  await kvPut(env, "hl_cons", JSON.stringify({ t: now, n: seen, cons }));
  // Tageszusammenfassung 21 Uhr (Bukarest)
  const d = new Date(), loc = (d.getUTCHours() + 2) % 24, day = d.toISOString().slice(0, 10);
  if (loc === 21 && (await kvGet(env, "hl_day")) !== day) {
    await kvPut(env, "hl_day", day);
    const S = (await env.DB.prepare("SELECT w.label, t.addr, COUNT(*) n, SUM(t.pnl > 0) win, SUM(t.pnl) pnl FROM hub_hl_trade t LEFT JOIN hub_hl_wallet w ON w.addr = t.addr WHERE t.t_close IS NOT NULL GROUP BY t.addr ORDER BY pnl DESC").all()).results;
    const top = Object.entries(cons).filter(([, c]) => c.long + c.short >= 3).sort((a, b) => (b[1].long + b[1].short) - (a[1].long + a[1].short)).slice(0, 6)
      .map(([k, c]) => `• ${nm(k)}: ${c.long} long / ${c.short} short`);
    const tot = S.reduce((a, s) => a + (s.pnl || 0), 0), n = S.reduce((a, s) => a + s.n, 0);
    await say(env, `📡 Hyperliquid-Profis (${seen} Konten)\nPapier-Kopien bisher: ${n} geschlossen, ${tot >= 0 ? "+" : ""}${tot.toFixed(0)} $ (je 1.000 $, ohne Hebel)\n` +
      (S.length ? "Beste: " + S.slice(0, 3).map((s) => `${s.label || short(s.addr)} ${s.pnl >= 0 ? "+" : ""}${(s.pnl || 0).toFixed(0)} $ (${s.n})`).join(" · ") + "\n" : "") +
      (top.length ? "Gerade positioniert:\n" + top.join("\n") + "\n" : "") + "Nur Beobachtung, keine Anlageberatung.").catch(() => {});
  }
  return `Hyperliquid: ${seen}/${W.length} Konten, ${opened} neu, ${closed} geschlossen`;
}
