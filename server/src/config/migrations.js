'use strict';

/**
 * Versiyalangan migratsiyalar. Har biri faqat bir marta bajariladi (schema_migrations jadvali).
 * Eski (v1.0) bazalar ham xavfsiz yangilanadi: CREATE ... IF NOT EXISTS + information_schema tekshiruvlari.
 */

const TABLE_OPTS = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

async function columnExists(pool, table, column) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function indexExists(pool, table, index) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [table, index]
  );
  return rows.length > 0;
}

async function addColumn(pool, table, column, ddl) {
  if (!(await columnExists(pool, table, column))) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${column} ${ddl}`);
  }
}

async function addIndex(pool, table, name, ddl) {
  if (!(await indexExists(pool, table, name))) {
    await pool.query(`ALTER TABLE \`${table}\` ADD ${ddl}`);
  }
}

const migrations = [
  {
    id: 1,
    name: 'base tables',
    async up(pool) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id CHAR(36) PRIMARY KEY,
          email VARCHAR(191) NOT NULL UNIQUE,
          google_id VARCHAR(191) NULL UNIQUE,
          username VARCHAR(64) NULL UNIQUE,
          invite_code VARCHAR(32) NULL UNIQUE,
          phone VARCHAR(32) NULL,
          display_name VARCHAR(120) NOT NULL,
          bio VARCHAR(255) NOT NULL DEFAULT 'PulseLink orqali aloqadaman',
          avatar_color VARCHAR(16) NOT NULL DEFAULT '#6366F1',
          avatar_url VARCHAR(512) NULL,
          password_hash VARCHAR(255) NULL,
          role ENUM('user', 'moderator', 'admin') NOT NULL DEFAULT 'user',
          is_banned TINYINT(1) NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ${TABLE_OPTS}`);
      await addColumn(pool, 'users', 'invite_code', 'VARCHAR(32) NULL UNIQUE');
      await addColumn(pool, 'users', 'role', "ENUM('user', 'moderator', 'admin') NOT NULL DEFAULT 'user'");
      await addColumn(pool, 'users', 'is_banned', 'TINYINT(1) NOT NULL DEFAULT 0');

      await pool.query(`
        CREATE TABLE IF NOT EXISTS friendships (
          id CHAR(36) PRIMARY KEY,
          user_id CHAR(36) NOT NULL,
          friend_id CHAR(36) NOT NULL,
          status ENUM('pending', 'accepted', 'blocked') NOT NULL DEFAULT 'pending',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_friend_pair (user_id, friend_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
        ) ${TABLE_OPTS}`);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id CHAR(36) PRIMARY KEY,
          chat_id VARCHAR(80) NOT NULL,
          sender_id CHAR(36) NOT NULL,
          receiver_id CHAR(36) NOT NULL,
          text TEXT NOT NULL,
          type VARCHAR(20) NOT NULL DEFAULT 'text',
          media_url VARCHAR(512) NULL,
          status ENUM('sent', 'delivered', 'read') NOT NULL DEFAULT 'sent',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_messages_chat (chat_id, created_at),
          INDEX idx_messages_receiver (receiver_id, status),
          FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
        ) ${TABLE_OPTS}`);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS calls (
          id CHAR(36) PRIMARY KEY,
          caller_id CHAR(36) NOT NULL,
          receiver_id CHAR(36) NOT NULL,
          call_type ENUM('audio', 'video') NOT NULL DEFAULT 'audio',
          status ENUM('ringing', 'active', 'ended', 'missed', 'rejected') NOT NULL DEFAULT 'ringing',
          duration_sec INT NOT NULL DEFAULT 0,
          started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          ended_at DATETIME NULL,
          INDEX idx_calls_users (caller_id, receiver_id, started_at),
          FOREIGN KEY (caller_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
        ) ${TABLE_OPTS}`);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS reports (
          id CHAR(36) PRIMARY KEY,
          reporter_id CHAR(36) NOT NULL,
          target_user_id CHAR(36) NOT NULL,
          reason VARCHAR(255) NOT NULL,
          status ENUM('open', 'resolved') NOT NULL DEFAULT 'open',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ${TABLE_OPTS}`);
    },
  },
  {
    id: 2,
    name: 'token versioning, email_verified, millisecond timestamps',
    async up(pool) {
      await addColumn(pool, 'users', 'token_version', 'INT NOT NULL DEFAULT 0');
      await addColumn(pool, 'users', 'email_verified', 'TINYINT(1) NOT NULL DEFAULT 0');
      // Bir soniyada yuborilgan xabarlar tartibi/dublikat muammosini yo'qotish uchun
      await pool.query('ALTER TABLE messages MODIFY created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)');
      await pool.query('ALTER TABLE calls MODIFY started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)');
    },
  },
  {
    id: 3,
    name: 'friendships: canonical pair key (race-free)',
    async up(pool) {
      await addColumn(pool, 'friendships', 'pair_key', 'VARCHAR(80) NULL');
      // Teskari dublikat juftliklarni olib tashlash (eng kichik id qoladi)
      await pool.query(`
        DELETE f1 FROM friendships f1
        JOIN friendships f2
          ON LEAST(f1.user_id, f1.friend_id) = LEAST(f2.user_id, f2.friend_id)
         AND GREATEST(f1.user_id, f1.friend_id) = GREATEST(f2.user_id, f2.friend_id)
         AND f1.id > f2.id`);
      await pool.query(
        `UPDATE friendships SET pair_key = CONCAT(LEAST(user_id, friend_id), ':', GREATEST(user_id, friend_id)) WHERE pair_key IS NULL`
      );
      await pool.query('ALTER TABLE friendships MODIFY pair_key VARCHAR(80) NOT NULL');
      await addIndex(pool, 'friendships', 'uq_friend_pair_key', 'UNIQUE KEY uq_friend_pair_key (pair_key)');
      await addIndex(pool, 'friendships', 'idx_friendships_friend', 'INDEX idx_friendships_friend (friend_id, status)');
    },
  },
  {
    id: 4,
    name: 'uploads, audit log, indexes',
    async up(pool) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS uploads (
          name VARCHAR(64) PRIMARY KEY,
          owner_id CHAR(36) NOT NULL,
          original_name VARCHAR(255) NOT NULL,
          mime VARCHAR(100) NOT NULL,
          size INT NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_uploads_owner (owner_id),
          FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
        ) ${TABLE_OPTS}`);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          actor_id CHAR(36) NOT NULL,
          action VARCHAR(50) NOT NULL,
          target_id VARCHAR(64) NULL,
          details VARCHAR(500) NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_audit_actor (actor_id, created_at)
        ) ${TABLE_OPTS}`);

      await addIndex(pool, 'messages', 'idx_messages_sender', 'INDEX idx_messages_sender (sender_id, created_at)');
      await addIndex(pool, 'messages', 'idx_messages_receiver_time', 'INDEX idx_messages_receiver_time (receiver_id, created_at)');
      await addIndex(pool, 'messages', 'idx_messages_media', 'INDEX idx_messages_media (media_url(190))');
      await addIndex(pool, 'calls', 'idx_calls_started', 'INDEX idx_calls_started (started_at)');
      await addIndex(pool, 'reports', 'idx_reports_status', 'INDEX idx_reports_status (status, created_at)');
    },
  },
];

module.exports = { migrations, columnExists, indexExists };
