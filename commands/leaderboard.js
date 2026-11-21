const { EmbedBuilder, MessageFlags, SlashCommandBuilder, escapeMarkdown } = require('discord.js');
const users = require('../database/users');
const formatMoney = require('../utils/formatMoney');

const leaderboardSize = 10;
const medals = ['🥇', '🥈', '🥉'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Показать 10 клубов с наибольшим балансом'),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: 'Таблица лидеров доступна только на сервере.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const players = users.getLeaderboard(interaction.guildId, leaderboardSize);
    const description = players.length > 0
      ? players.map((player, index) => {
        const rank = medals[index] ?? `${index + 1}.`;
        const clubName = escapeMarkdown(player.clubName ?? 'Без названия');
        return `${rank} <@${player.userId}> — **${formatMoney(player.balance)}**\n　${clubName}`;
      }).join('\n')
      : 'Пока никто не создал клуб. Запусти `/start`, чтобы попасть в рейтинг.';

    const embed = new EmbedBuilder()
      .setColor(0x00eeff)
      .setTitle('🏆 Топ клубов по балансу')
      .setDescription(description)
      .setFooter({ text: `Рейтинг этого сервера · топ-${leaderboardSize}` });

    await interaction.reply({ embeds: [embed] });
  },
};
