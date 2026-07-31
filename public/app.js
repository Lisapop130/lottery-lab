/* Lottery Lab dashboard — renders data/analysis.json and generates suggested lines. */

const $ = (id) => document.getElementById(id);
let DATA = null;
let current = null;

/* ---------------- suggestion engine ---------------- */

// Weighted pick without replacement.
function weightedPick(rows, k, weightFn) {
  const pool = rows.map((r) => ({ n: r.n, w: Math.max(1e-6, weightFn(r)) }));
  const out = [];
  for (let i = 0; i < k && pool.length; i++) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let t = Math.random() * total;
    let idx = pool.length - 1;
    for (let j = 0; j < pool.length; j++) {
      t -= pool[j].w;
      if (t <= 0) { idx = j; break; }
    }
    out.push(pool[idx].n);
    pool.splice(idx, 1);
  }
  return out.sort((a, b) => a - b);
}

const uniform = (rows, k) => weightedPick(rows, k, () => 1);

// Most common odd/even split observed in the window, e.g. "3/3".
function topSplitOdds(shape) {
  const key = Object.keys(shape.oddEven)[0];
  return key ? Number(key.split('/')[0]) : null;
}

// Retry a generator until the line looks like a typical draw
// (sum inside the middle 80% band, and the most common odd/even split).
function profiled(gen, shape, tries = 400) {
  const wantOdds = topSplitOdds(shape);
  const { p10, p90 } = shape.sum;
  let best = gen();
  for (let i = 0; i < tries; i++) {
    const line = gen();
    const s = line.reduce((a, b) => a + b, 0);
    const odds = line.filter((n) => n % 2 === 1).length;
    if (s >= p10 && s <= p90 && odds === wantOdds) return line;
    best = line;
  }
  return best;
}

function buildStrategies(g) {
  const rows = g.main.rows;
  const ex = g.extra.rows;
  const k = g.meta.mainCount;
  const ek = g.meta.extraCount;
  const maxCount = Math.max(...rows.map((r) => r.count)) || 1;
  const maxSince = Math.max(...rows.map((r) => r.drawsSince)) || 1;

  const hotW = (r) => Math.pow(r.count / maxCount, 3) + 0.02;
  const coldW = (r) => Math.pow(1 - r.count / maxCount, 3) + 0.02;
  const dueW = (r) => Math.pow(r.drawsSince / maxSince, 2.5) + 0.02;

  return [
    {
      key: 'hot',
      name: 'Hot streak',
      note: 'Weighted towards the most-drawn balls',
      main: () => weightedPick(rows, k, hotW),
      extra: () => weightedPick(ex, ek, hotW),
    },
    {
      key: 'due',
      name: 'Long overdue',
      note: 'Weighted towards balls that have waited longest',
      main: () => weightedPick(rows, k, dueW),
      extra: () => weightedPick(ex, ek, dueW),
    },
    {
      key: 'cold',
      name: 'Cold contrarian',
      note: 'Weighted towards the least-drawn balls',
      main: () => weightedPick(rows, k, coldW),
      extra: () => weightedPick(ex, ek, coldW),
    },
    {
      key: 'balanced',
      name: 'Typical shape',
      note: 'Random, but matching the commonest sum and odd/even split',
      main: () => profiled(() => uniform(rows, k), g.shape),
      extra: () => uniform(ex, ek),
    },
    {
      key: 'dip',
      name: 'Lucky dip',
      note: 'Pure chance — the honest baseline to compare against',
      main: () => uniform(rows, k),
      extra: () => uniform(ex, ek),
    },
  ];
}

/* ---------------- rendering ---------------- */

const fmtDate = (iso) => {
  const [y, m, d] = iso.split('-');
  return new Date(Date.UTC(+y, +m - 1, +d)).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
};

function ball(n, cls = '') {
  return `<div class="ball ${cls}">${n}</div>`;
}

function ballWithMeta(n, meta, cls = '') {
  return `<div class="ballwrap">${ball(n, cls)}<span class="meta">${meta}</span></div>`;
}

function renderTabs() {
  $('gameTabs').innerHTML = Object.values(DATA.games)
    .map(
      (g) => `<button class="tab" role="tab" data-id="${g.meta.id}"
        aria-selected="${g.meta.id === current}">
        ${g.meta.name}<span class="flag">${g.meta.region}</span></button>`
    )
    .join('');
  for (const btn of $('gameTabs').querySelectorAll('.tab')) {
    btn.onclick = () => { current = btn.dataset.id; render(); };
  }
}

function renderStats(g) {
  const s = g.shape;
  const cells = [
    ['Draws analysed', g.meta.draws, g.meta.schedule],
    ['Window', `${fmtDate(g.meta.from)}`, `to ${fmtDate(g.meta.to)}`],
    ['Hottest ball', g.hot[0].n, `${g.hot[0].count} times`],
    ['Longest wait', g.overdue[0].n, `${g.overdue[0].drawsSince} draws ago`],
    ['Typical sum', s.sum.median, `usually ${s.sum.p10}–${s.sum.p90}`],
    ['Fairness test', g.main.biased ? 'Uneven' : 'Fair', `p = ${g.main.p.toFixed(3)}`],
  ];
  $('statRow').innerHTML = cells
    .map(([k, v, sub]) => `<div class="stat"><div class="k">${k}</div>
      <div class="v">${v} <small>${sub}</small></div></div>`)
    .join('');
}

function renderChart(g) {
  const rows = g.main.rows;
  const exp = g.main.expected;
  const max = Math.max(...rows.map((r) => r.count), exp) * 1.12;
  const el = $('freqChart');
  el.innerHTML =
    rows
      .map((r) => {
        const h = (r.count / max) * 100;
        const up = r.count >= exp;
        const showLab = rows.length <= 50 || r.n % 5 === 0;
        const tip =
          `<b>Ball ${r.n}</b> — drawn ${r.count}×<br>expected ${r.expected} · ` +
          `${r.deviation > 0 ? '+' : ''}${r.deviation}%<br>` +
          `last seen ${r.lastSeen ? fmtDate(r.lastSeen) : 'not in window'}`;
        return `<div class="bar ${up ? 'up' : ''}" style="height:${h.toFixed(2)}%"
            data-tip="${tip.replace(/"/g, '&quot;')}">
          ${showLab ? `<span class="lab">${r.n}</span>` : ''}
        </div>`;
      })
      .join('') +
    `<div class="expline" style="bottom:${22 + (exp / max) * (190 - 22)}px"></div>` +
    `<div class="charttip" id="chartTip" hidden></div>`;

  // One shared tooltip, clamped inside the chart, so 69 hidden popups can't
  // stretch the card's scroll width.
  const tipEl = $('chartTip');
  el.onmousemove = (e) => {
    const bar = e.target.closest('.bar');
    if (!bar) { tipEl.hidden = true; return; }
    tipEl.hidden = false;
    tipEl.innerHTML = bar.dataset.tip;
    const cb = el.getBoundingClientRect();
    const bb = bar.getBoundingClientRect();
    const w = tipEl.offsetWidth;
    let left = bb.left - cb.left + bb.width / 2 - w / 2;
    left = Math.max(0, Math.min(left, cb.width - w));
    tipEl.style.left = `${left}px`;
    tipEl.style.bottom = `${cb.bottom - bb.top + 8}px`;
  };
  el.onmouseleave = () => { tipEl.hidden = true; };
}

function renderBalls(g) {
  $('hotBalls').innerHTML = g.hot
    .map((r) => ballWithMeta(r.n, `${r.count}×`, 'gold'))
    .join('');
  $('coldBalls').innerHTML = g.cold
    .map((r) => ballWithMeta(r.n, `${r.count}×`, 'cool'))
    .join('');
  $('overdueBalls').innerHTML = g.overdue
    .map((r) => ballWithMeta(r.n, `${r.drawsSince} ago`))
    .join('');
  $('extraLabelHot').textContent =
    g.meta.extraLabel.toLowerCase() + (g.meta.extraPlayerPicks ? '' : ' (drawn, not chosen)');
  $('hotExtra').innerHTML = g.hotExtra
    .map((r) => ballWithMeta(r.n, `${r.count}×`, g.meta.extraClass))
    .join('');
}

function renderPicks(g) {
  const strategies = buildStrategies(g);
  const picksExtra = g.meta.extraPlayerPicks;
  $('pickList').innerHTML = strategies
    .map((s) => {
      const main = s.main();
      const extra = picksExtra ? s.extra() : [];
      return `<div class="pick" data-line="${main.join(' ')}${picksExtra ? ` | ${extra.join(' ')}` : ''}">
        <div class="name"><b>${s.name}</b><span>${s.note}</span></div>
        <div class="line">
          ${main.map((n) => ball(n, 'gold')).join('')}
          ${picksExtra
            ? `<span class="sep">+</span>${extra.map((n) => ball(n, g.meta.extraClass)).join('')}`
            : ''}
        </div>
      </div>`;
    })
    .join('');
  $('rolledNote').textContent = picksExtra
    ? `${g.meta.mainCount} ${g.meta.mainLabel.toLowerCase()} + ${g.meta.extraCount} ${g.meta.extraLabel.toLowerCase()}`
    : `${g.meta.mainCount} ${g.meta.mainLabel.toLowerCase()} — the ${g.meta.extraLabel.toLowerCase()} is drawn, not chosen`;
}

function renderShape(g) {
  const s = g.shape;
  const total = g.meta.draws;
  const dist = (obj) =>
    Object.entries(obj)
      .slice(0, 5)
      .map(
        ([k, v], i) =>
          `<span class="dpill ${i === 0 ? 'top' : ''}">${k} <b>${Math.round((v / total) * 100)}%</b></span>`
      )
      .join('');

  $('shapeBox').innerHTML = `
    <div class="srow"><div class="k">Odd / even split</div><div class="dist">${dist(s.oddEven)}</div></div>
    <div class="srow"><div class="k">Low / high split (1–${Math.floor(g.meta.mainMax / 2)} vs above)</div><div class="dist">${dist(s.lowHigh)}</div></div>
    <div class="srow"><div class="k">Sum of the ${g.meta.mainCount} main balls</div>
      <div class="v">Median <b>${s.sum.median}</b> · middle 80% falls between <b>${s.sum.p10}</b> and <b>${s.sum.p90}</b>
      <span style="color:var(--muted)"> (range ${s.sum.min}–${s.sum.max})</span></div></div>
    <div class="srow"><div class="k">Contains at least one consecutive pair</div>
      <div class="v"><b>${s.consecutivePct}%</b> of draws</div></div>
    <div class="srow"><div class="k">Shares a number with the previous draw</div>
      <div class="v"><b>${s.repeatFromPrevPct}%</b> of draws</div></div>
    <div class="srow"><div class="k">Average gap between lowest and highest ball</div>
      <div class="v"><b>${s.span.mean}</b></div></div>`;
}

function renderBuckets(g) {
  const b = g.shape.buckets;
  const entries = Object.entries(b).sort(
    (x, y) => parseInt(x[0]) - parseInt(y[0])
  );
  const max = Math.max(...entries.map((e) => e[1]));
  $('bucketBox').innerHTML = entries
    .map(
      ([k, v]) => `<div class="brow"><span class="bk">${k}</span>
      <span class="track"><span class="fill" style="width:${(v / max) * 100}%"></span></span>
      <span class="bv">${v}</span></div>`
    )
    .join('');

  $('pairExpected').textContent = g.pairs.expected;
  $('pairBox').innerHTML = g.pairs.top
    .map(
      (p) => `<span class="pairchip">
        <span class="mini">${p.pair[0]}</span><span class="mini">${p.pair[1]}</span>
        <span class="n">${p.count}×</span></span>`
    )
    .join('');
}

function renderRecent(g) {
  $('recentBox').innerHTML = g.recent
    .map(
      (d) => `<div class="rrow">
      <span class="d">${fmtDate(d.date)}</span>
      ${d.round ? `<span class="rd">R${d.round}</span>` : ''}
      <span class="balls">
        ${d.main.map((n) => ball(n, 'gold')).join('')}
        <span class="sep" style="color:var(--muted);margin:0 4px">+</span>
        ${d.extra.map((n) => ball(n, g.meta.extraClass)).join('')}
      </span></div>`
    )
    .join('');
}

function renderVerdict(g) {
  const el = $('verdict');
  if (g.main.biased) {
    el.className = 'verdict bias';
    el.innerHTML = `<div class="icon">◆</div><div>
      <h3>This game's numbers came up unevenly over the window</h3>
      <p>Across ${g.meta.draws} draws the spread of results is wider than chance comfortably explains
      (chi-square ${g.main.chi2} on ${g.main.df} degrees of freedom, p = ${g.main.p}). With a sample this
      small that is far more likely to be ordinary short-run noise than a faulty machine — over a longer
      window it almost always flattens out. Worth noticing, not worth betting the house on.</p></div>`;
  } else {
    el.className = 'verdict fair';
    el.innerHTML = `<div class="icon">✓</div><div>
      <h3>No real pattern — this game looks fair</h3>
      <p>Across ${g.meta.draws} draws the numbers fell almost exactly as a fair machine would produce
      (chi-square ${g.main.chi2} on ${g.main.df} degrees of freedom, p = ${g.main.p}; anything above 0.05
      is consistent with pure chance). The hot and cold numbers below are real history, but they carry no
      predictive power for the next draw. Pick the ones you like the look of.</p></div>`;
  }
}

function render() {
  const g = DATA.games[current];
  if (!g) return;
  for (const btn of $('gameTabs').querySelectorAll('.tab'))
    btn.setAttribute('aria-selected', String(btn.dataset.id === current));

  renderStats(g);
  renderChart(g);
  renderBalls(g);
  renderPicks(g);
  renderShape(g);
  renderBuckets(g);
  renderRecent(g);
  renderVerdict(g);
}

/* ---------------- boot ---------------- */

async function boot() {
  try {
    // The published artifact inlines the analysis (its sandbox blocks network
    // requests); the local server fetches it so a refresh shows up on reload.
    if (window.__LOTTERY_DATA__) {
      DATA = window.__LOTTERY_DATA__;
    } else {
      const res = await fetch('/data/analysis.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      DATA = await res.json();
    }
  } catch (err) {
    $('loadError').hidden = false;
    $('loadError').innerHTML = `<b>Couldn't load the analysis data.</b><br>
      Run <code>npm run refresh</code> in the project folder, then reload this page.
      <br><br>(${err.message})`;
    return;
  }

  current = Object.keys(DATA.games)[0];
  const built = new Date(DATA.generatedAt);
  $('windowLine').textContent =
    `Last ${DATA.windowMonths} months of draws · analysed ${built.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const totalDraws = Object.values(DATA.games).reduce((s, g) => s + g.meta.draws, 0);
  $('topbarMeta').innerHTML = `
    <span class="chip"><b>${Object.keys(DATA.games).length}</b> games</span>
    <span class="chip"><b>${totalDraws}</b> draws analysed</span>
    <span class="chip">since <b>${fmtDate(DATA.cutoff)}</b></span>`;

  renderTabs();
  $('app').hidden = false;
  render();

  $('rollBtn').onclick = () => renderPicks(DATA.games[current]);
  $('copyBtn').onclick = async () => {
    const g = DATA.games[current];
    const lines = [...document.querySelectorAll('.pick')].map((p) => {
      const name = p.querySelector('.name b').textContent;
      return `${name.padEnd(18)} ${p.dataset.line}`;
    });
    const text = `${g.meta.name} — suggested lines\n${lines.join('\n')}`;
    try {
      await navigator.clipboard.writeText(text);
      $('copyBtn').textContent = 'Copied';
      setTimeout(() => ($('copyBtn').textContent = 'Copy all'), 1400);
    } catch {
      $('copyBtn').textContent = 'Copy failed';
      setTimeout(() => ($('copyBtn').textContent = 'Copy all'), 1400);
    }
  };
}

boot();
