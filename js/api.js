let allPokemon = [];

const spriteCache = {};
const abilityDescCache = {};
const moveDataCache = {};
const varietiesCache = {};
const formFlagsCache = {}; // {name: {is_cosmetic, is_battle_only}}
const cosmeticForms = new Set();

async function loadPokemonList() {
  try {
    const r = await fetch('https://pokeapi.co/api/v2/pokemon?limit=1302');
    const d = await r.json();
    // Normalize: replace API names with canonical names (e.g. giratina-altered → giratina)
    const raw = d.results.map(p => API_NAME_MAP_REVERSE[p.name] || p.name);
    const nameSet = new Set(raw);
    allPokemon = [...nameSet]
      .filter(n => !n.endsWith('-starter'))
      .filter(n => {
        // Filter alt-forms whose base is already in the list — accessible via form chips
        for (const s of FORM_SUFFIXES) {
          if (n.endsWith(s) && nameSet.has(n.slice(0, -s.length))) return false;
        }
        return true;
      });
  } catch(e) {}
}
loadPokemonList();

// Merged fetchPreview + fetchPokemonTypes — returns {sprite, types}
async function fetchPokemonData(name) {
  if (spriteCache[name]) return spriteCache[name];
  const apiName = API_NAME_MAP[name] || name; // e.g. 'giratina' → 'giratina-altered'
  try {
    const r = await fetch(`https://pokeapi.co/api/v2/pokemon/${apiName}`);
    const d = await r.json();
    const data = {sprite: d.sprites.front_default, types: d.types.map(t => t.type.name)};
    spriteCache[name] = data;
    if (apiName !== name) spriteCache[apiName] = data; // also cache under API name
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

async function fetchFormFlags(formName) {
  if (formFlagsCache[formName] !== undefined) return;
  try {
    const r = await fetch(`https://pokeapi.co/api/v2/pokemon-form/${formName}`);
    const d = await r.json();
    formFlagsCache[formName] = {is_cosmetic: !!d.is_cosmetic, is_battle_only: !!d.is_battle_only};
    if (d.is_cosmetic) cosmeticForms.add(formName);
  } catch(e) { formFlagsCache[formName] = {is_cosmetic: false, is_battle_only: false}; }
}

async function fetchVarieties(pokemonId) {
  try {
    const r = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${pokemonId}`);
    const d = await r.json();
    const speciesName = d.name;
    const defaultEntry = d.varieties.find(v => v.is_default);
    const defaultRawName = defaultEntry ? defaultEntry.pokemon.name : speciesName;

    // Normalize: replace default variety name with species name if they differ
    // e.g. darmanitan-standard → darmanitan, giratina-altered → giratina
    const varieties = d.varieties.map(v =>
      (v.pokemon.name === defaultRawName && v.pokemon.name !== speciesName) ? speciesName : v.pokemon.name
    );

    // Populate cache for species name, original default name (alias), and all varieties
    varietiesCache[speciesName] = varieties;
    if (defaultRawName !== speciesName) varietiesCache[defaultRawName] = varieties;
    for (const v of varieties) varietiesCache[v] = varieties;

    // Fetch form flags for all non-default varieties (await so flags are ready before render)
    const nonDefault = varieties.filter(v => v !== speciesName);
    await Promise.all(nonDefault.map(fetchFormFlags));

    return varieties;
  } catch(e) { return []; }
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
