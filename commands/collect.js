const { EmbedBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const economy = require('../services/economyService');
const formatMoney = require('../utils/formatMoney');
const formatCount = require('../utils/formatCount');
const guestsConfig = require('../data/guests');
const guestTypes = guestsConfig.types;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('collect')
    .setDescription('Собрать пассивный доход своего клуба'),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: 'Собирать доход можно только на сервере.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const result = economy.collectIncome(interaction.guildId, interaction.user.id);
    if (!result) {
      await interaction.reply({
        content: 'Сначала создай клуб командой `/start`.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const elapsedHours = formatCount(result.elapsedMs / 3_600_000);
    const guestSummary =
      `${guestTypes.regular.name}: ${formatCount(result.regularGuests)}, ` +
      `${guestTypes.medium.name}: ${formatCount(result.mediumGuests)}, ` +
      `${guestTypes.rich.name}: ${formatCount(result.richGuests)} 💎`;
    const embed = new EmbedBuilder()
      .setColor(0x00eeff)
      .setTitle('🪩 Посещаемость клуба')
      .setDescription(
        `За **${elapsedHours} ч** в клубе побывало **${formatCount(result.totalGuests)} человек**: ${guestSummary}.\n` +
        `Заработано **${formatMoney(result.earned)}**` +
        (result.tips > 0 ? ` (чаевые от богатых гостей: ${formatMoney(result.tips)})` : '') +
        '.',
      )
      .addFields(
        { name: '💵 Баланс', value: formatMoney(result.balance), inline: true },
      )
      .setFooter({
        text: `Доход накапливается максимум за ${guestsConfig.maxAccumulationHours} часов.`,
      });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
