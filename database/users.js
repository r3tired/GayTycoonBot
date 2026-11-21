const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');
const zonesConfig = require('../data/zones');
const { clubNameKey } = require('../utils/clubName');

const inProgress = new Set();
const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (guild_id, user_id, balance, last_collected_at, registered_at, club_name, club_name_key)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const insertZone = db.prepare(`
  INSERT INTO user_zones (guild_id, user_id, zone_id, level)
  VALUES (?, ?, ?, ?)
`);

function isClubNameTaken(guildId, clubName, exceptUserId = '') {
  const row = db.prepare(`
    SELECT 1 FROM users
    WHERE guild_id = ? AND club_name_key = ? AND user_id != ?
  `).get(guildId, clubNameKey(clubName), exceptUserId);
  return Boolean(row);
}

// Повертає true (створено), false (гравець уже є) або 'name-taken'
const createPlayerTransaction = db.transaction((guildId, userId, now, clubName) => {
  if (clubName && isClubNameTaken(guildId, clubName)) return 'name-taken';

  const result = insertUser.run(
    guildId,
    userId,
    zonesConfig.startingBalance,
    now,
    now,
    clubName ?? null,
    clubName ? clubNameKey(clubName) : null,
  );
  if (result.changes === 0) return false;

  for (const zoneId of Object.keys(zonesConfig.zones)) {
    insertZone.run(guildId, userId, zoneId, zonesConfig.startingLevel);
  }
  return true;
});

function createPlayer(guildId, userId, now = Date.now(), clubName = null) {
  return createPlayerTransaction(guildId, userId, now, clubName);
}

function setClubName(guildId, userId, clubName) {
  if (isClubNameTaken(guildId, clubName, userId)) return { status: 'name-taken' };

  const result = db.prepare(`
    UPDATE users SET club_name = ?, club_name_key = ?
    WHERE guild_id = ? AND user_id = ?
  `).run(clubName, clubNameKey(clubName), guildId, userId);
  return { status: result.changes > 0 ? 'ok' : 'not-registered' };
}

function getPlayer(guildId, userId) {
  const user = db.prepare(`
    SELECT guild_id AS guildId, user_id AS userId, balance, club_name AS clubName,
           last_collected_at AS lastCollectedAt, registered_at AS registeredAt
    FROM users
    WHERE guild_id = ? AND user_id = ?
  `).get(guildId, userId);

  if (!user) return null;

  const zones = db.prepare(`
    SELECT zone_id AS zoneId, level
    FROM user_zones
    WHERE guild_id = ? AND user_id = ?
    ORDER BY zone_id
  `).all(guildId, userId);

  return { ...user, zones };
}

async function runStartOnce(guildId, userId, operation, clubName = null) {
  const claimKey = `${guildId}:${userId}`;
  if (getPlayer(guildId, userId)) return { status: 'already-used' };
  if (inProgress.has(claimKey)) return { status: 'in-progress' };

  inProgress.add(claimKey);
  try {
    const result = await operation();
    if (!result.completed) return { status: 'not-completed', result };

    const created = createPlayer(guildId, userId, Date.now(), clubName);
    if (created === 'name-taken') return { status: 'name-taken' };
    if (!created) return { status: 'already-used' };
    return { status: 'completed', result };
  } finally {
    inProgress.delete(claimKey);
  }
}

function collectIncome(guildId, userId, getHourlyIncome, now = Date.now()) {
  const collectTransaction = db.transaction(() => {
    const player = getPlayer(guildId, userId);
    if (!player) return null;

    const hourlyIncome = player.zones.reduce((total, playerZone) => {
      const zone = zonesConfig.zones[playerZone.zoneId];
      return total + getHourlyIncome(zone, playerZone.level);
    }, 0);
    const collectedAt = Math.max(now, player.lastCollectedAt);
    const elapsedMs = collectedAt - player.lastCollectedAt;
    const earned = hourlyIncome * elapsedMs / 3_600_000;

    db.prepare(`
      UPDATE users
      SET balance = balance + ?, last_collected_at = ?
      WHERE guild_id = ? AND user_id = ?
    `).run(earned, collectedAt, guildId, userId);

    return {
      earned,
      hourlyIncome,
      elapsedMs,
      balance: player.balance + earned,
    };
  });

  return collectTransaction();
}

function upgradeZone(guildId, userId, zoneId, getUpgradePrice, getHourlyIncome, now = Date.now()) {
  const upgradeTransaction = db.transaction(() => {
    const player = db.prepare(`
      SELECT balance, last_collected_at AS lastCollectedAt
      FROM users WHERE guild_id = ? AND user_id = ?
    `).get(guildId, userId);
    if (!player) return { status: 'not-registered' };

    const playerZone = db.prepare(`
      SELECT level FROM user_zones
      WHERE guild_id = ? AND user_id = ? AND zone_id = ?
    `).get(guildId, userId, zoneId);
    if (!playerZone) return { status: 'zone-not-found' };
    if (playerZone.level >= zonesConfig.maxLevel) {
      return { status: 'max-level', level: playerZone.level };
    }

    const zones = db.prepare(`
      SELECT zone_id AS zoneId, level FROM user_zones
      WHERE guild_id = ? AND user_id = ?
    `).all(guildId, userId);
    const hourlyIncome = zones.reduce((total, zone) => {
      return total + getHourlyIncome(zonesConfig.zones[zone.zoneId], zone.level);
    }, 0);
    const collectedAt = Math.max(now, player.lastCollectedAt);
    const earned = hourlyIncome * (collectedAt - player.lastCollectedAt) / 3_600_000;
    const balance = player.balance + earned;
    db.prepare(`
      UPDATE users SET balance = ?, last_collected_at = ?
      WHERE guild_id = ? AND user_id = ?
    `).run(balance, collectedAt, guildId, userId);

    const price = getUpgradePrice(playerZone.level);
    if (balance < price) {
      return { status: 'insufficient-funds', balance, price };
    }

    db.prepare(`
      UPDATE users SET balance = balance - ?
      WHERE guild_id = ? AND user_id = ?
    `).run(price, guildId, userId);
    db.prepare(`
      UPDATE user_zones SET level = level + 1
      WHERE guild_id = ? AND user_id = ? AND zone_id = ?
    `).run(guildId, userId, zoneId);

    return {
      status: 'upgraded',
      level: playerZone.level + 1,
      price,
      balance: balance - price,
    };
  });

  return upgradeTransaction();
}

function migrateLegacyClaims() {
  const legacyPath = path.join(__dirname, 'startClaims.json');
  if (!fs.existsSync(legacyPath)) return;

  const claims = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
  if (!Array.isArray(claims) || claims.some(claim => typeof claim !== 'string')) {
    throw new Error('Файл startClaims.json має містити масив рядків');
  }

  const now = Date.now();
  for (const claim of claims) {
    const match = /^(\d+):(\d+)$/.exec(claim);
    if (!match) throw new Error(`Некоректний запис у startClaims.json: ${claim}`);
    createPlayer(match[1], match[2], now);
  }
}

migrateLegacyClaims();

module.exports = {
  collectIncome,
  createPlayer,
  getPlayer,
  isClubNameTaken,
  runStartOnce,
  setClubName,
  upgradeZone,
};
