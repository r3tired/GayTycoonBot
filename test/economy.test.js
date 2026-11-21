const assert = require('node:assert/strict');
const { test } = require('node:test');
const db = require('../database/db');
const users = require('../database/users');
const economy = require('../services/economyService');
const zonesConfig = require('../data/zones');

test('guest visits are randomized, capped, persisted and settled before an upgrade', async t => {
  const suffix = `${process.pid}-${Date.now()}`;
  const guildId = `test-guild-${suffix}`;
  const userId = `test-user-${suffix}`;
  const incompleteUserId = `test-incomplete-${suffix}`;
  const guestCounterUserId = `test-guest-counters-${suffix}`;

  const barCheck = zonesConfig.zones.bar.averageCheck;
  const rolls = [0.995, 0.95, 0.5];
  const guestMix = economy.simulateCollection(
    [{ zoneId: 'bar', level: 1 }],
    360_000,
    () => rolls.shift(),
  );
  assert.equal(guestMix.totalGuests, 3);
  assert.equal(guestMix.regularGuests, 1);
  assert.equal(guestMix.mediumGuests, 1);
  assert.equal(guestMix.richGuests, 1);
  assert.ok(Math.abs(guestMix.earned - 19 * barCheck) < 1e-10);
  assert.ok(Math.abs(guestMix.tips - 14 * barCheck) < 1e-10);

  let roundingRoll = 0;
  const roundedVisits = economy.simulateCollection(
    [{ zoneId: 'bar', level: 1 }],
    (12.6 / 30) * 3_600_000,
    () => roundingRoll++ === 0 ? 0.59 : 0.5,
  );
  assert.equal(roundedVisits.totalGuests, 13);

  t.after(() => {
    db.prepare('DELETE FROM users WHERE guild_id = ? AND user_id IN (?, ?, ?)')
      .run(guildId, userId, incompleteUserId, guestCounterUserId);
    db.close();
  });

  const started = await users.runStartOnce(guildId, userId, async () => ({ completed: true }));
  assert.equal(started.status, 'completed');

  const initial = economy.getPlayer(guildId, userId);
  assert.equal(initial.balance, 1000);
  assert.equal(initial.zones.length, 4);
  assert.equal(initial.visitorsPerHour, 80);
  assert.ok(Math.abs(initial.expectedHourlyIncome - 85) < 1e-10);

  const duplicate = await users.runStartOnce(guildId, userId, async () => {
    throw new Error('The start callback must not run twice');
  });
  assert.equal(duplicate.status, 'already-used');

  const incomplete = await users.runStartOnce(guildId, incompleteUserId, async () => ({ completed: false }));
  assert.equal(incomplete.status, 'not-completed');
  assert.equal(users.getPlayer(guildId, incompleteUserId), null);

  await users.runStartOnce(guildId, guestCounterUserId, async () => ({ completed: true }));
  db.prepare(`
    DELETE FROM user_zones
    WHERE guild_id = ? AND user_id = ? AND zone_id != 'bar'
  `).run(guildId, guestCounterUserId);
  const typeRolls = [0.995, 0.95, 0.5];
  const typedCollection = economy.collectIncome(
    guildId,
    guestCounterUserId,
    users.getPlayer(guildId, guestCounterUserId).lastCollectedAt + 360_000,
    () => typeRolls.shift(),
  );
  assert.equal(typedCollection.regularGuests, 1);
  assert.equal(typedCollection.mediumGuests, 1);
  assert.equal(typedCollection.richGuests, 1);
  const guestCounters = users.getPlayer(guildId, guestCounterUserId);
  assert.equal(guestCounters.regularGuests, 1);
  assert.equal(guestCounters.mediumGuests, 1);
  assert.equal(guestCounters.richGuests, 1);

  const cappedCollection = economy.collectIncome(
    guildId,
    userId,
    initial.registeredAt + 48 * 3_600_000,
    () => 0.5,
  );
  assert.equal(cappedCollection.elapsedMs, 12 * 3_600_000);
  assert.equal(cappedCollection.totalGuests, 960);
  assert.equal(cappedCollection.regularGuests, 960);
  assert.equal(cappedCollection.mediumGuests, 0);
  assert.equal(cappedCollection.richGuests, 0);
  assert.equal(economy.getPlayer(guildId, userId).regularGuests, 960);

  const upgrade = economy.upgradeZone(
    guildId,
    userId,
    'strip',
    initial.registeredAt + 49 * 3_600_000,
    () => 0.5,
  );
  assert.equal(upgrade.status, 'upgraded');
  assert.equal(upgrade.totalGuests, 80);
  assert.equal(economy.getPlayer(guildId, userId).zones.find(zone => zone.zoneId === 'strip').level, 2);

  const collection = economy.collectIncome(
    guildId,
    userId,
    initial.registeredAt + 50 * 3_600_000,
    () => 0.5,
  );
  assert.equal(collection.totalGuests, 87);
  assert.equal(economy.getPlayer(guildId, userId).regularGuests, 1127);
  assert.equal(economy.getPlayer(guildId, userId).mediumGuests, 0);
  assert.equal(economy.getPlayer(guildId, userId).richGuests, 0);

  db.prepare('UPDATE users SET balance = 0 WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  assert.equal(economy.upgradeZone(guildId, userId, 'vip').status, 'insufficient-funds');
});
