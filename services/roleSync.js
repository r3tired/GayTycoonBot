const rolesConfig = require('../data/roles');
const zonesConfig = require('../data/zones');
const { zoneRoleName } = require('../utils/zoneRoles');

// Створює відсутні ролі та оновлює ті, що відрізняються від конфігу
async function syncRoles(guild) {
  const existing = await guild.roles.fetch();
  const result = { created: 0, updated: 0, skipped: 0, failed: 0 };

  for (const [key, cfg] of Object.entries(rolesConfig)) {
    try {
      const role = existing.find(r => r.name === cfg.name);

      if (!role) {
        await guild.roles.create({
          name: cfg.name,
          colors: { primaryColor: cfg.color },
          hoist: cfg.hoist ?? false,
          mentionable: cfg.mentionable ?? false,
          permissions: [], // косметична роль без прав
          reason: `Автостворення ролі (${key})`,
        });
        console.log(`✅ Створено роль: ${cfg.name}`);
        result.created++;
        continue;
      }

      // Бот не може редагувати ролі, що вищі за його власну
      if (!role.editable) {
        console.warn(`⚠️ Немає доступу до ролі: ${cfg.name} (підніми роль бота вище)`);
        result.skipped++;
        continue;
      }

      const needsUpdate =
        role.hexColor.toLowerCase() !== cfg.color.toLowerCase() ||
        role.hoist !== (cfg.hoist ?? false) ||
        role.mentionable !== (cfg.mentionable ?? false);

      if (needsUpdate) {
        await role.edit({
          colors: { primaryColor: cfg.color },
          hoist: cfg.hoist ?? false,
          mentionable: cfg.mentionable ?? false,
          reason: `Автооновлення ролі (${key})`,
        });
        console.log(`🔄 Оновлено роль: ${cfg.name}`);
        result.updated++;
      } else {
        result.skipped++;
      }
    } catch (err) {
      console.error(`❌ Помилка з роллю ${cfg.name}:`, err.message);
      result.failed++;
    }
  }

  return result;
}

// Видача однієї ролі за ключем з roles.js
async function giveRole(member, key) {
  const cfg = rolesConfig[key];
  if (!cfg) throw new Error(`Невідомий ключ ролі: ${key}`);

  const roles = await member.guild.roles.fetch();
  const role = roles.find(r => r.name === cfg.name);
  if (!role) return false;
  if (member.roles.cache.has(role.id)) return true;

  await member.roles.add(role, 'Видача ролі');
  return true;
}

// Видача всіх ролей групи
async function giveGroupRoles(member, group) {
  const entries = Object.entries(rolesConfig).filter(([, cfg]) => cfg.group === group);
  const result = { assigned: [], alreadyHad: [], failed: [] };
  const roles = await member.guild.roles.fetch();

  for (const [key, cfg] of entries) {
    try {
      const role = roles.find(candidate => candidate.name === cfg.name);
      if (!role) {
        throw new Error(`Роль "${cfg.name}" ще не створена`);
      }

      if (member.roles.cache.has(role.id)) {
        result.alreadyHad.push(cfg.name);
        continue;
      }

      await member.roles.add(role, `Видача ролі групи ${group} (${key})`);
      result.assigned.push(cfg.name);
    } catch (error) {
      console.error(`Не вдалося видати роль ${cfg.name}:`, error);
      result.failed.push(cfg.name);
    }
  }

  return result;
}

// Інша налаштована група означає, що гравець уже перейшов зі стартового рівня.
async function getMemberRolesFromOtherGroups(member, group) {
  const entries = Object.values(rolesConfig)
    .filter(cfg => cfg.group && cfg.group !== group);
  if (entries.length === 0) return [];

  const roles = await member.guild.roles.fetch();
  return entries
    .filter(cfg => {
      const role = roles.find(candidate => candidate.name === cfg.name);
      return role && member.roles.cache.has(role.id);
    })
    .map(cfg => cfg.name);
}


// Робить так, щоб у гравця для кожної зони була рівно одна роль: поточного рівня.
// playerZones: [{ zoneId, level }]. Нічого не викликає в Discord, якщо ролі вже правильні.
async function syncZoneRoles(member, playerZones) {
  const result = { changed: [], failed: [] };
  let roles = [...member.guild.roles.cache.values()];

  const findRole = async name => {
    let role = roles.find(candidate => candidate.name === name);
    if (!role) {
      roles = [...(await member.guild.roles.fetch()).values()];
      role = roles.find(candidate => candidate.name === name);
    }
    return role;
  };

  for (const { zoneId, level } of playerZones) {
    const zone = zonesConfig.zones[zoneId];
    if (!zone) continue;

    const targetName = zoneRoleName(zone, level);
    try {
      const target = await findRole(targetName);
      if (!target) throw new Error(`Роль "${targetName}" ще не створена`);

      const toRemove = [];
      for (let other = 1; other <= zonesConfig.maxLevel; other++) {
        if (other === level) continue;
        const role = roles.find(candidate => candidate.name === zoneRoleName(zone, other));
        if (role && member.roles.cache.has(role.id)) toRemove.push(role);
      }
      const needsAdd = !member.roles.cache.has(target.id);
      if (!needsAdd && toRemove.length === 0) continue;

      // Спочатку видаємо нову роль, потім знімаємо стару: гравець не лишається без ролі
      if (needsAdd) await member.roles.add(target, `Рівень зони: ${targetName}`);
      if (toRemove.length > 0) await member.roles.remove(toRemove, `Заміна ролі на ${targetName}`);
      result.changed.push(targetName);
    } catch (error) {
      console.error(`Не вдалося оновити роль ${targetName}:`, error);
      result.failed.push(targetName);
    }
  }

  return result;
}

module.exports = { syncZoneRoles, syncRoles, giveRole, giveGroupRoles, getMemberRolesFromOtherGroups };
