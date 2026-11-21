const { EmbedBuilder, MessageFlags, SlashCommandBuilder, escapeMarkdown } = require('discord.js');
const { giveGroupRoles, getMemberRolesFromOtherGroups } = require('../services/roleSync');
const { getPlayer, isClubNameTaken, runStartOnce } = require('../database/users');
const { validateClubName } = require('../utils/clubName');
const { CLUB_NAME_FIELD, createClubNameModal } = require('../utils/clubNameModal');
const zonesConfig = require('../data/zones');
const rolesConfig = require('../data/roles');

const group = 'beginner';
const startColor = 0x00eeff;
const modalId = 'start-club-name';

function createStartEmbed(title, description, color = startColor) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'Gay Tycoon • Група Beginner' })
    .setTimestamp();
}

module.exports = {
  modalId,
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

  // Крок 2: гравець надіслав назву, створюємо клуб і видаємо ролі
  async handleModal(interaction) {
    if (!interaction.inGuild()) return;

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

    // Видача ролей може тривати понад 3 секунди, тому одразу підтверджуємо відповідь
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const claim = await runStartOnce(interaction.guildId, interaction.user.id, async () => {
      const higherGroupRoles = await getMemberRolesFromOtherGroups(interaction.member, group);
      if (higherGroupRoles.length > 0) {
        return { completed: false, higherGroupRoles };
      }

      const result = await giveGroupRoles(interaction.member, group);
      return { completed: result.failed.length === 0, roles: result };
    }, clubName);

    if (claim.status === 'already-used') {
      await interaction.editReply({
        embeds: [
          createStartEmbed(
            '✅ Старт уже пройдено',
            'Ти вже використовував `/start`. Команда створює клуб лише один раз.',
          ),
        ],
      });
      return;
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
      return;
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
      return;
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
      return;
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
      return;
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
  },
};
