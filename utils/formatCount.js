const formatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

module.exports = value => formatter.format(value);
