const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const users = require('../../database/users');
const zonesConfig = require('../../data/zones');
const { syncZoneRoles } = require('../../services/roleSync');
const formatMoney = require('../../utils/formatMoney');

const maxAdminBalance = 1_000_000_000;

async function beginAdminCommand(interaction) {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: 'Команды администратора доступны только на сервере.',
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  if (!process.env.CREATORID || interaction.user.id !== process.env.CREATORID) {
    await interaction.reply({
      content: 'Эти команды доступны только владельцу бота.',
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  return true;
}

async function fetchTargetMember(interaction, userId) {
  try {
    return await interaction.guild.members.fetch(userId);
  } catch (error) {
    if (error && (error.code === 10007 || error.status === 404)) return null;
    throw error;
  }
}

function zoneRoleWarning(result) {
  return result.failed.length > 0
    ? `\n⚠️ Не удалось синхронизировать роли: ${result.failed.join(', ')}.`
    : '';
}

const giveCommand = {
  data: new SlashCommandBuilder()
    .setName('give')
    .setDescription('Выдать монеты игроку (только владелец бота)')
    .addUserOption(option =>
      option.setName('player').setDescription('Игрок').setRequired(true))
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('Сколько монет выдать')
        .setMinValue(1)
        .setMaxValue(maxAdminBalance)
        .setRequired(true)),

  async execute(interaction) {
    if (!await beginAdminCommand(interaction)) return;

    const target = interaction.options.getUser('player', true);
    const amount = interaction.options.getInteger('amount', true);
    const result = users.giveBalance(interaction.guildId, target.id, amount);
    const messages = {
      ok: `✅ Выдано ${formatMoney(amount)} игроку <@${target.id}>. Новый баланс: ${formatMoney(result.balance)}.`,
      'not-registered': `Игрок <@${target.id}> ещё не создал клуб.`,
      'invalid-amount': 'Сумма должна быть положительным целым числом.',
      'balance-limit': 'После начисления баланс превысит безопасный предел.',
    };
    await interaction.editReply({ content: messages[result.status] });
  },
};

const changeCommand = {
  data: new SlashCommandBuilder()
    .setName('change')
    .setDescription('Изменить баланс или уровень зоны (только владелец бота)')
    .addSubcommand(subcommand =>
      subcommand
        .setName('balance')
        .setDescription('Установить баланс игрока')
        .addUserOption(option =>
          option.setName('player').setDescription('Игрок').setRequired(true))
        .addIntegerOption(option =>
          option
            .setName('amount')
            .setDescription('Новый баланс')
            .setMinValue(0)
            .setMaxValue(maxAdminBalance)
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('zone')
        .setDescription('Установить уровень зоны игрока')
        .addUserOption(option =>
          option.setName('player').setDescription('Игрок').setRequired(true))
        .addStringOption(option => {
          option.setName('zone').setDescription('Игровая зона').setRequired(true);
          for (const [zoneId, zone] of Object.entries(zonesConfig.zones)) {
            option.addChoices({ name: zone.name, value: zoneId });
          }
          return option;
        })
        .addIntegerOption(option =>
          option
            .setName('level')
            .setDescription('Новый уровень зоны')
            .setMinValue(zonesConfig.startingLevel)
            .setMaxValue(zonesConfig.maxLevel)
            .setRequired(true))),

  async execute(interaction) {
    if (!await beginAdminCommand(interaction)) return;

    const subcommand = interaction.options.getSubcommand();
    const target = interaction.options.getUser('player', true);
    if (subcommand === 'balance') {
      const amount = interaction.options.getInteger('amount', true);
      const result = users.setBalance(interaction.guildId, target.id, amount);
      const messages = {
        ok: `✅ Баланс игрока <@${target.id}> установлен на ${formatMoney(result.balance)}.`,
        'not-registered': `Игрок <@${target.id}> ещё не создал клуб.`,
        'invalid-amount': 'Баланс должен быть неотрицательным целым числом.',
      };
      await interaction.editReply({ content: messages[result.status] });
      return;
    }

    if (subcommand === 'zone') {
      if (!users.getPlayer(interaction.guildId, target.id)) {
        await interaction.editReply({ content: `Игрок <@${target.id}> ещё не создал клуб.` });
        return;
      }

      const member = await fetchTargetMember(interaction, target.id);
      if (!member) {
        await interaction.editReply({ content: 'Игрок должен состоять на этом сервере, чтобы синхронизировать роли.' });
        return;
      }

      const zoneId = interaction.options.getString('zone', true);
      const level = interaction.options.getInteger('level', true);
      const result = users.setZoneLevel(interaction.guildId, target.id, zoneId, level);
      if (result.status === 'unchanged') {
        await interaction.editReply({ content: `Уровень зоны уже равен ${level}; изменений нет.` });
        return;
      }
      if (result.status !== 'ok') {
        await interaction.editReply({ content: 'Не удалось изменить уровень зоны. Проверьте игрока, зону и уровень.' });
        return;
      }

      const player = users.getPlayer(interaction.guildId, target.id);
      const roles = await syncZoneRoles(member, player.zones);
      const zone = zonesConfig.zones[zoneId];
      await interaction.editReply({
        content: `✅ Уровень зоны «${zone.name}» игрока <@${target.id}> изменён: ` +
          `${result.previousLevel} → ${result.level}. Ненакопленный доход сброшен, чтобы избежать начисления задним числом.` +
          zoneRoleWarning(roles),
      });
    }
  },
};

const resetCommand = {
  data: new SlashCommandBuilder()
    .setName('reset')
    .setDescription('Сбросить игровой прогресс игрока (только владелец бота)')
    .addUserOption(option =>
      option.setName('player').setDescription('Игрок').setRequired(true))
    .addBooleanOption(option =>
      option
        .setName('confirm')
        .setDescription('Подтвердить сброс баланса, зон и статистики')
        .setRequired(true)),

  async execute(interaction) {
    if (!await beginAdminCommand(interaction)) return;

    if (!interaction.options.getBoolean('confirm', true)) {
      await interaction.editReply({ content: 'Сброс отменён.' });
      return;
    }

    const target = interaction.options.getUser('player', true);
    if (!users.getPlayer(interaction.guildId, target.id)) {
      await interaction.editReply({ content: `Игрок <@${target.id}> ещё не создал клуб.` });
      return;
    }

    const member = await fetchTargetMember(interaction, target.id);
    if (!member) {
      await interaction.editReply({ content: 'Игрок должен состоять на этом сервере, чтобы сбросить прогресс.' });
      return;
    }

    const result = users.resetPlayer(interaction.guildId, target.id);
    if (result.status !== 'ok') {
      await interaction.editReply({ content: 'Не удалось сбросить прогресс игрока.' });
      return;
    }

    const player = users.getPlayer(interaction.guildId, target.id);
    const roles = await syncZoneRoles(member, player.zones);
    await interaction.editReply({
      content: `✅ Прогресс игрока <@${target.id}> сброшен: баланс ${formatMoney(zonesConfig.startingBalance)}, ` +
        `зоны уровня ${zonesConfig.startingLevel}, счётчики гостей обнулены. Название и изображение клуба сохранены.` +
        zoneRoleWarning(roles),
    });
  },
};

module.exports = [giveCommand, changeCommand, resetCommand];