// Inlines the dashboard + analysis into one self-contained HTML file that can
// be published as a claude.ai Artifact (its sandbox blocks all network calls,
// so nothing may be linked — everything ships in the file).
// Run: npm run artifact

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const read = (p) => fs.readFile(path.join(ROOT, p), 'utf8');

const fmt = (iso) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

async function main() {
  const [html, css, js, analysis] = await Promise.all([
    read('public/index.html'),
    read('public/styles.css'),
    read('public/app.js'),
    read('data/analysis.json'),
  ]);

  const data = JSON.parse(analysis);
  const totalDraws = Object.values(data.games).reduce((s, g) => s + g.meta.draws, 0);
  const latest = Object.values(data.games)
    .map((g) => g.meta.to)
    .sort()
    .pop();

  // Take only what sits between <body> and </body>; the artifact host supplies
  // the document skeleton, so no doctype/html/head/body of our own.
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>')).trim();

  // Strip the module script tag and the stylesheet link — both are inlined.
  const markup = body
    .replace(/<script[^>]*src="\/app\.js"[^>]*><\/script>/, '')
    .trim();

  // </script> inside the JSON payload would close the tag early.
  const json = JSON.stringify(data).replace(/<\/script/gi, '<\\/script');

  const out = `<title>Lottery Lab — 12 months of UK lottery draws</title>
<style>
${css}
/* the artifact is a fixed snapshot, so the freshness line is part of the page */
.snapshot{
  display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;
  margin:0 clamp(16px,4vw,44px) 18px;padding:11px 15px;
  background:var(--sunk);border:1px solid var(--line);border-radius:10px;
  color:var(--muted);font-size:12.5px;max-width:1360px;
}
.snapshot b{color:var(--ink)}
@media(min-width:1449px){.snapshot{margin-left:auto;margin-right:auto}}
</style>

<div class="snapshot">
  <span>Snapshot of <b>${totalDraws}</b> draws, latest <b>${fmt(latest)}</b>.</span>
  <span>Figures are fixed at the moment this page was built — re-run the scraper locally and republish to bring it up to date.</span>
</div>

${markup}

<script>window.__LOTTERY_DATA__ = ${json};</script>
<script type="module">
${js}
</script>
`;

  const dest = path.join(ROOT, 'artifact', 'lottery-lab.html');
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, out);
  const kb = (Buffer.byteLength(out) / 1024).toFixed(0);
  console.log(`Wrote artifact/lottery-lab.html (${kb} KB, ${totalDraws} draws, latest ${latest})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
