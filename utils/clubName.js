const CLUB_NAME_MIN = 3;
const CLUB_NAME_MAX = 32;

// Ключ для порівняння назв без урахування регістру (працює і для кирилиці)
function clubNameKey(name) {
  return name.toLocaleLowerCase('uk');
}

function validateClubName(input) {
  const name = String(input ?? '').replace(/\s+/g, ' ').trim();
  const length = [...name].length;

  if (length < CLUB_NAME_MIN) {
    return { ok: false, reason: `Назва закоротка: потрібно від ${CLUB_NAME_MIN} до ${CLUB_NAME_MAX} символів.` };
  }
  if (length > CLUB_NAME_MAX) {
    return { ok: false, reason: `Назва задовга: максимум ${CLUB_NAME_MAX} символів.` };
  }
  if (/[<>@]/.test(name)) {
    return { ok: false, reason: 'У назві не можна використовувати символи `@`, `<` та `>`.' };
  }
  if (/https?:|discord\.gg|www\./i.test(name)) {
    return { ok: false, reason: 'У назві не можна вказувати посилання.' };
  }
  return { ok: true, name };
}

module.exports = { CLUB_NAME_MIN, CLUB_NAME_MAX, clubNameKey, validateClubName };
