// Єдине місце, де формується назва ролі рівня зони: «Бар Зона 2»
function zoneRoleName(zone, level) {
  return `${zone.name} Зона ${level}`;
}

module.exports = { zoneRoleName };
