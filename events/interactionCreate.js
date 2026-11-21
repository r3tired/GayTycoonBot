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
        console.error('❌ Error handling zone upgrade:', error);
        const response = {
          content: 'Failed to upgrade zone. Please try again later or contact an administrator.',
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
      console.error(`❌ Error executing /${interaction.commandName}:`, error);

      const response = {
        content: 'Failed to execute command. Please try again later or contact an administrator.',
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
