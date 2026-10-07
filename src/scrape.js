// Fetches draw history for every game from lottery.co.uk yearly archive pages
// and writes data/draws.json. Run: npm run refresh

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES } from './games.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function get(url, tries = 5) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (i === tries) throw err;
      // back off 2s, 4s, 8s, 16s so a transient 5xx has time to clear
      await new Promise((r) => setTimeout(r, 2000 * 2 ** (i - 1)));
    }
  }
}

// "/lotto/results-29-07-2026" -> "2026-07-29"
function dateFromHref(href) {
  const m = href.match(/results-(\d{2})-(\d{2})-(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Some rows have no results link, only visible text: "Tuesday 21st July 2026".
function dateFromText(rowHtml) {
  const text = rowHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const m = text.match(/(\d{1,2})(?:st|nd|rd|th)\s+([A-Za-z]{3,9})\.?\s+(\d{4})/);
  if (!m) return null;
  const mm = MONTHS[m[2].slice(0, 3).toLowerCase()];
  if (!mm) return null;
  return `${m[3]}-${String(mm).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

// Pull every <div class="result ...">NN</div> out of a table row, in order.
function resultBalls(rowHtml) {
  const out = [];
  const re = /<div class="([^"]*\bresult\b[^"]*)"[^>]*>\s*([0-9]{1,2})\s*<\/div>/g;
  let m;
  while ((m = re.exec(rowHtml))) out.push({ cls: m[1], n: Number(m[2]) });
  return out;
}

function parseArchive(html, game) {
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
  const draws = [];

  for (const row of rows) {
    const balls = resultBalls(row);
    if (!balls.length) continue;

    const hrefMatch = row.match(new RegExp(`/${game.slug}/results-\\d{2}-\\d{2}-\\d{4}`));
    const date = hrefMatch ? dateFromHref(hrefMatch[0]) : dateFromText(row);
    if (!date) continue;

    if (game.rounds) {
      // Lotto ran a single draw until early 2026, then two rounds per date.
      // Legacy markup: lotto-ball / lotto-bonus-ball (no round suffix).
      const legacyMain = balls.filter((b) => /lotto-ball(?!-round)/.test(b.cls)).map((b) => b.n);
      if (legacyMain.length === game.main.count) {
        const legacyExtra = balls.filter((b) => /lotto-bonus-ball(?!-round)/.test(b.cls)).map((b) => b.n);
        draws.push({ date, round: 1, main: legacyMain.sort((a, b) => a - b), extra: legacyExtra });
        continue;
      }
      for (const round of [1, 2]) {
        const main = balls.filter((b) => b.cls.includes(`lotto-ball-round-${round}`)).map((b) => b.n);
        const extra = balls
          .filter((b) => b.cls.includes(`lotto-bonus-ball-round-${round}`))
          .map((b) => b.n);
        if (main.length === game.main.count) {
          draws.push({ date, round, main: main.sort((a, b) => a - b), extra });
        }
      }
    } else {
      const extra = balls.filter((b) => game.extraClass.test(b.cls)).map((b) => b.n);
      const main = balls
        .filter((b) => game.ballClass.test(b.cls) && !game.extraClass.test(b.cls))
        .map((b) => b.n);
      if (main.length === game.main.count) {
        draws.push({ date, main: main.sort((a, b) => a - b), extra });
      }
    }
  }
  return draws;
}

function yearsToCover(monthsBack = 12) {
  const now = new Date();
  const from = new Date(now);
  from.setMonth(from.getMonth() - monthsBack);
  const years = [];
  for (let y = from.getFullYear(); y <= now.getFullYear(); y++) years.push(y);
  return { years, cutoff: from.toISOString().slice(0, 10) };
}

async function main() {
  const months = Number(process.argv[2]) || 12;
  const { years, cutoff } = yearsToCover(months);
  console.log(`Fetching ${months} months of draws (from ${cutoff}), archive years: ${years.join(', ')}`);

  const out = { generatedAt: new Date().toISOString(), cutoff, months, games: {} };

  for (const game of GAMES) {
    let all = [];
    for (const year of years) {
      const url = `https://www.lottery.co.uk/${game.slug}/results/archive-${year}`;
      try {
        const html = await get(url);
        const draws = parseArchive(html, game);
        all = all.concat(draws);
        console.log(`  ${game.name} ${year}: ${draws.length} draws`);
      } catch (err) {
        console.warn(`  ! ${game.name} ${year}: ${err.message}`);
      }
    }

    // De-duplicate (date + round), keep only the last N months, newest first.
    const seen = new Set();
    const draws = all
      .filter((d) => d.date >= cutoff)
      .filter((d) => {
        const k = `${d.date}#${d.round || 1}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => (a.date === b.date ? (a.round || 1) - (b.round || 1) : a.date < b.date ? 1 : -1));

    out.games[game.id] = draws;
    console.log(`  => ${game.name}: ${draws.length} draws in window\n`);
  }

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, 'draws.json'), JSON.stringify(out, null, 1));
  console.log(`Wrote data/draws.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
