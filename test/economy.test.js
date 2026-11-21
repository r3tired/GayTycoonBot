const assert = require('node:assert/strict');
const { test } = require('node:test');
const db = require('../database/db');
const users = require('../database/users');
const economy = require('../services/economyService');

test('start is one-time and upgrades only affect income after purchase', async t => {
  const suffix = `${process.pid}-${Date.now()}`;
  const guildId = `test-guild-${suffix}`;
  const userId = `test-user-${suffix}`;
  const incompleteUserId = `test-incomplete-${suffix}`;

  t.after(() => {
    db.prepare('DELETE FROM users WHERE guild_id = ? AND user_id IN (?, ?)')
      .run(guildId, userId, incompleteUserId);
    db.close();
  });

  const started = await users.runStartOnce(guildId, userId, async () => ({ completed: true }));
  assert.equal(started.status, 'completed');

  const initial = economy.getPlayer(guildId, userId);
  assert.equal(initial.balance, 1000);
  assert.equal(initial.zones.length, 4);
  assert.equal(initial.hourlyIncome, 85);

  const duplicate = await users.runStartOnce(guildId, userId, async () => {
    throw new Error('The start callback must not run twice');
  });
  assert.equal(duplicate.status, 'already-used');

  const incomplete = await users.runStartOnce(guildId, incompleteUserId, async () => ({ completed: false }));
  assert.equal(incomplete.status, 'not-completed');
  assert.equal(users.getPlayer(guildId, incompleteUserId), null);

  const upgrade = economy.upgradeZone(guildId, userId, 'strip', initial.registeredAt + 3_600_000);
  assert.equal(upgrade.status, 'upgraded');
  assert.equal(upgrade.balance, 835);

  const collection = economy.collectIncome(guildId, userId, initial.registeredAt + 7_200_000);
  assert.equal(collection.earned, 92);
  assert.equal(collection.balance, 927);
  assert.equal(economy.collectIncome(guildId, userId, initial.registeredAt + 3_600_000).earned, 0);

  db.prepare('UPDATE users SET balance = 0 WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  assert.equal(economy.upgradeZone(guildId, userId, 'vip').status, 'insufficient-funds');
});
