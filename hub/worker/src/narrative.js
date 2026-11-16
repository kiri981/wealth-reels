// WC Trading Hub – Narrativ-Radar (v3.0, Kevin 17.11.): Worauf basiert ein Meme-Coin, und welche Themen laufen GERADE?
// 1) Jeder Solana-Coin aus dem Radar bekommt ein Thema aus Name + Symbol (Stichwort-Liste unten, erweiterbar).
// 2) Stündlich: je Thema in den letzten 72 Std. – Anzahl neuer Coins, Anteil ≥ 2× / ≥ 5× seit Entdeckung (nur plausible Daten:
//    Liquidität > 1.000 $ und Volumen vorhanden), bester Coin. Ergebnis in hub_kv 'narr'; täglich 9 Uhr (Bukarest) eine Bot-Übersicht.
// 3) Bekannte 100×–1000×-Coins mit Herkunft des Narrativs (Einordnung aus allgemein bekanntem Wissen) für den Vergleich.
export const NARR = {
  "KI / AI-Agent": ["ai", "agent", "gpt", "bot", "neural", "llm", "grok", "claude", "openai", "robot", "agi", "zerebro", "eliza", "virtual"],
  "Hund": ["dog", "doge", "inu", "shib", "pup", "wif", "bonk", "corgi", "shiba", "hound"],
  "Katze": ["cat", "kitty", "meow", "mew", "popcat", "michi", "neko", "kitten"],
  "Frosch / Pepe": ["pepe", "frog", "fwog", "toad", "kek"],
  "Andere Tiere": ["hippo", "moodeng", "squirrel", "pnut", "monkey", "ape", "penguin", "bear", "bull", "goat", "panda", "fish", "duck", "rat", "hamster", "capy", "otter", "sloth", "pig"],
  "Politik": ["trump", "maga", "biden", "elon", "musk", "president", "vote", "kamala", "melania", "vance", "usa", "america"],
  "Promi / Influencer": ["iggy", "kanye", "ye", "drake", "tate", "mrbeast", "ansem", "snoop", "taylor", "celeb"],
  "Internet-Meme / Slang": ["chill", "sigma", "giga", "chad", "based", "lock", "lockin", "rizz", "skibidi", "troll", "wojak", "npc", "aura", "brainrot", "cope", "gm", "wagmi", "ngmi", "moon", "lfg"],
  "Humor / Absurd": ["fart", "butt", "poop", "useless", "retard", "stupid", "dumb", "idiot", "toilet", "cum", "pee", "lmao", "lol", "joke"],
  "Nachrichten / Ereignis": ["news", "breaking", "war", "fed", "rate", "cpi", "election", "trial", "arrest", "ceasefire", "tariff"],
  "Finanzen / Krypto-Parodie": ["btc", "bitcoin", "eth", "sol", "solana", "coin", "money", "cash", "rich", "house", "gold", "dollar", "bank", "stock", "nvidia", "apple"],
  "Gaming / Anime": ["anime", "waifu", "ani", "game", "pixel", "mario", "pokemon", "naruto", "goku"],
  "Asien / China": ["china", "chinese", "dragon", "panda", "大", "中", "币", "龙", "japan", "kawaii"],
};
export function tagNarr(name, sym, desc) {
  const t = `${name || ""} ${sym || ""} ${desc || ""}`.toLowerCase();
  const w = new Set(t.split(/[^a-z0-9一-鿿]+/).filter(Boolean));
  for (const [k, L] of Object.entries(NARR)) if (L.some((x) => (/[一-鿿]/.test(x) ? t.includes(x) : x.length <= 3 ? w.has(x) : t.includes(x)))) return k;
  return "Sonstiges";
}
// Bekannte Großgewinner (Herkunft grob eingeordnet, aus allgemein bekanntem Wissen – keine Garantie für Details)
export const KNOWN = {
  FARTCOIN: ["Humor / Absurd", "Furz-Witz, verbreitet durch den KI-Bot „Truth Terminal“"], GOAT: ["KI / AI-Agent", "KI-Bot „Truth Terminal“ machte den Coin bekannt"],
  PNUT: ["Andere Tiere", "Nachrichten-Ereignis: Eichhörnchen „Peanut“ (USA), politisch aufgeladen"], MOODENG: ["Andere Tiere", "virales Zwergflusspferd aus einem Zoo in Thailand"],
  CHILLGUY: ["Internet-Meme / Slang", "TikTok-Meme „Just a chill guy“"], USELESS: ["Humor / Absurd", "selbstironisch „nutzlos“"], ZEREBRO: ["KI / AI-Agent", "autonomer KI-Künstler-Agent"],
  FWOG: ["Frosch / Pepe", "Frosch-Meme"], MICHI: ["Katze", "Katzen-Meme"], RETARDIO: ["Humor / Absurd", "Degen-Humor"], SIGMA: ["Internet-Meme / Slang", "Jugend-Slang „Sigma“"],
  ACT: ["KI / AI-Agent", "KI-Prophezeiungs-Narrativ"], LOCKIN: ["Internet-Meme / Slang", "Motivations-Slogan „lock in“"], ALCH: ["KI / AI-Agent", "KI-App-Baukasten"],
  GRIFFAIN: ["KI / AI-Agent", "KI-Agenten-Plattform"], BUTTCOIN: ["Humor / Absurd", "Bitcoin-Parodie"], HOUSE: ["Finanzen / Krypto-Parodie", "Witz über Immobilienpreise"],
  TROLL: ["Internet-Meme / Slang", "klassisches Trollface-Meme"], ANI: ["KI / AI-Agent", "KI-Begleiterin aus Grok (xAI)"], JELLYJELLY: ["Promi / Influencer", "App eines bekannten Gründers"],
  VINE: ["Promi / Influencer", "Vine-Mitgründer, Comeback-Narrativ"], KLED: ["KI / AI-Agent", "KI-Daten-App"], AI16Z: ["KI / AI-Agent", "KI-Investmentfonds-Parodie (a16z)"],
  GIGA: ["Internet-Meme / Slang", "Gigachad-Meme"], WIF: ["Hund", "Hund mit Mütze"], BONK: ["Hund", "Community-Hund, Airdrop"], POPCAT: ["Katze", "virales Katzen-Meme"],
  MEW: ["Katze", "Katzen-Gegenbewegung zu Hunde-Coins"], PONKE: ["Andere Tiere", "Affe, Degen-Kultur"], BOME: ["Internet-Meme / Slang", "„Book of Meme“, Meme-Archiv"],
  SLERF: ["Andere Tiere", "Faultier, Panne beim Start wurde zur Story"], MOTHER: ["Promi / Influencer", "Rapperin Iggy Azalea"],
};

export async function narrTick(env, say, kvGet, kvPut) {
  const now = Math.floor(Date.now() / 1000);
  const R = (await env.DB.prepare(`SELECT m.sym, m.name, m.first_mc mc0, (SELECT MAX(s.mc) FROM hub_meme_snap s WHERE s.id = m.id AND s.liq > 1000 AND s.v1h > 0) mx
    FROM hub_meme m WHERE m.chain = 'solana' AND m.first_seen > ? AND m.first_mc >= 5000`).bind(now - 72 * 3600).all()).results;
  const G = {};
  for (const r of R) { const k = tagNarr(r.name, r.sym); const g = (G[k] ||= { n: 0, x2: 0, x5: 0, best: null, bx: 0 }); g.n++;
    const x = r.mx && r.mc0 ? r.mx / r.mc0 : 0; if (x >= 2) g.x2++; if (x >= 5) g.x5++; if (x > g.bx && x < 1000) { g.bx = x; g.best = r.sym; } }
  const all = Object.values(G).reduce((a, g) => a + g.n, 0) || 1, base5 = Object.values(G).reduce((a, g) => a + g.x5, 0) / all;
  const rows = Object.entries(G).map(([k, g]) => ({ k, ...g, share: g.n / all, r5: g.n ? g.x5 / g.n : 0, lift: base5 ? (g.n ? g.x5 / g.n : 0) / base5 : 0 })).sort((a, b) => b.x5 - a.x5 || b.n - a.n);
  await kvPut(env, "narr", JSON.stringify({ t: now, n: R.length, base5, rows }));
  const d = new Date(), loc = (d.getUTCHours() + 2) % 24;
  if (loc === 9 && (await kvGet(env, "narr_day")) !== d.toISOString().slice(0, 10)) {
    await kvPut(env, "narr_day", d.toISOString().slice(0, 10));
    const top = rows.filter((r) => r.n >= 10).slice(0, 6).map((r) => `• ${r.k}: ${r.n} neue Coins (${Math.round(r.share * 100)} %), ${r.x5}× ≥ 5-fach${r.lift >= 1.5 ? " 🔥 " + r.lift.toFixed(1) + "× über Schnitt" : ""}${r.best ? " – bester: " + r.best + " " + r.bx.toFixed(1) + "×" : ""}`);
    await say(env, `🧭 Narrativ-Radar (Solana, letzte 72 Std., ${R.length} Coins)\n${top.join("\n")}\nNur Beobachtung, keine Anlageberatung.`);
  }
  return `Narrative: ${R.length} Coins, ${rows.length} Themen`;
}
