const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

function uid() {
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function ensureClientOwned(clientId, userId) {
  const result = await pool.query(
    'SELECT id FROM rou_clients WHERE id = $1 AND user_id = $2',
    [clientId, userId]
  );
  return result.rows[0] || null;
}

// ── Bootstrap: full workspace for this user ─────────────────
router.get('/bootstrap', async (req, res) => {
  try {
    const userId = req.user.id;

    const [clientsRes, settingsRes, leasesRes, logsRes, overridesRes] = await Promise.all([
      pool.query(
        `SELECT id, name, code, address, default_ibr AS "defaultIBR",
                prepared_by AS "preparedBy", created_at AS "createdAt"
         FROM rou_clients WHERE user_id = $1 ORDER BY created_at ASC`,
        [userId]
      ),
      pool.query(
        `SELECT settings, admin_hash AS "adminHash", last_client AS "lastClient"
         FROM rou_settings WHERE user_id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT id, client_id AS "clientId", payload, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM rou_leases WHERE user_id = $1 ORDER BY created_at ASC`,
        [userId]
      ),
      pool.query(
        `SELECT id, client_id AS "clientId", payload
         FROM rou_audit_logs WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId]
      ),
      pool.query(
        `SELECT id, client_id AS "clientId", rou_id AS "rouId", payload
         FROM rou_overrides WHERE user_id = $1 ORDER BY created_at ASC`,
        [userId]
      )
    ]);

    const clients = clientsRes.rows.map(c => ({
      id: c.id,
      name: c.name,
      code: c.code,
      address: c.address,
      defaultIBR: c.defaultIBR != null ? Number(c.defaultIBR) : 9,
      preparedBy: c.preparedBy,
      createdAt: c.createdAt
    }));

    const rous = {};
    clients.forEach(c => { rous[c.id] = []; });
    leasesRes.rows.forEach(row => {
      const lease = { ...(row.payload || {}), id: row.id };
      if (!rous[row.clientId]) rous[row.clientId] = [];
      rous[row.clientId].push(lease);
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
      clients,
      settings: settingsRow.settings || null,
      adminHash: settingsRow.adminHash || null,
      lastClient: settingsRow.lastClient || null,
      rous,
      auditLogs,
      overrides
    });
  } catch (err) {
    console.error('ROU bootstrap error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Settings ────────────────────────────────────────────────
router.put('/settings', async (req, res) => {
  try {
    const userId = req.user.id;
    const settings = req.body.settings || {};
    await pool.query(
      `INSERT INTO rou_settings (user_id, settings, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET settings = EXCLUDED.settings, updated_at = NOW()`,
      [userId, JSON.stringify(settings)]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('ROU settings error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/admin-hash', async (req, res) => {
  try {
    const userId = req.user.id;
    const { adminHash } = req.body;
    if (!adminHash) return res.status(400).json({ error: 'adminHash required' });
    await pool.query(
      `INSERT INTO rou_settings (user_id, admin_hash, settings, updated_at)
       VALUES ($1, $2, '{}'::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET admin_hash = EXCLUDED.admin_hash, updated_at = NOW()`,
      [userId, adminHash]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('ROU admin-hash error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/last-client', async (req, res) => {
  try {
    const userId = req.user.id;
    const lastClient = req.body.lastClient || null;
    await pool.query(
      `INSERT INTO rou_settings (user_id, last_client, settings, updated_at)
       VALUES ($1, $2, '{}'::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET last_client = EXCLUDED.last_client, updated_at = NOW()`,
      [userId, lastClient]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('ROU last-client error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Clients ─────────────────────────────────────────────────
router.get('/clients', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, code, address, default_ibr AS "defaultIBR",
              prepared_by AS "preparedBy", created_at AS "createdAt"
       FROM rou_clients WHERE user_id = $1 ORDER BY created_at ASC`,
      [req.user.id]
    );
    res.json(result.rows.map(c => ({
      ...c,
      defaultIBR: c.defaultIBR != null ? Number(c.defaultIBR) : 9
    })));
  } catch (err) {
    console.error('ROU list clients error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/clients', async (req, res) => {
  // Accept full array replace (used by frontend sync)
  try {
    const userId = req.user.id;
    const clients = Array.isArray(req.body.clients) ? req.body.clients : null;
    if (!clients) return res.status(400).json({ error: 'clients array required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query('SELECT id FROM rou_clients WHERE user_id = $1', [userId]);
      const keep = new Set(clients.map(c => c.id));
      for (const row of existing.rows) {
        if (!keep.has(row.id)) {
          await client.query('DELETE FROM rou_clients WHERE id = $1 AND user_id = $2', [row.id, userId]);
        }
      }
      for (const c of clients) {
        const id = c.id || uid();
        await client.query(
          `INSERT INTO rou_clients (id, user_id, name, code, address, default_ibr, prepared_by, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, NOW()))
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             code = EXCLUDED.code,
             address = EXCLUDED.address,
             default_ibr = EXCLUDED.default_ibr,
             prepared_by = EXCLUDED.prepared_by
           WHERE rou_clients.user_id = $2`,
          [
            id,
            userId,
            c.name || 'Untitled',
            c.code || '',
            c.address || '',
            c.defaultIBR != null ? c.defaultIBR : 9,
            c.preparedBy || c.name || '',
            c.createdAt || null
          ]
        );
      }
      await client.query('COMMIT');
      res.json({ ok: true, count: clients.length });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('ROU put clients error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/clients', async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, code, address, defaultIBR, preparedBy, id, createdAt } = req.body;
    if (!name) return res.status(400).json({ error: 'Company name required' });
    const clientId = id || uid();
    const result = await pool.query(
      `INSERT INTO rou_clients (id, user_id, name, code, address, default_ibr, prepared_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, NOW()))
       RETURNING id, name, code, address, default_ibr AS "defaultIBR",
                 prepared_by AS "preparedBy", created_at AS "createdAt"`,
      [
        clientId,
        userId,
        name,
        code || '',
        address || '',
        defaultIBR != null ? defaultIBR : 9,
        preparedBy || name,
        createdAt || null
      ]
    );
    const row = result.rows[0];
    res.status(201).json({
      ...row,
      defaultIBR: row.defaultIBR != null ? Number(row.defaultIBR) : 9
    });
  } catch (err) {
    console.error('ROU create client error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/clients/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM rou_clients WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Client not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('ROU delete client error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Leases (ROUs) for a client — full array sync ────────────
router.put('/clients/:clientId/rous', async (req, res) => {
  try {
    const userId = req.user.id;
    const { clientId } = req.params;
    const owned = await ensureClientOwned(clientId, userId);
    if (!owned) return res.status(404).json({ error: 'Client not found' });

    const rous = Array.isArray(req.body.rous) ? req.body.rous : null;
    if (!rous) return res.status(400).json({ error: 'rous array required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM rou_leases WHERE client_id = $1 AND user_id = $2', [clientId, userId]);
      for (const rou of rous) {
        const id = rou.id || uid();
        const payload = { ...rou, id };
        await client.query(
          `INSERT INTO rou_leases (id, client_id, user_id, payload, created_at, updated_at)
           VALUES ($1, $2, $3, $4::jsonb, COALESCE($5::timestamptz, NOW()), NOW())`,
          [id, clientId, userId, JSON.stringify(payload), rou.createdAt || null]
        );
      }
      await client.query('COMMIT');
      res.json({ ok: true, count: rous.length });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('ROU put leases error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Audit log sync ──────────────────────────────────────────
router.put('/clients/:clientId/audit-log', async (req, res) => {
  try {
    const userId = req.user.id;
    const { clientId } = req.params;
    const owned = await ensureClientOwned(clientId, userId);
    if (!owned) return res.status(404).json({ error: 'Client not found' });

    const logs = Array.isArray(req.body.logs) ? req.body.logs : null;
    if (!logs) return res.status(400).json({ error: 'logs array required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM rou_audit_logs WHERE client_id = $1 AND user_id = $2', [clientId, userId]);
      for (const entry of logs.slice(0, 500)) {
        const id = entry.id || uid();
        await client.query(
          `INSERT INTO rou_audit_logs (id, client_id, user_id, payload, created_at)
           VALUES ($1, $2, $3, $4::jsonb, COALESCE($5::timestamptz, NOW()))`,
          [id, clientId, userId, JSON.stringify({ ...entry, id }), entry.ts || null]
        );
      }
      await client.query('COMMIT');
      res.json({ ok: true, count: Math.min(logs.length, 500) });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('ROU put audit-log error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Reassessment overrides sync ─────────────────────────────
router.put('/clients/:clientId/overrides', async (req, res) => {
  try {
    const userId = req.user.id;
    const { clientId } = req.params;
    const owned = await ensureClientOwned(clientId, userId);
    if (!owned) return res.status(404).json({ error: 'Client not found' });

    const overrides = Array.isArray(req.body.overrides) ? req.body.overrides : null;
    if (!overrides) return res.status(400).json({ error: 'overrides array required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM rou_overrides WHERE client_id = $1 AND user_id = $2', [clientId, userId]);
      for (const o of overrides) {
        const id = o.id || uid();
        await client.query(
          `INSERT INTO rou_overrides (id, client_id, rou_id, user_id, payload, created_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, COALESCE($6::timestamptz, NOW()))`,
          [id, clientId, o.rouId || null, userId, JSON.stringify({ ...o, id }), o.createdAt || null]
        );
      }
      await client.query('COMMIT');
      res.json({ ok: true, count: overrides.length });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('ROU put overrides error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Full workspace replace (admin backup restore) ───────────
router.put('/workspace', async (req, res) => {
  try {
    const userId = req.user.id;
    const data = req.body || {};
    const clients = Array.isArray(data.clients) ? data.clients : [];
    const settings = data.settings || {};
    const adminHash = data.admin_hash || data.adminHash || null;
    const lastClient = data.last_client || data.lastClient || null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query('DELETE FROM rou_clients WHERE user_id = $1', [userId]);

      for (const c of clients) {
        const id = c.id || uid();
        await client.query(
          `INSERT INTO rou_clients (id, user_id, name, code, address, default_ibr, prepared_by, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, NOW()))`,
          [
            id, userId, c.name || 'Untitled', c.code || '', c.address || '',
            c.defaultIBR != null ? c.defaultIBR : 9, c.preparedBy || c.name || '', c.createdAt || null
          ]
        );

        const rous = Array.isArray(data['rous_' + id]) ? data['rous_' + id] : [];
        for (const rou of rous) {
          const rouId = rou.id || uid();
          await client.query(
            `INSERT INTO rou_leases (id, client_id, user_id, payload, created_at, updated_at)
             VALUES ($1, $2, $3, $4::jsonb, COALESCE($5::timestamptz, NOW()), NOW())`,
            [rouId, id, userId, JSON.stringify({ ...rou, id: rouId }), rou.createdAt || null]
          );
        }

        const logs = Array.isArray(data['audit_log_' + id]) ? data['audit_log_' + id] : [];
        for (const entry of logs.slice(0, 500)) {
          const logId = entry.id || uid();
          await client.query(
            `INSERT INTO rou_audit_logs (id, client_id, user_id, payload, created_at)
             VALUES ($1, $2, $3, $4::jsonb, COALESCE($5::timestamptz, NOW()))`,
            [logId, id, userId, JSON.stringify({ ...entry, id: logId }), entry.ts || null]
          );
        }

        const overrides = Array.isArray(data['reassess_override_' + id]) ? data['reassess_override_' + id] : [];
        for (const o of overrides) {
          const oid = o.id || uid();
          await client.query(
            `INSERT INTO rou_overrides (id, client_id, rou_id, user_id, payload, created_at)
             VALUES ($1, $2, $3, $4, $5::jsonb, COALESCE($6::timestamptz, NOW()))`,
            [oid, id, o.rouId || null, userId, JSON.stringify({ ...o, id: oid }), o.createdAt || null]
          );
        }
      }

      await client.query(
        `INSERT INTO rou_settings (user_id, settings, admin_hash, last_client, updated_at)
         VALUES ($1, $2::jsonb, $3, $4, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           settings = EXCLUDED.settings,
           admin_hash = EXCLUDED.admin_hash,
           last_client = EXCLUDED.last_client,
           updated_at = NOW()`,
        [userId, JSON.stringify(settings), adminHash, lastClient]
      );

      await client.query('COMMIT');
      res.json({ ok: true, clients: clients.length });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('ROU workspace restore error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
