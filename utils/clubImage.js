const fs = require('node:fs/promises');
const path = require('node:path');

const CLUB_IMAGE_DIRECTORY = path.join(__dirname, '..', 'assets', 'user-photos');
const MAX_CLUB_IMAGE_SIZE = 5 * 1024 * 1024;
const allowedContentTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);

class ClubImageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ClubImageError';
  }
}

function getClubImagePath(filename) {
  if (!/^\d+-\d+-\d+\.(png|jpg|webp)$/.test(filename)) {
    throw new Error('Некоректне ім’я файлу зображення клубу');
  }
  return path.join(CLUB_IMAGE_DIRECTORY, filename);
}

function getImageExtension(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

async function saveClubImage(attachment, guildId, userId, interactionId) {
  if (!Number.isInteger(attachment.size) || attachment.size < 1 || attachment.size > MAX_CLUB_IMAGE_SIZE) {
    throw new ClubImageError('Зображення має бути розміром від 1 байта до 5 МБ.');
  }

  const contentType = attachment.contentType?.split(';')[0];
  if (contentType && !allowedContentTypes.has(contentType)) {
    throw new ClubImageError('Підтримуються лише PNG, JPEG і WebP.');
  }

  let url;
  try {
    url = new URL(attachment.url);
  } catch {
    throw new ClubImageError('Не вдалося прочитати завантажене зображення.');
  }
  if (
    url.protocol !== 'https:' ||
    !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)
  ) {
    throw new ClubImageError('Зображення має бути завантажене у Discord.');
  }

  let response;
  try {
    response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ClubImageError('Не вдалося завантажити зображення з Discord. Спробуй ще раз.');
  }
  if (!response.ok || !response.body) {
    throw new ClubImageError('Discord не зміг віддати завантажене зображення.');
  }

  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_CLUB_IMAGE_SIZE) {
    throw new ClubImageError('Зображення завелике. Максимальний розмір — 5 МБ.');
  }

  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of response.body) {
      const buffer = Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_CLUB_IMAGE_SIZE) {
        throw new ClubImageError('Зображення завелике. Максимальний розмір — 5 МБ.');
      }
      chunks.push(buffer);
    }
  } catch (error) {
    if (error instanceof ClubImageError) throw error;
    throw new ClubImageError('Не вдалося прочитати завантажене зображення.');
  }

  const image = Buffer.concat(chunks, size);
  const extension = getImageExtension(image);
  if (!extension) {
    throw new ClubImageError('Файл не є підтримуваним зображенням PNG, JPEG або WebP.');
  }

  const ids = [guildId, userId, interactionId];
  if (ids.some(id => !/^\d+$/.test(id))) {
    throw new Error('Discord повернув некоректний ідентифікатор для зображення клубу');
  }

  const filename = `${guildId}-${userId}-${interactionId}.${extension}`;
  const imagePath = getClubImagePath(filename);
  await fs.mkdir(CLUB_IMAGE_DIRECTORY, { recursive: true });
  try {
    await fs.writeFile(imagePath, image, { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      try {
        await fs.unlink(imagePath);
      } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') throw cleanupError;
      }
    }
    throw error;
  }
  return { filename, imagePath };
}

async function removeClubImage(filename) {
  try {
    await fs.unlink(getClubImagePath(filename));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

module.exports = {
  ClubImageError,
  MAX_CLUB_IMAGE_SIZE,
  getClubImagePath,
  removeClubImage,
  saveClubImage,  
};
