'use strict';

const mysql = require('mysql2/promise');
const { migrations } = require('./migrations');

const isProd = process.env.NODE_ENV === 'production';

function buildConfig() {
  const cfg = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'pulselink',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'pulselink',
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL || 10),
    charset: 'utf8mb4',
    timezone: 'Z',
    dateStrings: false,
  };
  if (process.env.DB_SSL === 'true') cfg.ssl = { rejectUnauthorized: true };
  return cfg;
}

let pool;

async function ensureDatabase(cfg) {
  // Production'da baza oldindan yaratilgan bo'lishi va ilova minimal huquqli foydalanuvchi bilan ishlashi kerak.
  const autoCreate = process.env.DB_AUTO_CREATE ? process.env.DB_AUTO_CREATE === 'true' : !isProd;
  if (!autoCreate) return;
  const conn = await mysql.createConnection({
    host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, charset: 'utf8mb4', ssl: cfg.ssl,
  });
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS ${mysql.escapeId(cfg.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await conn.end();
}

async function runMigrations(p) {
  await p.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  const [rows] = await p.query('SELECT id FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.id));
  for (const m of migrations) {
    if (applied.has(m.id)) continue;
    console.log(`[db] migratsiya ${m.id}: ${m.name}`);
    await m.up(p); // xato bo'lsa server ishga tushmaydi (jimgina yutilmaydi)
    await p.query('INSERT INTO schema_migrations (id, name) VALUES (?, ?)', [m.id, m.name]);
  }
}

async function initDatabase() {
  const cfg = buildConfig();
  await ensureDatabase(cfg);
  pool = mysql.createPool(cfg);
  await runMigrations(pool);
}

function getPool() {
  if (!pool) throw new Error('Database pool not initialized');
  return pool;
}

async function closeDatabase() {
  if (pool) await pool.end();
}

module.exports = { initDatabase, getPool, closeDatabase };
