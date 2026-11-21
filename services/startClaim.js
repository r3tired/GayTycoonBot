const fs = require('node:fs');
const path = require('node:path');

function createStartClaimStore(claimsPath) {
  const inProgress = new Set();
  let completedClaims;

  function getCompletedClaims() {
    if (completedClaims) return completedClaims;

    try {
      const storedClaims = JSON.parse(fs.readFileSync(claimsPath, 'utf8'));
      if (!Array.isArray(storedClaims) || storedClaims.some(claim => typeof claim !== 'string')) {
        throw new Error('Файл claims має містити масив рядків');
      }
      completedClaims = new Set(storedClaims);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      completedClaims = new Set();
    }

    return completedClaims;
  }

  function saveCompletedClaims(claims) {
    fs.mkdirSync(path.dirname(claimsPath), { recursive: true });
    const temporaryPath = `${claimsPath}.${process.pid}.${Date.now()}.tmp`;

    try {
      fs.writeFileSync(temporaryPath, JSON.stringify([...claims], null, 2), 'utf8');
      fs.renameSync(temporaryPath, claimsPath);
    } catch (error) {
      try {
        fs.unlinkSync(temporaryPath);
      } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') {
          console.error('Не вдалося видалити тимчасовий файл start claims:', cleanupError);
        }
      }
      throw error;
    }
  }

  async function runStartOnce(guildId, userId, operation) {
    const claims = getCompletedClaims();
    const claimKey = `${guildId}:${userId}`;

    if (claims.has(claimKey)) return { status: 'already-used' };
    if (inProgress.has(claimKey)) return { status: 'in-progress' };

    inProgress.add(claimKey);
    try {
      const result = await operation();
      if (!result.completed) return { status: 'not-completed', result };

      claims.add(claimKey);
      try {
        saveCompletedClaims(claims);
      } catch (error) {
        claims.delete(claimKey);
        throw error;
      }

      return { status: 'completed', result };
    } finally {
      inProgress.delete(claimKey);
    }
  }

  return { runStartOnce };
}

const defaultStore = createStartClaimStore(
  path.join(__dirname, '..', 'database', 'startClaims.json'),
);

module.exports = { ...defaultStore, createStartClaimStore };
