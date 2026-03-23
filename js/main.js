let ddIndex = -1, debounceTimer;
let currentGen = 0, currentAbilityOverride = '';
let showBattleForms = false;
let currentMovesData = null, currentMovesTab = 'level-up', currentAvailableTabs = [];

// --- History ---

function getHistory() {
  try { return JSON.parse(localStorage.getItem('wdex_h14') || '[]'); } catch(e) { return []; }
}

function saveToHistory(e) {
  let h = getHistory().filter(x => x.name !== e.name);
  h.unshift(e);
  localStorage.setItem('wdex_h14', JSON.stringify(h));
}

// --- Feed ---

function renderFeed() {
  const history = getHistory();
  const feed = document.getElementById('feed');
  if (!history.length) { feed.innerHTML = ''; return; }
  feed.innerHTML = buildCurrentCard(history[0]) + history.slice(1).map(e => buildHistoryCard(e)).join('');
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
  document.getElementById('moves-title').textContent = `${pokemonName} — moves`;
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
      document.getElementById('moves-body').innerHTML = '<p class="moves-empty">Failed to load moves.</p>';
      return;
    }
  }

  currentAvailableTabs = MOVE_TABS.filter(t => (currentMovesData.byMethod[t.key] || []).length > 0);
  if (!currentAvailableTabs.length) { document.getElementById('moves-body').innerHTML = '<p class="moves-empty">No move data available.</p>'; return; }
  if (!currentAvailableTabs.find(t => t.key === currentMovesTab)) currentMovesTab = currentAvailableTabs[0].key;

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
  document.getElementById('moves-tabs').innerHTML = currentAvailableTabs.map(t =>
    `<div class="moves-tab${t.key === activeTab ? ' active' : ''}" onclick="switchMoveTab('${t.key}')">${t.label}</div>`
  ).join('');
}

function switchMoveTab(tab) { currentMovesTab = tab; renderMoveTabs(tab); renderMoveTable(tab); }

function renderMoveTable(tab) {
  if (!currentMovesData) return;
  const body = document.getElementById('moves-body');
  const filtered = currentMovesData.byMethod[tab] || [];
  if (!filtered.length) { body.innerHTML = '<p class="moves-empty">No moves in this category.</p>'; return; }

  function buildTable() {
    let html = `<table class="moves-table"><thead><tr>${tab === 'level-up' ? '<th>LV</th>' : ''}<th>MOVE</th><th>TYPE</th><th>CAT</th><th>PWR</th><th>ACC</th><th>PP</th></tr></thead><tbody>`;
    for (const m of filtered) {
      const det = moveDataCache[m.name] || {};
      const mc = TC[det.type] || {bg:'#555', text:'#aaa'};
      const catCls = det.category === 'physical' ? 'physical' : det.category === 'special' ? 'special' : 'status';
      html += `<tr>${tab === 'level-up' ? `<td><span class="move-level">${m.level || '—'}</span></td>` : ''}<td style="text-transform:capitalize">${m.name.replace(/-/g, ' ')}</td><td>${det.type ? `<span style="background:${mc.bg};color:${mc.text};padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600">${det.type}</span>` : '—'}</td><td>${det.category ? `<span class="move-cat ${catCls}">${det.category}</span>` : '—'}</td><td class="move-power">${det.power || '—'}</td><td>${det.accuracy || '—'}</td><td>${det.pp || '—'}</td></tr>`;
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

document.addEventListener('keydown', e => { if (e.key === 'Escape') document.getElementById('moves-overlay').style.display = 'none'; });

// --- Advanced panel ---

function toggleAdvanced() {
  document.getElementById('adv-btn').classList.toggle('open');
  document.getElementById('adv-panel').classList.toggle('open');
}

function setGen(val) { currentGen = parseInt(val); renderFeed(); }
function setAbilityOverride(val) { currentAbilityOverride = val; renderFeed(); }
function toggleBattleForms(val) { showBattleForms = val; renderFeed(); }
function bringToTop(name) { lookup(name); }

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
  const ld = document.createElement('div');
  ld.className = 'poke-card is-current';
  ld.innerHTML = '<div class="spinner"></div>';
  feed.prepend(ld);

  try {
    const apiName = API_NAME_MAP[name] || name; // e.g. 'giratina' → 'giratina-altered'
    const r = await fetch(`https://pokeapi.co/api/v2/pokemon/${apiName}`);
    if (!r.ok) throw new Error();
    const d = await r.json();
    // Normalize name: API may return "darmanitan-standard" or "giratina-altered" for base species.
    // If user searched the species name directly, use the clean species name as canonical entry name.
    const speciesName = d.species.name;
    const entryName = (d.name !== speciesName && name === speciesName) ? speciesName : d.name;
    const pdata = {sprite: d.sprites.front_default, types: d.types.map(t => t.type.name)};
    spriteCache[entryName] = pdata;
    const speciesId = parseInt(d.species.url.split('/').filter(Boolean).pop());
    const entry = {
      name: entryName, id: d.id, speciesName, speciesId,
      sprite: d.sprites.front_default,
      shiny_sprite: d.sprites.front_shiny,
      types: d.types.map(t => t.type.name),
      abilities: d.abilities.map(a => ({name: a.ability.name, is_hidden: a.is_hidden})),
      stats: d.stats,
      shiny: false,
    };
    // Use species name (not pokemon variant ID) so fetchVarieties works for alt forms like giratina-origin
    await fetchVarieties(speciesName);
    saveToHistory(entry);
    ld.remove();
    renderFeed();
  } catch(e) {
    ld.remove();
    document.getElementById('search-error').innerHTML = `<p class="error-msg">Pokémon "${name}" not found. Check the spelling?</p>`;
  }
}

// --- Autocomplete ---

const inp = document.getElementById('inp');
const dd = document.getElementById('dropdown');

async function updateDropdown(val) {
  const matches = allPokemon.filter(n => n.includes(val) && !cosmeticForms.has(n)).slice(0, 7);
  if (!matches.length) { closeDropdown(); return; }
  ddIndex = -1;
  dd.innerHTML = matches.map((m, i) => {
    const idx = m.indexOf(val);
    const hi = m.slice(0, idx) + `<strong style="color:var(--accent)">${m.slice(idx, idx + val.length)}</strong>` + m.slice(idx + val.length);
    const cached = spriteCache[m];
    const sh = cached && cached.sprite ? `<img src="${cached.sprite}"/>` : '';
    const td = cached ? cached.types.map(t => { const c = TC[t] || {bg:'#888'}; return `<span class="dd-type-dot" style="background:${c.bg}"></span>`; }).join('') : '';
    return `<div class="dd-item" id="ddi-${i}" data-name="${m}"><div class="dd-sprite${cached ? '' : ' loading'}" id="ddsprite-${i}">${sh}</div><span class="dd-name">${hi}</span><div class="dd-types">${td}</div></div>`;
  }).join('');
  dd.classList.add('open');
  dd.querySelectorAll('.dd-item').forEach(el => el.addEventListener('mousedown', e => { e.preventDefault(); lookup(el.dataset.name); }));
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
    if (dw) dw.innerHTML = data.types.map(t => { const c = TC[t] || {bg:'#888'}; return `<span class="dd-type-dot" style="background:${c.bg}"></span>`; }).join('');
  });
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
renderFeed();
