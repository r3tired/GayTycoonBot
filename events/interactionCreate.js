const { Events, MessageFlags } = require('discord.js');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.isButton() && interaction.customId.startsWith('zone-upgrade:')) {
      const command = interaction.client.commands.get('upgrade');
      if (!command) return;

      try {
        await command.handleButton(interaction);
      } catch (error) {
        console.error('❌ Помилка прокачки зони:', error);
        const response = {
          content: 'Не вдалося прокачати зону. Спробуй ще раз пізніше.',
          flags: MessageFlags.Ephemeral,
        };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(response);
        } else {
          await interaction.reply(response);
        }
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      const command = interaction.client.commands.find(candidate => candidate.modalId === interaction.customId);
      if (!command) return;

      try {
        await command.handleModal(interaction);
      } catch (error) {
        console.error(`❌ Помилка модального вікна ${interaction.customId}:`, error);
        const response = {
          content: 'Не вдалося обробити форму. Спробуй ще раз пізніше.',
          flags: MessageFlags.Ephemeral,
        };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(response);
        } else {
          await interaction.reply(response);
        }
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`❌ Помилка виконання /${interaction.commandName}:`, error);

      const response = {
        content: 'Не вдалося виконати команду. Спробуй ще раз пізніше.',
        flags: MessageFlags.Ephemeral,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(response);
      } else {
        await interaction.reply(response);
      }
    }
  },
};
