# weakness-dex

Pokémon type weakness lookup SPA. No build step, no bundler — plain HTML/CSS/JS served by nginx.

## Stack

- Vanilla JS, no framework, no npm
- Docker + nginx (static files)
- Cloudflare Worker (`worker/`) for OG meta tags on share links
- PokéAPI for all data, cached in `localStorage`

## Script load order (matters — globals leak between files)

```
data.js → api.js → render.js → main.js
```

State is module-level globals. Later files read globals from earlier ones. Never reorder.

## Key patterns

- **i18n**: `t('key')` at render time. Never store translated strings. Loop vars must not shadow `t`.
- **Caching**: `fetchVarieties` early-returns only if BOTH `showableFormsCache[n]` AND `localizedNamesCache[n]` are set — check both.
- **DOM concurrency**: `loadEvoChain` is async — always look up `#evo-wrap` immediately before writing, never cache the ref.
- **Loading state**: `lookup()` adds `.is-loading` (CSS border pulse) to existing card. Only first lookup uses spinner.
- **Regional forms**: `REGIONAL_EVO_CHAINS` + `REGIONAL_BRANCHES` in `data.js` patch PokéAPI gaps for Hisuian/Alolan branches.

## Dev

No build step. Just open `index.html` or serve locally:
```bash
python3 -m http.server 8080
```

## Deploy

```bash
# CI handles image build on push to master
docker compose pull && docker compose up -d
```

Cloudflare Worker (separate deploy):
```bash
cd worker && npx wrangler deploy
```
