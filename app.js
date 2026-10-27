(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  // On GitHub Pages, make the header's GitHub link point to this site's repository.
  const githubLink = $('.github-link');
  if (githubLink && window.location.hostname.endsWith('.github.io')) {
    const owner = window.location.hostname.split('.')[0];
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const repo = pathParts[0] || `${owner}.github.io`;
    githubLink.href = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  }
  const els = {
    search: $('#search-input'), categoryList: $('#category-list'), grid: $('#api-grid'),
    resultsCount: $('#results-count'), empty: $('#empty-state'), activeFilters: $('#active-filters'),
    sort: $('#sort-select'), freeOnly: $('#free-only'),
    total: $('#stat-total'), categories: $('#stat-categories'), noKey: $('#stat-no-key'), checkable: $('#stat-checkable'),
    savedCount: $('#saved-pill-count'), dialog: $('#api-dialog'), toast: $('#toast')
  };
  const CATEGORY_SIGNS = {
    'Animals':'◉','Art & Culture':'▧','Books & Knowledge':'▤','Developer Tools':'⌘','Education & Language':'文',
    'Finance & Crypto':'$','Food & Drink':'⌁','Fun & Lifestyle':'✳','Games & Entertainment':'△','Geography & Maps':'⌖',
    'Government & Open Data':'▥','Images & Design':'▧','Movies & TV':'▶','Music & Audio':'♫','Network & Security':'⌁',
    'Science & Research':'∑','Sports & Fitness':'◎','Testing & Mock Data':'{}','Time & Calendar':'◷','Transport & Mobility':'↗',
    'Weather & Environment':'☼','Data Validation':'✓','Open Data':'▥'
  };
  const STATUS = {
    online: {label:'Online', cls:'success', dot:'online', detail:'The last automated HTTP check succeeded. This is not a service-level guarantee.'},
    http_error: {label:'HTTP error', cls:'warn', dot:'error', detail:'The endpoint returned an HTTP error during its last check.'},
    server_error: {label:'Server error', cls:'fail', dot:'offline', detail:'The endpoint returned a server-side error during its last check.'},
    offline: {label:'Unreachable', cls:'fail', dot:'offline', detail:'The checker could not connect to the endpoint during its last check.'},
    invalid_response: {label:'Unexpected response', cls:'warn', dot:'error', detail:'The server responded, but the response did not parse as expected.'},
    not_checked: {label:'Not checked', cls:'unknown', dot:'checking', detail:'No automated result has been recorded yet.'},
    manual_check: {label:'Manual check', cls:'unknown', dot:'', detail:'This entry is not checked automatically because the endpoint needs a special request or response handling.'},
    needs_auth: {label:'Auth required', cls:'warn', dot:'checking', detail:'Automatic checks are skipped for this entry because authentication may be needed.'}
  };
  let catalog = null;
  let apis = [];
  let statusMap = {};
  let selectedCategory = '';
  let activeView = 'all';
  let searchTerm = '';
  let favorites = new Set();
  let currentApi = null;
  let toastTimer = null;

  try { favorites = new Set(JSON.parse(localStorage.getItem('workingapi-favorites') || '[]')); } catch (_) { favorites = new Set(); }

  function safeURL(value) {
    try {
      const u = new URL(value, window.location.href);
      return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '#';
    } catch (_) { return '#'; }
  }
  function text(value, fallback = 'Not provided') {
    return typeof value === 'string' && value.trim() ? value : fallback;
  }
  function make(tag, cls, content) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function add(parent, tag, cls, content) {
    const node = make(tag, cls, content);
    parent.append(node);
    return node;
  }
  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2100);
  }
  async function copyText(value, button) {
    try {
      await navigator.clipboard.writeText(value);
    } catch (_) {
      const area = document.createElement('textarea');
      area.value = value; area.style.position = 'fixed'; area.style.opacity = '0';
      document.body.append(area); area.select();
      const ok = document.execCommand('copy'); area.remove();
      if (!ok) { showToast('Could not copy. Select the text and copy it manually.'); return; }
    }
    if (button) {
      const old = button.textContent;
      button.classList.add('copied');
      button.textContent = 'Copied';
      setTimeout(() => { button.classList.remove('copied'); button.textContent = old; }, 1250);
    }
    showToast('Copied to clipboard');
  }
  function responseStatus(api) {
    return statusMap[api.id] || { status: api.check_url ? 'not_checked' : 'manual_check', checked_at: null, http_status: null, cors_probe: 'not_checked', error: null };
  }
  function statusInfo(api) {
    const live = responseStatus(api);
    return STATUS[live.status] || STATUS.not_checked;
  }
  function accessLabel(api) {
    const a = (api.auth || 'Unknown').toLowerCase();
    if (a === 'none' || a.startsWith('none for')) return 'No key';
    if (a.includes('optional')) return 'Key optional';
    if (a.includes('oauth')) return 'OAuth';
    if (a.includes('token')) return 'Token';
    if (a.includes('client id')) return 'Client ID';
    if (a.includes('api key') || a.includes('key')) return 'API key';
    return api.auth;
  }
  function isNoKey(api) {
    const a = (api.auth || '').toLowerCase();
    return a === 'none' || a.startsWith('none for');
  }
  function makeBadge(label, cls) { return make('span', `badge ${cls}`, label); }
  function setFavorite(id, wanted) {
    if (wanted) favorites.add(id); else favorites.delete(id);
    try { localStorage.setItem('workingapi-favorites', JSON.stringify(Array.from(favorites))); } catch (_) {}
    updateSavedCount();
    render();
    if (currentApi && currentApi.id === id) updateDialogSave();
  }
  function updateSavedCount() { els.savedCount.textContent = String(favorites.size); }

  function renderCategories() {
    els.categoryList.replaceChildren();
    const allBtn = make('button', `category-button ${selectedCategory === '' ? 'active' : ''}`);
    allBtn.type = 'button'; allBtn.dataset.category = '';
    add(allBtn, 'span', 'category-symbol', '⌘'); add(allBtn, 'span', 'category-name', 'All categories');
    add(allBtn, 'span', 'category-count', String(apis.length));
    els.categoryList.append(allBtn);
    const counts = new Map();
    apis.forEach(api => counts.set(api.category, (counts.get(api.category) || 0) + 1));
    Array.from(counts.keys()).sort((a,b) => a.localeCompare(b)).forEach(category => {
      const btn = make('button', `category-button ${selectedCategory === category ? 'active' : ''}`);
      btn.type = 'button'; btn.dataset.category = category;
      add(btn, 'span', 'category-symbol', CATEGORY_SIGNS[category] || '•');
      add(btn, 'span', 'category-name', category);
      add(btn, 'span', 'category-count', String(counts.get(category)));
      els.categoryList.append(btn);
    });
  }
  function createCard(api) {
    const card = make('article', 'api-card');
    const top = add(card, 'div', 'api-card-top');
    add(top, 'div', 'api-mark', initials(api.name));
    const titleWrap = add(top, 'div', 'api-title-wrap');
    add(titleWrap, 'h3', 'api-title', api.name);
    const catLine = add(titleWrap, 'div', 'api-category');
    add(catLine, 'span', 'cat-dot'); add(catLine, 'span', '', api.category);
    const save = make('button', `card-save ${favorites.has(api.id) ? 'saved' : ''}`, favorites.has(api.id) ? '★' : '☆');
    save.type = 'button'; save.setAttribute('aria-label', favorites.has(api.id) ? `Remove ${api.name} from saved APIs` : `Save ${api.name}`); save.title = save.getAttribute('aria-label');
    save.addEventListener('click', () => setFavorite(api.id, !favorites.has(api.id)));
    top.append(save);
    add(card, 'p', 'api-description', api.description);
    const badges = add(card, 'div', 'badge-row');
    const authClass = isNoKey(api) ? 'badge-auth' : 'badge-key';
    badges.append(makeBadge(accessLabel(api), authClass));
    badges.append(makeBadge(api.https ? 'HTTPS' : 'HTTP only', api.https ? 'badge-https' : 'badge-cors-no'));
    const cors = api.cors || 'Unknown';
    badges.append(makeBadge(`CORS ${cors}`, cors === 'Yes' ? 'badge-cors-yes' : cors === 'No' ? 'badge-cors-no' : 'badge-cors-unknown'));
    const live = responseStatus(api); const info = statusInfo(api);
    const bottom = add(card, 'div', 'card-bottom');
    const status = add(bottom, 'div', 'status-line');
    add(status, 'span', `status-dot ${info.dot || ''}`);
    let statusText = info.label;
    if (live.http_status) statusText += ` · ${live.http_status}`;
    if (live.checked_at) statusText += ` · ${shortDate(live.checked_at)}`;
    add(status, 'span', '', statusText);
    const view = add(bottom, 'button', 'card-view', 'View details →');
    view.type = 'button'; view.addEventListener('click', () => openDetails(api));
    card.addEventListener('click', event => { if (!event.target.closest('button,a')) openDetails(api); });
    card.tabIndex = 0; card.setAttribute('role', 'group');
    card.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.target.closest('button')) openDetails(api); });
    return card;
  }
  function initials(name) {
    const words = name.replace(/[()]/g, '').split(/\s+/).filter(Boolean);
    if (words.length === 1) return words[0].slice(0,2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  function shortDate(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function matches(api) {
    if (selectedCategory && api.category !== selectedCategory) return false;
    if (activeView === 'no-key' && !isNoKey(api)) return false;
    if (activeView === 'cors' && api.cors !== 'Yes') return false;
    if (activeView === 'favorites' && !favorites.has(api.id)) return false;
    if (els.freeOnly.checked && !/free/i.test(api.free_tier || '')) return false;
    if (searchTerm) {
      const haystack = [api.name,api.category,api.description,api.auth,api.cors,api.free_tier,api.rate_limit].join(' ').toLowerCase();
      const terms = searchTerm.split(/\s+/).filter(Boolean);
      if (!terms.every(term => haystack.includes(term))) return false;
    }
    return true;
  }
  function sortItems(items) {
    const sort = els.sort.value;
    if (sort === 'name') return items.sort((a,b) => a.name.localeCompare(b.name));
    if (sort === 'category') return items.sort((a,b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    if (sort === 'auth') return items.sort((a,b) => Number(!isNoKey(a)) - Number(!isNoKey(b)) || a.name.localeCompare(b.name));
    return items.sort((a,b) => a._index-b._index);
  }
  function renderActiveFilters() {
    els.activeFilters.replaceChildren();
    const tags = [];
    if (selectedCategory) tags.push({label:selectedCategory, clear:()=>{selectedCategory=''; renderCategories(); render();}});
    if (activeView !== 'all') tags.push({label: activeView==='no-key'?'No API key':activeView==='cors'?'Browser-friendly':'Saved', clear:()=>setView('all')});
    if (els.freeOnly.checked) tags.push({label:'Free to start', clear:()=>{els.freeOnly.checked=false;render();}});
    if (searchTerm) tags.push({label:`Search: ${searchTerm}`, clear:()=>{els.search.value='';searchTerm='';render();}});
    if (!tags.length) { els.activeFilters.hidden = true; return; }
    els.activeFilters.hidden = false;
    tags.forEach(tag => {
      const item = make('span','active-filter-tag'); item.append(document.createTextNode(tag.label));
      const x = make('button','','×'); x.type='button'; x.setAttribute('aria-label',`Clear ${tag.label} filter`); x.addEventListener('click',tag.clear); item.append(x); els.activeFilters.append(item);
    });
  }
  function render() {
    const found = sortItems(apis.filter(matches).map(a => ({...a,_index:apis.findIndex(item=>item.id===a.id)})));
    els.grid.replaceChildren(); els.grid.setAttribute('aria-busy','false');
    els.resultsCount.innerHTML = `<strong>${found.length}</strong> ${found.length===1?'API':'APIs'} found`;
    found.forEach(api => els.grid.append(createCard(api)));
    els.empty.hidden = found.length !== 0;
    els.grid.hidden = found.length === 0;
    renderActiveFilters();
    updateSavedCount();
    $$('.filter-pill').forEach(btn => btn.classList.toggle('active', btn.dataset.view === activeView));
    $$('.category-button', els.categoryList).forEach(btn => btn.classList.toggle('active', btn.dataset.category === selectedCategory));
  }
  function setView(view) { activeView = view; render(); }
  function updateDialogSave() {
    if (!currentApi) return;
    const isSaved = favorites.has(currentApi.id);
    const b = $('#dialog-save'); b.textContent = isSaved ? '★' : '☆'; b.classList.toggle('saved',isSaved);
    b.setAttribute('aria-label',isSaved?'Remove from saved APIs':'Save API');
  }
  function detailCors(api, live) {
    const val = api.cors || 'Unknown';
    let line = val === 'Yes' ? 'Reported as supported.' : val === 'No' ? 'Reported as unavailable for direct browser calls.' : 'Not confirmed in the catalogue.';
    if (api.cors_evidence) line += ` ${api.cors_evidence}.`;
    if (live && live.cors_probe && live.cors_probe !== 'not_checked') {
      const map = {yes:'The automated probe saw a compatible Access-Control-Allow-Origin header for its test origin.', no:'The automated probe did not see an Access-Control-Allow-Origin header for its test origin.', restricted:'A CORS header was present but did not allow the probe origin.', unknown:'The probe could not determine CORS support.'};
      line += ` Live probe: ${map[live.cors_probe] || live.cors_probe}`;
    }
    return line;
  }
  function openDetails(api) {
    currentApi = api;
    $('#dialog-category').textContent = api.category;
    $('#dialog-title').textContent = api.name;
    $('#dialog-description').textContent = api.description;
    $('#dialog-mark').textContent = initials(api.name);
    $('#detail-auth').textContent = text(api.auth);
    $('#detail-free').textContent = text(api.free_tier);
    $('#detail-rate').textContent = text(api.rate_limit);
    const live = responseStatus(api); $('#detail-cors').textContent = detailCors(api, live);
    $('#detail-cors-source').textContent = api.cors_evidence ? 'CORS source: ' + api.cors_evidence : 'CORS result is unknown until checked from a browser context.';
    const liveInfo = statusInfo(api);
    $('#detail-live-status').textContent = liveInfo.detail + (live.http_status ? ` HTTP ${live.http_status}.` : '') + (live.error ? ` ${live.error}` : '');
    $('#detail-last-checked').textContent = live.checked_at ? `Last check: ${new Date(live.checked_at).toLocaleString()}` : 'No automated check has been recorded yet.';
    const sb = $('#detail-status-badge'); sb.className = `status-badge status-${liveInfo.cls}`; sb.textContent = liveInfo.label;
    const badges = $('#dialog-badges'); badges.replaceChildren();
    badges.append(makeBadge(accessLabel(api),isNoKey(api)?'badge-auth':'badge-key'));
    badges.append(makeBadge(api.https?'HTTPS':'HTTP only',api.https?'badge-https':'badge-cors-no'));
    badges.append(makeBadge(`CORS ${api.cors || 'Unknown'}`,api.cors==='Yes'?'badge-cors-yes':api.cors==='No'?'badge-cors-no':'badge-cors-unknown'));
    if (api.check_url) badges.append(makeBadge('Automated check eligible','badge-free'));
    $('#detail-endpoint').textContent = api.endpoint;
    const docs = $('#detail-docs'); docs.href = safeURL(api.docs); docs.style.display = safeURL(api.docs)==='#'?'none':'inline-flex';
    const link = $('#detail-api-link'); link.href=safeURL(api.endpoint); link.style.display=safeURL(api.endpoint)==='#'?'none':'inline-flex';
    $('#detail-code').textContent = api.example_js || `fetch(${JSON.stringify(api.endpoint)}).then(r => r.json()).then(console.log);`;
    const hasPlaceholder = /YOUR_[A-Z0-9_]+/.test(api.example_js || '') || /YOUR_[A-Z0-9_]+/.test(api.endpoint || '') || JSON.stringify(api.headers||{}).includes('YOUR_');
    $('#key-warning').hidden = !hasPlaceholder;
    $('#example-note').textContent = api.response_type==='image' ? 'Use this snippet in a browser to display the asset.' : api.response_type==='xml' ? 'This endpoint returns XML, so the example reads the response as text.' : api.response_type==='text' ? 'This endpoint returns plain text, so the example reads the response as text.' : 'Copy this starting point into your project. Check the provider docs for request options.';
    $('#notes-section').hidden = !api.notes;
    $('#detail-notes').textContent = api.notes || '';
    updateDialogSave();
    if (!els.dialog.open) els.dialog.showModal();
  }

  function setStats() {
    els.total.textContent = String(apis.length);
    els.categories.textContent = String(new Set(apis.map(a => a.category)).size);
    els.noKey.textContent = String(apis.filter(isNoKey).length);
    els.checkable.textContent = String(apis.filter(a => a.check_url).length);
  }
  function setError(message) {
    els.grid.replaceChildren();
    const block = make('div','loading-card',message);
    els.grid.append(block); els.grid.setAttribute('aria-busy','false');
    els.resultsCount.textContent = 'Catalogue could not be loaded';
  }
  async function load() {
    try {
      const [catalogRes,statusRes] = await Promise.all([fetch('./data/apis.json',{cache:'no-cache'}),fetch('./data/status.json',{cache:'no-cache'}).catch(()=>null)]);
      if (!catalogRes.ok) throw new Error(`Catalogue request failed (${catalogRes.status}).`);
      catalog = await catalogRes.json();
      if (!Array.isArray(catalog.apis)) throw new Error('The catalogue file has an unexpected format.');
      apis = catalog.apis;
      if (statusRes && statusRes.ok) {
        const statusJson = await statusRes.json(); statusMap = statusJson.results || {};
      }
      setStats(); renderCategories(); render();
    } catch (error) {
      setError(`Could not load data/apis.json. ${error.message} If you opened this file directly, run a local web server or deploy it with GitHub Pages.`);
    }
  }

  els.search.addEventListener('input', () => { searchTerm = els.search.value.trim().toLowerCase(); render(); });
  els.sort.addEventListener('change', render);
  els.freeOnly.addEventListener('change', render);
  els.categoryList.addEventListener('click', event => {
    const button = event.target.closest('button[data-category]'); if (!button) return;
    selectedCategory = button.dataset.category; renderCategories(); render();
  });
  $('#clear-category').addEventListener('click', () => { selectedCategory=''; renderCategories(); render(); });
  $$('.filter-pill').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  $('#reset-filters').addEventListener('click', () => {
    selectedCategory=''; activeView='all'; searchTerm=''; els.search.value=''; els.freeOnly.checked=false; els.sort.value='curated'; renderCategories(); render();
  });
  $('#close-dialog').addEventListener('click', () => els.dialog.close());
  $('#close-dialog-bottom').addEventListener('click', () => els.dialog.close());
  els.dialog.addEventListener('click', event => { if (event.target === els.dialog) els.dialog.close(); });
  $('#dialog-save').addEventListener('click', () => { if (currentApi) setFavorite(currentApi.id,!favorites.has(currentApi.id)); });
  $('#copy-endpoint').addEventListener('click', () => { if (currentApi) copyText(currentApi.endpoint,$('#copy-endpoint')); });
  $('#copy-code').addEventListener('click', () => { if (currentApi) copyText(currentApi.example_js || '', $('#copy-code')); });
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName) && !els.dialog.open) { event.preventDefault(); els.search.focus(); }
    if (event.key === 'Escape' && els.dialog.open) els.dialog.close();
  });
  updateSavedCount();
  load();
})();
