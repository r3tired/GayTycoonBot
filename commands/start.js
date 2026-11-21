const { EmbedBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const { giveGroupRoles, getMemberRolesFromOtherGroups } = require('../services/roleSync');
const { runStartOnce } = require('../database/users');
const zonesConfig = require('../data/zones');
const rolesConfig = require('../data/roles');

const group = 'beginner';
const startColor = 0x00eeff;

function createStartEmbed(title, description, color = startColor) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'Gay Tycoon • Група Beginner' })
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('start')
    .setDescription('Отримати стартові ролі групи Beginner'),

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

    const claim = await runStartOnce(interaction.guildId, interaction.user.id, async () => {
      const higherGroupRoles = await getMemberRolesFromOtherGroups(interaction.member, group);
      if (higherGroupRoles.length > 0) {
        return { completed: false, higherGroupRoles };
      }

      const result = await giveGroupRoles(interaction.member, group);
      return { completed: result.failed.length === 0, roles: result };
    });

    if (claim.status === 'already-used') {
      await interaction.reply({
        embeds: [
          createStartEmbed(
            '✅ Старт уже пройден',
            'Ти вже використовував `/start`. Команда видає стартові ролі лише один раз.',
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (claim.status === 'in-progress') {
      await interaction.reply({
        embeds: [
          createStartEmbed(
            '⏳ Запит уже обробляється',
            'Зачекай трохи — бот уже видає тобі стартові ролі.',
          ),
        ],
        flags: MessageFlags.Ephemeral,
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
      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const result = claim.result.roles;
    const hasFailures = result.failed.length > 0;
    const embed = createStartEmbed(
      hasFailures ? '🌈 Твій старт майже готовий' : '🌈 Ласкаво просимо до Gay Tycoon!',
      result.assigned.length > 0
        ? `Привіт, ${interaction.user}! Твоя пригода починається — ось твої стартові ролі та ${zonesConfig.startingBalance} монет.`
        : `Привіт! Усі стартові ролі вже є — клуб створено з балансом ${zonesConfig.startingBalance} монет.`,
      hasFailures ? 0xffc857 : startColor,
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
    if (result.failed.length > 0) {
      embed.addFields({
        name: '⚠️ Не вдалося видати',
        value: `${result.failed.map(role => `• ${role}`).join('\n')}\nПеревір права та ієрархію ролей бота.`,
      });
    }

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  },
};
