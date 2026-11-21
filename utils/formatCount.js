const formatter = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 1 });

module.exports = value => formatter.format(value);
