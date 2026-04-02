# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

Vanilla JS SPA — no build step, no bundler, no package manager, no tests. Open `index.html` directly or serve with any static server.

## Architecture

Load order via `<script>` tags: `data.js` → `api.js` → `render.js` → `main.js`. All state is module-level globals; later files can read globals from earlier ones.

**`js/data.js`** — Pure data/helpers. No DOM, no fetch.
- `typeChart`, `TC` (type colors), `GEN_OVERRIDES`, `REL_ABILITIES` — static game data
- `STAT_CONFIG`, `MOVE_TABS` — config with `statKey`/`labelKey` for i18n
- `currentLang`, `UI_STRINGS` (7 languages × ~40 keys), `t(key)` — i18n system
- `LANG_LABELS` — 11 entries (en/de/fr/es/it/ja/ko/zh-Hans/zh-Hant/ja-Hrkt/roomaji); dropdown populated dynamically from PokéAPI, ~7 appear in practice
- `getLocalizedName(entries, lang)` — finds name in PokéAPI `names[]`, falls back to English
- `getLocalizedTypeName(type, lang)` — wraps `getLocalizedName` using `typeNamesCache` from `api.js`

**`js/api.js`** — All fetch logic and caching. No DOM.
- In-memory caches: `spriteCache`, `localizedNamesCache`, `flavorTextCache`, `evoChainUrlCache`, `evoChainCache`, `typeNamesCache`, `abilityDescCache`, `abilityNamesCache`, `showableFormsCache`, `defaultFormCache`, `moveDataCache`
- `loadCaches()` / `saveCaches()` — persists to `localStorage` under `wdex_apicache_v1`; species list under `wdex_species_list_v1`; lang list under `wdex_lang_list_v1`
- `fetchVarieties(speciesName)` — central species fetcher; early-returns only if BOTH `showableFormsCache[n]` AND `localizedNamesCache[n]` are set
- `pokemonListReady` — promise used in `main.js` init to chain `prefetchLocalizedNames()`

**`js/render.js`** — All HTML generation. No fetch (calls api functions).
- `buildCurrentCard(entry)` — returns HTML string; identity block (`sprite-wrap`, `hero-num`, `hero-name`, `hero-types`) is wrapped in `.hero-identity` div; lazy trigger if `showableFormsCache`/`localizedNamesCache` missing
- `buildHistoryCard(entry)` — returns HTML string
- `renderGroups(g)` — renders weakness blocks in order: ×4, ×2, then resistances ×½, ×¼, ×0 (immune last)
- `loadEvoChain(entry)` — async; always looks up `#evo-wrap` immediately before writing (never at function start) to avoid stale refs from concurrent `renderFeed()` calls
- `renderFeed()` — does a full `feed.innerHTML` replacement; called twice per lookup (immediately + after abilities load)

**`js/main.js`** — App logic, search, event handlers.
- `lookup(name)` — if a card already exists, adds `is-loading` class (border pulse, no layout shift) instead of spinner; first lookup uses spinner; on success `renderFeed()` replaces the card naturally
- `renderFeed()` — rebuilds entire feed from `history[0]` (current) + `history.slice(1)` (history cards)
- `localizedSearchIndex: Map<localizedLower, speciesName>` — rebuilt by `rebuildLocalizedIndex()`
- `prefetchLocalizedNames()` — background-fetches all ~1302 species in batches of 20; called on init and in `setLang()`
- `updateStaticLabels()` — updates `data-i18n` / `data-i18n-placeholder` DOM attributes; called on init and in `setLang()`
- History stored in `localStorage` under `wdex_h14`

## Key Patterns

**i18n**: Static strings use `t('key')` at render time (never stored). Loop variables must not shadow `t` — rename to e.g. `tp`.

**Caching**: PokéAPI responses cached in memory, persisted on `beforeunload`. `fetchVarieties` two-condition early return — both `showableFormsCache[n]` AND `localizedNamesCache[n]` must be set.

**DOM concurrency**: `loadEvoChain` is async; `renderFeed()` may fire again before it finishes. Always look up `#evo-wrap` immediately before writing.

**Loading state**: `lookup()` adds `.is-loading` to the existing card (CSS border pulse) instead of replacing it with a spinner. `renderFeed()` naturally replaces it on success. Only on first lookup (no existing card) is a spinner card created.

**Card layout**: `.current-hero` is a 2-col grid (`180px 1fr`). Left col (`.hero-left`) stacks `.hero-identity` then `.hero-abilities` then flavor text. At ≤700px, `current-hero` collapses to 1 col and `.hero-left` stays column-flex (no row layout).

## Assets

- `favicon.svg` — Pokédex-style icon (red panel, blue lens, dark body); referenced in `index.html`
- `banner.svg` — README banner; Pokédex icon inlined (not referenced via `<image>` — GitHub strips external SVG refs)

## Deployment

- **Docker:** `nginx:alpine`, static files → `/usr/share/nginx/html`, port 80
- **CI/CD:** `.github/workflows/deploy.yml` — builds & pushes to `ghcr.io/xoudusz/weakness-dex:latest` on push to `master`
- **Runtime:** `docker-compose.yml` on server, `network_mode: nginx_proxy_default`
- **Reverse proxy:** NPM — Proxy Host → `weakness-dex:80`
- **Redeploy:** `docker compose pull && docker compose up -d` (CI builds only, does not redeploy)

## License

GNU General Public License v3.0 — see `LICENSE`.

## Claude Instructions

- Do not add `Co-Authored-By` lines to commit messages.
- Keep CLAUDE.md up to date as the codebase evolves — it should always reflect current architecture and patterns.
