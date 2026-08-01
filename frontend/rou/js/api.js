/**
 * API client — KG Somani ROU Platform
 */
window.API = {
  base: (function() {
    if (typeof location !== 'undefined' && location.protocol.startsWith('http')) return '/api';
    return 'https://my-workflow-app.onrender.com/api';
  })(),

  // Safe JWT payload decode (handles non-padded base64)
  _decodeJWT: function(token) {
    var parts = (token || '').split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT');
    var pad = parts[1];
    pad += '='.repeat((4 - pad.length % 4) % 4);
    return JSON.parse(atob(pad));
  },

  token: function() {
    return localStorage.getItem('rou_token') || '';
  },

  user: function() {
    try { return JSON.parse(localStorage.getItem('rou_user') || 'null'); } catch { return null; }
  },

  // Called by boot.js — returns false if redirecting away
  requireAuth: function() {
    // Absorb ?sso_token= from OAuth callback redirect
    var params = new URLSearchParams(window.location.search);
    var ssoToken = params.get('sso_token');
    if (ssoToken) {
      try {
        var sp = this._decodeJWT(ssoToken);
        if (sp.exp * 1000 > Date.now()) {
          localStorage.setItem('rou_token', ssoToken);
          localStorage.setItem('rou_user', JSON.stringify({
            id: sp.id, name: sp.name, email: sp.email, role: sp.role
          }));
          history.replaceState({}, '', window.location.pathname);
        }
      } catch(e) { /* malformed — fall through to normal check */ }
    }

    var token = this.token();
    if (!token) { window.location.replace('login.html'); return false; }
    try {
      var p = this._decodeJWT(token);
      if (p.exp * 1000 < Date.now()) throw new Error('Expired');
      return true;
    } catch(e) {
      localStorage.removeItem('rou_token');
      localStorage.removeItem('rou_user');
      window.location.replace('login.html');
      return false;
    }
  },

  request: async function(method, path, body) {
    var headers = { 'Content-Type': 'application/json' };
    var token = this.token();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    var res = await fetch(this.base + path, {
      method:    method,
      headers:   headers,
      body:      body !== undefined ? JSON.stringify(body) : undefined,
      keepalive: method !== 'GET',
    });

    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('rou_token');
      localStorage.removeItem('rou_user');
      window.location.replace('login.html');
      throw new Error('Session expired. Please sign in again.');
    }

    var text = await res.text();
    var data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
    if (!res.ok) throw new Error((data && data.error) || 'Request failed (' + res.status + ')');
    return data;
  },

  get:  function(path)        { return this.request('GET',    path); },
  post: function(path, body)  { return this.request('POST',   path, body); },
  put:  function(path, body)  { return this.request('PUT',    path, body); },
  del:  function(path)        { return this.request('DELETE', path); },
};
