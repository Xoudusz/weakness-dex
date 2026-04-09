let allPokemon = [];

const spriteCache = {};
const abilityDescCache = {};
const moveDataCache = {};
const showableFormsCache = {}; // speciesName → [varietyName, ...]
const defaultFormCache = {};   // speciesName → default variety pokemon name
const resolvedApiNameCache = {}; // speciesName → actual /pokemon/{name} that resolves
const localizedNamesCache = {}; // speciesName → names[] from species endpoint
const flavorTextCache = {};     // speciesName → flavor_text_entries[] from species endpoint
const abilityNamesCache = {};   // abilityName → names[] from ability endpoint
const typeNamesCache = {};      // typeName → names[] from /type/{name}
const evoChainUrlCache = {};    // speciesName → evolution_chain URL string
const evoChainCache = {};       // chainId → chain data object

// Bump the version suffix to force a full cache bust on next load (e.g. after a data shape change).
const CACHE_LS_KEY = 'wdex_apicache_v3';

const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function loadCaches() {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_LS_KEY) || 'null');
    if (!saved) return;
    if (saved.savedAt && Date.now() - saved.savedAt > CACHE_MAX_AGE_MS) return;
    Object.assign(spriteCache,          saved.sprite        || {});
    Object.assign(abilityDescCache,     saved.ability       || {});
    Object.assign(moveDataCache,        saved.move          || {});
    Object.assign(showableFormsCache,   saved.forms         || {});
    Object.assign(defaultFormCache,     saved.defaultForm   || {});
    Object.assign(resolvedApiNameCache, saved.resolvedName  || {});
    Object.assign(localizedNamesCache,  saved.localNames    || {});
    Object.assign(flavorTextCache,      saved.flavorText    || {});
    Object.assign(abilityNamesCache,    saved.abilityNames  || {});
    Object.assign(typeNamesCache,       saved.typeNames     || {});
    Object.assign(evoChainUrlCache,     saved.evoChainUrl   || {});
    Object.assign(evoChainCache,        saved.evoChain      || {});
  } catch(e) {}
}

function saveCaches() {
  try {
    localStorage.setItem(CACHE_LS_KEY, JSON.stringify({
      savedAt:      Date.now(),
      sprite:       spriteCache,
      ability:      abilityDescCache,
      move:         moveDataCache,
      forms:        showableFormsCache,
      defaultForm:  defaultFormCache,
      resolvedName: resolvedApiNameCache,
      localNames:   localizedNamesCache,
      flavorText:   flavorTextCache,
      abilityNames: abilityNamesCache,
      typeNames:    typeNamesCache,
      evoChainUrl:  evoChainUrlCache,
      evoChain:     evoChainCache,
    }));
  } catch(e) {} // handles QuotaExceededError gracefully
}

loadCaches();
window.addEventListener('beforeunload', saveCaches);

// Resolves a species/form name to the raw PokeAPI pokemon object, or throws.
// Falls back to the species endpoint when /pokemon/{name} doesn't exist directly.
async function fetchResolvedPokemon(name) {
  let apiName = resolvedApiNameCache[name] || name;
  let r = await fetch(`https://pokeapi.co/api/v2/pokemon/${apiName}`);
  if (!r.ok) {
    const sr = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${name}`);
    if (!sr.ok) throw new Error();
    const sd = await sr.json();
    const def = sd.varieties.find(v => v.is_default);
    if (!def) throw new Error();
    apiName = def.pokemon.name;
    resolvedApiNameCache[name] = apiName;
    r = await fetch(`https://pokeapi.co/api/v2/pokemon/${apiName}`);
    if (!r.ok) throw new Error();
  }
  return r.json();
}

function pickSprite(sprites) {
  return sprites.front_default
    || sprites.other?.showdown?.front_default
    || sprites.other?.['official-artwork']?.front_default
    || null;
}
function pickShinySprite(sprites) {
  return sprites.front_shiny
    || sprites.other?.showdown?.front_shiny
    || null;
}

const SPECIES_LIST_LS_KEY = 'wdex_species_list_v1';

async function loadPokemonList() {
  try {
    const saved = localStorage.getItem(SPECIES_LIST_LS_KEY);
    if (saved) { allPokemon = [...JSON.parse(saved), ...REGIONAL_POKEMON]; return; }
  } catch(e) {}
  try {
    const r = await fetch('https://pokeapi.co/api/v2/pokemon-species?limit=1302');
    const d = await r.json();
    const speciesList = d.results.map(p => p.name).filter(n => !n.endsWith('-starter'));
    localStorage.setItem(SPECIES_LIST_LS_KEY, JSON.stringify(speciesList));
    allPokemon = [...speciesList, ...REGIONAL_POKEMON];
  } catch(e) {}
}
const pokemonListReady = loadPokemonList();

async function fetchAllTypeNames() {
  const missing = Object.keys(TC).filter(t => !typeNamesCache[t]);
  if (!missing.length) return;
  await Promise.all(missing.map(async t => {
    try {
      const r = await fetch(`https://pokeapi.co/api/v2/type/${t}`);
      const d = await r.json();
      typeNamesCache[t] = d.names || [];
    } catch(e) {}
  }));
}
fetchAllTypeNames();

// Fetches sprite+types from /pokemon-form/{name} for forms that only exist there (e.g. Arceus types).
async function fetchFormData(name) {
  if (spriteCache[name]) return spriteCache[name];
  try {
    const r = await fetch(`https://pokeapi.co/api/v2/pokemon-form/${name}`);
    if (!r.ok) throw new Error();
    const d = await r.json();
    const data = {sprite: d.sprites?.front_default || null, shiny_sprite: d.sprites?.front_shiny || null, types: d.types.map(t => t.type.name)};
    spriteCache[name] = data;
    return data;
  } catch(e) { return null; }
}

// Returns {sprite, types} for dropdown previews and form chip icons.
async function fetchPokemonData(name) {
  if (spriteCache[name]) return spriteCache[name];
  try {
    const d = await fetchResolvedPokemon(name);
    const data = {sprite: pickSprite(d.sprites), types: d.types.map(t => t.type.name)};
    spriteCache[name] = data;
    if (d.name !== name) spriteCache[d.name] = data;
    return data;
  } catch(e) { return null; }
}

// Fetches ability description for both the requested lang and 'en' in one call.
// Prefers effect_entries (longer, canonical) over flavor_text_entries (shorter, game-specific).
// Falls back to 'en' if the requested lang has no entry.
async function fetchAbilityDesc(name, lang = currentLang) {
  const key = `${name}__${lang}`;
  if (abilityDescCache[key] !== undefined) return abilityDescCache[key];
  try {
    const r = await fetch(`https://pokeapi.co/api/v2/ability/${name}`);
    const d = await r.json();
    if (!abilityNamesCache[name]) abilityNamesCache[name] = d.names || [];
    for (const tl of [lang, 'en']) {
      const k = `${name}__${tl}`;
      if (abilityDescCache[k] !== undefined) continue;
      const effect = d.effect_entries?.find(e => e.language.name === tl);
      if (effect) { abilityDescCache[k] = effect.short_effect || effect.effect || ''; continue; }
      const flavor = d.flavor_text_entries?.slice().reverse().find(e => e.language.name === tl);
      abilityDescCache[k] = flavor ? flavor.flavor_text.replace(/[\n\f]/g, ' ') : 'No description available.';
    }
    return abilityDescCache[key] ?? abilityDescCache[`${name}__en`] ?? 'No description available.';
  } catch(e) {
    abilityDescCache[key] = 'No description available.';
    return 'No description available.';
  }
}

async function fetchVarieties(speciesName) {
  // Both conditions must be set — if either is missing the previous fetch was partial and must re-run.
  if (showableFormsCache[speciesName] !== undefined && localizedNamesCache[speciesName] !== undefined) return showableFormsCache[speciesName];
  try {
    const r = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${speciesName}`);
    const d = await r.json();

    const defaultV = d.varieties.find(v => v.is_default);
    if (defaultV) defaultFormCache[speciesName] = defaultV.pokemon.name;
    if (d.names)               localizedNamesCache[speciesName] = d.names;
    if (d.flavor_text_entries) flavorTextCache[speciesName]     = d.flavor_text_entries;
    if (d.evolution_chain?.url) evoChainUrlCache[speciesName]   = d.evolution_chain.url;

    // Show all non-default varieties (includes regional forms — they are valid form chips)
    // Exclude totem forms — they are functionally identical to base and clutter the UI.
    const showable = d.varieties
      .filter(v => !v.is_default && !v.pokemon.name.includes('totem'))
      .map(v => v.pokemon.name);

    showableFormsCache[speciesName] = showable;
    return showable;
  } catch(e) {
    showableFormsCache[speciesName] = [];
    return [];
  }
}

async function fetchMoveDetails(moveName) {
  if (moveDataCache[moveName]) return moveDataCache[moveName];
  try {
    const r = await fetch(`https://pokeapi.co/api/v2/move/${moveName}`);
    const d = await r.json();
    const data = {type: d.type.name, category: d.damage_class.name, power: d.power, pp: d.pp, accuracy: d.accuracy, names: d.names || []};
    moveDataCache[moveName] = data;
    return data;
  } catch(e) { return null; }
}
