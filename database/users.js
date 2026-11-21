const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');
const zonesConfig = require('../data/zones');
const { clubNameKey } = require('../utils/clubName');

const inProgress = new Set();
const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (
    guild_id, user_id, balance, last_collected_at, registered_at, club_name, club_name_key,
    club_image_source, club_image_filename
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
const createPlayerTransaction = db.transaction((guildId, userId, now, clubName, clubImageSource, clubImageFilename) => {
  if (clubName && isClubNameTaken(guildId, clubName)) return 'name-taken';

  const result = insertUser.run(
    guildId,
    userId,
    zonesConfig.startingBalance,
    now,
    now,
    clubName ?? null,
    clubName ? clubNameKey(clubName) : null,
    clubImageSource,
    clubImageFilename,
  );
  if (result.changes === 0) return false;

  for (const zoneId of Object.keys(zonesConfig.zones)) {
    insertZone.run(guildId, userId, zoneId, zonesConfig.startingLevel);
  }
  return true;
});

function createPlayer(
  guildId,
  userId,
  now = Date.now(),
  clubName = null,
  clubImageSource = 'profile',
  clubImageFilename = null,
) {
  return createPlayerTransaction(guildId, userId, now, clubName, clubImageSource, clubImageFilename);
}

function setClubName(guildId, userId, clubName) {
  if (isClubNameTaken(guildId, clubName, userId)) return { status: 'name-taken' };

  const result = db.prepare(`
    UPDATE users SET club_name = ?, club_name_key = ?
    WHERE guild_id = ? AND user_id = ?
  `).run(clubName, clubNameKey(clubName), guildId, userId);
  return { status: result.changes > 0 ? 'ok' : 'not-registered' };
}

function giveBalance(guildId, userId, amount) {
  const transaction = db.transaction(() => {
    if (!Number.isSafeInteger(amount) || amount <= 0) return { status: 'invalid-amount' };
    const player = db.prepare(`
      SELECT balance FROM users WHERE guild_id = ? AND user_id = ?
    `).get(guildId, userId);
    if (!player) return { status: 'not-registered' };

    const balance = player.balance + amount;
    if (!Number.isFinite(balance) || balance > Number.MAX_SAFE_INTEGER) {
      return { status: 'balance-limit' };
    }

    db.prepare(`
      UPDATE users SET balance = ? WHERE guild_id = ? AND user_id = ?
    `).run(balance, guildId, userId);
    return { status: 'ok', balance };
  });

  return transaction();
}

function setBalance(guildId, userId, amount) {
  const transaction = db.transaction(() => {
    if (!Number.isSafeInteger(amount) || amount < 0) return { status: 'invalid-amount' };
    const result = db.prepare(`
      UPDATE users SET balance = ? WHERE guild_id = ? AND user_id = ?
    `).run(amount, guildId, userId);
    return result.changes > 0 ? { status: 'ok', balance: amount } : { status: 'not-registered' };
  });

  return transaction();
}

function setZoneLevel(guildId, userId, zoneId, level, now = Date.now()) {
  const transaction = db.transaction(() => {
    if (!zonesConfig.zones[zoneId]) return { status: 'unknown-zone' };
    if (!Number.isInteger(level) || level < 1 || level > zonesConfig.maxLevel) {
      return { status: 'invalid-level' };
    }

    const current = db.prepare(`
      SELECT level FROM user_zones
      WHERE guild_id = ? AND user_id = ? AND zone_id = ?
    `).get(guildId, userId, zoneId);
    if (!current) {
      const exists = db.prepare(`
        SELECT 1 FROM users WHERE guild_id = ? AND user_id = ?
      `).get(guildId, userId);
      return { status: exists ? 'unknown-zone' : 'not-registered' };
    }
    if (current.level === level) return { status: 'unchanged', level };

    db.prepare(`
      UPDATE user_zones SET level = ?
      WHERE guild_id = ? AND user_id = ? AND zone_id = ?
    `).run(level, guildId, userId, zoneId);
    db.prepare(`
      UPDATE users SET last_collected_at = MAX(last_collected_at, ?)
      WHERE guild_id = ? AND user_id = ?
    `).run(now, guildId, userId);

    return { status: 'ok', previousLevel: current.level, level };
  });

  return transaction();
}

function resetPlayer(guildId, userId, now = Date.now()) {
  const transaction = db.transaction(() => {
    const result = db.prepare(`
      UPDATE users
      SET balance = ?,
          last_collected_at = MAX(last_collected_at, ?),
          regular_guests = 0,
          medium_guests = 0,
          rich_guests = 0
      WHERE guild_id = ? AND user_id = ?
    `).run(zonesConfig.startingBalance, now, guildId, userId);
    if (result.changes === 0) return { status: 'not-registered' };

    db.prepare(`
      UPDATE user_zones SET level = ?
      WHERE guild_id = ? AND user_id = ?
    `).run(zonesConfig.startingLevel, guildId, userId);
    return { status: 'ok' };
  });

  return transaction();
}

function getPlayer(guildId, userId) {
  const user = db.prepare(`
    SELECT guild_id AS guildId, user_id AS userId, balance, club_name AS clubName,
           club_image_source AS clubImageSource, club_image_filename AS clubImageFilename,
           regular_guests AS regularGuests, medium_guests AS mediumGuests,
           rich_guests AS richGuests,
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

function getLeaderboard(guildId, limit = 10) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError('Leaderboard limit must be an integer between 1 and 100');
  }

  return db.prepare(`
    SELECT user_id AS userId, balance, club_name AS clubName
    FROM users
    WHERE guild_id = ?
    ORDER BY balance DESC, registered_at ASC, user_id ASC
    LIMIT ?
  `).all(guildId, limit);
}

async function runStartOnce(
  guildId,
  userId,
  operation,
  clubName = null,
  clubImageSource = 'profile',
  clubImageFilename = null,
) {
  const claimKey = `${guildId}:${userId}`;
  if (getPlayer(guildId, userId)) return { status: 'already-used' };
  if (inProgress.has(claimKey)) return { status: 'in-progress' };

  inProgress.add(claimKey);
  try {
    const result = await operation();
    if (!result.completed) return { status: 'not-completed', result };

    const created = createPlayer(
      guildId,
      userId,
      Date.now(),
      clubName,
      clubImageSource,
      clubImageFilename,
    );
    if (created === 'name-taken') return { status: 'name-taken' };
    if (!created) return { status: 'already-used' };
    return { status: 'completed', result };
  } finally {
    inProgress.delete(claimKey);
  }
}

function settleCollection(player, guildId, userId, processCollection, maxCollectionMs, now) {
  const collectedAt = Math.max(now, player.lastCollectedAt);
  const elapsedMs = Math.min(collectedAt - player.lastCollectedAt, maxCollectionMs);
  const collection = processCollection(player.zones, elapsedMs);

  db.prepare(`
    UPDATE users
    SET balance = balance + ?,
        last_collected_at = ?,
        regular_guests = regular_guests + ?,
        medium_guests = medium_guests + ?,
        rich_guests = rich_guests + ?
    WHERE guild_id = ? AND user_id = ?
  `).run(
    collection.earned,
    collectedAt,
    collection.regularGuests,
    collection.mediumGuests,
    collection.richGuests,
    guildId,
    userId,
  );

  return {
    ...collection,
    elapsedMs,
    balance: player.balance + collection.earned,
  };
}

function collectIncome(guildId, userId, processCollection, maxCollectionMs, now = Date.now()) {
  const collectTransaction = db.transaction(() => {
    const player = getPlayer(guildId, userId);
    if (!player) return null;

    return settleCollection(player, guildId, userId, processCollection, maxCollectionMs, now);
  });

  return collectTransaction();
}

function upgradeZone(
  guildId,
  userId,
  zoneId,
  getUpgradePrice,
  processCollection,
  maxCollectionMs,
  now = Date.now(),
) {
  const upgradeTransaction = db.transaction(() => {
    const player = getPlayer(guildId, userId);
    if (!player) return { status: 'not-registered' };

    const playerZone = db.prepare(`
      SELECT level FROM user_zones
      WHERE guild_id = ? AND user_id = ? AND zone_id = ?
    `).get(guildId, userId, zoneId);
    if (!playerZone) return { status: 'zone-not-found' };
    if (playerZone.level >= zonesConfig.maxLevel) {
      return { status: 'max-level', level: playerZone.level };
    }

    const collection = settleCollection(
      player,
      guildId,
      userId,
      processCollection,
      maxCollectionMs,
      now,
    );

    const price = getUpgradePrice(playerZone.level);
    if (collection.balance < price) {
      return { ...collection, status: 'insufficient-funds', price };
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
      ...collection,
      status: 'upgraded',
      level: playerZone.level + 1,
      price,
      balance: collection.balance - price,
    };
  });

  return upgradeTransaction();
}

function migrateLegacyClaims() {
  const legacyPath = path.join(__dirname, 'startClaims.json');
  if (!fs.existsSync(legacyPath)) return;

  const claims = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
  if (!Array.isArray(claims) || claims.some(claim => typeof claim !== 'string')) {
    throw new Error('startClaims.json must contain an array of strings');
  }

  const now = Date.now();
  for (const claim of claims) {
    const match = /^(\d+):(\d+)$/.exec(claim);
    if (!match) throw new Error(`Invalid entry in startClaims.json: ${claim}`);
    createPlayer(match[1], match[2], now);
  }
}

migrateLegacyClaims();

module.exports = {
  collectIncome,
  createPlayer,
  giveBalance,
  getPlayer,
  getLeaderboard,
  isClubNameTaken,
  resetPlayer,
  runStartOnce,
  setBalance,
  setClubName,
  setZoneLevel,
  upgradeZone,
};
