let allPokemon = [];

const spriteCache = {};
const abilityDescCache = {};
const moveDataCache = {};
const showableFormsCache = {}; // speciesName → [varietyName, ...]
const defaultFormCache = {};   // speciesName → default variety pokemon name
const resolvedApiNameCache = {}; // speciesName → actual /pokemon/{name} that resolves

const CACHE_LS_KEY = 'wdex_apicache_v1';

function loadCaches() {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_LS_KEY) || 'null');
    if (!saved) return;
    Object.assign(spriteCache,          saved.sprite       || {});
    Object.assign(abilityDescCache,     saved.ability      || {});
    Object.assign(moveDataCache,        saved.move         || {});
    Object.assign(showableFormsCache,   saved.forms        || {});
    Object.assign(defaultFormCache,     saved.defaultForm  || {});
    Object.assign(resolvedApiNameCache, saved.resolvedName || {});
  } catch(e) {}
}

function saveCaches() {
  try {
    localStorage.setItem(CACHE_LS_KEY, JSON.stringify({
      sprite:       spriteCache,
      ability:      abilityDescCache,
      move:         moveDataCache,
      forms:        showableFormsCache,
      defaultForm:  defaultFormCache,
      resolvedName: resolvedApiNameCache,
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

async function loadPokemonList() {
  try {
    const r = await fetch('https://pokeapi.co/api/v2/pokemon-species?limit=1302');
    const d = await r.json();
    allPokemon = d.results.map(p => p.name).filter(n => !n.endsWith('-starter'));
  } catch(e) {}
}
loadPokemonList();

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

async function fetchAbilityDesc(name) {
  if (abilityDescCache[name] !== undefined) return abilityDescCache[name];
  try {
    const r = await fetch(`https://pokeapi.co/api/v2/ability/${name}`);
    const d = await r.json();
    const effect = d.effect_entries && d.effect_entries.find(e => e.language.name === 'en');
    if (effect) {
      const desc = effect.short_effect || effect.effect || '';
      abilityDescCache[name] = desc;
      return desc;
    }
    const flavor = d.flavor_text_entries && d.flavor_text_entries.slice().reverse().find(e => e.language.name === 'en');
    const desc = flavor ? flavor.flavor_text.replace(/[\n\f]/g, ' ') : 'No description available.';
    abilityDescCache[name] = desc;
    return desc;
  } catch(e) {
    abilityDescCache[name] = 'No description available.';
    return 'No description available.';
  }
}

const REGIONAL_SUFFIXES = ['-alola', '-galar', '-hisui', '-paldea'];

async function fetchVarieties(speciesName) {
  if (showableFormsCache[speciesName] !== undefined) return showableFormsCache[speciesName];
  try {
    const r = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${speciesName}`);
    const d = await r.json();

    const defaultV = d.varieties.find(v => v.is_default);
    if (defaultV) defaultFormCache[speciesName] = defaultV.pokemon.name;

    // Show all non-default, non-regional varieties — cosmetic forms are never separate varieties
    const showable = d.varieties
      .filter(v => !v.is_default && !REGIONAL_SUFFIXES.some(s => v.pokemon.name.includes(s)))
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
    const data = {type: d.type.name, category: d.damage_class.name, power: d.power, pp: d.pp, accuracy: d.accuracy};
    moveDataCache[moveName] = data;
    return data;
  } catch(e) { return null; }
}
