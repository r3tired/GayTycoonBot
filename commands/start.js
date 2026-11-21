const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  escapeMarkdown,
} = require('discord.js');
const { giveGroupRoles, getMemberRolesFromOtherGroups } = require('../services/roleSync');
const { getPlayer, isClubNameTaken, runStartOnce } = require('../database/users');
const { validateClubName } = require('../utils/clubName');
const { CLUB_NAME_FIELD, createClubNameModal } = require('../utils/clubNameModal');
const {
  CLUB_IMAGE_FIELD,
  CLUB_IMAGE_MODAL_PREFIX,
  createClubImageModal,
} = require('../utils/clubImageModal');
const {
  ClubImageError,
  removeClubImage,
  saveClubImage,
} = require('../utils/clubImage');
const zonesConfig = require('../data/zones');
const rolesConfig = require('../data/roles');

const group = 'beginner';
const startColor = 0x00eeff;
const modalId = 'start-club-name';
const pendingStartLifetime = 15 * 60 * 1000;
const pendingStarts = new Map();

function createStartEmbed(title, description, color = startColor) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'Gay Tycoon • Стартовые роли' })
    .setTimestamp();
}

function getPendingStartKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function rememberPendingStart(guildId, userId, clubName, requestId) {
  const key = getPendingStartKey(guildId, userId);
  const previous = pendingStarts.get(key);
  if (previous) clearTimeout(previous.timeout);

  const pending = { clubName, requestId };
  pending.timeout = setTimeout(() => {
    if (pendingStarts.get(key) === pending) pendingStarts.delete(key);
  }, pendingStartLifetime);
  pending.timeout.unref();
  pendingStarts.set(key, pending);
}

function clearPendingStart(guildId, userId) {
  const key = getPendingStartKey(guildId, userId);
  const pending = pendingStarts.get(key);
  if (!pending) return;
  clearTimeout(pending.timeout);
  pendingStarts.delete(key);
}

async function createClub(interaction, clubName, imageSource, imageFilename, deferred = false) {
  if (!deferred) await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const claim = await runStartOnce(interaction.guildId, interaction.user.id, async () => {
    const higherGroupRoles = await getMemberRolesFromOtherGroups(interaction.member, group);
    if (higherGroupRoles.length > 0) {
      return { completed: false, higherGroupRoles };
    }

    const result = await giveGroupRoles(interaction.member, group);
    return { completed: result.failed.length === 0, roles: result };
  }, clubName, imageSource, imageFilename);

  if (claim.status === 'already-used') {
    await interaction.editReply({
      embeds: [
        createStartEmbed(
          '✅ Клуб уже создан',
          'Ты уже запускал `/start`. Эта команда позволяет создать клуб только один раз.',
        ),
      ],
    });
    return claim;
  }

  if (claim.status === 'in-progress') {
    await interaction.editReply({
      embeds: [
        createStartEmbed(
          '⏳ Запрос уже обрабатывается',
          'Подожди немного — бот уже создаёт твой клуб.',
        ),
      ],
    });
    return claim;
  }

  if (claim.status === 'name-taken') {
    await interaction.editReply({
      embeds: [
        createStartEmbed(
          '✏️ Это название уже занято',
          'Кто-то только что занял это название. Запусти `/start` ещё раз.',
          0xffc857,
        ),
      ],
    });
    return claim;
  }

  if (claim.result.higherGroupRoles) {
    const embed = createStartEmbed(
      '🏆 У тебя уже есть роль более высокого уровня',
      'Стартовые роли не выдаются, чтобы не конфликтовать с твоим текущим уровнем.',
      0xffc857,
    );
    embed.addFields({
      name: 'Твои роли',
      value: claim.result.higherGroupRoles.map(role => `• ${role}`).join('\n'),
    });
    await interaction.editReply({ embeds: [embed] });
    return claim;
  }

  if (claim.status === 'not-completed') {
    const failed = claim.result.roles?.failed ?? [];
    await interaction.editReply({
      embeds: [
        createStartEmbed(
          '⚠️ Не удалось выдать роли',
          `Клуб не создан: не удалось выдать роли: ${failed.join(', ') || 'неизвестно'}. ` +
          'Проверь права бота и иерархию ролей, затем запусти `/start` ещё раз.',
          0xffc857,
        ),
      ],
    });
    return claim;
  }

  const result = claim.result.roles;
  const embed = createStartEmbed(
    '🌈 Добро пожаловать в Gay Tycoon!',
    `Привет, ${interaction.user}! Клуб **${escapeMarkdown(clubName)}** открыт: вот твои стартовые роли и ${zonesConfig.startingBalance} монет.`,
  );

  if (result.assigned.length > 0) {
    embed.addFields({
      name: '🎭 Новые роли',
      value: result.assigned.map(role => `• ${role}`).join('\n'),
      inline: true,
    });
  }
  if (result.alreadyHad.length > 0) {
    embed.addFields({
      name: '✨ Уже есть',
      value: result.alreadyHad.map(role => `• ${role}`).join('\n'),
      inline: true,
    });
  }

  await interaction.editReply({ embeds: [embed] });
  return claim;
}

async function handleClubImageUpload(interaction) {
  if (!interaction.inGuild()) return;

  const key = getPendingStartKey(interaction.guildId, interaction.user.id);
  const pending = pendingStarts.get(key);
  const requestId = interaction.customId.slice(CLUB_IMAGE_MODAL_PREFIX.length);
  if (!pending || pending.requestId !== requestId) {
    await interaction.reply({
      content: 'Время выбора изображения истекло. Запусти `/start` ещё раз.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const uploads = interaction.fields.getUploadedFiles(CLUB_IMAGE_FIELD);
  const attachment = uploads?.first();
  if (!attachment) {
    await interaction.reply({
      content: 'Загрузи одно изображение или запусти `/start` ещё раз.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  let filename;
  try {
    const savedImage = await saveClubImage(
      attachment,
      interaction.guildId,
      interaction.user.id,
      interaction.id,
    );
    filename = savedImage.filename;
    await createClub(interaction, pending.clubName, 'upload', filename, true);
  } catch (error) {
    if (!(error instanceof ClubImageError)) throw error;
    console.error('Failed to save club image:', error.name);
    await interaction.editReply({ content: `❌ ${error.message} Запусти \`/start\` ещё раз.` });
  } finally {
    clearPendingStart(interaction.guildId, interaction.user.id);
    if (filename) {
      const player = getPlayer(interaction.guildId, interaction.user.id);
      if (!player || player.clubImageFilename !== filename) await removeClubImage(filename);
    }
  }
}

module.exports = {
  modalId,
  modalIds: [modalId],
  modalPrefix: CLUB_IMAGE_MODAL_PREFIX,
  data: new SlashCommandBuilder()
    .setName('start')
    .setDescription('Создать свой гей-клуб и получить стартовые роли'),

  // Крок 1: перевірки й вікно для введення назви клубу
  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        embeds: [
          createStartEmbed(
            '🏰 Команда доступна только на сервере',
            'Зайди на сервер Gay Tycoon и запусти `/start` там.',
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const groupRoles = Object.values(rolesConfig).filter(role => role.group === group);

    if (groupRoles.length === 0) {
      await interaction.reply({
        embeds: [
          createStartEmbed(
            '⏳ Стартовые роли ещё готовятся',
            'Для новичков пока не настроены роли. Попробуй немного позже.',
            0xffc857,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (getPlayer(interaction.guildId, interaction.user.id)) {
      await interaction.reply({
        embeds: [
          createStartEmbed(
            '✅ Клуб уже создан',
            'Ты уже запускал `/start`. Эта команда позволяет создать клуб только один раз. Название можно изменить командой `/rename`.',
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.showModal(createClubNameModal(modalId, 'Назови свой гей-клуб'));
  },

  // Крок 2: перевіряємо назву та даємо вибрати зображення клубу
  async handleModal(interaction) {
    if (!interaction.inGuild()) return;
    if (interaction.customId.startsWith(CLUB_IMAGE_MODAL_PREFIX)) return handleClubImageUpload(interaction);

    const check = validateClubName(interaction.fields.getTextInputValue(CLUB_NAME_FIELD));
    if (!check.ok) {
      await interaction.reply({
        embeds: [createStartEmbed('✏️ Это название не подходит', `${check.reason}\nЗапусти \`/start\` ещё раз.`, 0xffc857)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const clubName = check.name;
    if (isClubNameTaken(interaction.guildId, clubName)) {
      await interaction.reply({
        embeds: [
          createStartEmbed(
            '✏️ Это название уже занято',
            `На этом сервере уже есть клуб **${escapeMarkdown(clubName)}**. Запусти \`/start\` ещё раз и придумай другое название.`,
            0xffc857,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    rememberPendingStart(interaction.guildId, interaction.user.id, clubName, interaction.id);
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`start-image:profile:${interaction.user.id}:${interaction.id}`)
        .setLabel('Использовать аватар профиля')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`start-image:upload:${interaction.user.id}:${interaction.id}`)
        .setLabel('Загрузить своё изображение')
        .setStyle(ButtonStyle.Primary),
    );
    await interaction.reply({
      embeds: [
        createStartEmbed(
          '🖼️ Выбери изображение клуба',
          `Название **${escapeMarkdown(clubName)}** сохранено. Выбери аватар профиля или загрузи своё изображение.`,
        ),
      ],
      components: [buttons],
      flags: MessageFlags.Ephemeral,
    });
  },

  async handleImageChoice(interaction) {
    const [, choice, ownerId, requestId] = interaction.customId.split(':');
    if (!interaction.inGuild() || ownerId !== interaction.user.id) {
      await interaction.reply({
        content: 'Этот выбор изображения предназначен другому игроку.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const key = getPendingStartKey(interaction.guildId, interaction.user.id);
    const pending = pendingStarts.get(key);
    if (!pending || pending.requestId !== requestId) {
      await interaction.reply({
        content: 'Время выбора изображения истекло. Запусти `/start` ещё раз.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (choice === 'upload') {
      await interaction.showModal(createClubImageModal(requestId));
      return;
    }
    if (choice !== 'profile') {
      await interaction.reply({
        content: 'Неизвестный вариант изображения. Запусти `/start` ещё раз.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    clearPendingStart(interaction.guildId, interaction.user.id);
    await createClub(interaction, pending.clubName, 'profile', null);
  },
};
