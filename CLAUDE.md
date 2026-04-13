# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

Vanilla JS SPA — no build step, no bundler, no package manager, no tests. Open `index.html` directly or serve with any static server.

## Architecture

Load order via `<script>` tags: `data.js` → `api.js` → `render.js` → `main.js`. All state is module-level globals; later files can read globals from earlier ones.

**`js/data.js`** — Pure data/helpers. No DOM, no fetch.
- `typeChart`, `TC` (type colors), `GEN_OVERRIDES`, `REL_ABILITIES` — static game data
- `REGIONAL_EVO_CHAINS` — explicit lookup table; both regional api names (meowth-galar) and regional-exclusive species names (perrserker) map to a complete ordered chain array; trailing array element means branch point (e.g. slowpoke-galar's entry ends with `['slowbro-galar','slowking-galar']`)
- `REGIONAL_BRANCHES` — species node → supplemental branch chains to inject into the standard evo tree (Hisuian/Alolan evolutions PokéAPI omits)
- `PARALLEL_FORMS` — terminal evolutions from same base that are separate species but shown as form chips (e.g. persian ↔ perrserker, quagsire ↔ clodsire, cofagrigus ↔ runerigus)
- `FORM_BASE_LABELS` — overrides the "Base" chip label for specific species (e.g. ogerpon → "Teal Mask")
- `getRegionPrefix(name)` — returns 'Alolan'/'Galarian'/'Hisuian'/'Paldean' for regional api names, or null
- `STAT_CONFIG`, `MOVE_TABS` — config with `statKey`/`labelKey` for i18n
- `currentLang`, `UI_STRINGS` (7 languages × ~40 keys), `t(key)` — i18n system
- `LANG_LABELS` — 11 entries (en/de/fr/es/it/ja/ko/zh-Hans/zh-Hant/ja-Hrkt/roomaji); dropdown populated dynamically from PokéAPI, ~7 appear in practice
- `getLocalizedName(entries, lang)` — finds name in PokéAPI `names[]`, falls back to English
- `getLocalizedTypeName(type, lang)` — wraps `getLocalizedName` using `typeNamesCache` from `api.js`

**`js/api.js`** — All fetch logic and caching. No DOM.
- In-memory caches: `spriteCache`, `localizedNamesCache`, `flavorTextCache`, `evoChainUrlCache`, `evoChainCache`, `typeNamesCache`, `abilityDescCache`, `abilityNamesCache`, `showableFormsCache`, `defaultFormCache`, `moveDataCache`
- `loadCaches()` / `saveCaches()` — persists to `localStorage` under `wdex_apicache_v3`; species list under `wdex_species_list_v1`; lang list under `wdex_lang_list_v1`
- `fetchVarieties(speciesName)` — central species fetcher; early-returns only if BOTH `showableFormsCache[n]` AND `localizedNamesCache[n]` are set
- `pokemonListReady` — promise used in `main.js` init to chain `prefetchLocalizedNames()`

**`js/render.js`** — All HTML generation. No fetch (calls api functions).
- `regionalDisplayName(apiName, speciesName, lang)` — returns "Galarian Linoone" for `apiName='linoone-galar'`; used by `buildCurrentCard`, `buildHistoryCard`, `evoMonEl`, and `openMoves` in main.js
- `buildCurrentCard(entry)` — returns HTML string; identity block (`sprite-wrap`, `hero-num`, `hero-name`, `hero-types`) is wrapped in `.hero-identity` div; lazy trigger if `showableFormsCache`/`localizedNamesCache` missing
- `buildHistoryCard(entry)` — returns HTML string
- `renderGroups(g)` — renders weakness blocks in order: ×4, ×2, then resistances ×½, ×¼, ×0 (immune last)
- `loadEvoChain(entry)` — async; always looks up `#evo-wrap` immediately before writing; uses `REGIONAL_EVO_CHAINS[entry.name] || REGIONAL_EVO_CHAINS[activeForm]` as trigger for hardcoded regional path; standard chain prunes children whose chain starts with a regional form, then injects `REGIONAL_BRANCHES` supplemental nodes
- `renderFeed()` — does a full `feed.innerHTML` replacement; called twice per lookup (immediately + after abilities load)

**`js/main.js`** — App logic, search, event handlers.
- `lookup(name)` — if a card already exists, adds `is-loading` class (border pulse, no layout shift) instead of spinner; first lookup uses spinner; on success `renderFeed()` replaces the card naturally
- `renderFeed()` — rebuilds entire feed from `history[0]` (current) + `history.slice(1)` (history cards)
- `localizedSearchIndex: Map<localizedLower, speciesName>` — rebuilt by `rebuildLocalizedIndex()`; always includes regional display names ('galarian meowth' → 'meowth-galar') regardless of language
- `prefetchLocalizedNames()` — background-fetches all ~1302 species in batches of 20; called on init and in `setLang()`
- `updateStaticLabels()` — updates `data-i18n` / `data-i18n-placeholder` DOM attributes; called on init and in `setLang()`
- History stored in `localStorage` under `wdex_h14`

## Key Patterns

**i18n**: Static strings use `t('key')` at render time (never stored). Loop variables must not shadow `t` — rename to e.g. `tp`.

**Caching**: PokéAPI responses cached in memory, persisted on `beforeunload`. `fetchVarieties` two-condition early return — both `showableFormsCache[n]` AND `localizedNamesCache[n]` must be set.

**DOM concurrency**: `loadEvoChain` is async; `renderFeed()` may fire again before it finishes. Always look up `#evo-wrap` immediately before writing.

**Loading state**: `lookup()` adds `.is-loading` to the existing card (CSS border pulse) instead of replacing it with a spinner. `renderFeed()` naturally replaces it on success. Only on first lookup (no existing card) is a spinner card created.

**Card layout**: `.current-hero` is a 2-col grid (`180px 1fr`). Left col (`.hero-left`) stacks `.hero-identity` then `.hero-abilities` then flavor text. At ≤700px, `current-hero` collapses to 1 col and `.hero-left` stays column-flex (no row layout).

**Action bar**: `.card-action-bar` is `position:relative; min-height:56px; padding:12px 110px 12px 20px`. The `.moves-btn` is `position:absolute; top:12px; right:20px` — the right padding and min-height exist specifically to accommodate it. Form chips (`.form-chips`) live in the flex flow on the left.

**Search bar**: `.top-bar` is `display:flex; gap:10px`. `.search-wrap` is `flex:1; position:relative` and contains the `#inp` input and `.dropdown` (absolutely positioned, `left:0; right:0` relative to `.search-wrap`). At ≤700px, `.top-bar` gains `position:relative` and `.search-wrap` becomes `position:static`, so the dropdown's containing block shifts to `.top-bar` — making the dropdown span the full bar width (input + buttons) without moving buttons to a new line.

**Moves modal**: `openMoves(pokemonName)` fetches `/pokemon/{pokemonName}`. If the response is non-ok or `d.moves` is empty, it falls back to `speciesKey` (base species from history). Arceus-type forms (arceus-fire etc.) 404 on the pokemon endpoint — they are form-only, not separate pokemon entries. `fetchMoveDetails` caches `{type, category, power, pp, accuracy, names, effect}` per move in `moveDataCache`. Move rows have `data-move` attribute; `attachMoveTooltips()` uses event delegation on the moves-body to show `#move-tooltip` on hover.

**typeChart orientation**: `typeChart[defendingType][attackingType] = multiplier`. This is the same in both `js/data.js` (browser) and `worker/typedata.js` (Cloudflare Worker). The worker's `computeWeaknesses` iterates attacking types and looks up `typeChart[def][atk]` — same pattern as `calcWeaknesses` in `render.js:62`.

## Assets

- `favicon.svg` — Pokédex-style icon (red panel, blue lens, dark body); referenced in `index.html`
- `banner.svg` — README banner; Pokédex icon inlined (not referenced via `<image>` — GitHub strips external SVG refs)

## Deployment

- **Docker:** `nginx:alpine`, static files → `/usr/share/nginx/html`, port 80
- **CI/CD:** `.github/workflows/deploy.yml` — builds & pushes to `ghcr.io/xoudusz/weakness-dex:latest` on push to `master`
- **Runtime:** `docker-compose.yml` on server, `network_mode: nginx_proxy_default`
- **Reverse proxy:** NPM — Proxy Host → `weakness-dex:80`
- **Redeploy:** `docker compose pull && docker compose up -d` (CI builds only, does not redeploy)
- **Cloudflare Worker:** `worker/` — injects dynamic OG meta tags for share links (`?p=`); deploy with `wrangler deploy` from that directory; set correct `pattern`/`zone_name` in `wrangler.toml` first

## License

GNU General Public License v3.0 — see `LICENSE`.

## Claude Instructions

- Do not add `Co-Authored-By` lines to commit messages.
- Keep CLAUDE.md up to date as the codebase evolves — it should always reflect current architecture and patterns.
