# Lottery Lab

A personal dashboard that scans the **last 12 months** of draws for five lotteries, looks for
patterns, and suggests lines to play.

| Game | Region | Pick | Draws |
|---|---|---|---|
| Lotto | UK | 6 from 59 | Wed & Sat |
| EuroMillions | UK / EU | 5 from 50 + 2 Lucky Stars from 12 | Tue & Fri |
| Set For Life | UK | 5 from 47 + 1 Life Ball from 10 | Mon & Thu |
| Thunderball | UK | 5 from 39 + 1 Thunderball from 14 | Tue, Wed, Fri & Sat |
| Powerball | US | 5 from 69 + 1 Powerball from 26 | Mon, Wed & Sat |

> There is no UK game called Powerball — the one included here is the US draw, marked `US` in the
> dashboard. Note that Lotto has run **two rounds per draw date** since early 2026; both are counted.

## Running it

```bash
npm run refresh && npm start
```

Then open <http://localhost:5173>.

- `npm run scrape` — fetch draw history into `data/draws.json`
- `npm run analyse` — compute statistics into `data/analysis.json`
- `npm run artifact` — inline everything into `artifact/lottery-lab.html`
- `npm run refresh` — all three of the above
- `npm start` — serve the dashboard

To analyse a different window, pass a number of months: `node src/scrape.js 24`.

No dependencies, no build step, no API keys. Re-run `npm run refresh` whenever you want fresh data.

## The published artifact

The dashboard can be published as a private claude.ai Artifact — a single self-contained page.

It is a **snapshot, not a live feed**. Artifacts run in a sandbox that blocks all network
requests, so the page cannot scrape lottery.co.uk itself — the analysis is inlined into the HTML
at build time, and a banner on the page states which draws it covers.

### Weekly auto-refresh

A scheduled task, `lottery-lab-weekly-refresh`, runs **every Sunday at 09:26** — after Saturday's
Lotto and Thunderball draws, so each refresh picks up a complete week. It re-scrapes, re-analyses,
rebuilds the artifact, and republishes it to the same URL. It refuses to publish if a game returns
zero draws or its count drops sharply, since that means the site changed and the parser is
under-matching rather than that draws stopped.

It runs while the Claude Code app is open; if the app is closed on Sunday, it runs at next launch.
Manage or disable it under **Scheduled** in the sidebar.

### Refreshing by hand

```bash
cd /path/to/uk-lottery-lab && npm run refresh
```

Then ask Claude to republish `artifact/lottery-lab.html`, passing the artifact URL above so it
updates in place rather than minting a new link.

## What it works out

**Per number** — how many times each ball was drawn against what a fair machine would produce,
the percentage deviation, when it was last seen, and how many draws it has been waiting.

**Per draw** — the sum of the main balls (median and the middle-80% band), odd/even split,
low/high split, how often a draw contains a consecutive pair, how often a number carries over
from the previous draw, and how the balls spread across the number ranges.

**Across draws** — the pairs of numbers that landed together most often, against the count
chance alone predicts.

**Fairness test** — a chi-square goodness-of-fit test against a uniform draw. This is the
honest headline: it reports whether the spread of results over the window is anything more
than ordinary randomness. (When last run, all five games passed as fair.)

## The five suggested lines

| Strategy | What it does |
|---|---|
| Hot streak | Weighted towards the most-drawn balls |
| Long overdue | Weighted towards the balls that have waited longest |
| Cold contrarian | Weighted towards the least-drawn balls |
| Typical shape | Random, but re-rolled until the sum and odd/even split match the commonest pattern |
| Lucky dip | Pure chance — the baseline the other four should be compared against |

"Roll new lines" regenerates them; "Copy all" puts them on the clipboard.

Lotto's bonus ball is deliberately excluded from suggested lines — it is drawn from the machine,
not chosen on your ticket. Its frequency is still shown as history.

## An honest note

Lottery draws are independent events. The machine has no memory, so a "hot" or "overdue" number
is **exactly** as likely to come up next time as any other. That is not a caveat bolted on the
end — it is what the chi-square test on the dashboard actually measures, and it reports fair when
the data is fair.

What these strategies genuinely give you is a more interesting way to choose than a Lucky Dip,
plus one small real effect: picking unpopular combinations (avoiding dates, avoiding straight
lines on the slip) does not raise your chance of winning, but it lowers the chance of *sharing*
a jackpot if you do.

For fun and personal use. If gambling stops being fun — [BeGambleAware.org](https://www.begambleaware.org), 0808 8020 133.

## Data

Draw history is scraped from the `lottery.co.uk` yearly archives. The most recent Lotto draw was
cross-checked against the official National Lottery feed and matched exactly. The official feed
only exposes the single latest draw, which is why the archive pages are used for history.

Parsers live in `src/games.js` (game definitions and ball CSS classes) and `src/scrape.js`. If a
game ever returns 0 draws after a site redesign, that is where to look.
