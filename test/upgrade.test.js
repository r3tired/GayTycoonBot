const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const db = require('../database/db');
const users = require('../database/users');
const economy = require('../services/economyService');
const { syncZoneRoles } = require('../services/roleSync');
const rolesConfig = require('../data/roles');
const zonesConfig = require('../data/zones');
const adminCommands = require('../commands/admin/adminCommands');

after(() => db.close());

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

test('admin database operations validate values, update zones and reset progress', t => {
  const suffix = `${process.pid}-${Date.now()}`;
  const guildId = `admin-guild-${suffix}`;
  const userId = `admin-user-${suffix}`;
  const clubName = `Admin Club ${suffix}`;
  const imageFilename = `${suffix}.webp`;
  const now = Date.now() - 10_000;

  assert.equal(users.createPlayer(guildId, userId, now, clubName, 'upload', imageFilename), true);
  t.after(() => db.prepare('DELETE FROM users WHERE guild_id = ?').run(guildId));
  const player = users.getPlayer(guildId, userId);

  assert.equal(users.giveBalance(guildId, userId, 250).balance, player.balance + 250);
  assert.equal(users.giveBalance(guildId, userId, 0).status, 'invalid-amount');
  assert.equal(users.setBalance(guildId, userId, 0).balance, 0);
  assert.equal(users.setBalance(guildId, userId, -1).status, 'invalid-amount');
  assert.equal(users.giveBalance(guildId, 'missing-user', 1).status, 'not-registered');

  const changedAt = player.lastCollectedAt + 5_000;
  assert.deepEqual(users.setZoneLevel(guildId, userId, 'bar', 2, changedAt), {
    status: 'ok',
    previousLevel: 1,
    level: 2,
  });
  assert.equal(users.getPlayer(guildId, userId).lastCollectedAt, changedAt);
  assert.equal(users.setZoneLevel(guildId, userId, 'bar', 2).status, 'unchanged');
  assert.equal(users.setZoneLevel(guildId, userId, 'bar', zonesConfig.maxLevel + 1).status, 'invalid-level');

  db.prepare(`
    UPDATE users SET regular_guests = 8, medium_guests = 3, rich_guests = 1
    WHERE guild_id = ? AND user_id = ?
  `).run(guildId, userId);
  assert.equal(users.resetPlayer(guildId, userId, changedAt + 5_000).status, 'ok');

  const reset = users.getPlayer(guildId, userId);
  assert.equal(reset.balance, zonesConfig.startingBalance);
  assert.ok(reset.zones.every(zone => zone.level === zonesConfig.startingLevel));
  assert.deepEqual([reset.regularGuests, reset.mediumGuests, reset.richGuests], [0, 0, 0]);
  assert.equal(reset.clubName, clubName);
  assert.equal(reset.clubImageSource, 'upload');
  assert.equal(reset.clubImageFilename, imageFilename);
});

test('admin commands are registered and reject non-owner callers', async t => {
  const suffix = `${process.pid}-${Date.now()}`;
  const guildId = `admin-auth-guild-${suffix}`;
  const userId = `admin-auth-user-${suffix}`;
  assert.equal(users.createPlayer(guildId, userId), true);
  t.after(() => db.prepare('DELETE FROM users WHERE guild_id = ?').run(guildId));

  const [giveCommand, changeCommand] = adminCommands;
  assert.deepEqual(adminCommands.map(command => command.data.name), ['give', 'change', 'reset']);
  assert.deepEqual(changeCommand.data.toJSON().options.map(option => option.name), ['balance', 'zone']);

  const previousCreatorId = process.env.CREATORID;
  process.env.CREATORID = 'bot-owner';
  t.after(() => {
    if (previousCreatorId === undefined) delete process.env.CREATORID;
    else process.env.CREATORID = previousCreatorId;
  });

  let response;
  const interaction = {
    guildId,
    inGuild: () => true,
    user: { id: 'not-the-owner' },
    reply: async payload => { response = payload; },
    deferReply: async () => {},
    editReply: async payload => { response = payload; },
    options: {
      getUser: () => ({ id: userId }),
      getInteger: () => 100,
    },
  };
  await giveCommand.execute(interaction);
  assert.match(response.content, /только владельцу бота/);
  assert.equal(users.getPlayer(guildId, userId).balance, zonesConfig.startingBalance);

  interaction.user.id = 'bot-owner';
  await giveCommand.execute(interaction);
  assert.match(response.content, /Выдано/);
  assert.equal(users.getPlayer(guildId, userId).balance, zonesConfig.startingBalance + 100);
});
