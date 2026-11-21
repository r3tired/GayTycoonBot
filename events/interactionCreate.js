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
        console.error('Zone upgrade failed:', error);
        const response = {
          content: 'Не удалось улучшить зону. Попробуй позже.',
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

    if (interaction.isButton() && interaction.customId.startsWith('start-image:')) {
      const command = interaction.client.commands.get('start');
      if (!command) return;

      try {
        await command.handleImageChoice(interaction);
      } catch (error) {
        console.error('Club image selection failed:', error);
        const response = {
          content: 'Не удалось выбрать изображение клуба. Запусти `/start` ещё раз.',
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
      const command = interaction.client.commands.find(candidate =>
        candidate.modalId === interaction.customId ||
        (Array.isArray(candidate.modalIds) && candidate.modalIds.includes(interaction.customId)) ||
        (candidate.modalPrefix && interaction.customId.startsWith(candidate.modalPrefix))
      );
      if (!command) return;

      try {
        await command.handleModal(interaction);
      } catch (error) {
        console.error(`Modal submission failed for ${interaction.customId}:`, error);
        const response = {
          content: 'Не удалось обработать форму. Попробуй позже.',
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
      console.error(`Command execution failed for /${interaction.commandName}:`, error);

      const response = {
        content: 'Не удалось выполнить команду. Попробуй позже.',
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
