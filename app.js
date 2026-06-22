/* GOT-YA — Firestopping Detail Finder
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
  { key: 'penetration',  label: 'Penetration type' },
  { key: 'seal',         label: 'Seal' },
  { key: 'batt',         label: 'Batt type' }
];

// ---------- App state ----------
const state = {
  details: [],
  filters: { manufacturer: new Set(), substrate: new Set(), penetration: new Set(), seal: new Set(), batt: new Set() },
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
  return [...set].sort((a, b) => {
    if (a === 'N/A') return 1;
    if (b === 'N/A') return -1;
    return a.localeCompare(b);
  });
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
  return state.details.filter((d) => matchesExcept(d, null));
}

// How many results a chip would yield, given the other active filters.
function chipCount(key, value) {
  return state.details.filter((d) => matchesExcept(d, key) && valuesOf(d, key).includes(value)).length;
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

  const resultsHtml = results.length
    ? results.map(cardHtml).join('')
    : `<div class="empty">No details match those filters yet.<br>Try removing one.</div>`;

  const liveQF = state.details.filter((d) => d.manufacturer === 'Quelfire' && !d.samplePlaceholder).length;
  const samples = state.details.filter((d) => d.samplePlaceholder).length;

  app.innerHTML = `
    <div class="view-head">
      <h1>Find a detail</h1>
      <p>Pick any combination below — it narrows as you go.</p>
    </div>
    <div class="sample-banner">✅ <strong>${liveQF} live Quelfire details</strong> with real links. ⚠️ Rockwool &amp; Nullifire are still <strong>${samples} sample placeholders</strong> — coming next.</div>
    <div class="filterbar">
      <span class="result-count"><strong>${results.length}</strong> of ${total} details</span>
      ${active ? `<button class="clear-btn" data-action="clear">Clear filters (${active})</button>` : ''}
    </div>
    ${facetsHtml}
    <div class="results">${resultsHtml}</div>
  `;
}

function cardHtml(d) {
  const tags = [...valuesOf(d, 'substrate'), ...valuesOf(d, 'penetration'), ...valuesOf(d, 'seal')]
    .filter((t) => t && t !== 'N/A')
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  return `<a class="card" href="#/detail/${encodeURIComponent(d.id)}">
    <div class="card-top">
      <span class="badge ${escapeHtml(d.manufacturer)}">${escapeHtml(d.manufacturer)}</span>
    </div>
    <h3>${escapeHtml(d.name)}</h3>
    <div class="product">${escapeHtml(d.product || '')}</div>
    <div class="tags">${tags}</div>
  </a>`;
}

function detailView(id) {
  const d = state.details.find((x) => x.id === id);
  if (!d) { app.innerHTML = `<a class="back" href="#/search">← Back</a><div class="empty">Detail not found.</div>`; return; }
  recordRecent(d.id);

  const kv = [...valuesOf(d, 'substrate'), ...valuesOf(d, 'penetration'), ...valuesOf(d, 'seal'), ...valuesOf(d, 'batt')]
    .filter((t) => t && t !== 'N/A')
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');

  const links = (d.relatedLinks || []).map((l) =>
    `<li><a href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label)} <span class="arrow">↗</span></a></li>`
  ).join('');

  const sampleNote = d.samplePlaceholder
    ? `<div class="note">Sample entry — this opens the manufacturer's landing page, not the exact detail PDF. The real PDF link will replace it once the details are loaded.</div>`
    : '';

  app.innerHTML = `
    <a class="back" href="#/search">← Back to search</a>
    <div class="detail-card">
      <span class="badge ${escapeHtml(d.manufacturer)}">${escapeHtml(d.manufacturer)}</span>
      <h1>${escapeHtml(d.name)}</h1>
      <div class="product" style="color:var(--muted);font-size:13px;margin-bottom:10px;">${escapeHtml(d.product || '')}</div>
      <p class="detail-desc">${escapeHtml(d.description || '')}</p>
      <div class="kv">${kv}</div>
      <a class="btn btn-primary" href="${escapeHtml(d.detailUrl)}" target="_blank" rel="noopener noreferrer">📄 Open detail (manufacturer)</a>
      <button class="btn btn-secondary" data-action="add-to-project" data-id="${escapeHtml(d.id)}">＋ Add to a project</button>
      ${sampleNote}
      ${links ? `<div class="section-label">Related documents</div><ul class="link-list">${links}</ul>` : ''}
    </div>
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
  const rows = items.length ? items.map(cardHtml).join('') : `<div class="empty">Nothing viewed yet.<br>Open a detail and it shows up here.</div>`;
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
