const path = require('node:path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'game.sqlite'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    balance REAL NOT NULL CHECK (balance >= 0),
    last_collected_at INTEGER NOT NULL,
    registered_at INTEGER NOT NULL,
    regular_guests INTEGER NOT NULL DEFAULT 0 CHECK (regular_guests >= 0),
    medium_guests INTEGER NOT NULL DEFAULT 0 CHECK (medium_guests >= 0),
    rich_guests INTEGER NOT NULL DEFAULT 0 CHECK (rich_guests >= 0),
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

const userColumns = db.prepare('PRAGMA table_info(users)').all().map(column => column.name);
if (!userColumns.includes('regular_guests')) {
  db.exec('ALTER TABLE users ADD COLUMN regular_guests INTEGER NOT NULL DEFAULT 0 CHECK (regular_guests >= 0)');
}
if (!userColumns.includes('medium_guests')) {
  db.exec('ALTER TABLE users ADD COLUMN medium_guests INTEGER NOT NULL DEFAULT 0 CHECK (medium_guests >= 0)');
}
if (!userColumns.includes('rich_guests')) {
  db.exec('ALTER TABLE users ADD COLUMN rich_guests INTEGER NOT NULL DEFAULT 0 CHECK (rich_guests >= 0)');
}
if (!userColumns.includes('club_name')) db.exec('ALTER TABLE users ADD COLUMN club_name TEXT');
if (!userColumns.includes('club_name_key')) db.exec('ALTER TABLE users ADD COLUMN club_name_key TEXT');
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_club_name
  ON users (guild_id, club_name_key)
  WHERE club_name_key IS NOT NULL;
`);

module.exports = db;
