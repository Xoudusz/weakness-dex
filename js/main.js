let ddIndex = -1, debounceTimer;
let currentGen = 0, currentAbilityOverride = '';
let currentMovesData = null, currentMovesTab = 'level-up', currentAvailableTabs = [];

// --- History ---

// Versioned key — increment the number to clear history saved with an incompatible shape.
function getHistory() {
  try { return JSON.parse(localStorage.getItem('wdex_h14') || '[]'); } catch(e) { return []; }
}

function saveToHistory(e) {
  const key = e.activeForm || e.name;
  let h = getHistory().filter(x => (x.activeForm || x.name) !== key);
  h.unshift(e);
  localStorage.setItem('wdex_h14', JSON.stringify(h.slice(0, 20)));
}

// --- Feed ---

function clearHistory() {
  const current = getHistory()[0];
  localStorage.setItem('wdex_h14', JSON.stringify(current ? [current] : []));
  renderFeed();
}

function renderFeed() {
  const history = getHistory();
  const feed = document.getElementById('feed');
  if (!history.length) { feed.innerHTML = ''; return; }
  const histCards = history.slice(1).map(e => buildHistoryCard(e)).join('');
  const clearBtn = histCards ? `<div class="clear-history-row"><button class="clear-history-btn" onclick="clearHistory()">✕ ${t('clearHistory')}</button></div>` : '';
  feed.innerHTML = buildCurrentCard(history[0]) + clearBtn + histCards;
  attachTooltipEvents();
  loadEvoChain(history[0]);
}

function toggleShiny(name) {
  const h = getHistory();
  const idx = h.findIndex(e => e.name === name);
  if (idx < 0) return;
  h[idx].shiny = !h[idx].shiny;
  localStorage.setItem('wdex_h14', JSON.stringify(h));
  const entry = h[idx];
  const sp = document.getElementById('current-sprite');
  const bg = document.getElementById('shiny-toggle');
  if (sp) sp.src = entry.shiny ? entry.shiny_sprite : entry.sprite;
  if (bg) bg.classList.toggle('active', entry.shiny);
}

// --- Moves ---

async function openMoves(pokemonName) {
  const histEntry = getHistory().find(e => e.activeForm === pokemonName || e.speciesName === pokemonName);
  const speciesKey = histEntry ? histEntry.speciesName : pokemonName;
  const movesDisplayName = regionalDisplayName(pokemonName, speciesKey, currentLang) || pokemonName.replace(/-/g, ' ');
  document.getElementById('moves-title').textContent = `${movesDisplayName} — ${t('movesBtn')}`;
  document.getElementById('moves-overlay').style.display = 'flex';
  document.getElementById('moves-tabs').innerHTML = '';
  document.getElementById('moves-body').innerHTML = '<div class="moves-loading"></div>';

  if (!currentMovesData || currentMovesData.name !== pokemonName) {
    try {
      const r = await fetch(`https://pokeapi.co/api/v2/pokemon/${pokemonName}`);
      const d = await r.json();
      const byMethod = {};
      for (const m of d.moves) {
        for (const vg of m.version_group_details) {
          const method = vg.move_learn_method.name;
          if (!byMethod[method]) byMethod[method] = [];
          const existing = byMethod[method].find(x => x.name === m.move.name);
          if (method === 'level-up') {
            if (!existing) byMethod[method].push({name: m.move.name, level: vg.level_learned_at});
            else if (vg.level_learned_at > existing.level) existing.level = vg.level_learned_at;
          } else {
            if (!existing) byMethod[method].push({name: m.move.name, level: 0});
          }
        }
      }
      if (byMethod['level-up']) byMethod['level-up'].sort((a, b) => a.level - b.level);
      for (const k of Object.keys(byMethod)) { if (k !== 'level-up') byMethod[k].sort((a, b) => a.name.localeCompare(b.name)); }
      currentMovesData = {name: pokemonName, byMethod};
    } catch(e) {
      document.getElementById('moves-body').innerHTML = `<p class="moves-empty">${t('failedMoves')}</p>`;
      return;
    }
  }

  currentAvailableTabs = MOVE_TABS.filter(tab => (currentMovesData.byMethod[tab.key] || []).length > 0);
  if (!currentAvailableTabs.length) { document.getElementById('moves-body').innerHTML = `<p class="moves-empty">${t('noMoveData')}</p>`; return; }
  if (!currentAvailableTabs.find(tab => tab.key === currentMovesTab)) currentMovesTab = currentAvailableTabs[0].key;

  renderMoveTabs(currentMovesTab);
  renderMoveTable(currentMovesTab);

  // Prefetch all move details in background
  const allNames = [...new Set(Object.values(currentMovesData.byMethod).flat().map(m => m.name))];
  for (let i = 0; i < allNames.length; i += 20) {
    Promise.all(allNames.slice(i, i + 20).map(n => fetchMoveDetails(n)));
    await new Promise(r => setTimeout(r, 50));
  }
}

function renderMoveTabs(activeTab) {
  document.getElementById('moves-tabs').innerHTML = currentAvailableTabs.map(tab =>
    `<div class="moves-tab${tab.key === activeTab ? ' active' : ''}" onclick="switchMoveTab('${tab.key}')">${t(tab.labelKey)}</div>`
  ).join('');
}

function switchMoveTab(tab) { currentMovesTab = tab; renderMoveTabs(tab); renderMoveTable(tab); }

function renderMoveTable(tab) {
  if (!currentMovesData) return;
  const body = document.getElementById('moves-body');
  const filtered = currentMovesData.byMethod[tab] || [];
  if (!filtered.length) { body.innerHTML = `<p class="moves-empty">${t('noMovesInCat')}</p>`; return; }

  function buildTable() {
    let html = `<table class="moves-table"><thead><tr>${tab === 'level-up' ? `<th>${t('colLv')}</th>` : ''}<th>${t('colMove')}</th><th>${t('colType')}</th><th>${t('colCat')}</th><th>${t('colPwr')}</th><th>${t('colAcc')}</th><th>${t('colPp')}</th></tr></thead><tbody>`;
    for (const m of filtered) {
      const det = moveDataCache[m.name] || {};
      const mc = TC[det.type] || {bg:'#555', text:'#aaa'};
      const catKey = det.category === 'physical' ? 'catPhysical' : det.category === 'special' ? 'catSpecial' : 'catStatus';
      const catCls = det.category === 'physical' ? 'physical' : det.category === 'special' ? 'special' : 'status';
      const moveName = getLocalizedName(det.names, currentLang) || m.name.replace(/-/g, ' ');
      const typeLabel = det.type ? getLocalizedTypeName(det.type, currentLang) : '—';
      html += `<tr>${tab === 'level-up' ? `<td><span class="move-level">${m.level || '—'}</span></td>` : ''}<td style="text-transform:capitalize">${moveName}</td><td>${det.type ? `<span style="background:${mc.bg};color:${mc.text};padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600">${typeLabel}</span>` : '—'}</td><td>${det.category ? `<span class="move-cat ${catCls}">${t(catKey)}</span>` : '—'}</td><td class="move-power">${det.power || '—'}</td><td>${det.accuracy || '—'}</td><td>${det.pp || '—'}</td></tr>`;
    }
    html += '</tbody></table>';
    return html;
  }

  body.innerHTML = buildTable();
  const uncached = filtered.filter(m => !moveDataCache[m.name]);
  if (uncached.length) {
    Promise.all(uncached.map(m => fetchMoveDetails(m.name))).then(() => { if (currentMovesTab === tab) body.innerHTML = buildTable(); });
  }
}

function closeMoves(e) {
  const overlay = document.getElementById('moves-overlay');
  if (!e || e.target === overlay) overlay.style.display = 'none';
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.getElementById('moves-overlay').style.display = 'none';
  // Press '/' or 's' anywhere to jump to search ('/' = Shift+7 on QWERTZ)
  if ((e.key === '/' || e.key === 's') && document.activeElement !== inp && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); inp.focus(); }
});

// --- Advanced panel ---

function toggleAdvanced() {
  document.getElementById('adv-btn').classList.toggle('open');
  document.getElementById('adv-panel').classList.toggle('open');
}

function setGen(val) { currentGen = parseInt(val); renderFeed(); }
function setAbilityOverride(val) { currentAbilityOverride = val; renderFeed(); }
// Maps lowercased localized names → species name. Rebuilt incrementally as prefetchLocalizedNames()
// progresses through batches, so search works before the full prefetch completes.
let localizedSearchIndex = new Map();

function rebuildLocalizedIndex() {
  localizedSearchIndex = new Map();
  // Species localized names (non-English only — English search uses allPokemon directly)
  if (currentLang !== 'en') {
    for (const [species, names] of Object.entries(localizedNamesCache)) {
      const localName = getLocalizedName(names, currentLang);
      if (localName) localizedSearchIndex.set(localName.toLowerCase(), species);
    }
  }
  // Regional form display names (e.g. 'galarian meowth' → 'meowth-galar').
  // Always added regardless of language since the prefix ('Galarian') is always English.
  for (const n of allPokemon) {
    if (!getRegionPrefix(n)) continue;
    const speciesKey = n.replace(/-(alola|galar|hisui|paldea)(-.*)?$/, '');
    const baseName = getLocalizedName(localizedNamesCache[speciesKey], currentLang)
      || getLocalizedName(localizedNamesCache[speciesKey], 'en');
    if (baseName) {
      const prefix = getRegionPrefix(n);
      localizedSearchIndex.set(`${prefix} ${baseName}`.toLowerCase(), n);
    }
  }
}
rebuildLocalizedIndex();

async function prefetchLocalizedNames() {
  // Regional forms are not species — skip them (no /pokemon-species/{name} endpoint).
  const missing = allPokemon.filter(n => !localizedNamesCache[n] && !getRegionPrefix(n));
  if (!missing.length) return;
  const BATCH = 20;
  for (let i = 0; i < missing.length; i += BATCH) {
    await Promise.all(missing.slice(i, i + BATCH).map(n => fetchVarieties(n)));
    rebuildLocalizedIndex();
  }
  saveCaches();
}

function updateStaticLabels() {
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  document.documentElement.lang = currentLang === 'roomaji' ? 'ja' : currentLang;
}

function setLang(val) {
  currentLang = val;
  localStorage.setItem('wdex_lang', val);
  currentMovesData = null;
  rebuildLocalizedIndex();
  updateStaticLabels();
  renderFeed();
  const missing = getHistory().filter(e => !localizedNamesCache[e.speciesName]);
  if (missing.length) Promise.all(missing.map(e => fetchVarieties(e.speciesName))).then(() => { rebuildLocalizedIndex(); renderFeed(); });
  prefetchLocalizedNames();
}

const LANG_LIST_LS_KEY = 'wdex_lang_list_v1';

async function loadLanguageList() {
  let langs;
  try {
    const saved = localStorage.getItem(LANG_LIST_LS_KEY);
    if (saved) langs = JSON.parse(saved);
  } catch(e) {}
  if (!langs) {
    try {
      const r = await fetch('https://pokeapi.co/api/v2/language/');
      const d = await r.json();
      langs = d.results.filter(l => LANG_LABELS[l.name]);
      localStorage.setItem(LANG_LIST_LS_KEY, JSON.stringify(langs));
    } catch(e) { langs = []; }
  }
  const sel = document.getElementById('lang-select');
  sel.innerHTML = langs
    .map(l => `<option value="${l.name}"${l.name === currentLang ? ' selected' : ''}>${LANG_LABELS[l.name]}</option>`)
    .join('');
}
loadLanguageList();

// --- Lookup ---

async function lookup(name) {
  name = (name || document.getElementById('inp').value).trim().toLowerCase();
  if (!name) return;
  closeDropdown();
  document.getElementById('inp').value = '';
  document.getElementById('search-error').innerHTML = '';
  tooltipEnabledAt = Date.now();
  hideTooltip();

  const feed = document.getElementById('feed');
  const prevCard = document.getElementById('card-current');
  let ld = null;
  // If a card is already showing, pulse its border instead of replacing it with a spinner —
  // avoids layout shift. Spinner is only used on the very first lookup.
  if (prevCard) {
    prevCard.classList.add('is-loading');
  } else {
    ld = document.createElement('div');
    ld.className = 'poke-card is-current';
    ld.innerHTML = '<div class="spinner"></div>';
    feed.prepend(ld);
  }

  try {
    const d = await fetchResolvedPokemon(name);
    const speciesName = d.species.name;
    const pdata = {sprite: pickSprite(d.sprites), types: d.types.map(t => t.type.name)};
    spriteCache[d.name] = pdata;
    const speciesId = parseInt(d.species.url.split('/').filter(Boolean).pop());
    const entry = {
      name: speciesName, id: d.id, speciesName, speciesId,
      activeForm: d.name,
      sprite: pickSprite(d.sprites),
      shiny_sprite: pickShinySprite(d.sprites),
      types: d.types.map(t => t.type.name),
      abilities: d.abilities.map(a => ({name: a.ability.name, is_hidden: a.is_hidden})),
      stats: d.stats,
      shiny: false,
    };
    // Use species name (not pokemon variant ID) so fetchVarieties works for alt forms like giratina-origin
    await fetchVarieties(speciesName);
    saveToHistory(entry);
    if (ld) ld.remove();
    rebuildLocalizedIndex();
    renderFeed();
    window.scrollTo({top: 0, behavior: 'smooth'});
    Promise.all(entry.abilities.map(a => fetchAbilityDesc(a.name, currentLang))).then(renderFeed);
  } catch(e) {
    if (ld) ld.remove(); else if (prevCard) prevCard.classList.remove('is-loading');
    document.getElementById('search-error').innerHTML = `<p class="error-msg">Pokémon "${name}" not found. Check the spelling?</p>`;
  }
}

// --- Form switch (in-place update, no new history entry) ---

async function switchForm(speciesName, formName) {
  const h = getHistory();
  const idx = h.findIndex(e => e.name === speciesName);
  if (idx < 0) return;
  try {
    const d = await fetchResolvedPokemon(formName);
    const sprite = pickSprite(d.sprites) || (spriteCache[speciesName] || {}).sprite || null;
    const shiny_sprite = pickShinySprite(d.sprites) || (spriteCache[speciesName] || {}).shiny_sprite || null;
    const pdata = {sprite, types: d.types.map(t => t.type.name)};
    spriteCache[d.name] = pdata;
    spriteCache[formName] = pdata;
    h[idx] = {
      ...h[idx],
      activeForm: d.name,
      sprite,
      shiny_sprite,
      types: d.types.map(t => t.type.name),
      abilities: d.abilities.map(a => ({name: a.ability.name, is_hidden: a.is_hidden})),
      stats: d.stats,
      shiny: false,
    };
    localStorage.setItem('wdex_h14', JSON.stringify(h));
    renderFeed();
  } catch(e) {}
}

// --- Autocomplete ---

function typeDotsHtml(types) {
  return types.map(t => { const c = TC[t] || {bg:'#888'}; return `<span class="dd-type-dot" style="background:${c.bg}"></span>`; }).join('');
}

const inp = document.getElementById('inp');
const dd = document.getElementById('dropdown');

async function updateDropdown(val) {
  // Merge localized/regional-display matches (from index) + API-name matches, dedup.
  // Always check localizedSearchIndex — it always contains regional display names ('galarian meowth' etc.)
  const seen = new Set();
  const merged = [];
  for (const [localLower, species] of localizedSearchIndex) {
    if (localLower.includes(val) && !seen.has(species)) { seen.add(species); merged.push(species); }
  }
  for (const n of allPokemon) { if (n.includes(val) && !seen.has(n)) { seen.add(n); merged.push(n); } }
  const matches = merged.slice(0, 7);
  if (!matches.length) {
    if (currentLang !== 'en') {
      dd.innerHTML = `<div class="dd-hint">${t('searchHint')}</div>`;
      dd.classList.add('open');
      allPokemon.filter(n => n.includes(val) && !getRegionPrefix(n)).slice(0, 3).forEach(m => {
        if (!localizedNamesCache[m]) fetchVarieties(m).then(() => {
          const ln = getLocalizedName(localizedNamesCache[m], currentLang);
          if (ln) localizedSearchIndex.set(ln.toLowerCase(), m);
        });
      });
    } else {
      closeDropdown();
    }
    return;
  }
  ddIndex = -1;
  dd.innerHTML = matches.map((m, i) => {
    // For regional forms (e.g. meowth-galar) localizedNamesCache has no entry — derive display name.
    const speciesKey = m.replace(/-(alola|galar|hisui|paldea)(-.*)?$/, '');
    const localName = regionalDisplayName(m, speciesKey, currentLang) || m;
    const displayLower = localName.toLowerCase();
    const idx = displayLower.indexOf(val);
    const hi = idx >= 0
      ? localName.slice(0, idx) + `<strong style="color:var(--accent)">${localName.slice(idx, idx + val.length)}</strong>` + localName.slice(idx + val.length)
      : localName;
    const cached = spriteCache[m];
    const sh = cached && cached.sprite ? `<img src="${cached.sprite}"/>` : '';
    const td = cached ? typeDotsHtml(cached.types) : '';
    return `<div class="dd-item" id="ddi-${i}" data-name="${m}"><div class="dd-sprite${cached ? '' : ' loading'}" id="ddsprite-${i}">${sh}</div><span class="dd-name">${hi}</span><div class="dd-types">${td}</div></div>`;
  }).join('');
  dd.classList.add('open');
  dd.querySelectorAll('.dd-item').forEach(el => el.addEventListener('mousedown', e => { e.preventDefault(); lookup(el.dataset.name); }));
  const currentVal = val;
  matches.forEach(async (m, i) => {
    if (spriteCache[m]) return;
    const data = await fetchPokemonData(m);
    if (!data) return;
    const se = document.getElementById(`ddsprite-${i}`);
    const ie = document.getElementById(`ddi-${i}`);
    if (!se || !ie) return;
    se.classList.remove('loading');
    if (data.sprite) se.innerHTML = `<img src="${data.sprite}"/>`;
    const dw = ie.querySelector('.dd-types');
    if (dw) dw.innerHTML = typeDotsHtml(data.types);
  });
  if (currentLang !== 'en') {
    matches.forEach(async (m, i) => {
      if (localizedNamesCache[m]) return;
      if (getRegionPrefix(m)) return; // Regional forms are not species — no species endpoint to fetch
      await fetchVarieties(m);
      const localName = getLocalizedName(localizedNamesCache[m], currentLang);
      if (localName) localizedSearchIndex.set(localName.toLowerCase(), m);
      const ne = document.getElementById(`ddi-${i}`)?.querySelector('.dd-name');
      if (!ne) return;
      const displayLower = localName.toLowerCase();
      const idx = displayLower.indexOf(currentVal);
      ne.innerHTML = idx >= 0
        ? localName.slice(0, idx) + `<strong style="color:var(--accent)">${localName.slice(idx, idx + currentVal.length)}</strong>` + localName.slice(idx + currentVal.length)
        : localName;
    });
  }
}

inp.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  const val = inp.value.trim().toLowerCase();
  if (!val) { closeDropdown(); return; }
  debounceTimer = setTimeout(() => updateDropdown(val), 150);
});

inp.addEventListener('keydown', e => {
  const items = dd.querySelectorAll('.dd-item');
  if (e.key === 'ArrowDown') { e.preventDefault(); ddIndex = Math.min(ddIndex + 1, items.length - 1); items.forEach((el, i) => el.classList.toggle('active', i === ddIndex)); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); ddIndex = Math.max(ddIndex - 1, -1); items.forEach((el, i) => el.classList.toggle('active', i === ddIndex)); }
  else if (e.key === 'Enter') { if (ddIndex >= 0 && items[ddIndex]) lookup(items[ddIndex].dataset.name); else lookup(); }
  else if (e.key === 'Escape') closeDropdown();
});

inp.addEventListener('blur', () => setTimeout(closeDropdown, 150));

function closeDropdown() { dd.classList.remove('open'); ddIndex = -1; }

// --- Init ---
updateStaticLabels();
renderFeed();
pokemonListReady.then(() => prefetchLocalizedNames());
