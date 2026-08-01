'use strict';
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const pool    = require('../db');
const auth    = require('../middleware/auth');

const ADMIN_EMAIL    = (process.env.ADMIN_EMAIL    || 'admin@kgsomani.com').toLowerCase();
const ADMIN_PASSWORD =  process.env.ADMIN_PASSWORD || 'KGSAdmin@2024';

/* ── helpers ──────────────────────────────────────────────── */
function makeJWT(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
}

/** Safe fetch wrapper — Node 18 has built-in fetch; guard just in case. */
async function safeFetch(url, opts) {
  if (typeof fetch === 'undefined') {
    throw new Error('fetch is not available. Ensure Node.js >= 18 is in use.');
  }
  return fetch(url, opts);
}

/* ── POST /login ──────────────────────────────────────────── */
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password required.' });

  const clean = email.trim().toLowerCase();

  // Hard-coded admin shortcut
  if (clean === ADMIN_EMAIL) {
    if (password !== ADMIN_PASSWORD)
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    const token = jwt.sign(
      { id: 0, role: 'admin', name: 'Administrator', email: ADMIN_EMAIL },
      process.env.JWT_SECRET, { expiresIn: '8h' }
    );
    return res.json({ token, user: { id: 0, name: 'Administrator', email: ADMIN_EMAIL, role: 'admin' } });
  }

  try {
    const r = await pool.query('SELECT * FROM users WHERE email = $1', [clean]);
    if (!r.rows.length)
      return res.status(404).json({ error: 'No account found with this email.' });

    const user = r.rows[0];
    if (user.status === 'pending')
      return res.status(403).json({ error: 'Account pending admin approval.' });
    if (user.status === 'suspended')
      return res.status(403).json({ error: 'Account suspended. Contact your administrator.' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok)
      return res.status(401).json({ error: 'Incorrect password.' });

    const token = makeJWT(user);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) {
    console.error('[auth/login]', e.message);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

/* ── POST /register ───────────────────────────────────────── */
router.post('/register', async (req, res) => {
  const { name, email, password, role = 'article', adminToken } = req.body || {};
  if (!name || !email || !password)
    return res.status(400).json({ error: 'Name, email and password required.' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const cleanRole = ['article', 'manager', 'partner'].includes(role) ? role : 'article';

  if (['manager', 'partner'].includes(cleanRole)) {
    if (!adminToken)
      return res.status(403).json({ error: 'Admin approval token required for Manager/Partner.' });
    try {
      const p = jwt.verify(adminToken, process.env.JWT_SECRET);
      if (p.role !== 'admin')
        return res.status(403).json({ error: 'Invalid admin token.' });
    } catch {
      return res.status(403).json({ error: 'Invalid or expired admin approval token.' });
    }
  }

  try {
    const clean = email.trim().toLowerCase();
    const ex = await pool.query('SELECT id FROM users WHERE email = $1', [clean]);
    if (ex.rows.length)
      return res.status(409).json({ error: 'An account with this email already exists.' });

    const hash = await bcrypt.hash(password, 12);
    const r = await pool.query(
      'INSERT INTO users(name,email,password,role,status) VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,role',
      [name.trim(), clean, hash, cleanRole, 'active']
    );
    const user  = r.rows[0];
    const token = makeJWT(user);
    res.status(201).json({ token, user });
  } catch (e) {
    console.error('[auth/register]', e.message);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

/* ── GET /google ──────────────────────────────────────────── */
router.get('/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID)
    return res.redirect('/login.html?sso_error=Google+SSO+is+not+configured+for+this+deployment.');

  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  process.env.APP_URL + '/api/auth/google/callback',
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'online',
    prompt:        'select_account',
  });
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
});

/* ── GET /google/callback ─────────────────────────────────── */
router.get('/google/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code)
    return res.redirect('/login.html?sso_error=' + encodeURIComponent(error || 'Google sign-in was cancelled.'));

  try {
    const tokenRes = await safeFetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  process.env.APP_URL + '/api/auth/google/callback',
        grant_type:    'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.access_token)
      throw new Error(tokens.error_description || 'Token exchange failed');

    const profileRes = await safeFetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + tokens.access_token },
    });
    const profile = await profileRes.json();
    if (!profile.email)
      throw new Error('No email returned from Google.');

    const user     = await upsertSSOUser(profile.name || profile.email, profile.email);
    const appToken = makeJWT(user);
    res.redirect('/home.html?sso_token=' + encodeURIComponent(appToken));
  } catch (e) {
    console.error('[auth/google/callback]', e.message);
    res.redirect('/login.html?sso_error=' + encodeURIComponent('Google sign-in failed: ' + e.message));
  }
});

/* ── GET /microsoft ───────────────────────────────────────── */
router.get('/microsoft', (req, res) => {
  if (!process.env.MS_CLIENT_ID)
    return res.redirect('/login.html?sso_error=Microsoft+SSO+is+not+configured+for+this+deployment.');

  const tenant = process.env.MS_TENANT_ID || 'common';
  const params = new URLSearchParams({
    client_id:     process.env.MS_CLIENT_ID,
    redirect_uri:  process.env.APP_URL + '/api/auth/microsoft/callback',
    response_type: 'code',
    scope:         'openid email profile User.Read',
    response_mode: 'query',
    prompt:        'select_account',
  });
  res.redirect(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?` + params.toString());
});

/* ── GET /microsoft/callback ──────────────────────────────── */
router.get('/microsoft/callback', async (req, res) => {
  const { code, error, error_description } = req.query;
  if (error || !code)
    return res.redirect('/login.html?sso_error=' + encodeURIComponent(error_description || error || 'Microsoft sign-in was cancelled.'));

  try {
    const tenant   = process.env.MS_TENANT_ID || 'common';
    const tokenRes = await safeFetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        code,
        client_id:     process.env.MS_CLIENT_ID,
        client_secret: process.env.MS_CLIENT_SECRET,
        redirect_uri:  process.env.APP_URL + '/api/auth/microsoft/callback',
        grant_type:    'authorization_code',
        scope:         'openid email profile User.Read',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.access_token)
      throw new Error(tokens.error_description || 'Token exchange failed');

    const profileRes = await safeFetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: 'Bearer ' + tokens.access_token },
    });
    const profile = await profileRes.json();
    const email   = profile.mail || profile.userPrincipalName;
    if (!email)
      throw new Error('No email returned from Microsoft.');

    const user     = await upsertSSOUser(profile.displayName || email, email);
    const appToken = makeJWT(user);
    res.redirect('/home.html?sso_token=' + encodeURIComponent(appToken));
  } catch (e) {
    console.error('[auth/microsoft/callback]', e.message);
    res.redirect('/login.html?sso_error=' + encodeURIComponent('Microsoft sign-in failed: ' + e.message));
  }
});

/* ── upsertSSOUser ────────────────────────────────────────── */
async function upsertSSOUser(name, email) {
  const clean = email.trim().toLowerCase();
  const r     = await pool.query('SELECT * FROM users WHERE email = $1', [clean]);

  if (r.rows.length) {
    const u = r.rows[0];
    if (u.status === 'suspended')
      throw new Error('Your account has been suspended. Contact your administrator.');
    return u;
  }

  // Auto-register new SSO users as article/active with a random unusable password
  const placeholder = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
  const ins = await pool.query(
    'INSERT INTO users(name,email,password,role,status) VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,role',
    [name.trim(), clean, placeholder, 'article', 'active']
  );
  return ins.rows[0];
}

/* ── POST /admin-approval-token ───────────────────────────── */
router.post('/admin-approval-token', auth, auth.requireAdmin, (req, res) => {
  const token = jwt.sign(
    { id: 0, role: 'admin', purpose: 'registration' },
    process.env.JWT_SECRET, { expiresIn: '24h' }
  );
  res.json({ token, expiresIn: '24h' });
});

/* ── GET /me ──────────────────────────────────────────────── */
router.get('/me', auth, async (req, res) => {
  if (req.user.id === 0)
    return res.json({ id: 0, name: 'Administrator', email: ADMIN_EMAIL, role: 'admin' });
  try {
    const r = await pool.query(
      'SELECT id,name,email,role,status,created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!r.rows.length)
      return res.status(404).json({ error: 'User not found.' });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── PUT /profile ─────────────────────────────────────────── */
router.put('/profile', auth, async (req, res) => {
  if (req.user.id === 0)
    return res.status(400).json({ error: 'Admin profile is managed via environment variables.' });
  const { name } = req.body || {};
  if (!name || !name.trim())
    return res.status(400).json({ error: 'Name is required.' });
  try {
    const r = await pool.query(
      'UPDATE users SET name = $1 WHERE id = $2 RETURNING id,name,email,role',
      [name.trim(), req.user.id]
    );
    if (!r.rows.length)
      return res.status(404).json({ error: 'User not found.' });
    const user  = r.rows[0];
    const token = makeJWT(user);
    res.json({ ok: true, token, user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── PUT /change-password ─────────────────────────────────── */
router.put('/change-password', auth, async (req, res) => {
  if (req.user.id === 0)
    return res.status(400).json({ error: 'Admin password is managed via environment variables.' });
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'Both passwords required.' });
  if (newPassword.length < 8)
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  try {
    const r = await pool.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
    if (!r.rows.length)
      return res.status(404).json({ error: 'User not found.' });
    const ok = await bcrypt.compare(currentPassword, r.rows[0].password);
    if (!ok)
      return res.status(401).json({ error: 'Current password is incorrect.' });
    await pool.query(
      'UPDATE users SET password = $1 WHERE id = $2',
      [await bcrypt.hash(newPassword, 12), req.user.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
