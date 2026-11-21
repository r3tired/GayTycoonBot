// Use the legacy role label when configured so localization does not create duplicate Discord roles.
function zoneRoleName(zone, level) {
  return `${zone.roleName ?? zone.name} Зона ${level}`;
}

module.exports = { zoneRoleName };
