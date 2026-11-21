const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const { createClubImageModal } = require('../utils/clubImageModal');
const { getClubImagePath, removeClubImage, saveClubImage } = require('../utils/clubImage');
const startCommand = require('../commands/start');
const db = require('../database/db');
const users = require('../database/users');

test('club image modal accepts one image and the upload is stored and linked to its club', async t => {
  const suffix = `${Date.now()}${process.pid}`;
  const guildId = `9${suffix}`;
  const userId = `8${suffix}`;
  const interactionId = `7${suffix}`;
  const modal = createClubImageModal(interactionId).toJSON();
  const fileUpload = modal.components[0].component;
  assert.equal(modal.custom_id, `start-club-image:${interactionId}`);
  assert.equal(fileUpload.custom_id, 'club-image');
  assert.equal(fileUpload.min_values, 1);
  assert.equal(fileUpload.max_values, 1);
  assert.deepEqual(fileUpload.file_types, ['.png', '.jpg', '.jpeg', '.webp']);
  let choiceReply;
  await startCommand.handleModal({
    id: interactionId,
    customId: startCommand.modalId,
    guildId,
    user: { id: userId },
    inGuild: () => true,
    fields: { getTextInputValue: () => `Test Club ${suffix}` },
    reply: async payload => { choiceReply = payload; },
  });
  const choiceButtons = choiceReply.components[0].components;
  assert.deepEqual(
    choiceButtons.map(button => button.data.label),
    ['Використати аватар профілю', 'Завантажити своє зображення'],
  );
  let uploadModal;
  await startCommand.handleImageChoice({
    customId: choiceButtons[1].data.custom_id,
    guildId,
    user: { id: userId },
    inGuild: () => true,
    showModal: async modal => { uploadModal = modal.toJSON(); },
  });
  assert.equal(uploadModal.custom_id, `start-club-image:${interactionId}`);

  let filename;
  const originalFetch = global.fetch;
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf5kAAAAASUVORK5CYII=',
    'base64',
  );

  t.after(async () => {
    global.fetch = originalFetch;
    db.prepare('DELETE FROM users WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
    if (filename) await removeClubImage(filename);
    db.close();
  });

  global.fetch = async () => new Response(image, {
    status: 200,
    headers: { 'content-length': String(image.length), 'content-type': 'image/png' },
  });

  const saved = await saveClubImage(
    {
      size: image.length,
      contentType: 'image/png',
      url: 'https://cdn.discordapp.com/attachments/test/image.png',
    },
    guildId,
    userId,
    interactionId,
  );
  filename = saved.filename;

  assert.equal(path.dirname(saved.imagePath), path.join(__dirname, '..', 'assets', 'user-photos'));
  assert.deepEqual(await fs.readFile(saved.imagePath), image);
  assert.equal(users.createPlayer(guildId, userId, Date.now(), 'Test Club', 'upload', filename), true);

  const player = users.getPlayer(guildId, userId);
  assert.equal(player.clubImageSource, 'upload');
  assert.equal(player.clubImageFilename, filename);
  assert.equal(getClubImagePath(filename), saved.imagePath);
});
