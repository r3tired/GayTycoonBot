const fs = require('node:fs');
const path = require('node:path');

// Логер підключаємо першим, щоб зловити будь-яку помилку, навіть при запуску
const logger = require('./utils/logger');
logger.hookConsole();

process.on('uncaughtException', error => {
  logger.error('КРИТИЧНА ПОМИЛКА (uncaughtException):', error);
  process.exit(1);
});
process.on('unhandledRejection', reason => {
  logger.error('Необроблена помилка промісу (unhandledRejection):', reason);
});

logger.info('=== Запуск бота ===');

const { Client, Collection, GatewayIntentBits } = require('discord.js');

require('dotenv').config({ path: path.join(__dirname, 'bot.env') });

const token = process.env.BOTTOKEN;
if (!token || token.startsWith('вставте')) {
  throw new Error('У bot.env не задано справжній BOTTOKEN');
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.on('error', error => logger.error('Помилка клієнта Discord:', error));
client.on('warn', message => logger.warn('Попередження Discord:', message));

// Команди (шукає .js і в підпапках)
client.commands = new Collection();

function loadCommands(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      loadCommands(fullPath);
    } else if (entry.name.endsWith('.js')) {
      try {
        const command = require(fullPath);
        if ('data' in command && 'execute' in command) {
          client.commands.set(command.data.name, command);
          logger.info(`Завантажено команду: /${command.data.name}`);
        } else {
          logger.warn(`Файл ${entry.name} без data/execute, пропущено`);
        }
      } catch (error) {
        logger.error(`Не вдалося завантажити команду ${entry.name}:`, error);
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
        logger.error(`Помилка в події ${event.name}:`, error);
      }
    };
    client[event.once ? 'once' : 'on'](event.name, handler);
    logger.info(`Завантажено подію: ${event.name}`);
  } catch (error) {
    logger.error(`Не вдалося завантажити подію ${file}:`, error);
  }
}

client.login(token).catch(error => {
  logger.error('Не вдалося увійти в Discord (перевір токен):', error);
  process.exit(1);
});
