const { EmbedBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const economy = require('../services/economyService');
const formatMoney = require('../utils/formatMoney');
const formatCount = require('../utils/formatCount');
const guestsConfig = require('../data/guests');
const guestTypes = guestsConfig.types;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('collect')
    .setDescription('Зібрати пасивний дохід свого клубу'),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: 'Збирати дохід можна лише на сервері.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const result = economy.collectIncome(interaction.guildId, interaction.user.id);
    if (!result) {
      await interaction.reply({
        content: 'Спершу створи клуб командою `/start`.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const elapsedHours = formatCount(result.elapsedMs / 3_600_000);
    const guestSummary =
      `${formatCount(result.regularGuests)} ${guestTypes.regular.name}, ` +
      `${formatCount(result.mediumGuests)} ${guestTypes.medium.name}, ` +
      `${formatCount(result.richGuests)} ${guestTypes.rich.name} 💎`;
    const embed = new EmbedBuilder()
      .setColor(0x00eeff)
      .setTitle('🪩 Відвідуваність клубу')
      .setDescription(
        `За **${elapsedHours} год** прийшло **${formatCount(result.totalGuests)} гостей**: ${guestSummary}.\n` +
        `Зароблено **${formatMoney(result.earned)}**` +
        (result.tips > 0 ? ` (чайові від багатих: ${formatMoney(result.tips)})` : '') +
        '.',
      )
      .addFields(
        { name: '💵 Баланс', value: formatMoney(result.balance), inline: true },
      )
      .setFooter({
        text: `Дохід накопичується максимум за ${guestsConfig.maxAccumulationHours} годин.`,
      });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
