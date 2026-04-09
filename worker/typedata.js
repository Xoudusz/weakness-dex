// Mirrors js/data.js (typeChart) and js/render.js:calcWeaknesses.
// Keep in sync with those files if type matchup data ever changes.

// typeChart[defending][attacking] = multiplier
export const typeChart = {
  normal:    { ghost:0, fighting:2 },
  fighting:  { rock:0.5, bug:0.5, dark:0.5, flying:2, psychic:2, fairy:2 },
  flying:    { ground:0, fighting:0.5, bug:0.5, grass:0.5, rock:2, electric:2, ice:2 },
  poison:    { fighting:0.5, poison:0.5, bug:0.5, grass:0.5, fairy:0.5, ground:2, psychic:2 },
  ground:    { electric:0, poison:0.5, rock:0.5, water:2, grass:2, ice:2 },
  rock:      { normal:0.5, flying:0.5, poison:0.5, fire:0.5, fighting:2, ground:2, steel:2, water:2, grass:2 },
  bug:       { fighting:0.5, ground:0.5, grass:0.5, flying:2, rock:2, fire:2 },
  ghost:     { normal:0, fighting:0, poison:0.5, bug:0.5, ghost:2, dark:2 },
  steel:     { poison:0, normal:0.5, flying:0.5, rock:0.5, bug:0.5, steel:0.5, grass:0.5, psychic:0.5, ice:0.5, dragon:0.5, fairy:0.5, fighting:2, ground:2, fire:2 },
  fire:      { bug:0.5, steel:0.5, fire:0.5, grass:0.5, ice:0.5, fairy:0.5, ground:2, rock:2, water:2 },
  water:     { steel:0.5, fire:0.5, water:0.5, ice:0.5, grass:2, electric:2 },
  grass:     { ground:0.5, water:0.5, grass:0.5, electric:0.5, flying:2, poison:2, bug:2, fire:2, ice:2 },
  electric:  { flying:0.5, steel:0.5, electric:0.5, ground:2 },
  psychic:   { fighting:0.5, psychic:0.5, bug:2, ghost:2, dark:2 },
  ice:       { ice:0.5, fighting:2, rock:2, steel:2, fire:2 },
  dragon:    { fire:0.5, water:0.5, grass:0.5, electric:0.5, ice:2, dragon:2, fairy:2 },
  dark:      { psychic:0, ghost:0.5, dark:0.5, fighting:2, bug:2, fairy:2 },
  fairy:     { dragon:0, fighting:0.5, bug:0.5, dark:0.5, poison:2, steel:2 },
};

export function computeWeaknesses(types) {
  const entries = [];
  for (const atk of Object.keys(typeChart)) {
    let m = 1;
    for (const def of types) { const row = typeChart[def] || {}; m *= row[atk] !== undefined ? row[atk] : 1; }
    if (m > 1) entries.push([atk, m]);
  }
  if (!entries.length) return 'None';
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([t, m]) => `${t[0].toUpperCase() + t.slice(1)} \u00d7${m}`)
    .join(' \u00b7 ');
}
