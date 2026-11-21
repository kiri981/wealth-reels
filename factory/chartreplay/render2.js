// node render2.js trade.json out.mp4
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const trade = JSON.parse(fs.readFileSync(process.argv[2])); const out = process.argv[3];
trade.candles = trade.candles.map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await p.goto('file://' + __dirname + '/page.html'); await p.evaluate((t) => window.init(t), trade);
  const dir = out + '_f'; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir); const list = []; let k = 0;
  const shot = async (n, dur) => { await p.evaluate((n) => window.step(n), n); await p.waitForTimeout(50); const f = `${dir}/${String(k++).padStart(3, '0')}.png`; await p.screenshot({ path: f }); list.push(`file '${f}'\nduration ${dur}`); };
  const C = trade.candles, iE = C.findIndex((c) => c.time === trade.entryBar), iX = C.findIndex((c) => c.time === trade.exitBar);
  const nTrade = iX - iE + 1, per = Math.min(0.6, Math.max(0.18, 9 / nTrade));   // Trade-Teil ~9 s
  await shot(iE, 1.8);
  for (let n = iE + 1; n <= iX + 1; n++) await shot(n, n === iE + 1 ? 1.2 : per);
  await shot(iX + 1, 3.2);
  list.push(`file '${dir}/${String(k - 1).padStart(3, '0')}.png'`);
  fs.writeFileSync(out + '_list.txt', list.join('\n')); await b.close();
  execSync(`ffmpeg -y -loglevel error -f concat -safe 0 -i ${out}_list.txt -vf "fps=30,format=yuv420p" -c:v libx264 -crf 20 ${out}`);
  console.log(out, k, 'Bilder');
})();
