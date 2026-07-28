const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const authMiddleware = require('../middleware/auth');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@kgsomani.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'KGSAdmin@2024';
const APPROVAL_REQUIRED_ROLES = ['manager', 'partner'];

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Invalid admin credentials.' });
    const token = jwt.sign({ id: 0, role: 'admin', name: 'Administrator', email: ADMIN_EMAIL }, process.env.JWT_SECRET, { expiresIn: '8h' });
    return res.json({ token, user: { id: 0, name: 'Administrator', email: ADMIN_EMAIL, role: 'admin' } });
  }
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (!result.rows.length) return res.status(404).json({ error: 'No account found with this email.' });
    const user = result.rows[0];
    if (user.status === 'pending') return res.status(403).json({ error: 'Your account is pending admin approval.' });
    if (user.status === 'suspended') return res.status(403).json({ error: 'Your account has been suspended. Contact admin.' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Incorrect password.' });
    const token = jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

router.post('/register', async (req, res) => {
  const { name, email, password, role = 'article', adminToken } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  const cleanRole = ['article', 'manager', 'partner'].includes(role) ? role : 'article';
  if (APPROVAL_REQUIRED_ROLES.includes(cleanRole)) {
    if (!adminToken) return res.status(403).json({ error: 'Admin approval token required for Manager or Partner.' });
    try {
      const decoded = jwt.verify(adminToken, process.env.JWT_SECRET);
      if (decoded.role !== 'admin') return res.status(403).json({ error: 'Invalid admin token.' });
    } catch { return res.status(403).json({ error: 'Invalid or expired admin approval token.' }); }
  }
  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) return res.status(409).json({ error: 'An account with this email already exists.' });
    const hashed = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role, status) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, role, status',
      [name.trim(), email.toLowerCase(), hashed, cleanRole, 'active']
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

router.post('/admin-approval-token', authMiddleware, authMiddleware.requireAdmin, (req, res) => {
  const token = jwt.sign({ id: 0, role: 'admin', purpose: 'registration_approval' }, process.env.JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, expiresIn: '24h' });
});

router.get('/me', authMiddleware, async (req, res) => {
  if (req.user.id === 0) return res.json({ id: 0, name: 'Administrator', email: ADMIN_EMAIL, role: 'admin' });
  try {
    const result = await pool.query('SELECT id, name, email, role, status, created_at FROM users WHERE id = $1', [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── UPDATE PROFILE (name) ─────────────────────────────────────────────────
router.put('/profile', authMiddleware, async (req, res) => {
  if (req.user.id === 0) return res.status(400).json({ error: 'Admin profile is managed via environment variables.' });
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });
  try {
    const result = await pool.query(
      'UPDATE users SET name=$1 WHERE id=$2 RETURNING id, name, email, role',
      [name.trim(), req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found.' });
    // Return a fresh token with updated name
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ ok: true, token, user });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── CHANGE PASSWORD ───────────────────────────────────────────────────────
router.put('/change-password', authMiddleware, async (req, res) => {
  if (req.user.id === 0) return res.status(400).json({ error: 'Admin password is managed via environment variables.' });
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both current and new password required.' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  try {
    const result = await pool.query('SELECT password FROM users WHERE id=$1', [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found.' });
    const valid = await bcrypt.compare(currentPassword, result.rows[0].password);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });
    const hashed = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password=$1 WHERE id=$2', [hashed, req.user.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
