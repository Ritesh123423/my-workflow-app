const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const authMiddleware = require('../middleware/auth');

// All team routes require authentication
router.use(authMiddleware);

// ── GET ALL MEMBERS (admin only) ─────────────────────────────
router.get('/', authMiddleware.requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, status, created_at FROM users ORDER BY role, name ASC'
    );
    // Prepend virtual admin row
    const rows = [
      { id: 0, name: 'Administrator', email: process.env.ADMIN_EMAIL || 'admin@kgsomani.com', role: 'admin', status: 'active', created_at: null }
    ].concat(result.rows);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET MY PROFILE ────────────────────────────────────────────
router.get('/me', async (req, res) => {
  if (req.user.id === 0) return res.json({ id: 0, name: 'Administrator', email: process.env.ADMIN_EMAIL || 'admin@kgsomani.com', role: 'admin', status: 'active' });
  try {
    const result = await pool.query('SELECT id, name, email, role, status, created_at FROM users WHERE id = $1', [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CREATE MEMBER (admin only) ────────────────────────────────
router.post('/', authMiddleware.requireAdmin, async (req, res) => {
  const { name, email, password, role = 'article' } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required.' });
  const cleanRole = ['article', 'manager', 'partner'].includes(role) ? role : 'article';
  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email already in use.' });
    const hashed = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role, status) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, status',
      [name.trim(), email.toLowerCase(), hashed, cleanRole, 'active']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── UPDATE MEMBER ROLE (admin only) ──────────────────────────
router.put('/:id/role', authMiddleware.requireAdmin, async (req, res) => {
  const { role } = req.body;
  const cleanRole = ['article', 'manager', 'partner'].includes(role) ? role : null;
  if (!cleanRole) return res.status(400).json({ error: 'Invalid role. Must be article, manager, or partner.' });
  try {
    const result = await pool.query(
      'UPDATE users SET role=$1 WHERE id=$2 RETURNING id, name, email, role, status',
      [cleanRole, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── UPDATE MEMBER STATUS (admin only) ────────────────────────
router.put('/:id/status', authMiddleware.requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!['active', 'suspended'].includes(status)) return res.status(400).json({ error: 'Status must be active or suspended.' });
  try {
    const result = await pool.query(
      'UPDATE users SET status=$1 WHERE id=$2 RETURNING id, name, email, role, status',
      [status, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── RESET MEMBER PASSWORD (admin only) ───────────────────────
router.put('/:id/reset-password', authMiddleware.requireAdmin, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  try {
    const hashed = await bcrypt.hash(newPassword, 12);
    const result = await pool.query('UPDATE users SET password=$1 WHERE id=$2 RETURNING id, name', [hashed, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json({ ok: true, name: result.rows[0].name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE MEMBER (admin only) ────────────────────────────────
router.delete('/:id', authMiddleware.requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM users WHERE id=$1 RETURNING id, name', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json({ ok: true, message: `${result.rows[0].name} removed.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
