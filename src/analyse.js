// Reads data/draws.json, computes pattern statistics per game, writes data/analysis.json.
// Run: npm run analyse

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES } from './games.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

/* ---------- small stats helpers ---------- */

// Lower regularised incomplete gamma P(s,x), series + continued fraction.
function gammaln(x) {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function lowerGamma(s, x) {
  if (x < 0 || s <= 0) return NaN;
  if (x === 0) return 0;
  if (x < s + 1) {
    let ap = s;
    let sum = 1 / s;
    let del = sum;
    for (let n = 0; n < 500; n++) {
      ap++;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
    }
    return sum * Math.exp(-x + s * Math.log(x) - gammaln(s));
  }
  // continued fraction for the upper tail, then complement
  let b = x + 1 - s;
  let c = 1e300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 500; i++) {
    const an = -i * (i - s);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return 1 - Math.exp(-x + s * Math.log(x) - gammaln(s)) * h;
}

// P(X > chi2) for the given degrees of freedom.
function chiSquareP(chi2, df) {
  if (!isFinite(chi2) || chi2 <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - lowerGamma(df / 2, chi2 / 2)));
}

const sum = (a) => a.reduce((x, y) => x + y, 0);
const mean = (a) => (a.length ? sum(a) / a.length : 0);
function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function percentile(a, p) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const i = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))));
  return s[i];
}

/* ---------- per-pool frequency ---------- */

// draws are newest-first, so index 0 == "0 draws ago".
function poolStats(draws, pick, max, total) {
  const count = new Array(max + 1).fill(0);
  const lastIdx = new Array(max + 1).fill(null);

  draws.forEach((balls, i) => {
    for (const n of balls) {
      if (n < 1 || n > max) continue;
      count[n]++;
      if (lastIdx[n] === null) lastIdx[n] = i;
    }
  });

  const expected = (total * pick) / max;
  const rows = [];
  for (let n = 1; n <= max; n++) {
    rows.push({
      n,
      count: count[n],
      expected: Number(expected.toFixed(2)),
      // +/- % vs. what a fair machine would produce
      deviation: expected ? Number((((count[n] - expected) / expected) * 100).toFixed(1)) : 0,
      drawsSince: lastIdx[n] === null ? total : lastIdx[n],
      lastSeen: lastIdx[n] === null ? null : draws.__dates[lastIdx[n]],
    });
  }

  // chi-square goodness of fit against a uniform machine
  let chi2 = 0;
  if (expected > 0) for (let n = 1; n <= max; n++) chi2 += (count[n] - expected) ** 2 / expected;
  const df = max - 1;
  const p = chiSquareP(chi2, df);

  return {
    rows,
    expected: Number(expected.toFixed(2)),
    chi2: Number(chi2.toFixed(2)),
    df,
    p: Number(p.toFixed(4)),
    // Is the observed spread wider than chance would explain?
    biased: p < 0.05,
  };
}

/* ---------- shape / pattern stats ---------- */

function shapeStats(mains, max) {
  const sums = mains.map(sum);
  const oddEven = {};
  const lowHigh = {};
  const half = Math.floor(max / 2);
  let withConsecutive = 0;
  let repeatCount = 0;
  const spans = [];

  mains.forEach((m, i) => {
    const odds = m.filter((n) => n % 2 === 1).length;
    const key = `${odds}/${m.length - odds}`;
    oddEven[key] = (oddEven[key] || 0) + 1;

    const low = m.filter((n) => n <= half).length;
    const lk = `${low}/${m.length - low}`;
    lowHigh[lk] = (lowHigh[lk] || 0) + 1;

    const s = [...m].sort((a, b) => a - b);
    if (s.some((v, j) => j > 0 && v === s[j - 1] + 1)) withConsecutive++;
    spans.push(s[s.length - 1] - s[0]);

    // how often a number carries over from the previous (more recent) draw
    if (i < mains.length - 1) {
      const prev = new Set(mains[i + 1]);
      if (m.some((n) => prev.has(n))) repeatCount++;
    }
  });

  // decade buckets: 1-9, 10-19, ...
  const buckets = {};
  for (const m of mains) {
    for (const n of m) {
      const b = Math.floor(n / 10) * 10;
      const label = b === 0 ? '1-9' : `${b}-${b + 9}`;
      buckets[label] = (buckets[label] || 0) + 1;
    }
  }

  return {
    sum: {
      min: Math.min(...sums),
      max: Math.max(...sums),
      mean: Number(mean(sums).toFixed(1)),
      median: median(sums),
      p10: percentile(sums, 10),
      p90: percentile(sums, 90),
    },
    span: { mean: Number(mean(spans).toFixed(1)), median: median(spans) },
    oddEven: Object.fromEntries(Object.entries(oddEven).sort((a, b) => b[1] - a[1])),
    lowHigh: Object.fromEntries(Object.entries(lowHigh).sort((a, b) => b[1] - a[1])),
    consecutivePct: Number(((withConsecutive / mains.length) * 100).toFixed(1)),
    repeatFromPrevPct: Number(((repeatCount / Math.max(1, mains.length - 1)) * 100).toFixed(1)),
    buckets,
  };
}

// Most frequent pairs, with the count chance alone would predict.
function pairStats(mains, pick, max, topN = 12) {
  const counts = new Map();
  for (const m of mains) {
    const s = [...m].sort((a, b) => a - b);
    for (let i = 0; i < s.length; i++)
      for (let j = i + 1; j < s.length; j++) {
        const k = `${s[i]}-${s[j]}`;
        counts.set(k, (counts.get(k) || 0) + 1);
      }
  }
  const pairsPerDraw = (pick * (pick - 1)) / 2;
  const totalPairsPossible = (max * (max - 1)) / 2;
  const expected = (mains.length * pairsPerDraw) / totalPairsPossible;

  return {
    expected: Number(expected.toFixed(2)),
    top: [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([k, c]) => ({ pair: k.split('-').map(Number), count: c })),
  };
}

/* ---------- monthly trend for the sparkline ---------- */

function monthlyCounts(dates) {
  const m = {};
  for (const d of dates) {
    const k = d.slice(0, 7);
    m[k] = (m[k] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(m).sort());
}

/* ---------- main ---------- */

async function main() {
  const raw = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'draws.json'), 'utf8'));
  const out = {
    generatedAt: new Date().toISOString(),
    sourceGeneratedAt: raw.generatedAt,
    windowMonths: raw.months,
    cutoff: raw.cutoff,
    games: {},
  };

  for (const game of GAMES) {
    const draws = raw.games[game.id] || [];
    if (!draws.length) {
      console.warn(`! ${game.name}: no draws, skipping`);
      continue;
    }

    const dates = draws.map((d) => d.date);
    const mains = draws.map((d) => d.main);
    const extras = draws.map((d) => d.extra);
    mains.__dates = dates;
    extras.__dates = dates;

    const main = poolStats(mains, game.main.count, game.main.max, draws.length);
    const extra = poolStats(extras, game.extra.count, game.extra.max, draws.length);

    const byCount = [...main.rows].sort((a, b) => b.count - a.count || a.n - b.n);
    const byOverdue = [...main.rows].sort((a, b) => b.drawsSince - a.drawsSince || a.n - b.n);

    out.games[game.id] = {
      meta: {
        id: game.id,
        name: game.name,
        region: game.region,
        schedule: game.draws,
        mainCount: game.main.count,
        mainMax: game.main.max,
        mainLabel: game.main.label,
        extraCount: game.extra.count,
        extraMax: game.extra.max,
        extraLabel: game.extra.label,
        extraClass: game.extra.class,
        // false when the secondary ball is drawn rather than chosen on the ticket
        extraPlayerPicks: game.extra.playerPicks !== false,
        draws: draws.length,
        from: dates[dates.length - 1],
        to: dates[0],
      },
      main,
      extra,
      hot: byCount.slice(0, 8),
      cold: byCount.slice(-8).reverse(),
      overdue: byOverdue.slice(0, 8),
      hotExtra: [...extra.rows].sort((a, b) => b.count - a.count).slice(0, 5),
      overdueExtra: [...extra.rows].sort((a, b) => b.drawsSince - a.drawsSince).slice(0, 5),
      shape: shapeStats(mains, game.main.max),
      pairs: pairStats(mains, game.main.count, game.main.max),
      monthly: monthlyCounts(dates),
      recent: draws.slice(0, 12),
    };

    const g = out.games[game.id];
    console.log(
      `${game.name.padEnd(13)} ${String(draws.length).padStart(4)} draws  ` +
        `chi2=${main.chi2} p=${main.p} ${main.biased ? '<= spread beyond chance' : '(consistent with a fair draw)'}`
    );
  }

  await fs.writeFile(path.join(DATA_DIR, 'analysis.json'), JSON.stringify(out, null, 1));
  console.log('\nWrote data/analysis.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
