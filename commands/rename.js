const { MessageFlags, SlashCommandBuilder, escapeMarkdown } = require('discord.js');
const { getPlayer, setClubName } = require('../database/users');
const { validateClubName } = require('../utils/clubName');
const { CLUB_NAME_FIELD, createClubNameModal } = require('../utils/clubNameModal');

const modalId = 'rename-club-name';

module.exports = {
  modalId,
  data: new SlashCommandBuilder()
    .setName('rename')
    .setDescription('Змінити назву свого гей-клубу'),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: 'Змінювати назву можна лише на сервері.', flags: MessageFlags.Ephemeral });
      return;
    }

    const player = getPlayer(interaction.guildId, interaction.user.id);
    if (!player) {
      await interaction.reply({ content: 'Спершу створи клуб командою `/start`.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.showModal(createClubNameModal(modalId, 'Нова назва клубу', player.clubName));
  },

  async handleModal(interaction) {
    if (!interaction.inGuild()) return;

    const check = validateClubName(interaction.fields.getTextInputValue(CLUB_NAME_FIELD));
    if (!check.ok) {
      await interaction.reply({ content: `✏️ ${check.reason} Запусти \`/rename\` ще раз.`, flags: MessageFlags.Ephemeral });
      return;
    }

    const result = setClubName(interaction.guildId, interaction.user.id, check.name);
    const messages = {
      ok: `✅ Тепер твій клуб називається **${escapeMarkdown(check.name)}**.`,
      'name-taken': '✏️ Така назва вже зайнята. Запусти `/rename` ще раз і вигадай іншу.',
      'not-registered': 'Спершу створи клуб командою `/start`.',
    };
    await interaction.reply({ content: messages[result.status], flags: MessageFlags.Ephemeral });
  },
};
