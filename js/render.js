const TOOLTIP_DELAY = 600;
let tooltipEnabledAt = 0;

// --- Form helpers ---

function getFormLabel(varietyName, speciesName) {
  const prefix = (speciesName || '') + '-';
  const suffix = varietyName.startsWith(prefix) ? varietyName.slice(prefix.length) : varietyName;
  return suffix.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') || 'Base';
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
  if (d.min_happiness) parts.push('friendship');
  if (d.min_beauty) parts.push('beauty');
  if (d.min_affection) parts.push('affection');
  if (d.time_of_day === 'day') parts.push('day');
  if (d.time_of_day === 'night') parts.push('night');
  if (d.gender === 1) parts.push('♀');
  if (d.gender === 2) parts.push('♂');
  if (d.needs_overworld_rain) parts.push('rain');
  if (d.turn_upside_down) parts.push('flip');
  if (d.trade_species) parts.push(`trade for ${d.trade_species.name}`);
  else if (d.trigger && d.trigger.name === 'trade') parts.push('trade');
  if (d.location) parts.push(d.location.name.replace(/-/g, ' '));
  if (d.party_species) parts.push(`with ${d.party_species.name}`);
  if (d.party_type) parts.push(`with ${d.party_type.name}-type`);
  return parts.join(' · ') || 'special';
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
      let b = 1;
      for (const def of et) { const row = typeChart[atk] || {}; b *= row[def] !== undefined ? row[def] : 1; }
      all[atk] = b > 1 ? b : 0;
      continue;
    }
    for (const def of et) { const row = typeChart[atk] || {}; m *= row[def] !== undefined ? row[def] : 1; }
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

function badge(type, mult, sm = false) {
  const c = TC[type] || {bg:'#444', text:'#eee'};
  return `<span class="badge${sm ? ' sm' : ''}" style="background:${c.bg};color:${c.text};border-color:${c.bg}AA">${type}<span class="mult">${mult}</span></span>`;
}

function renderGroups(g, sm = false) {
  const {w4, w2, imm, r2, r4} = g;
  let html = '';
  if (w4.length) html += `<div class="weakness-block"><div class="section-label x4">WEAKNESS ×4</div><div class="badges">${w4.map(t => badge(t, '×4', sm)).join('')}</div></div>`;
  if (w2.length) html += `<div class="weakness-block"><div class="section-label x2">WEAKNESS ×2</div><div class="badges">${w2.map(t => badge(t, '×2', sm)).join('')}</div></div>`;
  if ((w4.length || w2.length) && (imm.length || r2.length || r4.length)) html += '<hr class="divider-h">';
  if (imm.length) html += `<div class="weakness-block"><div class="section-label x0">IMMUNE ×0</div><div class="badges">${imm.map(t => badge(t, '×0', sm)).join('')}</div></div>`;
  if (r2.length) html += `<div class="weakness-block"><div class="section-label half">RESISTANT ×½</div><div class="badges">${r2.map(t => badge(t, '×½', sm)).join('')}</div></div>`;
  if (r4.length) html += `<div class="weakness-block"><div class="section-label quarter">RESISTANT ×¼</div><div class="badges">${r4.map(t => badge(t, '×¼', sm)).join('')}</div></div>`;
  if (!html) html = '<p class="empty-hint">No notable matchups</p>';
  return html;
}

function renderStats(stats) {
  if (!stats || !stats.length) return '';
  let total = 0;
  let cfg = STAT_CONFIG;
  if (currentGen === 1) {
    cfg = [
      {key:'hp',             label:'HP',     color:'#4caf50'},
      {key:'attack',         label:'Atk',    color:'#f44336'},
      {key:'defense',        label:'Def',    color:'#ff9800'},
      {key:'special-attack', label:'Special',color:'#9c27b0'},
      {key:'speed',          label:'Speed',  color:'#e91e63'},
    ];
  }
  const rows = cfg.map(sc => {
    const s = stats.find(x => x.stat.name === sc.key);
    const val = s ? s.base_stat : 0;
    total += val;
    const pct = Math.round((val / STAT_MAX) * 100);
    return `<div class="stat-row"><div class="stat-top"><span class="stat-name">${sc.label}</span><span class="stat-val">${val}</span></div><div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%;background:${sc.color}"></div></div></div>`;
  }).join('');
  return `<div class="stat-rows">${rows}<hr class="stat-divider"><div class="stat-total"><span class="stat-total-label">Total</span><span class="stat-total-val">${total}</span></div></div>`;
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
        let desc = abilityDescCache[name];
        if (desc === undefined) { showTooltip(el, 'Loading…'); desc = await fetchAbilityDesc(name); }
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
    const haTag = a.is_hidden ? '<span class="ha-tag">HA</span>' : '';
    const cls = 'ability-pill' + (isR ? ' relevant' : '') + (a.is_hidden ? ' ha-border' : '');
    return `<div class="ability-entry" data-ability="${a.name}"><span class="${cls}">${a.name.replace(/-/g, ' ')}${haTag}</span></div>`;
  }).join('');
  return `<div class="hero-abilities"><div class="hero-abilities-label">ABILITIES</div><div class="ability-list">${pills}</div></div>`;
}

// --- Current card ---

function buildCurrentCard(entry) {
  const {name, sprite, shiny, shiny_sprite, types, abilities, stats} = entry;
  const displayName = entry.speciesName || entry.name;
  const num = String(entry.speciesId || entry.id).padStart(4, '0');
  const activeSprite = shiny ? shiny_sprite : sprite;
  const typePills = types.map(t => {
    const c = TC[t] || {bg:'#444', text:'#eee'};
    return `<span class="type-pill" style="background:${c.bg};color:${c.text}">${t}</span>`;
  }).join('');

  const abilityKey = currentAbilityOverride || (abilities ? (abilities.find(a => REL_ABILITIES[a.name]) || {}).name : null);
  const defaultG = group(calcWeaknesses(types, null));
  const hasTwoCol = !!abilityKey;
  const abilityG = hasTwoCol ? group(calcWeaknesses(types, abilityKey)) : null;
  const weaknessHtml = hasTwoCol
    ? `<div class="twocol"><div><div class="col-label">DEFAULT</div>${renderGroups(defaultG)}</div><div><div class="col-label">WITH ${abilityKey.replace(/-/g, ' ').toUpperCase()}</div>${renderGroups(abilityG)}</div></div>`
    : renderGroups(defaultG);
  const statsHtml = renderStats(stats);

  // Forms bar
  const speciesNameForForms = entry.speciesName || name;
  const showable = showableFormsCache[speciesNameForForms] || [];
  const activeForm = entry.activeForm || name;
  const isAlt = showable.includes(activeForm);
  let actionBarHtml = '';

  if (showable.length > 0) {
    const baseData = spriteCache[speciesNameForForms] || {};
    const baseImg = baseData.sprite ? `<img src="${baseData.sprite}" />` : '';
    const defaultFormName = defaultFormCache[speciesNameForForms] || speciesNameForForms;
    const baseLabel = defaultFormName === speciesNameForForms ? 'Base' : getFormLabel(defaultFormName, speciesNameForForms);
    let chips = `<div class="form-chip${!isAlt ? ' active' : ''}" data-form-name="${speciesNameForForms}" onclick="switchForm('${speciesNameForForms}', '${speciesNameForForms}')"><span class="form-swap">⇄</span>${baseImg}${baseLabel}</div>`;

    chips += showable.map(f => {
      const fd = spriteCache[f] || {};
      const fi = fd.sprite ? `<img src="${fd.sprite}" />` : '';
      return `<div class="form-chip${f === activeForm ? ' active' : ''}" data-form-name="${f}" onclick="switchForm('${speciesNameForForms}', '${f}')"><span class="form-swap">⇄</span>${fi}${getFormLabel(f, speciesNameForForms)}</div>`;
    }).join('');

    // Lazily load sprites for form chips that don't have them yet
    [speciesNameForForms, ...showable].forEach(async f => {
      if (spriteCache[f] && spriteCache[f].sprite) return;
      const data = await fetchPokemonData(f);
      if (!data) return;
      document.querySelectorAll(`.form-chip[data-form-name="${f}"]`).forEach(chip => {
        if (!chip.querySelector('img') && data.sprite)
          chip.insertAdjacentHTML('afterbegin', `<img src="${data.sprite}" style="width:28px;height:28px;image-rendering:pixelated" />`);
      });
    });

    actionBarHtml = `<div class="card-action-bar"><span class="forms-label">FORMS</span>${chips}<button class="moves-btn" onclick="openMoves('${activeForm}')">📋 Moves</button></div>`;
  } else {
    actionBarHtml = `<div class="card-action-bar"><button class="moves-btn" onclick="openMoves('${activeForm}')">📋 Moves</button></div>`;
  }

  return `<div class="poke-card is-current" id="card-current">
    <div class="current-hero">
      <div class="hero-left">
        <div class="sprite-wrap"><img class="poke-img-current" id="current-sprite" src="${activeSprite || ''}" alt="${name}"/><span class="shiny-badge${shiny ? ' active' : ''}" id="shiny-toggle" onclick="toggleShiny('${name}')">✦</span></div>
        <div class="hero-num">#${num}</div>
        <div class="hero-name">${displayName}</div>
        <div class="hero-types">${typePills}</div>
        ${buildAbilitiesHtml(abilities)}
      </div>
      <div class="hero-right">
        <div class="hero-weaknesses"><div class="panel-label">WEAKNESSES</div>${weaknessHtml}</div>
        <div class="hero-stats"><div class="panel-label">BASE STATS</div>${statsHtml}</div>
      </div>
    </div>
    ${actionBarHtml}
    <div id="evo-wrap"></div>
  </div>`;
}

// --- History card ---

function buildHistoryCard(entry) {
  const {name, sprite, types, abilities} = entry;
  const displayName = entry.speciesName || entry.name;
  const num = String(entry.speciesId || entry.id).padStart(4, '0');
  const typePills = types.map(t => {
    const c = TC[t] || {bg:'#444', text:'#eee'};
    return `<span class="type-pill" style="background:${c.bg};color:${c.text}">${t}</span>`;
  }).join('');
  const abilityKey = currentAbilityOverride || (abilities ? (abilities.find(a => REL_ABILITIES[a.name]) || {}).name : null);
  const g = group(calcWeaknesses(types, abilityKey || null));
  const weakBadges = [...g.w4.map(t => badge(t, '×4', true)), ...g.w2.map(t => badge(t, '×2', true))];
  return `<div class="poke-card is-history" onclick="bringToTop('${name}')"><div class="history-inner"><img class="poke-img-small" src="${sprite || ''}" alt="${displayName}"/><div class="history-meta"><div class="history-top"><span class="history-num">#${num}</span><span class="history-name">${displayName}</span><div class="history-types">${typePills}</div></div>${weakBadges.length ? `<div class="history-weaknesses">${weakBadges.join('')}</div>` : ''}</div></div></div>`;
}

// --- Evo chain ---

function evoMonEl(name, spriteUrl, types, isCurrent, condition) {
  const img = spriteUrl ? `<img src="${spriteUrl}"/>` : `<div style="width:48px;height:48px;background:var(--surface2);border-radius:50%"></div>`;
  const tp = types && types[0] ? `<span class="evo-type" style="background:${(TC[types[0]] || {bg:'#444'}).bg};color:${(TC[types[0]] || {text:'#eee'}).text}">${types[0]}</span>` : '';
  const cond = condition ? `<span class="evo-cond">${condition}</span>` : '';
  return `<div class="evo-mon${isCurrent ? ' current' : ''}" onclick="lookup('${name}')">${img}<span class="evo-name">${name}</span>${tp}${cond}</div>`;
}

function walkChain(node) {
  if (!node) return null;
  return {name: node.species.name, evo_details: node.evolution_details || [], children: (node.evolves_to || []).map(walkChain).filter(Boolean)};
}

async function loadEvoChain(entry) {
  const wrap = document.getElementById('evo-wrap');
  if (!wrap) return;
  try {
    const sr = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${entry.speciesName || entry.id}`);
    const sd = await sr.json();
    const er = await fetch(sd.evolution_chain.url);
    const ed = await er.json();
    const tree = walkChain(ed.chain);
    if (!tree) return;

    function allNames(node) { return [node.name, ...node.children.flatMap(allNames)]; }
    await Promise.all([...new Set(allNames(tree))].map(n => fetchPokemonData(n)));
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

    let html = '';

    if (isChildOfBranch) {
      const aData = spriteCache[branchingAncestor] || {};
      const curNode = findNode(tree, currentName);
      const cond = formatEvoCondition(curNode ? curNode.evo_details : []);
      html = `<div class="evo-from"><span class="evo-from-label">evolves from</span>${evoMonEl(branchingAncestor, aData.sprite, aData.types, false, '')}<span class="evo-arrow">→</span>${evoMonEl(currentName, (spriteCache[currentName] || {}).sprite, (spriteCache[currentName] || {}).types, true, cond)}</div>`;
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

    wrap.innerHTML = `<div class="evo-chain"><div class="evo-label">EVOLUTION CHAIN</div>${html}</div>`;
  } catch(e) {}
}
