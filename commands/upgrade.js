const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} = require('discord.js');
const economy = require('../services/economyService');
const formatMoney = require('../utils/formatMoney');

function createUpgradeView(player, userId, notice) {
  const embed = new EmbedBuilder()
    .setColor(0x00eeff)
    .setTitle('🔧 Прокачка зон')
    .setDescription(
      `${notice ? `${notice}\n\n` : ''}Баланс: **${formatMoney(player.balance)}**\n` +
      player.zones
        .map(zone => {
          return `**${zone.name}** — рівень ${zone.level}; наступний: ${zone.level + 1} за ` +
            `${formatMoney(zone.nextUpgradePrice)}. Дохід: ${formatMoney(zone.hourlyIncome)} → ` +
            `${formatMoney(zone.nextHourlyIncome)}/год.`;
        })
        .join('\n'),
    );

  const buttons = player.zones.map(zone =>
    new ButtonBuilder()
      .setCustomId(`zone-upgrade:${zone.zoneId}:${userId}`)
      .setLabel(`${zone.name} · ${formatMoney(zone.nextUpgradePrice)}`)
      .setStyle(ButtonStyle.Primary),
  );
  const row = new ActionRowBuilder().addComponents(buttons);

  return { embeds: [embed], components: [row] };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('upgrade')
    .setDescription('Прокачати одну з ігрових зон'),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: 'Прокачувати зони можна лише на сервері.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const player = economy.getPlayer(interaction.guildId, interaction.user.id);
    if (!player) {
      await interaction.reply({
        content: 'Спершу створи клуб командою `/start`.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      ...createUpgradeView(player, interaction.user.id),
      flags: MessageFlags.Ephemeral,
    });
  },

  async handleButton(interaction) {
    const [, zoneId, ownerId] = interaction.customId.split(':');
    if (!interaction.inGuild() || ownerId !== interaction.user.id || !zoneId) {
      await interaction.reply({
        content: 'Ця кнопка прокачки призначена іншому гравцеві.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const result = economy.upgradeZone(interaction.guildId, interaction.user.id, zoneId);
    if (result.status === 'not-registered') {
      await interaction.reply({
        content: 'Спершу створи клуб командою `/start`.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (result.status === 'zone-not-found') {
      await interaction.reply({
        content: 'Цю зону не знайдено. Запусти `/upgrade` ще раз.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (result.status === 'insufficient-funds') {
      await interaction.reply({
        content: `Недостатньо коштів: потрібно ${formatMoney(result.price)}, у тебе ${formatMoney(result.balance)}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const player = economy.getPlayer(interaction.guildId, interaction.user.id);
    await interaction.update(createUpgradeView(
      player,
      interaction.user.id,
      `✅ Зону прокачано до рівня ${result.level} за ${formatMoney(result.price)}.`,
    ));
  },
};
