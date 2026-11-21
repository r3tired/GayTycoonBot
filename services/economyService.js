const users = require('../database/users');
const zonesConfig = require('../data/zones');
const guestsConfig = require('../data/guests');

const expectedGuestMultiplier = Object.values(guestsConfig.types)
  .reduce((total, guest) => total + guest.chance * guest.multiplier, 0);
const totalGuestChance = Object.values(guestsConfig.types)
  .reduce((total, guest) => total + guest.chance, 0);

if (Math.abs(totalGuestChance - 1) > 1e-9) {
  throw new Error('Шанси типів гостей у data/guests.js мають у сумі дорівнювати 1');
}

function getVisitorsPerHour(zone, level) {
  return zone.baseGuestsPerHour * zone.guestsGrowth ** (level - 1);
}

function getExpectedHourlyIncome(zone, level) {
  return getVisitorsPerHour(zone, level) * zone.averageCheck * expectedGuestMultiplier;
}

function simulateCollection(playerZones, elapsedMs, random = Math.random) {
  const result = {
    regularGuests: 0,
    mediumGuests: 0,
    richGuests: 0,
    totalGuests: 0,
    earned: 0,
    tips: 0,
  };
  const elapsedHours = elapsedMs / 3_600_000;
  const { regular, medium } = guestsConfig.types;

  for (const playerZone of playerZones) {
    const zone = zonesConfig.zones[playerZone.zoneId];
    const expectedGuests = getVisitorsPerHour(zone, playerZone.level) * elapsedHours;
    const wholeGuests = Math.floor(expectedGuests);
    const fractionalGuest = expectedGuests - wholeGuests;
    const guestCount = wholeGuests + (fractionalGuest > 0 && random() < fractionalGuest ? 1 : 0);

    for (let index = 0; index < guestCount; index++) {
      const roll = random();
      let guestType;
      if (roll < regular.chance) {
        guestType = 'regular';
      } else if (roll < regular.chance + medium.chance) {
        guestType = 'medium';
      } else {
        guestType = 'rich';
      }

      const guest = guestsConfig.types[guestType];
      const check = zone.averageCheck;
      result[`${guestType}Guests`]++;
      result.totalGuests++;
      result.earned += check * guest.multiplier;
      if (guestType === 'rich') result.tips += check * (guest.multiplier - 1);
    }
  }

  return result;
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
      visitorsPerHour: getVisitorsPerHour(config, playerZone.level),
      nextVisitorsPerHour: isMaxLevel ? null : getVisitorsPerHour(config, playerZone.level + 1),
      expectedHourlyIncome: getExpectedHourlyIncome(config, playerZone.level),
      nextUpgradePrice: isMaxLevel ? null : getUpgradePrice(config, playerZone.level),
    };
  });

  return {
    ...player,
    zones,
    visitorsPerHour: zones.reduce((total, zone) => total + zone.visitorsPerHour, 0),
    expectedHourlyIncome: zones.reduce((total, zone) => total + zone.expectedHourlyIncome, 0),
    totalGuests: player.regularGuests + player.mediumGuests + player.richGuests,
  };
}

function collectIncome(guildId, userId, now, random = Math.random) {
  const processCollection = (zones, elapsedMs) => simulateCollection(zones, elapsedMs, random);
  return users.collectIncome(
    guildId,
    userId,
    processCollection,
    guestsConfig.maxAccumulationHours * 3_600_000,
    now,
  );
}

function upgradeZone(guildId, userId, zoneId, now, random = Math.random) {
  const config = zonesConfig.zones[zoneId];
  if (!config) return { status: 'zone-not-found' };

  const processCollection = (zones, elapsedMs) => simulateCollection(zones, elapsedMs, random);
  return users.upgradeZone(
    guildId,
    userId,
    zoneId,
    level => getUpgradePrice(config, level),
    processCollection,
    guestsConfig.maxAccumulationHours * 3_600_000,
    now,
  );
}

module.exports = {
  collectIncome,
  getExpectedHourlyIncome,
  getPlayer,
  getUpgradePrice,
  getVisitorsPerHour,
  simulateCollection,
  upgradeZone,
};
