const assert = require('node:assert/strict');
const { test } = require('node:test');
const db = require('../database/db');
const users = require('../database/users');
const economy = require('../services/economyService');
const { syncZoneRoles } = require('../services/roleSync');
const rolesConfig = require('../data/roles');
const zonesConfig = require('../data/zones');

// Мінімальні підробки guild/member для перевірки логіки ролей без Discord
function fakeMember(roleNames, ownedNames) {
  const roles = roleNames.map((name, i) => ({ id: String(i + 1), name }));
  const owned = new Set(roles.filter(r => ownedNames.includes(r.name)).map(r => r.id));
  const calls = [];
  return {
    calls,
    guild: { roles: { cache: new Map(roles.map(r => [r.id, r])), fetch: async () => new Map(roles.map(r => [r.id, r])) } },
    roles: {
      cache: { has: id => owned.has(id) },
      add: async role => { calls.push(`+${role.name}`); owned.add(role.id); },
      remove: async list => { for (const role of [].concat(list)) { calls.push(`-${role.name}`); owned.delete(role.id); } },
    },
    has: name => owned.has(roles.find(r => r.name === name).id),
  };
}

test('ролі зон генеруються: по maxLevel на кожну зону, рівень 1 у beginner', () => {
  const zoneRoles = Object.values(rolesConfig).filter(r => r.zoneId);
  assert.equal(zoneRoles.length, Object.keys(zonesConfig.zones).length * zonesConfig.maxLevel);
  assert.equal(zoneRoles.filter(r => r.level === 1).every(r => r.group === 'beginner'), true);
  assert.equal(zoneRoles.filter(r => r.level > 1).every(r => r.group === 'zone'), true);
  assert.ok(Object.values(rolesConfig).some(r => r.name === 'Бар Зона 1'));
  assert.ok(Object.values(rolesConfig).some(r => r.name === 'Бар Зона 3'));
});

test('syncZoneRoles міняє роль рівня і нічого не робить, якщо все вже правильно', async () => {
  const names = ['Бар Зона 1', 'Бар Зона 2', 'Бар Зона 3'];
  const member = fakeMember(names, ['Бар Зона 1']);

  const first = await syncZoneRoles(member, [{ zoneId: 'bar', level: 2 }]);
  assert.deepEqual(first.changed, ['Бар Зона 2']);
  assert.deepEqual(member.calls, ['+Бар Зона 2', '-Бар Зона 1']);
  assert.equal(member.has('Бар Зона 2'), true);
  assert.equal(member.has('Бар Зона 1'), false);

  member.calls.length = 0;
  const second = await syncZoneRoles(member, [{ zoneId: 'bar', level: 2 }]);
  assert.deepEqual(second.changed, []);
  assert.deepEqual(member.calls, []);
});

test('syncZoneRoles повідомляє про відсутню роль, а не падає', async () => {
  const member = fakeMember(['Бар Зона 1'], ['Бар Зона 1']);
  const result = await syncZoneRoles(member, [{ zoneId: 'bar', level: 2 }]);
  assert.deepEqual(result.failed, ['Бар Зона 2']);
});

test('зону можна прокачати лише до maxLevel', async t => {
  const suffix = `${process.pid}-${Date.now()}`;
  const guildId = `upg-guild-${suffix}`;
  const userId = `upg-user-${suffix}`;
  t.after(() => {
    db.prepare('DELETE FROM users WHERE guild_id = ?').run(guildId);
    db.close();
  });

  users.runStartOnce(guildId, userId, async () => ({ completed: true }));
  await new Promise(resolve => setImmediate(resolve));
  db.prepare('UPDATE users SET balance = 1000000 WHERE guild_id = ? AND user_id = ?').run(guildId, userId);

  const now = Date.now();
  assert.equal(economy.upgradeZone(guildId, userId, 'bar', now).level, 2);
  assert.equal(economy.upgradeZone(guildId, userId, 'bar', now).level, 3);

  const balanceBefore = economy.getPlayer(guildId, userId).balance;
  assert.equal(economy.upgradeZone(guildId, userId, 'bar', now).status, 'max-level');
  assert.equal(economy.getPlayer(guildId, userId).balance, balanceBefore, 'на максимумі гроші не списуються');

  const bar = economy.getPlayer(guildId, userId).zones.find(z => z.zoneId === 'bar');
  assert.equal(bar.level, 3);
  assert.equal(bar.isMaxLevel, true);
  assert.equal(bar.nextUpgradePrice, null);
});
