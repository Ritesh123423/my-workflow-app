const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/auth');

// Get all audits
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, u.name as created_by_name 
       FROM audits a 
       LEFT JOIN users u ON a.created_by = u.id 
       ORDER BY a.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single audit
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, u.name as created_by_name 
       FROM audits a 
       LEFT JOIN users u ON a.created_by = u.id 
       WHERE a.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Audit not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create audit
router.post('/', authMiddleware, async (req, res) => {
  const { title, description, department, status, priority, assigned_to } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required.' });

  try {
    const result = await pool.query(
      `INSERT INTO audits (title, description, department, status, priority, assigned_to, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [title, description, department, status || 'pending', priority || 'medium', assigned_to, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update audit
router.put('/:id', authMiddleware, async (req, res) => {
  const { title, description, department, status, priority, assigned_to } = req.body;
  try {
    const result = await pool.query(
      `UPDATE audits SET title=$1, description=$2, department=$3, status=$4, priority=$5, assigned_to=$6, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [title, description, department, status, priority, assigned_to, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Audit not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete audit
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM audits WHERE id = $1', [req.params.id]);
    res.json({ message: 'Audit deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
