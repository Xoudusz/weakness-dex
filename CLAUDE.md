# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS single-page app — no build step, no bundler, no package manager. Open `index.html` directly in a browser or serve with any static server. There are no tests.

## Architecture

Scripts load in order via `<script>` tags: `data.js` → `api.js` → `render.js` → `main.js`. All state is in module-level globals; each file can reference globals from files loaded before it.

**`js/data.js`** — Pure data and helpers. No DOM, no fetch.
- `typeChart`, `TC` (type colors), `GEN_OVERRIDES`, `REL_ABILITIES` — static game data
- `STAT_CONFIG`, `MOVE_TABS` — config with `statKey`/`labelKey` for i18n
- `currentLang`, `UI_STRINGS` (11 languages × ~40 keys), `t(key)` — i18n system
- `getLocalizedName(entries, lang)` — finds a name in a PokéAPI `names[]` array, falls back to English
- `getLocalizedTypeName(type, lang)` — wraps `getLocalizedName` using `typeNamesCache` from `api.js`

**`js/api.js`** — All fetch logic and caching. No DOM.
- In-memory caches: `spriteCache`, `localizedNamesCache`, `flavorTextCache`, `evoChainUrlCache`, `evoChainCache`, `typeNamesCache`, `abilityDescCache`, `abilityNamesCache`, `showableFormsCache`, `defaultFormCache`, `moveDataCache`
- `loadCaches()` / `saveCaches()` — persists all caches to `localStorage` under `wdex_apicache_v1`; species list separately under `wdex_species_list_v1`; language list under `wdex_lang_list_v1`
- `fetchVarieties(speciesName)` — central species fetcher; populates `localizedNamesCache`, `flavorTextCache`, `evoChainUrlCache`, `showableFormsCache`, `defaultFormCache`; early-returns if both `showableFormsCache[n]` AND `localizedNamesCache[n]` are set
- `pokemonListReady` — promise from `loadPokemonList()`, used in `main.js` init to chain `prefetchLocalizedNames()`

**`js/render.js`** — All HTML generation. No fetch (calls api functions).
- `buildCurrentCard(entry)` / `buildHistoryCard(entry)` — return HTML strings; `buildCurrentCard` has a lazy trigger: if `showableFormsCache[speciesName]` or `localizedNamesCache[speciesName]` is undefined, it calls `fetchVarieties().then(renderFeed)`
- `loadEvoChain(entry)` — async; fetches all evo chain members, then looks up `#evo-wrap` **at write time** (not at function start) to avoid stale DOM references from concurrent `renderFeed()` calls
- `renderFeed()` is called multiple times per lookup (once immediately, once after ability descriptions load)

**`js/main.js`** — App logic, search, and event handlers.
- `lookup(name)` — resolves a name (localized or English), fetches species + forms, saves to history, calls `renderFeed()` twice (immediately + after abilities)
- `localizedSearchIndex: Map<localizedLower, speciesName>` — rebuilt by `rebuildLocalizedIndex()` from `localizedNamesCache`
- `prefetchLocalizedNames()` — background-fetches `fetchVarieties()` for all ~1302 species in batches of 20, rebuilding the search index after each batch; called on init (via `pokemonListReady.then(...)`) and in `setLang()`
- `updateStaticLabels()` — reads `data-i18n` / `data-i18n-placeholder` attributes and updates the DOM; called on init and in `setLang()`
- History stored in `localStorage` under `wdex_h14`

## Key Patterns

**i18n**: Static strings use `t('key')` at render time (never stored). HTML elements have `data-i18n="key"` or `data-i18n-placeholder="key"` attributes updated by `updateStaticLabels()`. Loop variables must not shadow `t` — rename loop params if they'd conflict (e.g. `t => tp`).

**Caching**: PokéAPI responses are cached in memory and persisted to localStorage on `beforeunload`. `fetchVarieties` has a two-condition early return — both `showableFormsCache[n]` AND `localizedNamesCache[n]` must be defined to skip the fetch.

**DOM concurrency**: `loadEvoChain` is async and `renderFeed()` can be called again before it finishes (ability descriptions trigger a second render). Always look up `#evo-wrap` immediately before writing, never at the start of an async function.

## Deployment

- **Docker image:** `nginx:alpine` — all static files copied to `/usr/share/nginx/html`, nginx serves on port 80
- **CI/CD:** `.github/workflows/deploy.yml` — builds and pushes to `ghcr.io/xoudusz/weakness-dex:latest` on every push to `master`
- **Runtime:** `docker-compose.yml` on the server — image pulled from GHCR, uses `network_mode: nginx_proxy_default` to join NPM's network directly
- **Reverse proxy:** Nginx Proxy Manager (NPM); configure a Proxy Host in NPM UI with forward hostname `weakness-dex` and port `80`
- **To redeploy after a push:** `docker compose pull && docker compose up -d` on the server (CI only builds/pushes the image; it does not redeploy)

## License

GNU General Public License v3.0 — see `LICENSE`.

## Claude Instructions

- Do not add `Co-Authored-By` lines to commit messages.
