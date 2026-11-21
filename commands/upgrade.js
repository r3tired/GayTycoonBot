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
  `⚠️ Не вдалося оновити ролі: ${failed.join(', ')}. ` +
  'Перевір, що в бота є право «Керувати ролями» і його роль стоїть вище за ролі зон.';

function createUpgradeView(player, userId, notice) {
  const allMaxed = player.zones.every(zone => zone.isMaxLevel);

  const lines = player.zones.map(zone => {
    const progress = `рівень ${zone.level}/${zonesConfig.maxLevel}`;
    if (zone.isMaxLevel) {
      return `**${zone.name}** — ${progress} 🏆 MAX. Відвідуваність: ${formatCount(zone.visitorsPerHour)} гостей/год.`;
    }
    return `**${zone.name}** — ${progress}. Далі: ${formatMoney(zone.nextUpgradePrice)} ` +
      `(відвідуваність ${formatCount(zone.visitorsPerHour)} → ` +
      `${formatCount(zone.nextVisitorsPerHour)} гостей/год).`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x00eeff)
    .setTitle('🔧 Прокачка зон')
    .setDescription(
      `${notice ? `${notice}\n\n` : ''}Баланс: **${formatMoney(player.balance)}**\n\n` +
      lines.join('\n') +
      (allMaxed ? '\n\n🏆 Усі зони на максимальному рівні!' : ''),
    );

  const buttons = player.zones.map(zone =>
    new ButtonBuilder()
      .setCustomId(`zone-upgrade:${zone.zoneId}:${userId}`)
      .setLabel(zone.isMaxLevel ? `${zone.name} · MAX` : `${zone.name} · ${formatMoney(zone.nextUpgradePrice)}`)
      .setStyle(zone.isMaxLevel ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(zone.isMaxLevel),
  );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(buttons)] };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('upgrade')
    .setDescription('Прокачати одну з ігрових зон'),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: 'Прокачувати зони можна лише на сервері.',
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

    // Підстраховка: якщо ролі розійшлись із рівнями в базі (наприклад, роль зняли вручну), вирівнюємо
    const roles = await syncZoneRoles(interaction.member, player.zones);
    const notice = roles.failed.length > 0 ? roleWarning(roles.failed) : undefined;

    await interaction.editReply(createUpgradeView(player, interaction.user.id, notice));
  },

  async handleButton(interaction) {
    const [, zoneId, ownerId] = interaction.customId.split(':');
    if (!interaction.inGuild() || ownerId !== interaction.user.id || !zoneId) {
      await interaction.reply({
        content: 'Ця кнопка прокачки призначена іншому гравцеві.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Зміна ролей у Discord може тривати понад 3 секунди, тому одразу підтверджуємо натискання
    await interaction.deferUpdate();

    const result = economy.upgradeZone(interaction.guildId, interaction.user.id, zoneId);

    if (result.status === 'not-registered') {
      await interaction.followUp({
        content: 'Спершу створи клуб командою `/start`.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (result.status === 'zone-not-found') {
      await interaction.followUp({
        content: 'Цю зону не знайдено. Запусти `/upgrade` ще раз.',
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
        `🏆 Зона «${zone.name}» уже на максимальному рівні.`,
      ));
      return;
    }
    if (result.status === 'insufficient-funds') {
      const collectionNotice = result.totalGuests > 0
        ? ` За цей час прийшло ${formatCount(result.totalGuests)} гостей і зароблено ${formatMoney(result.earned)}.`
        : '';
      await interaction.editReply(createUpgradeView(
        player,
        interaction.user.id,
        `❌ Недостатньо коштів: потрібно ${formatMoney(result.price)}, у тебе ${formatMoney(result.balance)}.` +
        collectionNotice,
      ));
      return;
    }

    // Гроші вже списано, тепер міняємо роль зони: «Бар Зона 1» → «Бар Зона 2»
    const roles = await syncZoneRoles(interaction.member, player.zones);
    let notice = `✅ «${zone.name}» прокачано до рівня ${result.level} за ${formatMoney(result.price)}. ` +
      `Нова роль: **${zoneRoleName(zone, result.level)}**.`;
    if (result.totalGuests > 0) {
      notice += `\nЗа цей час прийшло ${formatCount(result.totalGuests)} гостей і зароблено ${formatMoney(result.earned)}.`;
    }
    if (roles.failed.length > 0) notice += `\n${roleWarning(roles.failed)}`;

    await interaction.editReply(createUpgradeView(player, interaction.user.id, notice));
  },
};
