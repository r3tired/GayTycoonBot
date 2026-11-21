const zonesConfig = require('./zones');
const { zoneRoleName } = require('../utils/zoneRoles');

// Ролі зон генеруються з data/zones.js: для кожної зони по maxLevel ролей.
// Рівень 1 входить у групу beginner (видається через /start),
// вищі рівні (2, 3...) у групу zone: їх бот видає при прокачці.
const roles = {
  GayClub: {
    name: 'Гей Клуб',
    color: '#00eeff',
    hoist: false,
    mentionable: true,
    description: 'Gay Club Tycoon Player',
    group: 'beginner',
  },
};

for (const [zoneId, zone] of Object.entries(zonesConfig.zones)) {
  for (let level = 1; level <= zonesConfig.maxLevel; level++) {
    roles[`${zoneId}_${level}`] = {
      name: zoneRoleName(zone, level),
      color: zone.color,
      hoist: false,
      mentionable: true,
      description: `${zone.name} zone, level ${level}`,
      group: level === zonesConfig.startingLevel ? 'beginner' : 'zone',
      zoneId,
      level,
    };
  }
}

module.exports = roles;
