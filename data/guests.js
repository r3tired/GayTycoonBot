module.exports = {
  maxAccumulationHours: 12,
  types: {
    regular: { name: 'Обычные гости', chance: 0.9, multiplier: 1 },
    medium: { name: 'Средние гости', chance: 0.09, multiplier: 3 },
    rich: { name: 'Богатые гости', chance: 0.01, multiplier: 15 },
  },
};
