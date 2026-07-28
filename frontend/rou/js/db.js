/**
 * DB — API-backed store with in-memory cache.
 * Keeps sync get/set API used across the ROU app.
 * Persists to Postgres via /api/rou/* (user-scoped JWT).
 * localStorage remains a local offline mirror only.
 */
window.DB = {
  PREFIX: 'rou_bot_',
  _cache: Object.create(null),
  _dirty: new Set(),
  _persistTimer: null,
  _ready: false,
  _persisting: false,

  _enc(val) {
    try { return btoa(unescape(encodeURIComponent(JSON.stringify(val)))); }
    catch { return JSON.stringify(val); }
  },
  _dec(raw) {
    try { return JSON.parse(decodeURIComponent(escape(atob(raw)))); }
    catch {
      try { return JSON.parse(raw); } catch { return null; }
    }
  },

  get(key) {
    if (Object.prototype.hasOwnProperty.call(this._cache, key)) return this._cache[key];
    try {
      const raw = localStorage.getItem(this.PREFIX + key);
      if (!raw) return null;
      const val = this._dec(raw);
      this._cache[key] = val;
      return val;
    } catch {
      return null;
    }
  },

  set(key, val) {
    this._cache[key] = val;
    try {
      localStorage.setItem(this.PREFIX + key, this._enc(val));
    } catch (e) {
      console.warn('localStorage mirror failed for', key, e);
    }
    this._dirty.add(key);
    this._schedulePersist();
    return true;
  },

  remove(key) {
    delete this._cache[key];
    localStorage.removeItem(this.PREFIX + key);
    this._dirty.add(key);
    this._schedulePersist();
  },

  keys() {
    const fromCache = Object.keys(this._cache).map(k => this.PREFIX + k);
    const fromLS = Object.keys(localStorage).filter(k => k.startsWith(this.PREFIX));
    return Array.from(new Set([...fromCache, ...fromLS]));
  },

  sizeBytes() {
    return this.keys().reduce((t, k) => t + (localStorage.getItem(k) || '').length * 2, 0);
  },

  _schedulePersist() {
    if (this._persistTimer) clearTimeout(this._persistTimer);
    this._persistTimer = setTimeout(() => {
      this.flush().catch(err => console.error('ROU persist failed:', err));
    }, 250);
  },

  async hydrate() {
    const data = await API.get('/rou/bootstrap');

    this._cache = Object.create(null);

    const clients = data.clients || [];
    this._cache.clients = clients;
    this._mirror('clients', clients);

    if (data.settings) {
      this._cache.settings = data.settings;
      this._mirror('settings', data.settings);
    }
    if (data.adminHash) {
      this._cache.admin_hash = data.adminHash;
      this._mirror('admin_hash', data.adminHash);
    }
    if (data.lastClient) {
      this._cache.last_client = data.lastClient;
      this._mirror('last_client', data.lastClient);
    }

    const rous = data.rous || {};
    Object.keys(rous).forEach(clientId => {
      const key = 'rous_' + clientId;
      this._cache[key] = rous[clientId] || [];
      this._mirror(key, this._cache[key]);
    });
    // Ensure every client has a rous_ key
    clients.forEach(c => {
      const key = 'rous_' + c.id;
      if (!Object.prototype.hasOwnProperty.call(this._cache, key)) {
        this._cache[key] = [];
        this._mirror(key, []);
      }
    });

    const auditLogs = data.auditLogs || {};
    Object.keys(auditLogs).forEach(clientId => {
      const key = 'audit_log_' + clientId;
      this._cache[key] = auditLogs[clientId] || [];
      this._mirror(key, this._cache[key]);
    });

    const overrides = data.overrides || {};
    Object.keys(overrides).forEach(clientId => {
      const key = 'reassess_override_' + clientId;
      this._cache[key] = overrides[clientId] || [];
      this._mirror(key, this._cache[key]);
    });

    this._dirty.clear();
    this._ready = true;
    return data;
  },

  _mirror(key, val) {
    try { localStorage.setItem(this.PREFIX + key, this._enc(val)); } catch (_) { /* ignore */ }
  },

  async flush() {
    if (!this._dirty.size || this._persisting) return;
    if (!API.token()) return;

    this._persisting = true;
    const dirty = Array.from(this._dirty);
    this._dirty.clear();

    try {
      const clientsDirty = dirty.includes('clients');
      const promises = [];

      if (clientsDirty) {
        await API.put('/rou/clients', { clients: this.get('clients') || [] });
      }

      if (dirty.includes('settings')) {
        promises.push(API.put('/rou/settings', { settings: this.get('settings') || {} }));
      }
      if (dirty.includes('admin_hash') && this.get('admin_hash')) {
        promises.push(API.put('/rou/admin-hash', { adminHash: this.get('admin_hash') }));
      }
      if (dirty.includes('last_client')) {
        promises.push(API.put('/rou/last-client', { lastClient: this.get('last_client') || null }));
      }

      const clientIds = new Set();
      dirty.forEach(key => {
        let m;
        if ((m = /^rous_(.+)$/.exec(key))) clientIds.add(m[1]);
        if ((m = /^audit_log_(.+)$/.exec(key))) clientIds.add(m[1]);
        if ((m = /^reassess_override_(.+)$/.exec(key))) clientIds.add(m[1]);
      });

      for (const clientId of clientIds) {
        if (dirty.includes('rous_' + clientId) || clientsDirty) {
          promises.push(API.put('/rou/clients/' + encodeURIComponent(clientId) + '/rous', {
            rous: this.get('rous_' + clientId) || []
          }));
        }
        if (dirty.includes('audit_log_' + clientId)) {
          promises.push(API.put('/rou/clients/' + encodeURIComponent(clientId) + '/audit-log', {
            logs: this.get('audit_log_' + clientId) || []
          }));
        }
        if (dirty.includes('reassess_override_' + clientId)) {
          promises.push(API.put('/rou/clients/' + encodeURIComponent(clientId) + '/overrides', {
            overrides: this.get('reassess_override_' + clientId) || []
          }));
        }
      }

      await Promise.all(promises);
    } catch (err) {
      dirty.forEach(k => this._dirty.add(k));
      throw err;
    } finally {
      this._persisting = false;
      if (this._dirty.size) this._schedulePersist();
    }
  },

  /** Admin backup restore → server workspace replace, then rehydrate */
  async restoreWorkspace(data) {
    await API.put('/rou/workspace', data);
    await this.hydrate();
  },

  // IndexedDB stubs kept so older App.init paths don't crash
  async restoreFromIndexedDB() { return 0; },
  async _saveToIndexedDB() { /* no-op — Postgres is source of truth */ },
  async _removeFromIndexedDB() { /* no-op */ }
};
