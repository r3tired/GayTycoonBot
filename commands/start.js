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
    .setFooter({ text: 'Gay Tycoon • Група Beginner' })
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
          '✅ Старт уже пройдено',
          'Ти вже використовував `/start`. Команда створює клуб лише один раз.',
        ),
      ],
    });
    return claim;
  }

  if (claim.status === 'in-progress') {
    await interaction.editReply({
      embeds: [
        createStartEmbed(
          '⏳ Запит уже обробляється',
          'Зачекай трохи — бот уже створює твій клуб.',
        ),
      ],
    });
    return claim;
  }

  if (claim.status === 'name-taken') {
    await interaction.editReply({
      embeds: [
        createStartEmbed(
          '✏️ Така назва вже зайнята',
          'Хтось щойно встиг зайняти цю назву. Запусти `/start` ще раз.',
          0xffc857,
        ),
      ],
    });
    return claim;
  }

  if (claim.result.higherGroupRoles) {
    const embed = createStartEmbed(
      '🏆 У тебе вже є роль вищого рівня',
      'Стартові ролі Beginner не видаються, щоб не конфліктувати з твоїм поточним рівнем.',
      0xffc857,
    );
    embed.addFields({
      name: 'Твої ролі',
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
          '⚠️ Не вдалося видати ролі',
          `Клуб ще не створено, бо не вдалося видати ролі: ${failed.join(', ') || 'невідомо'}. ` +
          'Перевір права бота та ієрархію ролей і запусти `/start` ще раз.',
          0xffc857,
        ),
      ],
    });
    return claim;
  }

  const result = claim.result.roles;
  const embed = createStartEmbed(
    '🌈 Ласкаво просимо до Gay Tycoon!',
    `Привіт, ${interaction.user}! Клуб **${escapeMarkdown(clubName)}** відкрито: ось твої стартові ролі та ${zonesConfig.startingBalance} монет.`,
  );

  if (result.assigned.length > 0) {
    embed.addFields({
      name: '🎭 Нові ролі',
      value: result.assigned.map(role => `• ${role}`).join('\n'),
      inline: true,
    });
  }
  if (result.alreadyHad.length > 0) {
    embed.addFields({
      name: '✨ Уже твої',
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
      content: 'Час вибору зображення минув. Запусти `/start` ще раз.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const uploads = interaction.fields.getUploadedFiles(CLUB_IMAGE_FIELD);
  const attachment = uploads?.first();
  if (!attachment) {
    await interaction.reply({
      content: 'Завантаж одне зображення або запусти `/start` ще раз.',
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
    console.error('Не вдалося зберегти зображення клубу:', error);
    await interaction.editReply({ content: `❌ ${error.message} Запусти \`/start\` ще раз.` });
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
    .setDescription('Створити свій гей-клуб і отримати стартові ролі'),

  // Крок 1: перевірки й вікно для введення назви клубу
  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        embeds: [
          createStartEmbed(
            '🏰 Команда доступна на сервері',
            'Зайди на сервер Gay Tycoon і запусти `/start` там.',
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
            '⏳ Стартові ролі ще готуються',
            'Для групи Beginner поки не налаштовано ролей. Спробуй трохи пізніше.',
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
            '✅ Старт уже пройдено',
            'Ти вже використовував `/start`. Команда створює клуб лише один раз. Змінити назву можна командою `/rename`.',
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.showModal(createClubNameModal(modalId, 'Назви свій гей-клуб'));
  },

  // Крок 2: перевіряємо назву та даємо вибрати зображення клубу
  async handleModal(interaction) {
    if (!interaction.inGuild()) return;
    if (interaction.customId.startsWith(CLUB_IMAGE_MODAL_PREFIX)) return handleClubImageUpload(interaction);

    const check = validateClubName(interaction.fields.getTextInputValue(CLUB_NAME_FIELD));
    if (!check.ok) {
      await interaction.reply({
        embeds: [createStartEmbed('✏️ Ця назва не підходить', `${check.reason}\nЗапусти \`/start\` ще раз.`, 0xffc857)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const clubName = check.name;
    if (isClubNameTaken(interaction.guildId, clubName)) {
      await interaction.reply({
        embeds: [
          createStartEmbed(
            '✏️ Така назва вже зайнята',
            `На цьому сервері вже є клуб **${escapeMarkdown(clubName)}**. Запусти \`/start\` ще раз і вигадай іншу назву.`,
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
        .setLabel('Використати аватар профілю')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`start-image:upload:${interaction.user.id}:${interaction.id}`)
        .setLabel('Завантажити своє зображення')
        .setStyle(ButtonStyle.Primary),
    );
    await interaction.reply({
      embeds: [
        createStartEmbed(
          '🖼️ Обери зображення клубу',
          `Назву **${escapeMarkdown(clubName)}** збережено. Вибери аватар профілю або завантаж власне зображення.`,
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
        content: 'Цей вибір зображення призначений іншому гравцеві.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const key = getPendingStartKey(interaction.guildId, interaction.user.id);
    const pending = pendingStarts.get(key);
    if (!pending || pending.requestId !== requestId) {
      await interaction.reply({
        content: 'Час вибору зображення минув. Запусти `/start` ще раз.',
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
        content: 'Невідомий варіант зображення. Запусти `/start` ще раз.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    clearPendingStart(interaction.guildId, interaction.user.id);
    await createClub(interaction, pending.clubName, 'profile', null);
  },
};
