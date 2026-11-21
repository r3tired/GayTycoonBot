const { Events } = require('discord.js');
const { syncRoles } = require('../services/roleSync');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`Bot is ready as ${client.user.tag}`);

    // 1. Спочатку команди
    try {
      const commands = [...client.commands.values()].map(c => c.data.toJSON());
      for (const guild of client.guilds.cache.values()) {
        await guild.commands.set(commands);
        console.log(`[${guild.name}] registered commands: ${commands.length}`);
      }
    } catch (err) {
      console.error('❌ Error registering commands:', err);
    }

    // 2. Потім ролі
    for (const guild of client.guilds.cache.values()) {
      try {
        const res = await syncRoles(guild);
        console.log(
          `[${guild.name}] roles: +${res.created} created, ~${res.updated} updated, ` +
          `${res.skipped} unchanged, ${res.failed} errors`
        );
      } catch (err) {
        console.error(`❌ Error syncing roles for ${guild.name}:`, err);
      }
    }
  },
};
