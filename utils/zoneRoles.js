function zoneRoleName(zone, level) {
  return `${zone.roleName ?? zone.name} Зона ${level}`;
}

module.exports = { zoneRoleName };
