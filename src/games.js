// Game definitions. `slug` is the lottery.co.uk path segment.
// `main` = the pool you pick your main numbers from.
// `extra` = the secondary ball (Lucky Star / Life Ball / Thunderball / Powerball / bonus).

export const GAMES = [
  {
    id: 'lotto',
    slug: 'lotto',
    name: 'Lotto',
    region: 'UK',
    draws: 'Wed & Sat',
    main: { count: 6, max: 59, label: 'Main balls' },
    // The bonus ball is drawn from the same machine, not chosen on your ticket.
    extra: { count: 1, max: 59, label: 'Bonus ball', class: 'bonus', playerPicks: false },
    // Lotto runs two rounds per draw date; both are parsed.
    rounds: true,
    ballClass: /lotto-ball-round-(\d)/,
    extraClass: /lotto-bonus-ball-round-(\d)/,
  },
  {
    id: 'euromillions',
    slug: 'euromillions',
    name: 'EuroMillions',
    region: 'UK / EU',
    draws: 'Tue & Fri',
    main: { count: 5, max: 50, label: 'Main balls' },
    extra: { count: 2, max: 12, label: 'Lucky Stars', class: 'star' },
    ballClass: /euromillions-ball/,
    extraClass: /euromillions-lucky-star/,
  },
  {
    id: 'set-for-life',
    slug: 'set-for-life',
    name: 'Set For Life',
    region: 'UK',
    draws: 'Mon & Thu',
    main: { count: 5, max: 47, label: 'Main balls' },
    extra: { count: 1, max: 10, label: 'Life Ball', class: 'life' },
    ballClass: /setForLife-ball/,
    extraClass: /setForLife-life-ball/,
  },
  {
    id: 'thunderball',
    slug: 'thunderball',
    name: 'Thunderball',
    region: 'UK',
    draws: 'Tue, Wed, Fri & Sat',
    main: { count: 5, max: 39, label: 'Main balls' },
    extra: { count: 1, max: 14, label: 'Thunderball', class: 'thunder' },
    ballClass: /thunderball-ball/,
    extraClass: /thunderball-thunderball/,
  },
  {
    id: 'powerball',
    slug: 'powerball',
    name: 'Powerball',
    region: 'UK / US',
    // Same drawing for both countries. Held Mon/Wed/Sat evening US time, which is
    // early Tue/Thu/Sun in the UK, and lottery.co.uk dates each draw by UK day.
    draws: 'Tue, Thu & Sun (UK time)',
    main: { count: 5, max: 69, label: 'Main balls' },
    extra: { count: 1, max: 26, label: 'Powerball', class: 'power' },
    ballClass: /powerball-ball/,
    extraClass: /powerball-powerball/,
  },
];

export const byId = (id) => GAMES.find((g) => g.id === id);
