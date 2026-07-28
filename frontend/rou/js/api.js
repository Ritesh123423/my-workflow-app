/**
 * API client for Master Audit Workflow (Render / local Node backend).
 * Uses same-origin `/api` in production; falls back to localStorage token auth.
 */
window.API = {
  base: (() => {
    if (typeof location !== 'undefined' && location.protocol.startsWith('http')) {
      return '/api';
    }
    return 'https://my-workflow-app.onrender.com/api';
  })(),

  token() {
    return localStorage.getItem('token') || '';
  },

  user() {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  },

  requireAuth(redirectTo) {
    if (this.token()) return true;
    const next = encodeURIComponent(redirectTo || (location.pathname + location.search));
    location.href = '../login.html?next=' + next;
    return false;
  },

  async request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.token();
    if (token) headers.Authorization = 'Bearer ' + token;

    const res = await fetch(this.base + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      keepalive: method !== 'GET'
    });

    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      const next = encodeURIComponent(location.pathname + location.search);
      location.href = '../login.html?next=' + next;
      throw new Error('Session expired. Please sign in again.');
    }

    let data = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }

    if (!res.ok) throw new Error((data && data.error) || ('Request failed (' + res.status + ')'));
    return data;
  },

  get(path) { return this.request('GET', path); },
  put(path, body) { return this.request('PUT', path, body); },
  post(path, body) { return this.request('POST', path, body); },
  del(path) { return this.request('DELETE', path); }
};
