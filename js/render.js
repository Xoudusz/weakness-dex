const TOOLTIP_DELAY = 600;
// Reset to Date.now() on each lookup so tooltips don't fire immediately after a card re-render.
let tooltipEnabledAt = 0;

// --- Form helpers ---

function getFormLabel(varietyName, speciesName) {
  const spPrefix = (speciesName || '') + '-';
  const formPart = varietyName.startsWith(spPrefix) ? varietyName.slice(spPrefix.length) : varietyName;
  const regionMap = { alola: 'Alolan', galar: 'Galarian', hisui: 'Hisuian', paldea: 'Paldean' };
  return formPart.split('-').map(p => regionMap[p] || (p.charAt(0).toUpperCase() + p.slice(1))).join(' ') || 'Base';
}


// Returns e.g. "Galarian Linoone" for apiName='linoone-galar', speciesName='linoone'.
// Falls back to plain localized name when no regional prefix is detected.
function regionalDisplayName(apiName, speciesName, lang) {
  const prefix = getRegionPrefix(apiName);
  const base = getLocalizedName(localizedNamesCache[speciesName], lang) || speciesName.replace(/-/g, ' ');
  return prefix ? `${prefix} ${base}` : base;
}

// --- Evo condition helpers ---

function pickEvoDetail(details) {
  if (!details || !details.length) return null;
  if (currentGen === 0) return details[details.length - 1];
  const vgs = GEN_VGS[currentGen] || [];
  const match = details.find(d => d.version_group && vgs.includes(d.version_group.name));
  return match || details[0];
}

function formatEvoCondition(details) {
  if (!details || !details.length) return '';
  const d = pickEvoDetail(details);
  if (!d) return '';
  const parts = [];
  if (d.min_level) parts.push(`Lv. ${d.min_level}`);
  if (d.item) parts.push(d.item.name.replace(/-/g, ' '));
  if (d.held_item) parts.push(`hold ${d.held_item.name.replace(/-/g, ' ')}`);
  if (d.known_move) parts.push(`know ${d.known_move.name.replace(/-/g, ' ')}`);
  if (d.known_move_type) parts.push(`${d.known_move_type.name} move`);
  if (d.min_happiness) parts.push(t('friendship'));
  if (d.min_beauty) parts.push(t('beauty'));
  if (d.min_affection) parts.push(t('affection'));
  if (d.time_of_day === 'day') parts.push(t('day'));
  if (d.time_of_day === 'night') parts.push(t('night'));
  if (d.gender === 1) parts.push('♀');
  if (d.gender === 2) parts.push('♂');
  if (d.needs_overworld_rain) parts.push(t('rain'));
  if (d.turn_upside_down) parts.push(t('flip'));
  if (d.trade_species) parts.push(`${t('trade')} for ${d.trade_species.name}`);
  else if (d.trigger && d.trigger.name === 'trade') parts.push(t('trade'));
  if (d.location) parts.push(d.location.name.replace(/-/g, ' '));
  if (d.party_species) parts.push(`with ${d.party_species.name}`);
  if (d.party_type) parts.push(`with ${d.party_type.name}-type`);
  return parts.join(' · ') || t('special_');
}

// --- Type calculation ---

function calcWeaknesses(types, abilityKey) {
  const et = types.map(t => (currentGen > 0 && GEN_OVERRIDES[currentGen] && GEN_OVERRIDES[currentGen][t] === null) ? 'normal' : t);
  const am = abilityKey ? REL_ABILITIES[abilityKey] : null;
  const all = {};
  for (const t of Object.keys(TC)) all[t] = 1;
  for (const atk of Object.keys(TC)) {
    let m = 1;
    if (am && am.special === 'wonderguard') {
      // Wonder Guard blocks everything except super-effective hits — b > 1 passes through, all else → 0.
      let b = 1;
      for (const def of et) { const row = typeChart[def] || {}; b *= row[atk] !== undefined ? row[atk] : 1; }
      all[atk] = b > 1 ? b : 0;
      continue;
    }
    for (const def of et) { const row = typeChart[def] || {}; m *= row[atk] !== undefined ? row[atk] : 1; }
    if (am) {
      if (am.immune && am.immune.includes(atk)) m = 0;
      if (am.halve && am.halve.includes(atk)) m *= 0.5;
      if (am.weak && am.weak.includes(atk)) m *= 2;
    }
    all[atk] = m;
  }
  return all;
}

function group(all) {
  const w4=[], w2=[], imm=[], r2=[], r4=[];
  for (const [t, m] of Object.entries(all)) {
    if (m === 4) w4.push(t);
    else if (m === 2) w2.push(t);
    else if (m === 0) imm.push(t);
    else if (m === 0.5) r2.push(t);
    else if (m === 0.25) r4.push(t);
  }
  return {w4, w2, imm, r2, r4};
}

// --- Render helpers ---

function renderTypePills(types) {
  return types.map(t => {
    const c = TC[t] || {bg:'#444', text:'#eee'};
    return `<span class="type-pill" style="background:${c.bg};color:${c.text}">${getLocalizedTypeName(t, currentLang)}</span>`;
  }).join('');
}

function badge(type, mult, sm = false) {
  const c = TC[type] || {bg:'#444', text:'#eee'};
  return `<span class="badge${sm ? ' sm' : ''}" style="background:${c.bg};color:${c.text};border-color:${c.bg}AA">${getLocalizedTypeName(type, currentLang)}<span class="mult">${mult}</span></span>`;
}

const WEAK_GROUPS = [
  { key: 'w4',  cls: 'x4',      labelKey: 'weak4',   mult: '×4' },
  { key: 'w2',  cls: 'x2',      labelKey: 'weak2',   mult: '×2' },
];
const RES_GROUPS = [
  { key: 'r2',  cls: 'half',    labelKey: 'resist2', mult: '×½' },
  { key: 'r4',  cls: 'quarter', labelKey: 'resist4', mult: '×¼' },
  { key: 'imm', cls: 'x0',      labelKey: 'immune',  mult: '×0' },
];

function renderGroups(g, sm = false) {
  const renderBlock = ({key, cls, labelKey, mult}) =>
    g[key].length ? `<div class="weakness-block"><div class="section-label ${cls}">${t(labelKey)}</div><div class="badges">${g[key].map(tp => badge(tp, mult, sm)).join('')}</div></div>` : '';
  const weakHtml = WEAK_GROUPS.map(renderBlock).join('');
  const resHtml  = RES_GROUPS.map(renderBlock).join('');
  const divider  = weakHtml && resHtml ? '<hr class="divider-h">' : '';
  return weakHtml + divider + resHtml || `<p class="empty-hint">${t('noMatchups')}</p>`;
}

function renderStats(stats) {
  if (!stats || !stats.length) return '';
  let total = 0;
  let cfg = STAT_CONFIG;
  if (currentGen === 1) {
    cfg = [
      {key:'hp',             statKey:'hp',      color:'#4caf50'},
      {key:'attack',         statKey:'atk',     color:'#f44336'},
      {key:'defense',        statKey:'def',     color:'#ff9800'},
      {key:'special-attack', statKey:'special', color:'#9c27b0'},
      {key:'speed',          statKey:'speed',   color:'#e91e63'},
    ];
  }
  const rows = cfg.map(sc => {
    const s = stats.find(x => x.stat.name === sc.key);
    const val = s ? s.base_stat : 0;
    total += val;
    const pct = Math.round((val / STAT_MAX) * 100);
    return `<div class="stat-row"><div class="stat-top"><span class="stat-name">${t(sc.statKey)}</span><span class="stat-val">${val}</span></div><div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%;background:${sc.color}"></div></div></div>`;
  }).join('');
  return `<div class="stat-rows">${rows}<hr class="stat-divider"><div class="stat-total"><span class="stat-total-label">${t('total')}</span><span class="stat-total-val">${total}</span></div></div>`;
}

// --- Tooltip ---

const tooltipEl = document.getElementById('ability-tooltip');
let tooltipHideTimer, tooltipShowTimer;

function showTooltip(el, text) {
  clearTimeout(tooltipHideTimer);
  tooltipEl.textContent = text;
  tooltipEl.classList.add('visible');
  positionTooltip(el);
}

function positionTooltip(el) {
  const rect = el.getBoundingClientRect(), tw = 240, th = tooltipEl.offsetHeight || 60, vw = window.innerWidth;
  let left = rect.left + rect.width / 2 - tw / 2, top = rect.top - th - 8;
  if (top < 8) top = rect.bottom + 8;
  left = Math.max(8, Math.min(left, vw - tw - 8));
  tooltipEl.style.left = left + 'px';
  tooltipEl.style.top = top + 'px';
  tooltipEl.style.width = tw + 'px';
}

function hideTooltip() {
  clearTimeout(tooltipShowTimer);
  tooltipHideTimer = setTimeout(() => tooltipEl.classList.remove('visible'), 80);
}

function attachTooltipEvents() {
  document.querySelectorAll('.ability-entry[data-ability]').forEach(el => {
    const name = el.dataset.ability;
    el.addEventListener('mouseenter', async () => {
      if (Date.now() - tooltipEnabledAt < TOOLTIP_DELAY) return;
      clearTimeout(tooltipHideTimer);
      tooltipShowTimer = setTimeout(async () => {
        const cacheKey = `${name}__${currentLang}`;
        let desc = abilityDescCache[cacheKey];
        if (desc === undefined) { showTooltip(el, t('loading')); desc = await fetchAbilityDesc(name, currentLang); }
        showTooltip(el, desc);
      }, 120);
    });
    el.addEventListener('mouseleave', hideTooltip);
    el.addEventListener('mousemove', () => { if (tooltipEl.classList.contains('visible')) positionTooltip(el); });
  });
}

// --- Abilities HTML ---

function buildAbilitiesHtml(abilities) {
  if (!abilities || !abilities.length) return '';
  const pills = abilities.map(a => {
    const isR = !!REL_ABILITIES[a.name];
    const haTag = a.is_hidden ? `<span class="ha-tag">${t('ha')}</span>` : '';
    const cls = 'ability-pill' + (isR ? ' relevant' : '') + (a.is_hidden ? ' ha-border' : '');
    const localAbilityName = getLocalizedName(abilityNamesCache[a.name], currentLang) || a.name.replace(/-/g, ' ');
    return `<div class="ability-entry" data-ability="${a.name}"><span class="${cls}">${localAbilityName}${haTag}</span></div>`;
  }).join('');
  return `<div class="hero-abilities"><div class="hero-abilities-label">${t('abilities')}</div><div class="ability-list">${pills}</div></div>`;
}

// --- Current card ---

function buildCurrentCard(entry) {
  const {name, sprite, shiny, shiny_sprite, types, abilities, stats} = entry;
  const speciesName = entry.speciesName || entry.name;
  const activeFormName = entry.activeForm || entry.name;
  const displayName = regionalDisplayName(activeFormName, speciesName, currentLang) || entry.speciesName || entry.name;
  const num = String(entry.speciesId || entry.id).padStart(4, '0');
  const activeSprite = shiny ? shiny_sprite : sprite;
  const typePills = renderTypePills(types);

  const abilityKey = currentAbilityOverride || (abilities ? (abilities.find(a => REL_ABILITIES[a.name]) || {}).name : null);
  const defaultG = group(calcWeaknesses(types, null));
  const hasTwoCol = !!abilityKey;
  const abilityG = hasTwoCol ? group(calcWeaknesses(types, abilityKey)) : null;
  const localAbilityLabel = abilityKey ? (getLocalizedName(abilityNamesCache[abilityKey], currentLang) || abilityKey.replace(/-/g, ' ')).toUpperCase() : '';
  const weaknessHtml = hasTwoCol
    ? `<div class="twocol"><div><div class="col-label">${t('default_')}</div>${renderGroups(defaultG)}</div><div><div class="col-label">${t('with_')} ${localAbilityLabel}</div>${renderGroups(abilityG)}</div></div>`
    : renderGroups(defaultG);
  const statsHtml = renderStats(stats);

  const ftEntries = flavorTextCache[speciesName] || [];
  const ftLang = ftEntries.filter(e => e.language.name === currentLang);
  const ftFallback = ftLang.length ? ftLang : ftEntries.filter(e => e.language.name === 'en');
  // PokéAPI repeats the same text across multiple game versions — deduplicate, keep the latest entry.
  const seen = new Set();
  const ftUniq = ftFallback.filter(e => {
    const t = e.flavor_text.replace(/[\n\f]/g, ' ');
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  });
  const flavorText = ftUniq.length ? ftUniq[ftUniq.length - 1].flavor_text.replace(/[\n\f]/g, ' ') : '';
  const flavorHtml = flavorText ? `<div class="flavor-text">${flavorText}</div>` : '';

  // Forms bar
  const speciesNameForForms = speciesName;
  if (showableFormsCache[speciesNameForForms] === undefined || localizedNamesCache[speciesNameForForms] === undefined) {
    fetchVarieties(speciesNameForForms).then(renderFeed);
  }
  const activeForm = entry.activeForm || name;
  const showable = [...(showableFormsCache[speciesNameForForms] || []), ...(FORMS_OVERRIDE[speciesNameForForms] || [])];
  const isAlt = showable.includes(activeForm);
  let actionBarHtml = '';

  const parallels = PARALLEL_FORMS[speciesNameForForms] || [];

  if (showable.length > 0 || parallels.length > 0) {
    const baseData = spriteCache[speciesNameForForms] || {};
    const baseImg = baseData.sprite ? `<img src="${baseData.sprite}" />` : '';
    const defaultFormName = defaultFormCache[speciesNameForForms] || speciesNameForForms;
    const baseLabel = FORM_BASE_LABELS[speciesNameForForms]
      || (defaultFormName === speciesNameForForms ? 'Base' : getFormLabel(defaultFormName, speciesNameForForms));
    let chips = showable.length > 0
      ? `<div class="form-chip${!isAlt ? ' active' : ''}" data-form-name="${speciesNameForForms}" onclick="switchForm('${speciesNameForForms}', '${speciesNameForForms}')"><span class="form-swap">⇄</span>${baseImg}${baseLabel}</div>`
      : '';

    chips += showable.map(f => {
      const fd = spriteCache[f] || {};
      const fi = fd.sprite ? `<img src="${fd.sprite}" />` : '';
      const chipOnclick = getRegionPrefix(f)
        ? `lookup('${f}')`
        : `switchForm('${speciesNameForForms}', '${f}')`;
      return `<div class="form-chip${f === activeForm ? ' active' : ''}" data-form-name="${f}" onclick="${chipOnclick}"><span class="form-swap">⇄</span>${fi}${getFormLabel(f, speciesNameForForms)}</div>`;
    }).join('');

    // Parallel form chips (separate species, same evo stage, different regional lineage)
    chips += parallels.map(p => {
      const pd = spriteCache[p] || {};
      const pi = pd.sprite ? `<img src="${pd.sprite}" />` : '';
      const pLabel = getLocalizedName(localizedNamesCache[p], currentLang) || p.replace(/-/g, ' ');
      return `<div class="form-chip" data-form-name="${p}" onclick="lookup('${p}')"><span class="form-swap">⇄</span>${pi}${pLabel}</div>`;
    }).join('');

    // Lazily load sprites for form chips and parallel chips that don't have them yet.
    // FORMS_OVERRIDE forms (e.g. Arceus types) only exist on /pokemon-form/ — use fetchFormData.
    const overrideForms = new Set(FORMS_OVERRIDE[speciesNameForForms] || []);
    [...(showable.length > 0 ? [speciesNameForForms] : []), ...showable, ...parallels].forEach(async f => {
      if (spriteCache[f] && spriteCache[f].sprite) return;
      const data = await (overrideForms.has(f) ? fetchFormData(f) : fetchPokemonData(f));
      if (!data) return;
      document.querySelectorAll(`.form-chip[data-form-name="${f}"]`).forEach(chip => {
        if (!chip.querySelector('img') && data.sprite)
          chip.insertAdjacentHTML('afterbegin', `<img src="${data.sprite}" style="width:28px;height:28px;image-rendering:pixelated" />`);
      });
    });

    actionBarHtml = `<div class="card-action-bar"><span class="forms-label">${t('forms')}</span>${chips}<button class="moves-btn" onclick="openMoves('${activeForm}')">📋 ${t('movesBtn')}</button></div>`;
  } else {
    actionBarHtml = `<div class="card-action-bar"><button class="moves-btn" onclick="openMoves('${activeForm}')">📋 ${t('movesBtn')}</button></div>`;
  }

  return `<div class="poke-card is-current" id="card-current">
    <div class="current-hero">
      <div class="hero-left">
        <div class="hero-identity">
          <div class="sprite-wrap"><img class="poke-img-current" id="current-sprite" src="${activeSprite || ''}" alt="${name}" onerror="this.style.visibility='hidden'"/><span class="shiny-badge${shiny ? ' active' : ''}" id="shiny-toggle" onclick="toggleShiny('${name}')">✦</span></div>
          <div class="hero-num">#${num}</div>
          <div class="hero-name">${displayName}</div>
          <div class="hero-types">${typePills}</div>
        </div>
        ${buildAbilitiesHtml(abilities)}
      </div>
      <div class="hero-right">
        <div class="hero-weaknesses"><div class="panel-label">${t('weaknesses')}</div>${weaknessHtml}${flavorHtml}</div>
        <div class="hero-stats"><div class="panel-label">${t('baseStats')}</div>${statsHtml}</div>
      </div>
    </div>
    ${actionBarHtml}
    <div id="evo-wrap"></div>
  </div>`;
}

// --- History card ---

function buildHistoryCard(entry) {
  const {name, sprite, types, abilities} = entry;
  const displayName = regionalDisplayName(entry.activeForm || entry.name, entry.speciesName || entry.name, currentLang) || entry.speciesName || entry.name;
  const num = String(entry.speciesId || entry.id).padStart(4, '0');
  const typePills = renderTypePills(types);
  const abilityKey = currentAbilityOverride || (abilities ? (abilities.find(a => REL_ABILITIES[a.name]) || {}).name : null);
  const g = group(calcWeaknesses(types, abilityKey || null));
  const weakBadges = [...g.w4.map(t => badge(t, '×4', true)), ...g.w2.map(t => badge(t, '×2', true))];
  return `<div class="poke-card is-history" onclick="lookup('${entry.activeForm || name}')"><div class="history-inner"><img class="poke-img-small" src="${sprite || ''}" alt="${displayName}" onerror="this.style.visibility='hidden'"/><div class="history-meta"><div class="history-top"><span class="history-num">#${num}</span><span class="history-name">${displayName}</span><div class="history-types">${typePills}</div></div>${weakBadges.length ? `<div class="history-weaknesses">${weakBadges.join('')}</div>` : ''}</div></div></div>`;
}

// --- Evo chain ---

function evoMonEl(name, spriteUrl, types, isCurrent, condition) {
  const img = spriteUrl ? `<img src="${spriteUrl}" onerror="this.style.visibility='hidden'"/>` : `<div style="width:48px;height:48px;background:var(--surface2);border-radius:50%"></div>`;
  const tp = types && types[0] ? `<span class="evo-type" style="background:${(TC[types[0]] || {bg:'#444'}).bg};color:${(TC[types[0]] || {text:'#eee'}).text}">${getLocalizedTypeName(types[0], currentLang)}</span>` : '';
  const cond = condition ? `<span class="evo-cond">${condition}</span>` : '';
  // Derive species name by stripping regional suffix (e.g. linoone-galar → linoone)
  // so localizedNamesCache lookup works; regional prefix is prepended by regionalDisplayName.
  const speciesName = name.replace(/-(alola|galar|hisui|paldea)(-.*)?$/, '');
  const evoDisplayName = regionalDisplayName(name, speciesName, currentLang);
  return `<div class="evo-mon${isCurrent ? ' current' : ''}" onclick="lookup('${name}')">${img}<span class="evo-name">${evoDisplayName}</span>${tp}${cond}</div>`;
}

function walkChain(node) {
  if (!node) return null;
  return {name: node.species.name, evo_details: node.evolution_details || [], children: (node.evolves_to || []).map(walkChain).filter(Boolean)};
}

async function loadEvoChain(entry) {
  try {
    const speciesKey = entry.speciesName || entry.name;
    const activeForm = entry.activeForm || entry.name;
    let html = '';

    const chainDef = REGIONAL_EVO_CHAINS[entry.name] || REGIONAL_EVO_CHAINS[activeForm];
    if (chainDef) {
      // --- Hardcoded regional chain (PokéAPI chain data is unreliable for regional forms) ---
      const allApiNames = chainDef.flat();
      const speciesNamesForCache = [...new Set(allApiNames.map(n => n.replace(/-(alola|galar|hisui|paldea)(-.*)?$/, '')))];
      await Promise.all([...allApiNames.map(n => fetchPokemonData(n)), ...speciesNamesForCache.map(n => fetchVarieties(n))]);

      const lastItem = chainDef[chainDef.length - 1];
      const isBranching = Array.isArray(lastItem);

      if (isBranching) {
        const base = chainDef.slice(0, -1);
        const branches = lastItem;
        const baseTiles = base.map((n, i) => {
          const d = spriteCache[n] || {};
          return (i > 0 ? `<div class="evo-arrow-wrap"><span class="evo-arrow">→</span></div>` : '') + evoMonEl(n, d.sprite, d.types, n === activeForm || n === entry.name, '');
        }).join('');
        const branchTiles = branches.map(n => {
          const d = spriteCache[n] || {};
          return evoMonEl(n, d.sprite, d.types, n === activeForm || n === entry.name, '');
        }).join('');
        html = `<div class="evo-grid">${baseTiles}<span class="evo-grid-arrow">→</span><div class="evo-grid-branches" style="grid-template-columns:repeat(${branches.length},auto)">${branchTiles}</div></div>`;
      } else {
        if (chainDef.length < 2) return;
        const tiles = chainDef.map((n, i) => {
          const d = spriteCache[n] || {};
          return (i > 0 ? `<div class="evo-arrow-wrap"><span class="evo-arrow">→</span></div>` : '') + evoMonEl(n, d.sprite, d.types, n === activeForm || n === entry.name, '');
        }).join('');
        html = `<div class="evo-linear">${tiles}</div>`;
      }

    } else {
      // --- Standard PokéAPI chain (with regional-exclusive evolutions pruned) ---
      let chainUrl = evoChainUrlCache[speciesKey];
      if (!chainUrl) {
        await fetchVarieties(speciesKey);
        chainUrl = evoChainUrlCache[speciesKey];
      }
      if (!chainUrl) return;
      const chainId = chainUrl.split('/').filter(Boolean).pop();
      let ed = evoChainCache[chainId];
      if (!ed) {
        const er = await fetch(chainUrl);
        ed = await er.json();
        evoChainCache[chainId] = ed;
      }
      const tree = walkChain(ed.chain);
      if (!tree) return;

      // Remove evolutions whose regional chain starts from a regional form (e.g. perrserker
      // requires meowth-galar). Keep evolutions like kleavor/wyrdeer whose chain starts from
      // a standard species (scyther/stantler) — PokéAPI may include them already.
      function pruneRegional(node) {
        node.children = node.children.filter(c => {
          const chain = REGIONAL_EVO_CHAINS[c.name];
          return !chain || !getRegionPrefix(chain[0]);
        });
        node.children.forEach(pruneRegional);
      }
      pruneRegional(tree);

      // Inject supplemental regional branches that PokéAPI doesn't include in the chain.
      function injectBranches(node) {
        const branches = REGIONAL_BRANCHES[node.name] || [];
        for (const chain of branches) {
          if (node.children.find(c => c.name === chain[0])) continue;
          let branchNode = null;
          for (let i = chain.length - 1; i >= 0; i--) {
            branchNode = {name: chain[i], evo_details: [], children: branchNode ? [branchNode] : []};
          }
          node.children.push(branchNode);
        }
        node.children.forEach(injectBranches);
      }
      injectBranches(tree);

      function allNames(node) { return [node.name, ...node.children.flatMap(allNames)]; }
      await Promise.all([...new Set(allNames(tree))].map(n => Promise.all([fetchPokemonData(n), fetchVarieties(n)])));
      const currentName = entry.name;

      function findBranchingAncestor(node, target, ancestor) {
        if (node.children.length > 1) ancestor = node.name;
        if (node.name === target) return ancestor;
        for (const c of node.children) { const r = findBranchingAncestor(c, target, ancestor); if (r !== undefined) return r; }
        return undefined;
      }
      function findNode(node, target) {
        if (node.name === target) return node;
        for (const c of node.children) { const r = findNode(c, target); if (r) return r; }
        return null;
      }

      const isBranching = tree.children.length > 1 || (tree.children[0] && tree.children[0].children.length > 1);
      const branchingAncestor = findBranchingAncestor(tree, currentName, null);
      const isChildOfBranch = branchingAncestor && branchingAncestor !== currentName;

      if (isChildOfBranch) {
        const aData = spriteCache[branchingAncestor] || {};
        const curNode = findNode(tree, currentName);
        const cond = formatEvoCondition(curNode ? curNode.evo_details : []);
        html = `<div class="evo-from"><span class="evo-from-label">${t('evolvesFrom')}</span>${evoMonEl(branchingAncestor, aData.sprite, aData.types, false, '')}<span class="evo-arrow">→</span>${evoMonEl(currentName, (spriteCache[currentName] || {}).sprite, (spriteCache[currentName] || {}).types, true, cond)}</div>`;
      } else if (isBranching) {
        function findBranchNode(node) { if (node.children.length > 1) return node; if (node.children[0]) return findBranchNode(node.children[0]); return node; }
        const branchNode = findBranchNode(tree);
        const baseData = spriteCache[branchNode.name] || {};
        const cols = Math.ceil(Math.sqrt(branchNode.children.length));
        let preEvoHtml = '';
        if (branchNode.name !== tree.name) {
          const preData = spriteCache[tree.name] || {};
          const preCond = formatEvoCondition(branchNode.evo_details);
          preEvoHtml = evoMonEl(tree.name, preData.sprite, preData.types, tree.name === currentName, '') + `<div class="evo-arrow-wrap"><span class="evo-arrow">→</span>${preCond ? `<span class="evo-condition">${preCond}</span>` : ''}</div>`;
        }
        const branchTiles = branchNode.children.map(c => {
          const cData = spriteCache[c.name] || {};
          const cond = formatEvoCondition(c.evo_details);
          let tile = evoMonEl(c.name, cData.sprite, cData.types, c.name === currentName, cond);
          if (c.children && c.children[0]) {
            const cc = c.children[0];
            const ccData = spriteCache[cc.name] || {};
            const ccCond = formatEvoCondition(cc.evo_details);
            tile = `<div style="display:flex;align-items:center;gap:4px">${tile}<span class="evo-arrow" style="font-size:10px">→</span>${evoMonEl(cc.name, ccData.sprite, ccData.types, cc.name === currentName, ccCond)}</div>`;
          }
          return tile;
        }).join('');
        html = `<div class="evo-grid">${preEvoHtml}<div style="display:flex;flex-direction:column;align-items:center">${evoMonEl(branchNode.name, baseData.sprite, baseData.types, branchNode.name === currentName, '')}</div><span class="evo-grid-arrow">→</span><div class="evo-grid-branches" style="grid-template-columns:repeat(${cols},auto)">${branchTiles}</div></div>`;
      } else {
        function linearNodes(node) { const arr = [node]; let cur = node; while (cur.children && cur.children[0]) { cur = cur.children[0]; arr.push(cur); } return arr; }
        const path = linearNodes(tree);
        if (path.length < 2) return;
        const tiles = path.map((n, i) => {
          const d = spriteCache[n.name] || {};
          const cond = i > 0 ? formatEvoCondition(n.evo_details) : '';
          return (i > 0 ? `<div class="evo-arrow-wrap"><span class="evo-arrow">→</span>${cond ? `<span class="evo-condition">${cond}</span>` : ''}</div>` : '') + evoMonEl(n.name, d.sprite, d.types, n.name === currentName, '');
        }).join('');
        html = `<div class="evo-linear">${tiles}</div>`;
      }
    }

    // Look up #evo-wrap here, not at function start — renderFeed() may have replaced the card
    // while this async function was running, so an early ref would be stale.
    const wrap = document.getElementById('evo-wrap');
    if (!wrap) return;
    wrap.innerHTML = `<div class="evo-chain"><div class="evo-label">${t('evoChain')}</div>${html}</div>`;
  } catch(e) {}
}
