// Calibrated to the original 90/9/1 guest mix and current expected hourly income.
module.exports = {
  startingBalance: 1000,
  startingLevel: 1,
  maxLevel: 3,
  zones: {
    strip: {
      name: 'Стриптиз',
      color: '#ec4899',
      basePrice: 250,
      baseGuestsPerHour: 20,
      averageCheck: 20 / (20 * 1.32),
      priceGrowth: 1.5,
      guestsGrowth: 1.35,
    },
    bar: {
      name: 'Бар',
      color: '#f59e0b',
      basePrice: 200,
      baseGuestsPerHour: 30,
      averageCheck: 15 / (30 * 1.32),
      priceGrowth: 1.5,
      guestsGrowth: 1.35,
    },
    vip: {
      name: 'VIP',
      color: '#8b5cf6',
      basePrice: 500,
      baseGuestsPerHour: 10,
      averageCheck: 40 / (10 * 1.32),
      priceGrowth: 1.5,
      guestsGrowth: 1.35,
    },
    chill: {
      name: 'Зона отдыха',
      roleName: 'Чіл', // Сохраняем старые имена ролей, чтобы не создавать дубликаты.
      color: '#10b981',
      basePrice: 150,
      baseGuestsPerHour: 20,
      averageCheck: 10 / (20 * 1.32),
      priceGrowth: 1.5,
      guestsGrowth: 1.35,
    },
  },
};
