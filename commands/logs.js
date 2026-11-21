const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Показати останні рядки логу (лише для власника бота)')
    .addIntegerOption(option =>
      option
        .setName('lines')
        .setDescription('Скільки рядків показати (1-200, за замовчуванням 30)')
        .setMinValue(1)
        .setMaxValue(200)),

  async execute(interaction) {
    if (interaction.user.id !== process.env.CREATORID) {
      await interaction.reply({ content: 'Ця команда лише для власника бота.', ephemeral: true });
      return;
    }

    const lines = interaction.options.getInteger('lines') ?? 30;
    const text = logger.tail(lines);

    if (!text) {
      await interaction.reply({ content: 'Лог порожній.', ephemeral: true });
      return;
    }

    if (text.length <= 1900) {
      await interaction.reply({ content: '```\n' + text + '\n```', ephemeral: true });
    } else {
      const file = new AttachmentBuilder(Buffer.from(text, 'utf8'), { name: 'bot.log' });
      await interaction.reply({ content: 'Лог завеликий для повідомлення, надсилаю файлом:', files: [file], ephemeral: true });
    }
  },
};
