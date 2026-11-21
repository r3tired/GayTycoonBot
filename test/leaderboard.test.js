const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const db = require('../database/db');
const users = require('../database/users');
const leaderboardCommand = require('../commands/leaderboard');

after(() => db.close());

test('leaderboard sorts by balance, is guild-scoped, and renders Russian output', async t => {
  const suffix = `${process.pid}${Date.now()}`;
  const guildId = `900${suffix}`;
  const otherGuildId = `800${suffix}`;
  const firstUserId = `100${suffix}`;
  const secondUserId = `200${suffix}`;
  const thirdUserId = `300${suffix}`;
  const otherUserId = `400${suffix}`;
  const now = Date.now();

  assert.equal(users.createPlayer(guildId, firstUserId, now - 3_000, 'Первый клуб'), true);
  assert.equal(users.createPlayer(guildId, secondUserId, now - 2_000, 'Второй клуб'), true);
  assert.equal(users.createPlayer(guildId, thirdUserId, now - 1_000, 'Третий клуб'), true);
  assert.equal(users.createPlayer(otherGuildId, otherUserId, now, 'Чужой клуб'), true);
  t.after(() => db.prepare('DELETE FROM users WHERE guild_id IN (?, ?)').run(guildId, otherGuildId));

  const setBalance = db.prepare('UPDATE users SET balance = ? WHERE guild_id = ? AND user_id = ?');
  setBalance.run(5000, guildId, firstUserId);
  setBalance.run(5000, guildId, secondUserId);
  setBalance.run(2500, guildId, thirdUserId);
  setBalance.run(100000, otherGuildId, otherUserId);

  assert.deepEqual(
    users.getLeaderboard(guildId, 2).map(player => player.userId),
    [firstUserId, secondUserId],
  );
  assert.deepEqual(users.getLeaderboard(otherGuildId).map(player => player.userId), [otherUserId]);
  assert.throws(() => users.getLeaderboard(guildId, 0), RangeError);

  let response;
  await leaderboardCommand.execute({
    guildId,
    inGuild: () => true,
    reply: async payload => { response = payload; },
  });
  const description = response.embeds[0].toJSON().description;
  assert.ok(description.indexOf(`<@${firstUserId}>`) < description.indexOf(`<@${secondUserId}>`));
  assert.match(description, /Первый клуб/);
  assert.match(response.embeds[0].toJSON().title, /Топ клубов по балансу/);
});
