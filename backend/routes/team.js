'use strict';
const express       = require('express');
const router        = express.Router();
const bcrypt        = require('bcryptjs');
const pool          = require('../db');
const authMiddleware = require('../middleware/auth');

// All team routes require authentication
router.use(authMiddleware);

const MAX_NAME_LEN  = 100;
const MAX_EMAIL_LEN = 100;
const MIN_PW_LEN    = 8;

/* ── GET /team — list all members (admin only) ────────────── */
router.get('/', authMiddleware.requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, status, created_at FROM users ORDER BY role, name ASC'
    );
    const rows = [
      { id: 0, name: 'Administrator', email: process.env.ADMIN_EMAIL || 'admin@kgsomani.com', role: 'admin', status: 'active', created_at: null }
    ].concat(result.rows);
    res.json(rows);
  } catch (err) {
    console.error('[team/GET /]', err.message);
    res.status(500).json({ error: 'Failed to fetch team members.' });
  }
});

/* ── GET /team/me ─────────────────────────────────────────── */
router.get('/me', async (req, res) => {
  if (req.user.id === 0)
    return res.json({ id: 0, name: 'Administrator', email: process.env.ADMIN_EMAIL || 'admin@kgsomani.com', role: 'admin', status: 'active' });
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, status, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[team/GET /me]', err.message);
    res.status(500).json({ error: 'Failed to fetch profile.' });
  }
});

/* ── POST /team — create member (admin only) ─────────────── */
router.post('/', authMiddleware.requireAdmin, async (req, res) => {
  const { name, email, password, role = 'article' } = req.body || {};
  if (!name || !email || !password)
    return res.status(400).json({ error: 'Name, email and password required.' });
  if (name.length > MAX_NAME_LEN)
    return res.status(400).json({ error: `Name must be ${MAX_NAME_LEN} characters or fewer.` });
  if (email.length > MAX_EMAIL_LEN)
    return res.status(400).json({ error: `Email must be ${MAX_EMAIL_LEN} characters or fewer.` });
  if (password.length < MIN_PW_LEN)
    return res.status(400).json({ error: `Password must be at least ${MIN_PW_LEN} characters.` });

  const cleanRole = ['article', 'manager', 'partner'].includes(role) ? role : 'article';
  const cleanEmail = email.trim().toLowerCase();

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email already in use.' });
    const hashed = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role, status) VALUES ($1,$2,$3,$4,$5) RETURNING id,name,email,role,status',
      [name.trim(), cleanEmail, hashed, cleanRole, 'active']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[team/POST /]', err.message);
    res.status(500).json({ error: 'Failed to create team member.' });
  }
});

/* ── PUT /team/:id/role ────────────────────────────────────── */
router.put('/:id/role', authMiddleware.requireAdmin, async (req, res) => {
  const { role } = req.body || {};
  const cleanRole = ['article', 'manager', 'partner'].includes(role) ? role : null;
  if (!cleanRole)
    return res.status(400).json({ error: 'Invalid role. Must be article, manager, or partner.' });
  try {
    const result = await pool.query(
      'UPDATE users SET role=$1 WHERE id=$2 RETURNING id,name,email,role,status',
      [cleanRole, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[team/PUT /:id/role]', err.message);
    res.status(500).json({ error: 'Failed to update role.' });
  }
});

/* ── PUT /team/:id/status ─────────────────────────────────── */
router.put('/:id/status', authMiddleware.requireAdmin, async (req, res) => {
  const { status } = req.body || {};
  if (!['active', 'suspended'].includes(status))
    return res.status(400).json({ error: 'Status must be active or suspended.' });
  // Prevent admin from suspending their own record (id 0 is the env admin, so this guard
  // applies to DB-registered admins who somehow have admin role)
  if (Number(req.params.id) === req.user.id)
    return res.status(400).json({ error: 'You cannot suspend your own account.' });
  try {
    const result = await pool.query(
      'UPDATE users SET status=$1 WHERE id=$2 RETURNING id,name,email,role,status',
      [status, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[team/PUT /:id/status]', err.message);
    res.status(500).json({ error: 'Failed to update status.' });
  }
});

/* ── PUT /team/:id/reset-password ─────────────────────────── */
router.put('/:id/reset-password', authMiddleware.requireAdmin, async (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < MIN_PW_LEN)
    return res.status(400).json({ error: `Password must be at least ${MIN_PW_LEN} characters.` });
  try {
    const hashed = await bcrypt.hash(newPassword, 12);
    const result = await pool.query(
      'UPDATE users SET password=$1 WHERE id=$2 RETURNING id,name',
      [hashed, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json({ ok: true, name: result.rows[0].name });
  } catch (err) {
    console.error('[team/PUT /:id/reset-password]', err.message);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

/* ── DELETE /team/:id ─────────────────────────────────────── */
router.delete('/:id', authMiddleware.requireAdmin, async (req, res) => {
  // Prevent self-deletion
  if (Number(req.params.id) === req.user.id)
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  try {
    const result = await pool.query(
      'DELETE FROM users WHERE id=$1 RETURNING id,name',
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json({ ok: true, message: result.rows[0].name + ' removed.' });
  } catch (err) {
    console.error('[team/DELETE /:id]', err.message);
    res.status(500).json({ error: 'Failed to delete member.' });
  }
});

module.exports = router;
