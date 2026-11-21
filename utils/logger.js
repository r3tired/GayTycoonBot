const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'bot.log');
const MAX_SIZE = 2 * 1024 * 1024; // 2 МБ, потім файл ротується

fs.mkdirSync(LOG_DIR, { recursive: true });

function rotateIfNeeded() {
  try {
    if (fs.statSync(LOG_FILE).size > MAX_SIZE) {
      fs.renameSync(LOG_FILE, path.join(LOG_DIR, 'bot.old.log'));
    }
  } catch {
    // файлу ще немає
  }
}

function format(level, args) {
  const time = new Date().toLocaleString('sv-SE'); // 2026-11-21 14:05:09
  const text = args
    .map(a => (a instanceof Error ? (a.stack || a.message) : typeof a === 'string' ? a : util.inspect(a, { depth: 4 })))
    .join(' ');
  return `[${time}] [${level}] ${text}\n`;
}

function write(level, args) {
  try {
    rotateIfNeeded();
    fs.appendFileSync(LOG_FILE, format(level, args)); // синхронно, щоб запис не втратився при падінні
  } catch {
    // логер не має валити бота
  }
}

const original = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

const logger = {
  LOG_FILE,
  info: (...args) => { original.log(...args); write('INFO', args); },
  warn: (...args) => { original.warn(...args); write('WARN', args); },
  error: (...args) => { original.error(...args); write('ERROR', args); },

  // Усі console.log/warn/error у проєкті теж потраплять у файл
  hookConsole() {
    console.log = (...args) => { original.log(...args); write('INFO', args); };
    console.warn = (...args) => { original.warn(...args); write('WARN', args); };
    console.error = (...args) => { original.error(...args); write('ERROR', args); };
  },

  // Останні n рядків логу
  tail(n = 30) {
    try {
      const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
      return lines.slice(-n).join('\n');
    } catch {
      return '';
    }
  },
};

module.exports = logger;
