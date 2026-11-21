const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Показать последние строки лога (только для владельца бота)')
    .addIntegerOption(option =>
      option
        .setName('lines')
        .setDescription('Сколько строк показать (1–200, по умолчанию 30)')
        .setMinValue(1)
        .setMaxValue(200)),

  async execute(interaction) {
    if (interaction.user.id !== process.env.CREATORID) {
      await interaction.reply({ content: 'Эта команда доступна только владельцу бота.', ephemeral: true });
      return;
    }

    const lines = interaction.options.getInteger('lines') ?? 30;
    const text = logger.tail(lines);

    if (!text) {
      await interaction.reply({ content: 'Лог пуст.', ephemeral: true });
      return;
    }

    if (text.length <= 1900) {
      await interaction.reply({ content: '```\n' + text + '\n```', ephemeral: true });
    } else {
      const file = new AttachmentBuilder(Buffer.from(text, 'utf8'), { name: 'bot.log' });
      await interaction.reply({ content: 'Лог слишком большой для сообщения, отправляю его файлом:', files: [file], ephemeral: true });
    }
  },
};
