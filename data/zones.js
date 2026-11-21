module.exports = {
  startingBalance: 1000,
  startingLevel: 1,
  zones: {
    strip: {
      name: 'Стриптиз',
      basePrice: 250,
      baseIncomePerHour: 20,
      priceGrowth: 1.5,
      incomeGrowth: 1.35,
    },
    bar: {
      name: 'Бар',
      basePrice: 200,
      baseIncomePerHour: 15,
      priceGrowth: 1.5,
      incomeGrowth: 1.35,
    },
    vip: {
      name: 'VIP',
      basePrice: 500,
      baseIncomePerHour: 40,
      priceGrowth: 1.5,
      incomeGrowth: 1.35,
    },
    chill: {
      name: 'Чіл',
      basePrice: 150,
      baseIncomePerHour: 10,
      priceGrowth: 1.5,
      incomeGrowth: 1.35,
    },
  },
};
