const fs = require('node:fs');
const path = require('node:path');

// Логер підключаємо першим, щоб зловити будь-яку помилку, навіть при запуску
const logger = require('./utils/logger');
logger.hookConsole();

process.on('uncaughtException', error => {
  logger.error('❌ CRITICAL ERROR (uncaughtException):', error);
  process.exit(1);
});
process.on('unhandledRejection', reason => {
  logger.error('❌ UNHANDLED PROMISE REJECTION (unhandledRejection):', reason);
});

logger.info('=== Bot startup ===');

const { Client, Collection, GatewayIntentBits } = require('discord.js');

require('dotenv').config({ path: path.join(__dirname, 'bot.env'), quiet: true });

const token = process.env.BOTTOKEN;
if (!token || token.startsWith('вставте')) {
  throw new Error('BOTTOKEN is not configured in bot.env');
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.on('error', error => logger.error('❌ Error with Discord client:', error));
client.on('warn', message => logger.warn('❌ Discord warning:', message));

// Команди (шукає .js і в підпапках)
client.commands = new Collection();

function loadCommands(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      loadCommands(fullPath);
    } else if (entry.name.endsWith('.js')) {
      try {
        const loaded = require(fullPath);
        const commands = Array.isArray(loaded) ? loaded : [loaded];
        for (const command of commands) {
          if (command && typeof command === 'object' && 'data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            logger.info(`Loaded command: /${command.data.name}`);
          } else {
            logger.warn(`Command file ${entry.name} is missing data/execute and was skipped`);
          }
        }
      } catch (error) {
        logger.error(`Failed to load command ${entry.name}:`, error);
      }
    }
  }
}
loadCommands(path.join(__dirname, 'commands'));

// Події
const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'))) {
  try {
    const event = require(path.join(eventsPath, file));
    const handler = async (...args) => {
      try {
        await event.execute(...args);
      } catch (error) {
        logger.error(`❌ Error in event ${event.name}:`, error);
      }
    };
    client[event.once ? 'once' : 'on'](event.name, handler);
    logger.info(`Loaded event: ${event.name}`);
  } catch (error) {
    logger.error(`Failed to load event ${file}:`, error);
  }
}

client.login(token).catch(error => {
  logger.error('Failed to log in to Discord (check the bot token):', error);
  process.exit(1);
});
