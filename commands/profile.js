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
    .setDescription('Посмотреть баланс и уровни своих зон'),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: 'Профиль доступен только на сервере.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const player = economy.getPlayer(interaction.guildId, interaction.user.id);
    if (!player) {
      await interaction.reply({
        content: 'Сначала создай клуб командой `/start`.',
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
          name: '👥 Посещаемость',
          value: `${formatCount(player.visitorsPerHour)} гостей/ч`,
          inline: true,
        },
        {
          name: '📊 Всего посетителей',
          value: `${formatCount(player.totalGuests)}\n💎 Богатых: ${formatCount(player.richGuests)}`,
          inline: true,
        },
        {
          name: '🎭 Зоны',
          value: player.zones
            .map(zone => `**${zone.name}** — уровень ${zone.level}/${zonesConfig.maxLevel} (${formatCount(zone.visitorsPerHour)} гостей/ч)`)
            .join('\n'),
        },
        {
          name: '📅 Регистрация',
          value: `<t:${Math.floor(player.registeredAt / 1000)}:D>`,
          inline: true,
        },
      )
      .setFooter({ text: 'Gay Tycoon' });

    const notices = [];
    if (!player.clubName) notices.push('У клуба пока нет названия. Задай его командой `/rename`.');
    if (imageMissing) {
      notices.push('Изображение клуба не найдено; вместо него показан аватар профиля.');
    }
    if (notices.length > 0) embed.setDescription(notices.join('\n'));

    const response = { embeds: [embed] };
    if (imageAttachment) response.files = [imageAttachment];
    await interaction.editReply(response);
  },
};
