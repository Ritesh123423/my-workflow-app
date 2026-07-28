/**
 * API client — KG Somani ROU Platform
 * Token key: rou_token (aligned with login/register pages)
 */
window.API = {
  base: (() => {
    if (typeof location !== 'undefined' && location.protocol.startsWith('http')) {
      return '/api';
    }
    return 'https://my-workflow-app.onrender.com/api';
  })(),

  token() {
    return localStorage.getItem('rou_token') || '';
  },

  user() {
    try { return JSON.parse(localStorage.getItem('rou_user') || 'null'); } catch { return null; }
  },

  requireAuth() {
    const token = this.token();
    if (!token) { window.location.replace('login.html'); return false; }
    try {
      const p = JSON.parse(atob(token.split('.')[1]));
      if (p.exp * 1000 < Date.now()) {
        localStorage.removeItem('rou_token');
        localStorage.removeItem('rou_user');
        window.location.replace('login.html');
        return false;
      }
    } catch(e) {
      localStorage.removeItem('rou_token');
      localStorage.removeItem('rou_user');
      window.location.replace('login.html');
      return false;
    }
    return true;
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
      localStorage.removeItem('rou_token');
      localStorage.removeItem('rou_user');
      window.location.replace('login.html');
      throw new Error('Session expired. Please sign in again.');
    }

    let data = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }

    if (!res.ok) throw new Error((data && data.error) || ('Request failed (' + res.status + ')'));
    return data;
  },

  get(path)        { return this.request('GET', path); },
  put(path, body)  { return this.request('PUT', path, body); },
  post(path, body) { return this.request('POST', path, body); },
  del(path)        { return this.request('DELETE', path); }
};
