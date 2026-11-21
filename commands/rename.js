const { MessageFlags, SlashCommandBuilder, escapeMarkdown } = require('discord.js');
const { getPlayer, setClubName } = require('../database/users');
const { validateClubName } = require('../utils/clubName');
const { CLUB_NAME_FIELD, createClubNameModal } = require('../utils/clubNameModal');

const modalId = 'rename-club-name';

module.exports = {
  modalId,
  data: new SlashCommandBuilder()
    .setName('rename')
    .setDescription('Изменить название своего гей-клуба'),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: 'Менять название можно только на сервере.', flags: MessageFlags.Ephemeral });
      return;
    }

    const player = getPlayer(interaction.guildId, interaction.user.id);
    if (!player) {
      await interaction.reply({ content: 'Сначала создай клуб командой `/start`.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.showModal(createClubNameModal(modalId, 'Нова назва клубу', player.clubName));
  },

  async handleModal(interaction) {
    if (!interaction.inGuild()) return;

    const check = validateClubName(interaction.fields.getTextInputValue(CLUB_NAME_FIELD));
    if (!check.ok) {
      await interaction.reply({ content: `✏️ ${check.reason} Запусти \`/rename\` ещё раз.`, flags: MessageFlags.Ephemeral });
      return;
    }

    const result = setClubName(interaction.guildId, interaction.user.id, check.name);
    const messages = {
      ok: `✅ Теперь твой клуб называется **${escapeMarkdown(check.name)}**.`,
      'name-taken': '✏️ Это название уже занято. Запусти `/rename` и придумай другое.',
      'not-registered': 'Сначала создай клуб командой `/start`.',
    };
    await interaction.reply({ content: messages[result.status], flags: MessageFlags.Ephemeral });
  },
};
