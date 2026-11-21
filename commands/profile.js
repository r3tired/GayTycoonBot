const { EmbedBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const economy = require('../services/economyService');
const { syncZoneRoles } = require('../services/roleSync');
const zonesConfig = require('../data/zones');
const formatMoney = require('../utils/formatMoney');
const formatCount = require('../utils/formatCount');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Переглянути баланс і рівні своїх зон'),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: 'Профіль доступний лише на сервері.',
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

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await syncZoneRoles(interaction.member, player.zones);

    const embed = new EmbedBuilder()
      .setColor(0x00eeff)
      .setTitle(`🏰 ${player.clubName ?? `Клуб ${interaction.user.username}`}`)
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        { name: '💵 Баланс', value: formatMoney(player.balance), inline: true },
        {
          name: '👥 Відвідуваність',
          value: `${formatCount(player.visitorsPerHour)} гостей/год`,
          inline: true,
        },
        {
          name: '📊 Усього гостей',
          value: `${formatCount(player.totalGuests)}\n💎 Багатих: ${formatCount(player.richGuests)}`,
          inline: true,
        },
        {
          name: '🎭 Зони',
          value: player.zones
            .map(zone => `**${zone.name}** — рівень ${zone.level}/${zonesConfig.maxLevel} (${formatCount(zone.visitorsPerHour)} гостей/год)`)
            .join('\n'),
        },
        {
          name: '📅 Реєстрація',
          value: `<t:${Math.floor(player.registeredAt / 1000)}:D>`,
          inline: true,
        },
      )
      .setFooter({ text: 'Gay Tycoon' });

    if (!player.clubName) {
      embed.setDescription('У клуба ще немає назви. Задай її командою `/rename`.');
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
