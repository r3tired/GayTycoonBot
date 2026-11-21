const users = require('../database/users');
const zonesConfig = require('../data/zones');

function getHourlyIncome(zone, level) {
  return zone.baseIncomePerHour * zone.incomeGrowth ** (level - 1);
}

function getUpgradePrice(zone, level) {
  return Math.ceil(zone.basePrice * zone.priceGrowth ** (level - 1));
}

function getPlayer(guildId, userId) {
  const player = users.getPlayer(guildId, userId);
  if (!player) return null;

  const zones = player.zones.map(playerZone => {
    const config = zonesConfig.zones[playerZone.zoneId];
    const isMaxLevel = playerZone.level >= zonesConfig.maxLevel;
    return {
      ...playerZone,
      name: config.name,
      isMaxLevel,
      hourlyIncome: getHourlyIncome(config, playerZone.level),
      nextHourlyIncome: isMaxLevel ? null : getHourlyIncome(config, playerZone.level + 1),
      nextUpgradePrice: isMaxLevel ? null : getUpgradePrice(config, playerZone.level),
    };
  });

  return {
    ...player,
    zones,
    hourlyIncome: zones.reduce((total, zone) => total + zone.hourlyIncome, 0),
  };
}

function collectIncome(guildId, userId, now) {
  return users.collectIncome(
    guildId,
    userId,
    getHourlyIncome,
    now,
  );
}

function upgradeZone(guildId, userId, zoneId, now) {
  const config = zonesConfig.zones[zoneId];
  if (!config) return { status: 'zone-not-found' };

  return users.upgradeZone(
    guildId,
    userId,
    zoneId,
    level => getUpgradePrice(config, level),
    getHourlyIncome,
    now,
  );
}

module.exports = { collectIncome, getPlayer, getHourlyIncome, getUpgradePrice, upgradeZone };
