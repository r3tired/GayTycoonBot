const { EmbedBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const economy = require('../services/economyService');
const formatMoney = require('../utils/formatMoney');

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

    const embed = new EmbedBuilder()
      .setColor(0x00eeff)
      .setTitle('💰 Дохід зібрано')
      .setDescription(`На баланс надійшло **${formatMoney(result.earned)}**.`)
      .addFields(
        { name: '💵 Новий баланс', value: formatMoney(result.balance), inline: true },
        { name: '📈 Дохід на годину', value: formatMoney(result.hourlyIncome), inline: true },
      )
      .setFooter({ text: 'Дохід накопичується без часового ліміту.' });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
