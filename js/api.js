let allPokemon = [];

const spriteCache = {};
const abilityDescCache = {};
const moveDataCache = {};
const varietiesCache = {};
const showableFormsCache = {}; // speciesName → [varietyName, ...]
const defaultFormCache = {};   // speciesName → default variety pokemon name
const resolvedApiNameCache = {}; // speciesName → actual /pokemon/{name} that resolves

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

// Merged fetchPreview + fetchPokemonTypes — returns {sprite, types}
async function fetchPokemonData(name) {
  if (spriteCache[name]) return spriteCache[name];
  let apiName = resolvedApiNameCache[name] || name;
  try {
    let r = await fetch(`https://pokeapi.co/api/v2/pokemon/${apiName}`);
    if (!r.ok) {
      // No direct /pokemon entry — some species (e.g. wormadam) only have suffixed variants.
      // Resolve via species default variety.
      const sr = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${name}`);
      if (!sr.ok) return null;
      const sd = await sr.json();
      const def = sd.varieties.find(v => v.is_default);
      if (!def) return null;
      apiName = def.pokemon.name;
      resolvedApiNameCache[name] = apiName;
      r = await fetch(`https://pokeapi.co/api/v2/pokemon/${apiName}`);
      if (!r.ok) return null;
    }
    const d = await r.json();
    const data = {sprite: pickSprite(d.sprites), types: d.types.map(t => t.type.name)};
    spriteCache[name] = data;
    if (apiName !== name) spriteCache[apiName] = data;
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

    const allVNames = d.varieties.map(v => v.pokemon.name);
    varietiesCache[speciesName] = allVNames;
    for (const v of allVNames) varietiesCache[v] = allVNames;

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
