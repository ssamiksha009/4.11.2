// Sidebar widget: fetch project inputs and allow applying them to current form
(function () {
  const SIDEBAR_ID = 'input-settings-sidebar';

  function getProjectIdFromURL() {
    const p = new URLSearchParams(window.location.search);
    return p.get('projectId') || sessionStorage.getItem('currentProjectId') || null;
  }

  async function fetchSavedInputs() {
    try {
      // ✅ Get auth token from localStorage
      const token = localStorage.getItem('authToken');
      
      const headers = {
        'Content-Type': 'application/json'
      };
      
      // ✅ Add Authorization header if token exists
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      // ✅ Fetch from protocol_drafts with authentication
      const res = await fetch('/api/project-inputs?limit=200', {
        headers: headers
      });
      
      if (!res.ok) {
        if (res.status === 401) {
          console.error('❌ Authentication failed - redirecting to login');
          window.location.href = '/login.html';
          return { error: true, status: 401, message: 'Unauthorized' };
        }
        
        return { 
          error: true, 
          status: res.status, 
          statusText: res.statusText, 
          body: await safeText(res) 
        };
      }
      
      const json = await res.json();
      return Array.isArray(json) ? { items: json } : { items: [] };
      
    } catch (e) {
      return { error: true, exception: String(e) };
    }
  }

  async function safeText(res) {
    try { return await res.text(); } catch (e) { return ''; }
  }

  function createSidebarShell() {
    let aside = document.getElementById(SIDEBAR_ID);
    if (aside) return aside;

    aside = document.createElement('aside');
    aside.id = SIDEBAR_ID;
    aside.className = 'input-sidebar visible';

    aside.innerHTML = `
      <div class="input-sidebar-header">
        <div class="input-sidebar-title">Input Settings</div>
        <button id="inputSidebarRefresh" class="btn small">Refresh</button>
      </div>
      <div class="input-sidebar-search">
        <input id="inputSidebarFilter" placeholder="Filter projects or protocol..." />
      </div>
      <div id="inputSidebarStatus" class="input-sidebar-status">Loading…</div>
      <div id="inputSidebarList" class="input-sidebar-list" aria-live="polite"></div>
      <div class="input-sidebar-footer">
        <small class="muted">Recent project inputs — apply to populate the form</small>
      </div>
    `;
    document.body.appendChild(aside);

    document.getElementById('inputSidebarRefresh').addEventListener('click', loadAndRender);
    document.getElementById('inputSidebarFilter').addEventListener('input', (e) => filterList(e.target.value));
    return aside;
  }

  let currentItems = [];

  function setStatusHtml(html) {
    const s = document.getElementById('inputSidebarStatus');
    if (s) s.innerHTML = html;
  }

  function filterList(q) {
    q = (q || '').toLowerCase().trim();
    const list = document.getElementById('inputSidebarList');
    if (!list) return;
    const items = currentItems.filter(it => {
      if (!q) return true;
      return (it.project_name||'').toLowerCase().includes(q) || (it.protocol||'').toLowerCase().includes(q);
    });
    renderList(items);
  }

  function renderList(items) {
    const list = document.getElementById('inputSidebarList');
    if (!list) return;
    
    // ✅ CHANGED: Show all items, even those with partial inputs
    if (!items || items.length === 0) {
      list.innerHTML = '<div class="empty">No saved inputs</div>';
      return;
    }

    list.innerHTML = items.map(it => {
      const ts = it.created_at ? new Date(it.created_at).toLocaleString() : '';
      const safeName = escapeHtml(it.project_name || `#${it.id}`);
      const proto = escapeHtml(it.protocol || '');
      
      // ✅ Count how many input fields are saved
      const inputCount = it.inputs && typeof it.inputs === 'object' 
        ? Object.keys(it.inputs).length 
        : 0;
      
      // ✅ Show field count badge
      const fieldsBadge = inputCount > 0 
        ? `<span class="fields-count">${inputCount} fields</span>` 
        : '<span class="fields-count empty">No fields</span>';
      
      return `
        <div class="input-item" data-id="${it.id}">
          <div class="input-item-main">
            <div class="input-item-title">
              ${safeName} 
              <span class="input-proto">${proto}</span>
              ${fieldsBadge}
            </div>
            <div class="input-item-meta">${ts}</div>
          </div>
          <div class="input-item-actions">
            <button class="apply-btn btn" data-id="${it.id}" ${inputCount === 0 ? 'disabled' : ''}>Apply</button>
            <button class="preview-btn btn-ghost" data-id="${it.id}">Preview</button>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.apply-btn').forEach(b => b.addEventListener('click', onApplyClick));
    list.querySelectorAll('.preview-btn').forEach(b => b.addEventListener('click', onPreviewClick));
  }

  function escapeHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  async function onApplyClick(evt) {
    const id = evt.currentTarget.dataset.id;
    const item = currentItems.find(x => String(x.id) === String(id));
    if (!item) return alert('Item not found');
    const inputs = item.inputs || {};
    let filled = 0;
    Object.keys(inputs).forEach(k => {
      const el = document.getElementById(k);
      if (el) {
        try {
          el.value = inputs[k];
          el.dispatchEvent(new Event('input', { bubbles: true }));
          filled++;
        } catch (e) {}
      }
    });
    const currentProjectId = getProjectIdFromURL();
    if (currentProjectId && confirm(`Apply ${item.project_name || id} inputs and save into current project?`)) {
      try {
        await fetch(`/api/projects/${currentProjectId}/inputs`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs })
        });
        alert('Inputs applied and saved to current project.');
        await loadAndRender();
      } catch (e) {
        console.warn(e);
        alert('Inputs applied locally. Failed to save to server.');
      }
    } else {
      alert(`Inputs applied locally to form (${filled} fields updated).`);
    }
  }

  function onPreviewClick(evt) {
    const id = evt.currentTarget.dataset.id;
    const item = currentItems.find(x => String(x.id) === String(id));
    if (!item) return;
    const preview = JSON.stringify(item.inputs || {}, null, 2);
    const m = document.createElement('div');
    m.className = 'input-preview-backdrop';
    m.innerHTML = `
      <div class="input-preview">
        <div class="input-preview-header"><strong>Preview: ${escapeHtml(item.project_name||'#'+item.id)}</strong><button class="close">Close</button></div>
        <pre class="input-preview-body">${escapeHtml(preview)}</pre>
      </div>
    `;
    document.body.appendChild(m);
    m.querySelector('.close').addEventListener('click', () => m.remove());
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
  }

  async function loadAndRender() {
    const aside = createSidebarShell();
    setStatusHtml('Loading…');
    const result = await fetchSavedInputs();
    if (!result || result.error) {
      // Show informative error in the sidebar instead of console only
      const details = result && (result.status || result.exception) ? `
        <div class="error-line">Error loading inputs: ${escapeHtml(String(result.status || result.exception || 'unknown'))}</div>
        <div class="muted-small">Check server logs or run <code>GET /api/ping</code></div>
      ` : '<div class="error-line">Unknown fetch error</div>';
      setStatusHtml(details);
      document.getElementById('inputSidebarList').innerHTML = '<div class="empty">No saved inputs</div>';
      return;
    }

    const items = result.items || [];
    currentItems = items;
    setStatusHtml(`${items.length} saved input(s)`);
    renderList(items);
  }

  // Exposed helper for debugging in console
  window.inputSettings = { refresh: loadAndRender, _items: () => currentItems };

  document.addEventListener('DOMContentLoaded', () => {
    createSidebarShell();
    loadAndRender();
  });
})();