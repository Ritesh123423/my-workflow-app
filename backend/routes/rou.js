const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

function uid() {
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Returns clients this user can access:
// admin/manager/partner → all clients they own (user_id = theirs)
// article → only clients they've been assigned to
async function getAccessibleClients(userId, role) {
  if (role === 'admin') {
    // Admin can see all clients from all users
    const r = await pool.query(
      `SELECT id, name, code, address, default_ibr AS "defaultIBR",
              prepared_by AS "preparedBy", created_at AS "createdAt", user_id AS "ownerId"
       FROM rou_clients ORDER BY created_at ASC`
    );
    return r.rows;
  }
  if (role === 'article') {
    const r = await pool.query(
      `SELECT c.id, c.name, c.code, c.address, c.default_ibr AS "defaultIBR",
              c.prepared_by AS "preparedBy", c.created_at AS "createdAt", c.user_id AS "ownerId"
       FROM rou_clients c
       INNER JOIN client_assignments ca ON ca.client_id = c.id AND ca.user_id = $1
       ORDER BY c.created_at ASC`,
      [userId]
    );
    return r.rows;
  }
  // manager / partner — own clients
  const r = await pool.query(
    `SELECT id, name, code, address, default_ibr AS "defaultIBR",
            prepared_by AS "preparedBy", created_at AS "createdAt", user_id AS "ownerId"
     FROM rou_clients WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId]
  );
  return r.rows;
}

async function ensureClientAccess(clientId, userId, role) {
  if (role === 'admin') {
    const r = await pool.query('SELECT id FROM rou_clients WHERE id = $1', [clientId]);
    return r.rows[0] || null;
  }
  if (role === 'article') {
    const r = await pool.query(
      'SELECT c.id FROM rou_clients c INNER JOIN client_assignments ca ON ca.client_id = c.id WHERE c.id = $1 AND ca.user_id = $2',
      [clientId, userId]
    );
    return r.rows[0] || null;
  }
  const r = await pool.query('SELECT id FROM rou_clients WHERE id = $1 AND user_id = $2', [clientId, userId]);
  return r.rows[0] || null;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────
router.get('/bootstrap', async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    const clients = await getAccessibleClients(userId, role);
    const clientIds = clients.map(c => c.id);

    // For article users with no assignments, return empty quickly
    if (clientIds.length === 0) {
      return res.json({ clients: [], settings: null, adminHash: null, lastClient: null, rous: {}, auditLogs: {}, overrides: {} });
    }

    const placeholders = clientIds.map((_, i) => `$${i + 1}`).join(',');

    // Settings — use owner's settings for article users; own settings for others
    const settingsUserId = role === 'article' ? (clients[0]?.ownerId || userId) : userId;

    const [settingsRes, leasesRes, logsRes, overridesRes] = await Promise.all([
      pool.query(`SELECT settings, admin_hash AS "adminHash", last_client AS "lastClient" FROM rou_settings WHERE user_id = $1`, [role === 'article' ? userId : userId]),
      pool.query(`SELECT id, client_id AS "clientId", payload, created_at AS "createdAt", updated_at AS "updatedAt" FROM rou_leases WHERE client_id IN (${placeholders}) ORDER BY created_at ASC`, clientIds),
      pool.query(`SELECT id, client_id AS "clientId", payload FROM rou_audit_logs WHERE client_id IN (${placeholders}) ORDER BY created_at DESC`, clientIds),
      pool.query(`SELECT id, client_id AS "clientId", rou_id AS "rouId", payload FROM rou_overrides WHERE client_id IN (${placeholders}) ORDER BY created_at ASC`, clientIds)
    ]);

    const mappedClients = clients.map(c => ({
      id: c.id, name: c.name, code: c.code, address: c.address,
      defaultIBR: c.defaultIBR != null ? Number(c.defaultIBR) : 9,
      preparedBy: c.preparedBy, createdAt: c.createdAt
    }));

    const rous = {};
    mappedClients.forEach(c => { rous[c.id] = []; });
    leasesRes.rows.forEach(row => {
      if (!rous[row.clientId]) rous[row.clientId] = [];
      rous[row.clientId].push({ ...(row.payload || {}), id: row.id });
    });

    const auditLogs = {};
    logsRes.rows.forEach(row => {
      if (!auditLogs[row.clientId]) auditLogs[row.clientId] = [];
      auditLogs[row.clientId].push({ ...(row.payload || {}), id: row.id });
    });

    const overrides = {};
    overridesRes.rows.forEach(row => {
      if (!overrides[row.clientId]) overrides[row.clientId] = [];
      overrides[row.clientId].push({ ...(row.payload || {}), id: row.id, rouId: row.rouId });
    });

    const settingsRow = settingsRes.rows[0] || {};
    res.json({
      clients: mappedClients,
      settings: settingsRow.settings || null,
      adminHash: settingsRow.adminHash || null,
      lastClient: settingsRow.lastClient || null,
      rous, auditLogs, overrides,
      userRole: role
    });
  } catch (err) {
    console.error('ROU bootstrap error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Settings ───────────────────────────────────────────────────────────────
router.put('/settings', async (req, res) => {
  try {
    const userId = req.user.id;
    const settings = req.body.settings || {};
    await pool.query(
      `INSERT INTO rou_settings (user_id, settings, updated_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = NOW()`,
      [userId, JSON.stringify(settings)]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/admin-hash', async (req, res) => {
  try {
    const { adminHash } = req.body;
    if (!adminHash) return res.status(400).json({ error: 'adminHash required' });
    await pool.query(
      `INSERT INTO rou_settings (user_id, admin_hash, settings, updated_at) VALUES ($1, $2, '{}'::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE SET admin_hash = EXCLUDED.admin_hash, updated_at = NOW()`,
      [req.user.id, adminHash]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/last-client', async (req, res) => {
  try {
    const lastClient = req.body.lastClient || null;
    await pool.query(
      `INSERT INTO rou_settings (user_id, last_client, settings, updated_at) VALUES ($1, $2, '{}'::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE SET last_client = EXCLUDED.last_client, updated_at = NOW()`,
      [req.user.id, lastClient]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Clients ───────────────────────────────────────────────────────────────
router.get('/clients', async (req, res) => {
  try {
    const clients = await getAccessibleClients(req.user.id, req.user.role);
    res.json(clients.map(c => ({ ...c, defaultIBR: c.defaultIBR != null ? Number(c.defaultIBR) : 9 })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clients', async (req, res) => {
  // Only admin, manager, partner can create clients
  if (req.user.role === 'article') return res.status(403).json({ error: 'Articles cannot create companies. Contact your manager or admin.' });
  try {
    const userId = req.user.role === 'admin' ? (req.body.ownerId || req.user.id) : req.user.id;
    const { name, code, address, defaultIBR, preparedBy, id, createdAt } = req.body;
    if (!name) return res.status(400).json({ error: 'Company name required' });
    const clientId = id || uid();
    const result = await pool.query(
      `INSERT INTO rou_clients (id, user_id, name, code, address, default_ibr, prepared_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, NOW()))
       RETURNING id, name, code, address, default_ibr AS "defaultIBR", prepared_by AS "preparedBy", created_at AS "createdAt"`,
      [clientId, userId, name, code || '', address || '', defaultIBR ?? 9, preparedBy || name, createdAt || null]
    );
    const row = result.rows[0];
    res.status(201).json({ ...row, defaultIBR: row.defaultIBR != null ? Number(row.defaultIBR) : 9 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/clients', async (req, res) => {
  if (req.user.role === 'article') return res.status(403).json({ error: 'Articles cannot modify companies.' });
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const clients = Array.isArray(req.body.clients) ? req.body.clients : null;
    if (!clients) return res.status(400).json({ error: 'clients array required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        role === 'admin' ? 'SELECT id FROM rou_clients' : 'SELECT id FROM rou_clients WHERE user_id = $1',
        role === 'admin' ? [] : [userId]
      );
      const keep = new Set(clients.map(c => c.id));
      for (const row of existing.rows) {
        if (!keep.has(row.id)) await client.query('DELETE FROM rou_clients WHERE id = $1', [row.id]);
      }
      for (const c of clients) {
        const id = c.id || uid();
        const ownerId = role === 'admin' ? (c.ownerId || userId) : userId;
        await client.query(
          `INSERT INTO rou_clients (id, user_id, name, code, address, default_ibr, prepared_by, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, NOW()))
           ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, code=EXCLUDED.code, address=EXCLUDED.address,
             default_ibr=EXCLUDED.default_ibr, prepared_by=EXCLUDED.prepared_by`,
          [id, ownerId, c.name || 'Untitled', c.code || '', c.address || '', c.defaultIBR ?? 9, c.preparedBy || c.name || '', c.createdAt || null]
        );
      }
      await client.query('COMMIT');
      res.json({ ok: true, count: clients.length });
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/clients/:id', async (req, res) => {
  if (req.user.role === 'article') return res.status(403).json({ error: 'Articles cannot delete companies.' });
  try {
    const where = req.user.role === 'admin' ? 'WHERE id = $1' : 'WHERE id = $1 AND user_id = $2';
    const params = req.user.role === 'admin' ? [req.params.id] : [req.params.id, req.user.id];
    const result = await pool.query(`DELETE FROM rou_clients ${where} RETURNING id`, params);
    if (!result.rows.length) return res.status(404).json({ error: 'Client not found' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Client Assignments (admin only) ──────────────────────────────────────
router.get('/clients/:clientId/assignments', auth.requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT ca.user_id AS "userId", u.name, u.email, u.role, ca.assigned_at AS "assignedAt"
       FROM client_assignments ca JOIN users u ON u.id = ca.user_id
       WHERE ca.client_id = $1 ORDER BY u.name`,
      [req.params.clientId]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clients/:clientId/assignments', auth.requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    await pool.query(
      `INSERT INTO client_assignments (client_id, user_id, assigned_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [req.params.clientId, userId, req.user.id === 0 ? null : req.user.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/clients/:clientId/assignments/:userId', auth.requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM client_assignments WHERE client_id = $1 AND user_id = $2', [req.params.clientId, req.params.userId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Leases ────────────────────────────────────────────────────────────────
router.put('/clients/:clientId/rous', async (req, res) => {
  try {
    const userId = req.user.id; const role = req.user.role;
    const { clientId } = req.params;
    const owned = await ensureClientAccess(clientId, userId, role);
    if (!owned) return res.status(404).json({ error: 'Client not found or no access' });
    const rous = Array.isArray(req.body.rous) ? req.body.rous : null;
    if (!rous) return res.status(400).json({ error: 'rous array required' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM rou_leases WHERE client_id = $1', [clientId]);
      for (const rou of rous) {
        const id = rou.id || uid();
        await client.query(
          `INSERT INTO rou_leases (id, client_id, user_id, payload, created_at, updated_at) VALUES ($1,$2,$3,$4::jsonb,COALESCE($5::timestamptz,NOW()),NOW())`,
          [id, clientId, userId, JSON.stringify({ ...rou, id }), rou.createdAt || null]
        );
      }
      await client.query('COMMIT');
      res.json({ ok: true, count: rous.length });
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/clients/:clientId/audit-log', async (req, res) => {
  try {
    const { clientId } = req.params;
    const owned = await ensureClientAccess(clientId, req.user.id, req.user.role);
    if (!owned) return res.status(404).json({ error: 'Client not found' });
    const logs = Array.isArray(req.body.logs) ? req.body.logs : null;
    if (!logs) return res.status(400).json({ error: 'logs array required' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM rou_audit_logs WHERE client_id = $1', [clientId]);
      for (const entry of logs.slice(0, 500)) {
        const id = entry.id || uid();
        await client.query(
          `INSERT INTO rou_audit_logs (id, client_id, user_id, payload, created_at) VALUES ($1,$2,$3,$4::jsonb,COALESCE($5::timestamptz,NOW()))`,
          [id, clientId, req.user.id, JSON.stringify({ ...entry, id }), entry.ts || null]
        );
      }
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/clients/:clientId/overrides', async (req, res) => {
  try {
    const { clientId } = req.params;
    const owned = await ensureClientAccess(clientId, req.user.id, req.user.role);
    if (!owned) return res.status(404).json({ error: 'Client not found' });
    const overrides = Array.isArray(req.body.overrides) ? req.body.overrides : null;
    if (!overrides) return res.status(400).json({ error: 'overrides array required' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM rou_overrides WHERE client_id = $1', [clientId]);
      for (const o of overrides) {
        const id = o.id || uid();
        await client.query(
          `INSERT INTO rou_overrides (id, client_id, rou_id, user_id, payload, created_at) VALUES ($1,$2,$3,$4,$5::jsonb,COALESCE($6::timestamptz,NOW()))`,
          [id, clientId, o.rouId || null, req.user.id, JSON.stringify({ ...o, id }), o.createdAt || null]
        );
      }
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/workspace', async (req, res) => {
  try {
    const userId = req.user.id;
    const data = req.body || {};
    const clients = Array.isArray(data.clients) ? data.clients : [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM rou_clients WHERE user_id = $1', [userId]);
      for (const c of clients) {
        const id = c.id || uid();
        await client.query(
          `INSERT INTO rou_clients (id, user_id, name, code, address, default_ibr, prepared_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::timestamptz,NOW()))`,
          [id, userId, c.name || 'Untitled', c.code || '', c.address || '', c.defaultIBR ?? 9, c.preparedBy || c.name || '', c.createdAt || null]
        );
        for (const rou of (data['rous_' + id] || [])) {
          const rouId = rou.id || uid();
          await client.query(`INSERT INTO rou_leases (id, client_id, user_id, payload, created_at, updated_at) VALUES ($1,$2,$3,$4::jsonb,COALESCE($5::timestamptz,NOW()),NOW())`,
            [rouId, id, userId, JSON.stringify({ ...rou, id: rouId }), rou.createdAt || null]);
        }
        for (const entry of (data['audit_log_' + id] || []).slice(0, 500)) {
          const logId = entry.id || uid();
          await client.query(`INSERT INTO rou_audit_logs (id, client_id, user_id, payload, created_at) VALUES ($1,$2,$3,$4::jsonb,COALESCE($5::timestamptz,NOW()))`,
            [logId, id, userId, JSON.stringify({ ...entry, id: logId }), entry.ts || null]);
        }
      }
      await client.query(
        `INSERT INTO rou_settings (user_id, settings, admin_hash, last_client, updated_at) VALUES ($1,$2::jsonb,$3,$4,NOW())
         ON CONFLICT (user_id) DO UPDATE SET settings=EXCLUDED.settings, admin_hash=EXCLUDED.admin_hash, last_client=EXCLUDED.last_client, updated_at=NOW()`,
        [userId, JSON.stringify(data.settings || {}), data.adminHash || null, data.lastClient || null]
      );
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
