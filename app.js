/* Detail Database — Firestopping Detail Finder
 * Phase 1: client-side filter search over a local catalogue.
 * Projects + Recently-viewed are stored on the device (localStorage) for now;
 * proper login + shared storage comes in a later phase.
 */
'use strict';

// ---------- Facet definitions ----------
// key  = property on each detail record
// label = heading shown in the UI
const FACETS = [
  { key: 'manufacturer', label: 'Manufacturer / Brand' },
  { key: 'substrate',    label: 'Substrate' },
  { key: 'thickness',    label: 'Substrate thickness' },
  { key: 'penetration',  label: 'Penetration type' },
  { key: 'seal',         label: 'Seal' }
];

// ---------- App state ----------
const state = {
  details: [],
  query: '',
  filters: { manufacturer: new Set(), substrate: new Set(), thickness: new Set(), penetration: new Set(), seal: new Set() },
  openFacets: new Set(['manufacturer']),
  loaded: false
};

const app = document.getElementById('app');

// ---------- Local storage helpers ----------
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }
};
const PROJECTS_KEY = 'gotya.projects';
const RECENT_KEY = 'gotya.recent';

function getProjects() { return store.get(PROJECTS_KEY, []); }
function setProjects(p) { store.set(PROJECTS_KEY, p); }

function recordRecent(id) {
  let recent = store.get(RECENT_KEY, []);
  recent = [id, ...recent.filter((x) => x !== id)].slice(0, 24);
  store.set(RECENT_KEY, recent);
}

// ---------- Utilities ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Return the value(s) of a facet on a detail, always as an array.
function valuesOf(detail, key) {
  const v = detail[key];
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

// Unique facet values present in the catalogue, ordered sensibly (N/A last).
function facetValues(key) {
  const set = new Set();
  state.details.forEach((d) => valuesOf(d, key).forEach((v) => set.add(v)));
  const last = (v) => v === 'N/A' || v === 'Not specified' || v === 'Various / see drawing';
  const mm = (v) => { const m = /^(\d+)\s*mm$/.exec(v); return m ? +m[1] : null; };
  return [...set].sort((a, b) => {
    if (last(a) !== last(b)) return last(a) ? 1 : -1;      // "Not specified" / N/A always last
    const na = mm(a), nb = mm(b);
    if (na != null && nb != null) return na - nb;           // thickness: numeric order
    return a.localeCompare(b);
  });
}

// ---------- Free-text ("say what you mean") search ----------
// Each concept maps everyday words/phrases a user might type onto the terms
// that actually appear in the catalogue. A query triggers a concept if any of
// its `terms` appears; the detail must then contain one of the concept's
// `match` strings. All triggered concepts are AND-ed together.
const CONCEPTS = [
  // ---- walls ----
  { terms: ['solid wall', 'masonry', 'blockwork', 'block wall', 'concrete wall', 'brick', 'rigid wall'], match: ['rigid wall'] },
  { terms: ['plasterboard', 'drywall', 'dry lining', 'drylining', 'stud', 'partition', 'flexible wall', 'single skin', 'single-skin'], match: ['flexible wall'] },
  { terms: ['shaft'], match: ['shaft wall'] },
  { terms: ['wall'], match: ['wall'] },
  // ---- floors / ceilings ----
  { terms: ['metal deck', 'profile deck', 'composite floor'], match: ['profile deck floor'] },
  { terms: ['hollowcore', 'hollow core', 'hollow-core'], match: ['hollow-core floor'] },
  { terms: ['ceiling', 'soffit'], match: ['ceiling'] },
  { terms: ['floor', 'slab'], match: ['floor'] },
  // ---- penetrations ----
  { terms: ['plastic pipe', 'pvc', 'upvc', 'pex', 'abs pipe', 'combustible pipe', 'waste pipe', 'soil pipe'], match: ['plastic pipe'] },
  { terms: ['insulated pipe', 'lagged', 'insulated metal'], match: ['insulated metal pipe'] },
  { terms: ['metal pipe', 'copper', 'steel pipe', 'metallic pipe', 'non-combustible pipe', 'non combustible pipe'], match: ['metal pipe'] },
  { terms: ['sprinkler', 'cpvc'], match: ['cpvc sprinkler pipe'] },
  { terms: ['cable tray', 'cable ladder', 'cable basket', 'cable bundle', 'cables', 'cable'], match: ['cable'] },
  { terms: ['conduit'], match: ['conduit'] },
  { terms: ['trunking'], match: ['trunking'] },
  { terms: ['busbar', 'bus bar'], match: ['busbar'] },
  { terms: ['duct', 'ductwork', 'ventilation'], match: ['duct'] },
  { terms: ['head of wall', 'head-of-wall', 'deflection', 'top of wall', 'top of slab'], match: ['head of wall'] },
  { terms: ['linear', 'movement joint'], match: ['linear joint'] },
  { terms: ['blank', 'no penetration', 'empty opening'], match: ['blank seal'] },
  { terms: ['pipe'], match: ['pipe'] },
  // ---- seals / products ----
  { terms: ['coated batt', 'batt'], match: ['batt'] },
  { terms: ['collar'], match: ['collar'] },
  { terms: ['wrap'], match: ['wrap'] },
  { terms: ['sealant', 'mastic'], match: ['sealant'] },
  { terms: ['foam'], match: ['foam'] },
  { terms: ['mortar', 'compound'], match: ['mortar'] },
  { terms: ['putty', 'pillow', 'pad'], match: ['putty', 'pillow'] }
];

// A big lowercase string of everything searchable on a detail.
function searchBlob(d) {
  return [d.name, d.product, d.description, d.code, d.thickness,
    ...valuesOf(d, 'substrate'), ...valuesOf(d, 'penetration'),
    ...valuesOf(d, 'seal'), ...valuesOf(d, 'batt'),
    d.reference, d.fireRating, d.manufacturer
  ].filter(Boolean).join(' ').toLowerCase();
}

function textMatches(detail, rawQuery) {
  const q = (rawQuery || '').toLowerCase().trim();
  if (!q) return true;
  const blob = searchBlob(detail);
  // Every triggered concept must be satisfied.
  for (const c of CONCEPTS) {
    if (c.terms.some((t) => q.includes(t))) {
      if (!c.match.some((m) => blob.includes(m))) return false;
    }
  }
  // Any token containing a digit (a size like "110mm" or a code like "FS709")
  // is treated as a hard requirement.
  const codes = q.match(/[a-z]*\d[a-z0-9]*/g) || [];
  for (const code of codes) {
    if (code.length < 2) continue;
    const num = (code.match(/\d+/) || [''])[0];
    if (!(blob.includes(code) || (num && blob.includes(num)))) return false;
  }
  return true;
}

// Does a detail satisfy all active filters except (optionally) one facet?
function matchesExcept(detail, exceptKey) {
  return FACETS.every(({ key }) => {
    if (key === exceptKey) return true;
    const sel = state.filters[key];
    if (sel.size === 0) return true;
    return valuesOf(detail, key).some((v) => sel.has(v));
  });
}

function filteredDetails() {
  return state.details.filter((d) => matchesExcept(d, null) && textMatches(d, state.query));
}

// How many results a chip would yield, given the other active filters + query.
function chipCount(key, value) {
  return state.details.filter((d) => matchesExcept(d, key) && valuesOf(d, key).includes(value) && textMatches(d, state.query)).length;
}

function activeFilterCount() {
  return FACETS.reduce((n, { key }) => n + state.filters[key].size, 0);
}

// ---------- Views ----------
function searchView() {
  const results = filteredDetails();
  const total = state.details.length;
  const active = activeFilterCount();

  const facetsHtml = FACETS.map(({ key, label }) => {
    const isOpen = state.openFacets.has(key);
    const selected = state.filters[key];
    const chips = facetValues(key).map((value) => {
      const n = chipCount(key, value);
      const pressed = selected.has(value);
      return `<button class="chip" data-facet="${key}" data-value="${escapeHtml(value)}"
        aria-pressed="${pressed}" data-empty="${n === 0 && !pressed}">
        ${escapeHtml(value)} <span class="chip-n">${n}</span>
      </button>`;
    }).join('');
    const pill = selected.size ? `<span class="count-pill">${selected.size}</span>` : '';
    return `<section class="facet" open-state="${isOpen ? 'open' : 'closed'}">
      <button class="facet-head" data-facet-toggle="${key}">
        <span>${label}</span>${pill}<span class="chev">▾</span>
      </button>
      <div class="facet-body">${chips}</div>
    </section>`;
  }).join('');

  const byMfr = (m) => state.details.filter((d) => d.manufacturer === m).length;
  const liveTotal = state.details.filter((d) => !d.samplePlaceholder).length;

  app.innerHTML = `
    <div class="view-head">
      <h1>Find a detail</h1>
      <p>Type what you need, or pick filters below.</p>
    </div>
    <div class="searchbox">
      <span class="q-icon">🔍</span>
      <input id="q" type="search" inputmode="search" autocomplete="off" autocorrect="off" spellcheck="false"
        placeholder="e.g. plastic pipe through solid wall" value="${escapeHtml(state.query)}" />
      <button class="q-clear" data-action="clear-q" style="display:${state.query ? 'flex' : 'none'}" aria-label="Clear search">✕</button>
    </div>
    <div class="sample-banner">✅ <strong>${liveTotal} live details</strong> with links to the manufacturers' own drawings — Quelfire ${byMfr('Quelfire')}, Rockwool ${byMfr('Rockwool')}, Nullifire ${byMfr('Nullifire')}.</div>
    <div class="filterbar">
      <span class="result-count" id="result-count"><strong>${results.length}</strong> of ${total} details</span>
      ${active ? `<button class="clear-btn" data-action="clear">Clear filters (${active})</button>` : ''}
    </div>
    <div class="filters-panel">
      <div class="filters-head"><span class="filters-title">Filter by</span><span class="filters-hint">tap to narrow down</span></div>
      ${facetsHtml}
    </div>
    <div class="results" id="results-zone">${resultsHtml(results)}</div>
  `;
}

// Re-render only the count + result cards (keeps the search input focused while typing).
function updateResults() {
  const results = filteredDetails();
  const rc = document.getElementById('result-count');
  const rz = document.getElementById('results-zone');
  if (rc) rc.innerHTML = `<strong>${results.length}</strong> of ${state.details.length} details`;
  if (rz) rz.innerHTML = resultsHtml(results);
  const qc = document.querySelector('.q-clear');
  if (qc) qc.style.display = state.query ? 'flex' : 'none';
}

// Group results by penetration type, each group a grid of compact cards.
function resultsHtml(results) {
  if (!results.length) {
    return state.query
      ? `<div class="empty">No details match “${escapeHtml(state.query)}”.<br>Try fewer or simpler words.</div>`
      : `<div class="empty">No details match those filters yet.<br>Try removing one.</div>`;
  }
  const groups = new Map();
  results.forEach((d) => {
    const k = valuesOf(d, 'penetration')[0] || 'Other';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  });
  const order = [...groups.keys()].sort((a, b) => groups.get(b).length - groups.get(a).length);
  return order.map((k) => `
    <section class="result-group">
      <h2 class="group-head">${escapeHtml(k)}<span class="group-n">${groups.get(k).length}</span></h2>
      <div class="card-grid">${groups.get(k).map(cardHtml).join('')}</div>
    </section>`).join('');
}

function cardHtml(d) {
  const sub = [valuesOf(d, 'substrate')[0]]
    .filter((t) => t && t !== 'N/A')
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  const thk = (d.thickness && d.thickness !== 'Not specified')
    ? `<span class="tag tag-thk">${escapeHtml(d.thickness)}</span>` : '';
  const comps = (d.components || []).slice(0, 2)
    .map((t) => `<span class="tag tag-comp">${escapeHtml(t)}</span>`).join('');
  const multi = d.multiTest ? `<span class="badge-multi" title="Covers multiple test references">Multi</span>` : '';
  return `<a class="card" href="#/detail/${encodeURIComponent(d.id)}">
    <div class="card-top">
      <span class="badge ${escapeHtml(d.manufacturer)}">${escapeHtml(d.manufacturer)}</span>${multi}
    </div>
    ${d.code ? `<div class="code">${escapeHtml(d.code)}</div>` : ''}
    <h3>${escapeHtml(d.name)}</h3>
    <div class="tags">${sub}${thk}${comps}</div>
  </a>`;
}

// The "family" a code belongs to — e.g. QB-FW100-01 -> FW100, FS709-DW75-SI-CP-1005 -> DW75.
// Details in the same family are close siblings (same substrate + thickness test series).
function codeFamily(code) {
  if (!code) return null;
  const m = /(FW|RW|SW|WW|CW|CF|FL|RF|HC|DW|PD|PC|SP|PT)(\d{2,3})/i.exec(code);
  return m ? m[0].toUpperCase() : null;
}

// Find details closest to `d`, scored by shared attributes. Used for "Related details".
function relatedDetails(d, n = 6) {
  const pen = valuesOf(d, 'penetration')[0];
  const subs = new Set(valuesOf(d, 'substrate'));
  const comps = new Set(d.components || []);
  const fam = codeFamily(d.code);
  const hasThk = d.thickness && d.thickness !== 'Not specified';
  const scored = [];
  for (const o of state.details) {
    if (o.id === d.id) continue;
    let s = 0;
    if (pen && valuesOf(o, 'penetration')[0] === pen) s += 3;
    if (valuesOf(o, 'substrate').some((v) => subs.has(v))) s += 2;
    if (hasThk && o.thickness === d.thickness) s += 1;
    if (fam && codeFamily(o.code) === fam) s += 4;              // same test series = very related
    let overlap = 0; (o.components || []).forEach((c) => { if (comps.has(c)) overlap++; });
    s += Math.min(overlap, 2);
    if (o.manufacturer === d.manufacturer) s += 0.5;
    if (s >= 4) scored.push([s, o]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return scored.slice(0, n).map((x) => x[1]);
}

function detailView(id) {
  const d = state.details.find((x) => x.id === id);
  if (!d) { app.innerHTML = `<a class="back" href="#/search">← Back</a><div class="empty">Detail not found.</div>`; return; }
  recordRecent(d.id);

  // Application: where + what penetrates (substrate / thickness / penetration / fire rating)
  const appTags = [...valuesOf(d, 'substrate')]
    .filter((t) => t && t !== 'N/A')
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')
    + ((d.thickness && d.thickness !== 'Not specified') ? `<span class="tag tag-thk">${escapeHtml(d.thickness)}</span>` : '')
    + [...valuesOf(d, 'penetration')].filter((t) => t && t !== 'N/A')
        .map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')
    + (d.fireRating ? `<span class="tag tag-rating">${escapeHtml(d.fireRating)}</span>` : '');

  // Components: everything used in the detail itself (batt, mastic, collar, insulation…)
  const compTags = (d.components || [])
    .map((t) => `<span class="tag tag-comp">${escapeHtml(t)}</span>`).join('');

  const links = (d.relatedLinks || []).map((l) =>
    `<li><a href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label)} <span class="arrow">↗</span></a></li>`
  ).join('');

  const sampleNote = d.samplePlaceholder
    ? `<div class="note">Sample entry — this opens the manufacturer's landing page, not the exact detail PDF. The real PDF link will replace it once the details are loaded.</div>`
    : '';
  const multiNote = d.multiTest
    ? `<div class="note note-multi">📑 This detail covers <strong>multiple test references</strong> — check the drawing for the variant you need.</div>`
    : '';

  const related = relatedDetails(d, 6);
  const relatedHtml = related.length
    ? `<div class="related-block">
         <div class="section-label">Related &amp; similar details</div>
         <div class="card-grid">${related.map(cardHtml).join('')}</div>
       </div>`
    : '';

  app.innerHTML = `
    <a class="back" href="#/search">← Back to search</a>
    <div class="detail-card">
      <div class="card-top">
        <span class="badge ${escapeHtml(d.manufacturer)}">${escapeHtml(d.manufacturer)}</span>
        ${d.multiTest ? `<span class="badge-multi">Multiple test details</span>` : ''}
      </div>
      <h1>${escapeHtml(d.name)}</h1>
      ${d.code ? `<div class="code code-lg">${escapeHtml(d.code)}</div>` : ''}
      <div class="section-label">Application</div>
      <div class="kv">${appTags}</div>
      ${compTags ? `<div class="section-label">In this detail</div><div class="kv">${compTags}</div>` : ''}
      ${d.product ? `<div class="section-label">Products</div><div class="detail-product">${escapeHtml(d.product)}</div>` : ''}
      <a class="btn btn-primary" href="${escapeHtml(d.detailUrl)}" target="_blank" rel="noopener noreferrer">📄 Open detail drawing</a>
      <button class="btn btn-secondary" data-action="add-to-project" data-id="${escapeHtml(d.id)}">＋ Add to a project</button>
      ${multiNote}
      ${sampleNote}
      ${links ? `<div class="section-label">Related documents</div><ul class="link-list">${links}</ul>` : ''}
    </div>
    ${relatedHtml}
  `;
}

function projectsView() {
  const projects = getProjects();
  const rows = projects.length
    ? projects.map((p) => `<a class="row" href="#/project/${encodeURIComponent(p.id)}">
        <span><strong>${escapeHtml(p.name)}</strong><br><span class="meta">${p.detailIds.length} detail${p.detailIds.length === 1 ? '' : 's'}</span></span>
        <button class="icon-btn" data-action="delete-project" data-id="${escapeHtml(p.id)}" title="Delete">🗑</button>
      </a>`).join('')
    : `<div class="empty">No projects yet.<br>Create one above, then add details to it from any detail page.</div>`;

  app.innerHTML = `
    <div class="view-head"><h1>Projects</h1><p>Group the details for a job together.</p></div>
    <div class="add-row">
      <input id="new-project" type="text" placeholder="New project name…" maxlength="60" />
      <button data-action="create-project">Add</button>
    </div>
    <div class="list">${rows}</div>
  `;
}

function projectView(id) {
  const projects = getProjects();
  const p = projects.find((x) => x.id === id);
  if (!p) { app.innerHTML = `<a class="back" href="#/projects">← Back</a><div class="empty">Project not found.</div>`; return; }
  const items = p.detailIds.map((did) => state.details.find((d) => d.id === did)).filter(Boolean);
  const rows = items.length
    ? items.map((d) => `<div class="row">
        <a href="#/detail/${encodeURIComponent(d.id)}" style="text-decoration:none;color:inherit;flex:1;">
          <span class="badge ${escapeHtml(d.manufacturer)}">${escapeHtml(d.manufacturer)}</span><br>
          <strong style="font-size:14px;">${escapeHtml(d.name)}</strong>
        </a>
        <button class="icon-btn" data-action="remove-from-project" data-project="${escapeHtml(p.id)}" data-id="${escapeHtml(d.id)}" title="Remove">✕</button>
      </div>`).join('')
    : `<div class="empty">No details in this project yet.</div>`;

  app.innerHTML = `
    <a class="back" href="#/projects">← All projects</a>
    <div class="view-head"><h1>${escapeHtml(p.name)}</h1><p>${items.length} detail${items.length === 1 ? '' : 's'}</p></div>
    <div class="list">${rows}</div>
  `;
}

function recentView() {
  const recent = store.get(RECENT_KEY, []);
  const items = recent.map((id) => state.details.find((d) => d.id === id)).filter(Boolean);
  const rows = items.length ? `<div class="card-grid">${items.map(cardHtml).join('')}</div>` : `<div class="empty">Nothing viewed yet.<br>Open a detail and it shows up here.</div>`;
  app.innerHTML = `
    <div class="view-head"><h1>Recently viewed</h1><p>The details you looked at most recently.</p></div>
    <div class="results">${rows}</div>
  `;
}

// ---------- Add-to-project modal ----------
function openAddToProject(detailId) {
  const projects = getProjects();
  const opts = projects.map((p) =>
    `<button class="opt" data-action="choose-project" data-project="${escapeHtml(p.id)}" data-id="${escapeHtml(detailId)}">📁 ${escapeHtml(p.name)} <span style="color:var(--muted)">(${p.detailIds.length})</span></button>`
  ).join('');
  const node = document.createElement('div');
  node.className = 'modal-backdrop';
  node.dataset.modal = '1';
  node.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
    <h2>Add to a project</h2>
    ${opts || '<p style="color:var(--muted);font-size:14px;margin:0 0 12px;">No projects yet — create one below.</p>'}
    <div class="add-row" style="margin-top:8px;">
      <input id="modal-new-project" type="text" placeholder="New project name…" maxlength="60" />
      <button data-action="create-and-add" data-id="${escapeHtml(detailId)}">Add</button>
    </div>
  </div>`;
  document.body.appendChild(node);
}

function closeModal() {
  document.querySelectorAll('[data-modal]').forEach((n) => n.remove());
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1600);
}

function addDetailToProject(projectId, detailId) {
  const projects = getProjects();
  const p = projects.find((x) => x.id === projectId);
  if (!p) return;
  if (!p.detailIds.includes(detailId)) p.detailIds.push(detailId);
  setProjects(projects);
}

function createProject(name) {
  const projects = getProjects();
  const p = { id: 'p' + Date.now().toString(36), name: name.trim(), detailIds: [], createdAt: Date.now() };
  projects.unshift(p);
  setProjects(projects);
  return p;
}

// ---------- Event delegation ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-facet], [data-facet-toggle], [data-action]');
  if (!t) return;

  // Facet chip toggle
  if (t.dataset.facet) {
    const { facet, value } = t.dataset;
    const set = state.filters[facet];
    set.has(value) ? set.delete(value) : set.add(value);
    searchView();
    return;
  }
  // Facet accordion toggle
  if (t.dataset.facetToggle) {
    const key = t.dataset.facetToggle;
    state.openFacets.has(key) ? state.openFacets.delete(key) : state.openFacets.add(key);
    searchView();
    return;
  }

  const action = t.dataset.action;
  if (!action) return;

  switch (action) {
    case 'clear':
      FACETS.forEach(({ key }) => state.filters[key].clear());
      searchView();
      break;
    case 'clear-q':
      state.query = '';
      searchView();
      const qi = document.getElementById('q');
      if (qi) qi.focus();
      break;
    case 'add-to-project':
      openAddToProject(t.dataset.id);
      break;
    case 'choose-project':
      addDetailToProject(t.dataset.project, t.dataset.id);
      closeModal();
      toast('Added to project');
      break;
    case 'create-and-add': {
      const input = document.getElementById('modal-new-project');
      const name = (input && input.value || '').trim();
      if (!name) { input && input.focus(); return; }
      const p = createProject(name);
      addDetailToProject(p.id, t.dataset.id);
      closeModal();
      toast('Added to ' + p.name);
      break;
    }
    case 'create-project': {
      const input = document.getElementById('new-project');
      const name = (input && input.value || '').trim();
      if (!name) { input && input.focus(); return; }
      createProject(name);
      projectsView();
      break;
    }
    case 'delete-project':
      e.preventDefault();
      if (confirm('Delete this project?')) {
        setProjects(getProjects().filter((p) => p.id !== t.dataset.id));
        projectsView();
      }
      break;
    case 'remove-from-project': {
      const projects = getProjects();
      const p = projects.find((x) => x.id === t.dataset.project);
      if (p) { p.detailIds = p.detailIds.filter((d) => d !== t.dataset.id); setProjects(projects); projectView(p.id); }
      break;
    }
  }
});

// Close modal by tapping the backdrop
document.addEventListener('click', (e) => {
  if (e.target.classList && e.target.classList.contains('modal-backdrop')) closeModal();
});

// Live search as you type (updates only the results, so the box keeps focus).
document.addEventListener('input', (e) => {
  if (e.target.id === 'q') {
    state.query = e.target.value;
    updateResults();
  }
});

// Submit project name on Enter
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'new-project') document.querySelector('[data-action="create-project"]').click();
  if (e.target.id === 'modal-new-project') document.querySelector('[data-action="create-and-add"]').click();
});

// ---------- Router ----------
function setActiveTab(name) {
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === name));
}

function route() {
  if (!state.loaded) return;
  const hash = location.hash || '#/search';
  const [, path, arg] = hash.split('/');
  closeModal();
  window.scrollTo(0, 0);
  switch (path) {
    case 'detail':   detailView(decodeURIComponent(arg || '')); setActiveTab('search'); break;
    case 'projects': projectsView(); setActiveTab('projects'); break;
    case 'project':  projectView(decodeURIComponent(arg || '')); setActiveTab('projects'); break;
    case 'recent':   recentView(); setActiveTab('recent'); break;
    case 'search':
    default:         searchView(); setActiveTab('search');
  }
}
window.addEventListener('hashchange', route);

// ---------- Boot ----------
fetch('data/details.json', { cache: 'no-store' })
  .then((r) => r.json())
  .then((data) => {
    state.details = (data && data.details) || [];
    state.loaded = true;
    if (!location.hash) location.hash = '#/search';
    route();
  })
  .catch(() => {
    app.innerHTML = `<div class="empty">Couldn't load the detail catalogue.<br>If you opened this file directly, run it through a local server instead.</div>`;
  });

// ---------- PWA service worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
