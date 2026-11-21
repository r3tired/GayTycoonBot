const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} = require('discord.js');
const economy = require('../services/economyService');
const { syncZoneRoles } = require('../services/roleSync');
const zonesConfig = require('../data/zones');
const { zoneRoleName } = require('../utils/zoneRoles');
const formatMoney = require('../utils/formatMoney');
const formatCount = require('../utils/formatCount');

const roleWarning = failed =>
  `⚠️ Не удалось обновить роли: ${failed.join(', ')}. ` +
  'Проверь, что у бота есть право «Управлять ролями» и его роль находится выше ролей зон.';

function createUpgradeView(player, userId, notice) {
  const allMaxed = player.zones.every(zone => zone.isMaxLevel);

  const lines = player.zones.map(zone => {
    const progress = `уровень ${zone.level}/${zonesConfig.maxLevel}`;
    if (zone.isMaxLevel) {
      return `**${zone.name}** — ${progress} 🏆 МАКС. Посещаемость: ${formatCount(zone.visitorsPerHour)} гостей/ч.`;
    }
    return `**${zone.name}** — ${progress}. Следующий уровень: ${formatMoney(zone.nextUpgradePrice)} ` +
      `(посещаемость ${formatCount(zone.visitorsPerHour)} → ` +
      `${formatCount(zone.nextVisitorsPerHour)} гостей/ч).`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x00eeff)
    .setTitle('🔧 Улучшение зон')
    .setDescription(
      `${notice ? `${notice}\n\n` : ''}Баланс: **${formatMoney(player.balance)}**\n\n` +
      lines.join('\n') +
      (allMaxed ? '\n\n🏆 Все зоны достигли максимального уровня!' : ''),
    );

  const buttons = player.zones.map(zone =>
    new ButtonBuilder()
      .setCustomId(`zone-upgrade:${zone.zoneId}:${userId}`)
      .setLabel(zone.isMaxLevel ? `${zone.name} · МАКС` : `${zone.name} · ${formatMoney(zone.nextUpgradePrice)}`)
      .setStyle(zone.isMaxLevel ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(zone.isMaxLevel),
  );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(buttons)] };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('upgrade')
    .setDescription('Улучшить одну из игровых зон'),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: 'Улучшать зоны можно только на сервере.',
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

    // Підстраховка: якщо ролі розійшлись із рівнями в базі (наприклад, роль зняли вручну), вирівнюємо
    const roles = await syncZoneRoles(interaction.member, player.zones);
    const notice = roles.failed.length > 0 ? roleWarning(roles.failed) : undefined;

    await interaction.editReply(createUpgradeView(player, interaction.user.id, notice));
  },

  async handleButton(interaction) {
    const [, zoneId, ownerId] = interaction.customId.split(':');
    if (!interaction.inGuild() || ownerId !== interaction.user.id || !zoneId) {
      await interaction.reply({
        content: 'Эта кнопка улучшения предназначена другому игроку.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Зміна ролей у Discord може тривати понад 3 секунди, тому одразу підтверджуємо натискання
    await interaction.deferUpdate();

    const result = economy.upgradeZone(interaction.guildId, interaction.user.id, zoneId);

    if (result.status === 'not-registered') {
      await interaction.followUp({
        content: 'Сначала создай клуб командой `/start`.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (result.status === 'zone-not-found') {
      await interaction.followUp({
        content: 'Эта зона не найдена. Запусти `/upgrade` ещё раз.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const player = economy.getPlayer(interaction.guildId, interaction.user.id);
    const zone = zonesConfig.zones[zoneId];

    if (result.status === 'max-level') {
      await interaction.editReply(createUpgradeView(
        player,
        interaction.user.id,
        `🏆 Зона «${zone.name}» уже максимального уровня.`,
      ));
      return;
    }
    if (result.status === 'insufficient-funds') {
      const collectionNotice = result.totalGuests > 0
        ? ` За это время пришло ${formatCount(result.totalGuests)} гостей, заработано ${formatMoney(result.earned)}.`
        : '';
      await interaction.editReply(createUpgradeView(
        player,
        interaction.user.id,
        `❌ Недостаточно средств: нужно ${formatMoney(result.price)}, у тебя ${formatMoney(result.balance)}.` +
        collectionNotice,
      ));
      return;
    }

    // Гроші вже списано, тепер міняємо роль зони: «Бар Зона 1» → «Бар Зона 2»
    const roles = await syncZoneRoles(interaction.member, player.zones);
    let notice = `✅ Зона «${zone.name}» улучшена до уровня ${result.level} за ${formatMoney(result.price)}. ` +
      `Новая роль: **${zoneRoleName(zone, result.level)}**.`;
    if (result.totalGuests > 0) {
      notice += `\nЗа это время пришло ${formatCount(result.totalGuests)} гостей, заработано ${formatMoney(result.earned)}.`;
    }
    if (roles.failed.length > 0) notice += `\n${roleWarning(roles.failed)}`;

    await interaction.editReply(createUpgradeView(player, interaction.user.id, notice));
  },
};
