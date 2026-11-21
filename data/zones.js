module.exports = {
  startingBalance: 1000,
  startingLevel: 1,
  maxLevel: 3, // рівнів у кожної зони; для кожного рівня є своя роль («Бар Зона 1..3»)
  zones: {
    strip: {
      name: 'Стриптиз',
      color: '#ec4899',
      basePrice: 250,
      baseIncomePerHour: 20,
      priceGrowth: 1.5,
      incomeGrowth: 1.35,
    },
    bar: {
      name: 'Бар',
      color: '#f59e0b',
      basePrice: 200,
      baseIncomePerHour: 15,
      priceGrowth: 1.5,
      incomeGrowth: 1.35,
    },
    vip: {
      name: 'VIP',
      color: '#8b5cf6',
      basePrice: 500,
      baseIncomePerHour: 40,
      priceGrowth: 1.5,
      incomeGrowth: 1.35,
    },
    chill: {
      name: 'Чіл',
      color: '#10b981',
      basePrice: 150,
      baseIncomePerHour: 10,
      priceGrowth: 1.5,
      incomeGrowth: 1.35,
    },
  },
};
