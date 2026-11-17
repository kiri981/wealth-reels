// WC Trading Hub – gemeinsamer Helius-Zugang (v3.0): Stapelanfragen in kleine Teile (≤ 8) mit Pause, bei 429 (zu viele Anfragen) bis zu 3× warten und wiederholen.
// Hintergrund: Der kostenlose Helius-Zugang erlaubt nur ~10 Anfragen/Sekunde; eine Stapelanfrage mit 50 Transaktionen zählt wie 50 Anfragen.
const URL_ = (env) => `https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_KEY}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function one(env, body) {
  for (let k = 0; k < 4; k++) {
    const r = await fetch(URL_(env), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) return r.json();
    if (r.status !== 429 || k === 3) throw new Error("Helius " + r.status);
    await sleep(1200 * (k + 1));
  }
}
export async function rpc(env, body) {
  if (!Array.isArray(body)) return one(env, body);
  const out = [];
  for (let i = 0; i < body.length; i += 8) {
    if (i) await sleep(900);
    const res = await one(env, body.slice(i, i + 8));
    if (Array.isArray(res)) out.push(...res);
  }
  return out;
}
