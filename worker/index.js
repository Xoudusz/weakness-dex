/**
 * Weakness Dex — Cloudflare Worker
 *
 * Three jobs:
 *   1. Requests with ?p=<pokemon>          → inject dynamic OG meta tags into the HTML
 *   2. Requests with ?ogimg=1&p=<pokemon>  → return a 1200×630 PNG preview card
 *   3. Requests with ?ogimg=1 (no p)       → return a branded default splash card
 *
 * All other requests pass through to the origin unchanged.
 */

import { Resvg, initWasm } from '@resvg/resvg-wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
import { computeWeaknesses } from './typedata.js';

const SITE_URL     = 'https://weakness-dex.hyvitech.org';
const FALLBACK_DESC = 'Look up Pokémon type weaknesses, resistances, and immunities.';

// Inter font weights fetched once and cached for the worker's lifetime
let fontCache = null;
async function getFonts() {
  if (fontCache) return fontCache;
  const weights = [400, 600, 700];
  const buffers = await Promise.all(
    weights.map(async w => {
      const r = await fetch(
        `https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.8/files/inter-latin-${w}-normal.woff2`
      );
      if (!r.ok) throw new Error(`Font fetch failed: ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    })
  );
  fontCache = buffers;
  return fontCache;
}

const TYPE_COLORS = {
  normal:'#9DA0AA', fire:'#F57D31',   water:'#559EDF',  electric:'#F6C747',
  grass:'#62BB5C',  ice:'#74CEC0',    fighting:'#CE4265',poison:'#AB6AC8',
  ground:'#D97845', flying:'#90A7DA', psychic:'#F66F71', bug:'#91C12F',
  rock:'#CEC18C',   ghost:'#516AAC',  dragon:'#0B72D4',  dark:'#595761',
  steel:'#5A94A0',  fairy:'#EC8FE6',
};

let wasmReady = false;
async function ensureWasm() {
  if (!wasmReady) { await initWasm(resvgWasm); wasmReady = true; }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env, ctx) {
    const url     = new URL(request.url);
    const p       = url.searchParams.get('p');
    const isOgImg = url.searchParams.get('ogimg') === '1';

    if (isOgImg && p)  return handleOgImage(p, url, ctx);
    if (isOgImg && !p) return handleDefaultOgImage(url, ctx);
    if (!p)            return fetch(request);

    // Inject dynamic OG tags into the origin HTML
    const [originRes, meta] = await Promise.all([fetch(request), fetchMeta(p)]);
    const html = await originRes.text();

    if (!meta) {
      return new Response(html, { status: originRes.status, headers: buildHeaders(originRes) });
    }

    const shiny    = url.searchParams.get('s') === '1';
    const imageUrl = `${SITE_URL}/?ogimg=1&p=${encodeURIComponent(p)}${shiny ? '&s=1' : ''}`;
    const title    = `${meta.name} — Weakness Dex`;
    const weakStr  = computeWeaknesses(meta.types);
    const desc     = `Weak to: ${weakStr} | Abilities: ${meta.abilities} | BST: ${meta.bst}`;

    const injected = html
      .replace(
        `<meta property="og:title" content="Weakness Dex">`,
        `<meta property="og:title" content="${esc(title)}">`
      )
      .replace(
        `<meta property="og:description" content="Look up Pokémon type weaknesses, resistances, and immunities.">`,
        `<meta property="og:description" content="${esc(desc)}">`
      )
      .replace(
        `<meta name="twitter:card" content="summary_large_image">`,
        [
          `<meta name="twitter:card" content="summary_large_image">`,
          `<meta property="og:image" content="${esc(imageUrl)}">`,
          `<meta property="og:url" content="${esc(url.toString())}">`,
          `<meta name="twitter:image" content="${esc(imageUrl)}">`,
          `<meta name="twitter:title" content="${esc(title)}">`,
          `<meta name="twitter:description" content="${esc(desc)}">`,
        ].join('\n')
      );

    return new Response(injected, { status: originRes.status, headers: buildHeaders(originRes) });
  },
};

// ---------------------------------------------------------------------------
// OG image generation
// ---------------------------------------------------------------------------

async function handleOgImage(p, url, ctx) {
  // Serve from Cloudflare cache if available
  const cache    = caches.default;
  const cacheKey = new Request(url.toString());
  const cached   = await cache.match(cacheKey);
  if (cached) return cached;

  const shiny = url.searchParams.get('s') === '1';
  const meta  = await fetchMeta(p);
  if (!meta) return artworkFallback(1, false);

  const artworkUrl = shiny
    ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/${meta.id}.png`
    : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${meta.id}.png`;

  let artB64 = null;
  try {
    const r = await fetch(artworkUrl);
    if (r.ok) artB64 = toBase64(await r.arrayBuffer());
  } catch {}

  const svg = buildSvg(meta.name, meta.id, meta.types, meta.flavorText, artB64);
  return svgToPngResponse(svg, cacheKey, ctx);
}

// ---------------------------------------------------------------------------
// Default OG image (no Pokémon selected)
// ---------------------------------------------------------------------------

async function handleDefaultOgImage(url, ctx) {
  const cache    = caches.default;
  const cacheKey = new Request(url.toString());
  const cached   = await cache.match(cacheKey);
  if (cached) return cached;

  return svgToPngResponse(buildDefaultSvg(), cacheKey, ctx);
}

// ---------------------------------------------------------------------------
// Shared SVG → PNG renderer
// ---------------------------------------------------------------------------

async function svgToPngResponse(svg, cacheKey, ctx) {
  const [fonts] = await Promise.all([getFonts(), ensureWasm()]);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
    font: { fontBuffers: fonts, loadSystemFonts: false },
  });
  const png = resvg.render().asPng();

  const res = new Response(png, {
    headers: {
      'Content-Type':  'image/png',
      'Cache-Control': 'public, max-age=86400',
    },
  });

  ctx.waitUntil(caches.default.put(cacheKey, res.clone()));
  return res;
}

function buildDefaultSvg() {
  const TYPE_ROWS = [
    ['normal','fire','water','electric','grass','ice'],
    ['fighting','poison','ground','flying','psychic','bug'],
    ['rock','ghost','dragon','dark','steel','fairy'],
  ];

  const badges = TYPE_ROWS.map((row, ri) =>
    row.map((t, ci) => {
      const x   = 60 + ci * 190;
      const y   = 255 + ri * 90;
      const col = TYPE_COLORS[t] || '#68A090';
      const lbl = t[0].toUpperCase() + t.slice(1);
      return `
  <rect x="${x}" y="${y}" width="170" height="58" rx="29" fill="${col}"/>
  <text x="${x + 85}" y="${y + 41}" font-family="Inter" font-size="34" fill="white" font-weight="600" text-anchor="middle">${esc(lbl)}</text>`;
    }).join('')
  ).join('');

  return `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="1200" height="630" fill="#0d0d0f"/>

  <!-- Pokéball silhouette -->
  <circle cx="935" cy="295" r="130" fill="none" stroke="#1e1e25" stroke-width="48"/>
  <circle cx="935" cy="295" r="370" fill="none" stroke="#1e1e25" stroke-width="48"/>
  <line x1="565" y1="295" x2="1200" y2="295" stroke="#1e1e25" stroke-width="48"/>

  <!-- Bottom bar -->
  <rect x="0" y="566" width="1200" height="64" fill="#0a0a0d"/>

  <!-- Yellow left accent strip -->
  <rect x="0" y="0" width="40" height="630" fill="#e8e840"/>

  <!-- Title -->
  <text x="100" y="130" font-family="Inter" font-size="88" fill="#e8e840" font-weight="700" letter-spacing="3">WEAKNESS DEX</text>

  <!-- Tagline -->
  <text x="100" y="185" font-family="Inter" font-size="40" fill="#888">Type weakness &amp; resistance lookup</text>

  <!-- Accent line -->
  <rect x="100" y="210" width="500" height="3" fill="#e8e840" opacity="0.35"/>

  <!-- Type badge grid -->
  ${badges}

  <!-- Branding -->
  <text x="100" y="617" font-family="Inter" font-size="48" fill="#e8e840" font-weight="700" letter-spacing="3">WEAKNESS DEX</text>
  <text x="1120" y="613" font-family="Inter" font-size="40" fill="#888" text-anchor="end">weakness-dex.hyvitech.org</text>
</svg>`;
}

// ---------------------------------------------------------------------------
// SVG card (1200 × 630)
// ---------------------------------------------------------------------------

function buildSvg(name, id, types, flavorText, artB64) {
  const nameFontSize = name.length > 14 ? 46 : name.length > 10 ? 58 : 72;
  const nameY        = 102 + nameFontSize + 18;
  const typesY       = Math.round((283 + nameY) / 2) ;
  const flavorStartY = typesY + 62 + 80;

  // Type badge row — x offset accounts for 40px left strip + padding
  const badges = types.map((t, i) => {
    const x   = 100 + i * 208;
    const col = TYPE_COLORS[t] || '#68A090';
    const lbl = t[0].toUpperCase() + t.slice(1);
    return `
  <rect x="${x}" y="${typesY}" width="192" height="62" rx="31" fill="${col}"/>
  <text x="${x + 96}" y="${typesY + 44}" font-family="Inter" font-size="42" fill="white" font-weight="600" text-anchor="middle">${esc(lbl)}</text>`;
  }).join('');

  // Flavor text — wrap to fit the ~543px left column at 44px font size
  const allLines    = wrapText(flavorText, 22);
  const flavorLines = allLines.slice(0, 4);
  if (allLines.length > 4) {
    flavorLines[3] = flavorLines[3].replace(/\s+\S+$/, '') + '…';
  }
  const flavorSvg = flavorLines.map((l, i) =>
    `<tspan x="100" dy="${i === 0 ? 0 : 52}">${esc(l)}</tspan>`
  ).join('');

  const art = artB64
    ? `<image href="data:image/png;base64,${artB64}" x="655" y="30" width="520" height="520" preserveAspectRatio="xMidYMid meet"/>`
    : '';

  return `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="1200" height="630" fill="#0d0d0f"/>

  <!-- Pokéball silhouette behind artwork -->
  <circle cx="935" cy="295" r="130" fill="none" stroke="#1e1e25" stroke-width="48"/>
  <circle cx="935" cy="295" r="370" fill="none" stroke="#1e1e25" stroke-width="48"/>
  <line x1="565" y1="295" x2="1200" y2="295" stroke="#1e1e25" stroke-width="48"/>

  <!-- Bottom bar -->
  <rect x="0" y="566" width="1200" height="64" fill="#0a0a0d"/>

  <!-- Yellow left accent strip (on top of bottom bar) -->
  <rect x="0" y="0" width="40" height="630" fill="#e8e840"/>

  <!-- Pokédex number -->
  <text x="100" y="102" font-family="Inter" font-size="48" fill="#888" font-weight="600">#${String(id).padStart(4, '0')}</text>

  <!-- Name -->
  <text x="100" y="${nameY}" font-family="Inter" font-size="${nameFontSize}" fill="#e8e840" font-weight="700" letter-spacing="1">${esc(name.toUpperCase())}</text>

  <!-- Yellow accent line under name -->
  <rect x="100" y="${nameY + 24}" width="420" height="3" fill="#e8e840" opacity="0.35"/>

  <!-- Type badges -->
  ${badges}

  <!-- Flavor text -->
  <text x="100" y="${flavorStartY}" font-family="Inter" font-size="44" fill="#999">${flavorSvg}</text>

  <!-- Artwork -->
  ${art}

  <!-- Branding -->
  <text x="100" y="617" font-family="Inter" font-size="48" fill="#e8e840" font-weight="700" letter-spacing="3">WEAKNESS DEX</text>
  <text x="1120" y="613" font-family="Inter" font-size="40" fill="#888" text-anchor="end">weakness-dex.hyvitech.org</text>
</svg>`;
}

// ---------------------------------------------------------------------------
// PokéAPI
// ---------------------------------------------------------------------------

function extractPokemonFields(d) {
  return {
    id: d.id,
    speciesUrl: d.species.url,
    types: d.types.map(t => t.type.name),
    abilities: d.abilities.map(a =>
      a.ability.name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) +
      (a.is_hidden ? ' (hidden)' : '')
    ).join(' · '),
    bst: d.stats.reduce((sum, s) => sum + s.base_stat, 0),
  };
}

async function fetchMeta(p) {
  try {
    let fields;
    const r1 = await fetch(`https://pokeapi.co/api/v2/pokemon/${p}`);
    if (r1.ok) {
      fields = extractPokemonFields(await r1.json());
    } else {
      // FORMS_OVERRIDE (arceus-fire, silvally-dragon) — strip last segment, retry
      const r2 = await fetch(`https://pokeapi.co/api/v2/pokemon/${p.replace(/-[^-]+$/, '')}`);
      if (!r2.ok) return null;
      fields = extractPokemonFields(await r2.json());
    }
    const { id, speciesUrl, types, abilities, bst } = fields;

    const sr = await fetch(speciesUrl);
    if (!sr.ok) return null;
    const sd = await sr.json();

    const name = sd.names.find(n => n.language.name === 'en')?.name || p;
    const flavorText = sd.flavor_text_entries
      .filter(f => f.language.name === 'en')
      .pop()
      ?.flavor_text.replace(/[\f\n\r]/g, ' ').replace(/\s+/g, ' ').trim()
      || FALLBACK_DESC;

    return { id, name, flavorText, types, abilities, bst };
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function wrapText(text, maxChars) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) { cur = next; }
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str);
}

function buildHeaders(originRes) {
  const h = new Headers(originRes.headers);
  h.set('Content-Type', 'text/html;charset=UTF-8');
  return h;
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function artworkFallback(id, shiny) {
  const base = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork';
  return Response.redirect(shiny ? `${base}/shiny/${id}.png` : `${base}/${id}.png`, 302);
}
