// WC Trading Hub – Wallet-Copy (Papier) v1 · 21.11.2026 (Kevin: „genau 1 zu 1 nachmachen“)
// Jede beobachtete Wallet wird auf Papier 1:1 kopiert: Kauft sie einen Coin → wir kaufen 50 $ zum Kurs, den WIR in dem Moment bekommen
// (DexScreener, also mit der echten Verzögerung des Trackers). Verkauft sie einen Teil → wir verkaufen denselben Anteil.
// Kosten: 3 % hin + zurück (Gebühren + Slippage). Notbremsen: Liquidität weg (Rug), kein Kurs seit 30 Min., spätestens nach 48 Std. raus.
// Ergebnis je Wallet → zeigt, wem sich Kopieren lohnt (nicht, was die Wallet selbst verdient – das ist wegen der Verzögerung etwas anderes).
// Nur Papier – der Hub kauft nichts.
import { prices } from "./runner.js";

export const WCP = { size: 50, start: 5000, cost: 0.03, maxAgeS: 600, maxHoldH: 48, maxOpen: 60, minLiq: 3000, liqDead: 800, noPxS: 1800 };
const half = WCP.cost / 2;

async function schema(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS hub_cpos (id TEXT PRIMARY KEY, addr TEXT, label TEXT, mint TEXT, sym TEXT, t INTEGER, wt INTEGER, px REAL, qty REAL, cost REAL, cash REAL DEFAULT 0, wbuy REAL, wsold REAL DEFAULT 0, last_px REAL, last_seen INTEGER, peak REAL, t_close INTEGER, px_close REAL, pnl REAL, why TEXT)").run();
}

export async function copyTick(env, kvGet, kvPut) {
  await schema(env);
  const now = Math.floor(Date.now() / 1000), log = [];
  const since = +(await kvGet(env, "wcp_seen") || now - 600);
  const X = (await env.DB.prepare("SELECT x.*, w.label FROM hub_wtx x JOIN hub_wallet w ON w.addr = x.addr WHERE x.seen > ? ORDER BY x.t").bind(since).all()).results;
  const O = new Map((await env.DB.prepare("SELECT * FROM hub_cpos WHERE t_close IS NULL").all()).results.map((p) => [p.id, p]));
  const Q = await prices([...new Set([...X.map((x) => x.mint), ...[...O.values()].map((p) => p.mint)])]);
  let opened = 0, sold = 0;
  for (const x of X) {
    const id = x.addr + ":" + x.mint, q = Q[x.mint], p = O.get(id);
    if (x.side > 0) {
      if (p) { p.wbuy += x.amt; await env.DB.prepare("UPDATE hub_cpos SET wbuy = ? WHERE id = ?").bind(p.wbuy, id).run(); continue; }   // Wallet kauft nach → mitzählen (Anteile bleiben 1:1)
      if (now - x.t > WCP.maxAgeS || !q?.px || (q.liq || 0) < WCP.minLiq || O.size >= WCP.maxOpen) continue;
      if (await env.DB.prepare("SELECT 1 FROM hub_cpos WHERE id = ?").bind(id).first()) continue;   // denselben Coin derselben Wallet nur einmal
      const qty = WCP.size * (1 - half) / q.px;
      await env.DB.prepare("INSERT INTO hub_cpos (id, addr, label, mint, sym, t, wt, px, qty, cost, wbuy, last_px, last_seen, peak) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, x.addr, x.label, x.mint, x.sym, now, x.t, q.px, qty, WCP.size, x.amt, q.px, now, q.px).run();
      O.set(id, { id, addr: x.addr, mint: x.mint, sym: x.sym, t: now, px: q.px, qty, cost: WCP.size, cash: 0, wbuy: x.amt, wsold: 0, peak: q.px, last_seen: now }); opened++;
    } else if (p && p.qty > 0) {
      const left = Math.max(p.wbuy - p.wsold, 1e-12), fr = Math.min(1, x.amt / left), px = q?.px || p.last_px;
      const sell = fr >= 0.95 ? p.qty : p.qty * fr;
      p.cash = (p.cash || 0) + sell * px * (1 - half); p.qty -= sell; p.wsold += x.amt; sold++;
      if (p.qty <= 1e-12 || fr >= 0.95) { await close(env, p, px, `Wallet verkauft (${Math.round((now - p.t) / 60)} Min. gehalten)`, true); O.delete(id); }
      else await env.DB.prepare("UPDATE hub_cpos SET qty = ?, cash = ?, wsold = ? WHERE id = ?").bind(p.qty, p.cash, p.wsold, id).run();
    }
  }
  if (X.length) await kvPut(env, "wcp_seen", String(Math.max(...X.map((x) => x.seen))));
  // Notbremsen für offene Positionen
  for (const p of O.values()) {
    const q = Q[p.mint];
    if (!q?.px) { if (now - (p.last_seen || p.t) > WCP.noPxS) { await close(env, p, 0, "kein Kurs seit 30 Min."); } continue; }
    if ((q.liq || 0) < WCP.liqDead) { await close(env, p, 0, "Rug (Liquidität weg)"); continue; }
    if (now - p.t > WCP.maxHoldH * 3600) { await close(env, p, q.px, "Zeit (48 Std.) – Wallet hat nicht verkauft"); continue; }
    await env.DB.prepare("UPDATE hub_cpos SET last_px = ?, last_seen = ?, peak = MAX(COALESCE(peak, 0), ?) WHERE id = ?").bind(q.px, now, q.px, p.id).run();
  }
  return `Wallet-Copy: ${X.length} neue Wallet-Trades, ${opened} kopiert, ${sold} Verkäufe nachgemacht, ${O.size} offen`;
}

async function close(env, p, px, why, cashDone) {
  const cash = (p.cash || 0) + (cashDone ? 0 : p.qty * px * (1 - half));
  await env.DB.prepare("UPDATE hub_cpos SET t_close = ?, px_close = ?, pnl = ?, why = ?, qty = 0, cash = ? WHERE id = ?").bind(Math.floor(Date.now() / 1000), px, cash - p.cost, why, cash, p.id).run();
}

export async function copyData(env) {   // Bilanz je Wallet
  await schema(env);
  const W = (await env.DB.prepare("SELECT addr, MAX(label) label, COUNT(*) n, SUM(t_close IS NOT NULL) closed, ROUND(SUM(COALESCE(pnl, 0)), 1) pnl, ROUND(AVG(CASE WHEN t_close IS NOT NULL THEN pnl > 0 END) * 100) win, ROUND(AVG(CASE WHEN t_close IS NOT NULL THEN (t_close - t) / 60.0 END)) hold, ROUND(AVG(t - wt)) lag FROM hub_cpos GROUP BY addr ORDER BY pnl DESC").all()).results;
  const T = await env.DB.prepare("SELECT COUNT(*) n, ROUND(SUM(COALESCE(pnl, 0)), 1) pnl, SUM(t_close IS NULL) open FROM hub_cpos").first();
  return { total: T, wallets: W };
}
