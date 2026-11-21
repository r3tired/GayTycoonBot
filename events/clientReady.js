const { Events } = require('discord.js');
const { syncRoles } = require('../services/roleSync');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`Бот запущений як ${client.user.tag}`);

    // 1. Спочатку команди
    try {
      const commands = [...client.commands.values()].map(c => c.data.toJSON());
      for (const guild of client.guilds.cache.values()) {
        await guild.commands.set(commands);
        console.log(`[${guild.name}] зареєстровано команд: ${commands.length}`);
      }
    } catch (err) {
      console.error('❌ Помилка реєстрації команд:', err);
    }

    // 2. Потім ролі
    for (const guild of client.guilds.cache.values()) {
      try {
        const res = await syncRoles(guild);
        console.log(
          `[${guild.name}] ролі: +${res.created} створено, ~${res.updated} оновлено, ` +
          `${res.skipped} без змін, ${res.failed} помилок`
        );
      } catch (err) {
        console.error(`❌ Помилка ролей на ${guild.name}:`, err);
      }
    }
  },
};
