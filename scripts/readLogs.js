// Читання логів у терміналі:
//   npm run logs          (останні 50 рядків)
//   npm run logs -- 200   (останні 200 рядків)
//   npm run logs -- errors (лише помилки)
const logger = require('../utils/logger');

const arg = process.argv[2];
const errorsOnly = arg === 'errors';
const n = errorsOnly ? 2000 : Number(arg) || 50;

let text = logger.tail(n);
if (errorsOnly) {
  text = text.split('\n').filter(l => l.includes('[ERROR]') || l.includes('[WARN]') || /^\s+at /.test(l)).join('\n');
}

console.log(text || `Лог порожній: ${logger.LOG_FILE}`);
