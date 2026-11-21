const { Events } = require('discord.js');
const { syncRoles } = require('../services/roleSync');

module.exports = {
  name: Events.GuildCreate,
  async execute(guild) {
    try {
      // Реєструємо команди на новому сервері
      const commands = [...guild.client.commands.values()].map(c => c.data.toJSON());
      await guild.commands.set(commands);
      await syncRoles(guild);
    } catch (err) {
      console.error(`❌ Помилка налаштування сервера ${guild.name}:`, err);
    }
  },
};
