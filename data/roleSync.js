// services/roleSync.js
const rolesConfig = require('../data/roles');

async function syncRoles(guild) {
  // Підтягуємо актуальний список ролей з Discord
  const existing = await guild.roles.fetch();
  const result = { created: 0, updated: 0, skipped: 0, failed: 0 };

  for (const [key, cfg] of Object.entries(rolesConfig)) {
    try {
      const role = existing.find(r => r.name === cfg.name);

      // Створення
      if (!role) {
        await guild.roles.create({
          name: cfg.name,
          color: cfg.color,
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

      // Оновлення, тільки якщо щось відрізняється
      const needsUpdate =
        role.hexColor.toLowerCase() !== cfg.color.toLowerCase() ||
        role.hoist !== (cfg.hoist ?? false) ||
        role.mentionable !== (cfg.mentionable ?? false);

      if (needsUpdate) {
        await role.edit({
          color: cfg.color,
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

// Видача ролі за ключем з roles.js
async function giveRole(member, key) {
  const cfg = rolesConfig[key];
  if (!cfg) throw new Error(`Невідомий ключ ролі: ${key}`);

  const role = member.guild.roles.cache.find(r => r.name === cfg.name);
  if (!role) return false;
  if (member.roles.cache.has(role.id)) return true;

  await member.roles.add(role, 'Досягнення в грі');
  return true;
}

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

module.exports = { syncRoles, giveRole, giveGroupRoles };