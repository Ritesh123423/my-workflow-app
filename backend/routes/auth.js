const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const pool    = require('../db');
const auth    = require('../middleware/auth');

const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@kgsomani.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'KGSAdmin@2024';

/* ── helpers ───────────────────────────────────────────────── */
function makeJWT(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name, email: user.email },
    process.env.JWT_SECRET, { expiresIn: '8h' }
  );
}

/* ── LOGIN ─────────────────────────────────────────────────── */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });

  if (email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Invalid admin credentials.' });
    const token = jwt.sign(
      { id: 0, role: 'admin', name: 'Administrator', email: ADMIN_EMAIL },
      process.env.JWT_SECRET, { expiresIn: '8h' }
    );
    return res.json({ token, user: { id: 0, name: 'Administrator', email: ADMIN_EMAIL, role: 'admin' } });
  }

  try {
    const r = await pool.query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (!r.rows.length) return res.status(404).json({ error: 'No account found with this email.' });
    const user = r.rows[0];
    if (user.status === 'pending')   return res.status(403).json({ error: 'Account pending admin approval.' });
    if (user.status === 'suspended') return res.status(403).json({ error: 'Account suspended. Contact admin.' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Incorrect password.' });
    res.json({ token: makeJWT(user), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

/* ── REGISTER ──────────────────────────────────────────────── */
router.post('/register', async (req, res) => {
  const { name, email, password, role = 'article', adminToken } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  const cleanRole = ['article','manager','partner'].includes(role) ? role : 'article';
  if (['manager','partner'].includes(cleanRole)) {
    if (!adminToken) return res.status(403).json({ error: 'Admin approval token required for Manager/Partner.' });
    try {
      const p = jwt.verify(adminToken, process.env.JWT_SECRET);
      if (p.role !== 'admin') return res.status(403).json({ error: 'Invalid admin token.' });
    } catch { return res.status(403).json({ error: 'Invalid or expired admin approval token.' }); }
  }
  try {
    const ex = await pool.query('SELECT id FROM users WHERE email=$1', [email.trim().toLowerCase()]);
    if (ex.rows.length) return res.status(409).json({ error: 'Email already registered.' });
    const hash = await bcrypt.hash(password, 12);
    const r = await pool.query(
      'INSERT INTO users(name,email,password,role,status) VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,role',
      [name.trim(), email.trim().toLowerCase(), hash, cleanRole, 'active']
    );
    const user = r.rows[0];
    res.status(201).json({ token: makeJWT(user), user });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

/* ── GOOGLE OAUTH ──────────────────────────────────────────── */
// Step 1 — redirect browser to Google
router.get('/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.redirect('/login.html?sso_error=Google+SSO+is+not+configured+for+this+deployment.');
  }
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

// Step 2 — Google calls back with ?code=…
router.get('/google/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) {
    return res.redirect('/login.html?sso_error=' + encodeURIComponent(error || 'Google sign-in was cancelled.'));
  }
  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  process.env.APP_URL + '/api/auth/google/callback',
        grant_type:    'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.access_token) throw new Error(tokens.error_description || 'Token exchange failed');

    // Get user profile
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + tokens.access_token },
    });
    const profile = await profileRes.json();
    if (!profile.email) throw new Error('No email returned from Google.');

    const user = await upsertSSOUser(profile.name || profile.email, profile.email, 'google');
    const appToken = makeJWT(user);
    res.redirect('/home.html?sso_token=' + encodeURIComponent(appToken));
  } catch (e) {
    console.error('Google OAuth error:', e.message);
    res.redirect('/login.html?sso_error=' + encodeURIComponent('Google sign-in failed: ' + e.message));
  }
});

/* ── MICROSOFT OAUTH ───────────────────────────────────────── */
// Step 1 — redirect browser to Microsoft
router.get('/microsoft', (req, res) => {
  if (!process.env.MS_CLIENT_ID) {
    return res.redirect('/login.html?sso_error=Microsoft+SSO+is+not+configured+for+this+deployment.');
  }
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

// Step 2 — Microsoft calls back with ?code=…
router.get('/microsoft/callback', async (req, res) => {
  const { code, error, error_description } = req.query;
  if (error || !code) {
    return res.redirect('/login.html?sso_error=' + encodeURIComponent(error_description || error || 'Microsoft sign-in was cancelled.'));
  }
  try {
    const tenant = process.env.MS_TENANT_ID || 'common';
    // Exchange code for tokens
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.MS_CLIENT_ID,
        client_secret: process.env.MS_CLIENT_SECRET,
        redirect_uri:  process.env.APP_URL + '/api/auth/microsoft/callback',
        grant_type:    'authorization_code',
        scope:         'openid email profile User.Read',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.access_token) throw new Error(tokens.error_description || 'Token exchange failed');

    // Get user profile
    const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: 'Bearer ' + tokens.access_token },
    });
    const profile = await profileRes.json();
    const email = profile.mail || profile.userPrincipalName;
    if (!email) throw new Error('No email returned from Microsoft.');

    const user = await upsertSSOUser(profile.displayName || email, email, 'microsoft');
    const appToken = makeJWT(user);
    res.redirect('/home.html?sso_token=' + encodeURIComponent(appToken));
  } catch (e) {
    console.error('Microsoft OAuth error:', e.message);
    res.redirect('/login.html?sso_error=' + encodeURIComponent('Microsoft sign-in failed: ' + e.message));
  }
});

/* ── SSO user upsert ───────────────────────────────────────── */
// Find existing user by email, or auto-create with role=article and status=active
async function upsertSSOUser(name, email, provider) {
  const clean = email.trim().toLowerCase();
  let r = await pool.query('SELECT * FROM users WHERE email=$1', [clean]);
  if (r.rows.length) {
    const u = r.rows[0];
    if (u.status === 'suspended') throw new Error('Your account has been suspended. Contact your administrator.');
    return u;
  }
  // New SSO user — auto-register as article
  const placeholder = await bcrypt.hash(require('crypto').randomBytes(32).toString('hex'), 10);
  const ins = await pool.query(
    'INSERT INTO users(name,email,password,role,status) VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,role',
    [name.trim(), clean, placeholder, 'article', 'active']
  );
  return ins.rows[0];
}

/* ── ADMIN APPROVAL TOKEN ──────────────────────────────────── */
router.post('/admin-approval-token', auth, auth.requireAdmin, (req, res) => {
  const token = jwt.sign({ id: 0, role: 'admin', purpose: 'registration' }, process.env.JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, expiresIn: '24h' });
});

/* ── ME ────────────────────────────────────────────────────── */
router.get('/me', auth, async (req, res) => {
  if (req.user.id === 0) return res.json({ id: 0, name: 'Administrator', email: ADMIN_EMAIL, role: 'admin' });
  try {
    const r = await pool.query('SELECT id,name,email,role,status,created_at FROM users WHERE id=$1', [req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── UPDATE PROFILE (name) ─────────────────────────────────── */
router.put('/profile', auth, async (req, res) => {
  if (req.user.id === 0) return res.status(400).json({ error: 'Admin profile managed via env variables.' });
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });
  try {
    const r = await pool.query(
      'UPDATE users SET name=$1 WHERE id=$2 RETURNING id,name,email,role',
      [name.trim(), req.user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'User not found.' });
    const user = r.rows[0];
    res.json({ ok: true, token: makeJWT(user), user });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── CHANGE PASSWORD ───────────────────────────────────────── */
router.put('/change-password', auth, async (req, res) => {
  if (req.user.id === 0) return res.status(400).json({ error: 'Admin password managed via env variables.' });
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required.' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  try {
    const r = await pool.query('SELECT password FROM users WHERE id=$1', [req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'User not found.' });
    const ok = await bcrypt.compare(currentPassword, r.rows[0].password);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });
    await pool.query('UPDATE users SET password=$1 WHERE id=$2', [await bcrypt.hash(newPassword, 12), req.user.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
