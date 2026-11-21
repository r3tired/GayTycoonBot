const fs = require('node:fs');
const path = require('node:path');
const { AttachmentBuilder, EmbedBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const economy = require('../services/economyService');
const { syncZoneRoles } = require('../services/roleSync');
const zonesConfig = require('../data/zones');
const formatMoney = require('../utils/formatMoney');
const formatCount = require('../utils/formatCount');
const { getClubImagePath } = require('../utils/clubImage');

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

    let imageAttachment;
    let imageMissing = false;
    if (player.clubImageSource === 'upload' && player.clubImageFilename) {
      const imagePath = getClubImagePath(player.clubImageFilename);
      if (fs.existsSync(imagePath)) {
        const filename = path.basename(imagePath);
        imageAttachment = new AttachmentBuilder(imagePath, { name: filename });
      } else {
        imageMissing = true;
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x00eeff)
      .setTitle(`🏰 ${player.clubName ?? `Клуб ${interaction.user.username}`}`)
      .setThumbnail(
        imageAttachment
          ? `attachment://${imageAttachment.name}`
          : interaction.user.displayAvatarURL(),
      )
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

    const notices = [];
    if (!player.clubName) notices.push('У клуба ще немає назви. Задай її командою `/rename`.');
    if (imageMissing) {
      notices.push('Зображення клубу не знайдено; показано аватар профілю замість нього.');
    }
    if (notices.length > 0) embed.setDescription(notices.join('\n'));

    const response = { embeds: [embed] };
    if (imageAttachment) response.files = [imageAttachment];
    await interaction.editReply(response);
  },
};
