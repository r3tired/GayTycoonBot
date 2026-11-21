const path = require('node:path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'game.sqlite'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    balance REAL NOT NULL CHECK (balance >= 0),
    last_collected_at INTEGER NOT NULL,
    registered_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS user_zones (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    zone_id TEXT NOT NULL,
    level INTEGER NOT NULL CHECK (level >= 1),
    PRIMARY KEY (guild_id, user_id, zone_id),
    FOREIGN KEY (guild_id, user_id)
      REFERENCES users (guild_id, user_id)
      ON DELETE CASCADE
  );
`);

// Міграція для баз, створених до появи назв клубів
const userColumns = db.prepare('PRAGMA table_info(users)').all().map(column => column.name);
if (!userColumns.includes('club_name')) db.exec('ALTER TABLE users ADD COLUMN club_name TEXT');
if (!userColumns.includes('club_name_key')) db.exec('ALTER TABLE users ADD COLUMN club_name_key TEXT');
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_club_name
  ON users (guild_id, club_name_key)
  WHERE club_name_key IS NOT NULL;
`);

module.exports = db;
