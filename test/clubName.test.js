const assert = require('node:assert/strict');
const { test } = require('node:test');
const db = require('../database/db');
const users = require('../database/users');
const { validateClubName } = require('../utils/clubName');

test('validateClubName перевіряє довжину, символи й посилання', () => {
  assert.deepEqual(validateClubName('  Рожевий   Єдиноріг '), { ok: true, name: 'Гей Клуб Поковба' });
  assert.equal(validateClubName('ab').ok, false);
  assert.equal(validateClubName('x'.repeat(33)).ok, false);
  assert.equal(validateClubName('Клуб @everyone').ok, false);
  assert.equal(validateClubName('Клуб <#123>').ok, false);
  assert.equal(validateClubName('Мій клуб discord.gg/abc').ok, false);
  assert.equal(validateClubName('🌈 Веселка').ok, true);
});

test('назва клубу зберігається й унікальна на сервері без урахування регістру', async t => {
  const suffix = `${process.pid}-${Date.now()}`;
  const guildA = `club-guild-a-${suffix}`;
  const guildB = `club-guild-b-${suffix}`;
  t.after(() => {
    db.prepare('DELETE FROM users WHERE guild_id IN (?, ?)').run(guildA, guildB);
    db.close();
  });

  const claim = await users.runStartOnce(guildA, 'u1', async () => ({ completed: true }), 'Рожевий Єдиноріг');
  assert.equal(claim.status, 'completed');
  assert.equal(users.getPlayer(guildA, 'u1').clubName, 'Рожевий Єдиноріг');

  // та сама назва в іншому регістрі на тому ж сервері заборонена
  const duplicate = await users.runStartOnce(guildA, 'u2', async () => ({ completed: true }), 'рожевий єдиноріг');
  assert.equal(duplicate.status, 'name-taken');
  assert.equal(users.getPlayer(guildA, 'u2'), null, 'гравця з зайнятою назвою не створено');

  // на іншому сервері можна
  const other = await users.runStartOnce(guildB, 'u2', async () => ({ completed: true }), 'Рожевий Єдиноріг');
  assert.equal(other.status, 'completed');

  // перейменування: власну назву в іншому регістрі можна, чужу ні
  assert.equal(users.setClubName(guildA, 'u1', 'РОЖЕВИЙ ЄДИНОРІГ').status, 'ok');
  await users.runStartOnce(guildA, 'u3', async () => ({ completed: true }), 'Нічна Зміна');
  assert.equal(users.setClubName(guildA, 'u3', 'рожевий єдиноріг').status, 'name-taken');
  assert.equal(users.setClubName(guildA, 'ghost', 'Вільна Назва').status, 'not-registered');
});
