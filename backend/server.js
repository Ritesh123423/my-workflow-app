const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./db');
require('dotenv').config();

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set!');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL environment variable is not set!');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/master', (req, res) => res.redirect('/rou/'));
app.get('/rou', (req, res) => res.redirect('/rou/'));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/audits', require('./routes/audit'));
app.use('/api/team', require('./routes/team'));
app.use('/api/rou', require('./routes/rou'));

app.get('/api/health', (req, res) => res.json({ status: 'OK', service: 'master-audit-workflow' }));

const initDB = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'auditor',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audits (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      department VARCHAR(100),
      status VARCHAR(50) DEFAULT 'pending',
      priority VARCHAR(50) DEFAULT 'medium',
      assigned_to INT REFERENCES users(id) ON DELETE SET NULL,
      created_by INT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS rou_clients (
      id TEXT PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      code VARCHAR(50) DEFAULT '',
      address TEXT DEFAULT '',
      default_ibr NUMERIC(8,4) DEFAULT 9,
      prepared_by VARCHAR(255) DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_rou_clients_user ON rou_clients(user_id);

    CREATE TABLE IF NOT EXISTS rou_leases (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES rou_clients(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_rou_leases_client ON rou_leases(client_id);
    CREATE INDEX IF NOT EXISTS idx_rou_leases_user ON rou_leases(user_id);

    CREATE TABLE IF NOT EXISTS rou_audit_logs (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES rou_clients(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_rou_audit_client ON rou_audit_logs(client_id);

    CREATE TABLE IF NOT EXISTS rou_overrides (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES rou_clients(id) ON DELETE CASCADE,
      rou_id TEXT,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_rou_overrides_client ON rou_overrides(client_id);

    CREATE TABLE IF NOT EXISTS rou_settings (
      user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      admin_hash TEXT,
      last_client TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✓ Database tables ready (AuditFlow + Master ROU).');
};

initDB().catch(err => {
  console.error('FATAL: Cannot initialize database:', err.message);
  process.exit(1);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Master Audit Workflow API on port ${PORT}`));
