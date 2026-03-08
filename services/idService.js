const db = require('../database/db');

function generateCrateId(articleNumber) {
  const stmt = db.prepare('SELECT 1 FROM crates WHERE crate_id = ?');
  while (true) {
    const hex = Math.floor(Math.random() * 0xfffff)
      .toString(16)
      .toUpperCase()
      .padStart(5, '0');
    const crateId = `${articleNumber}-${hex}`;
    if (!stmt.get(crateId)) return crateId;
  }
}

module.exports = { generateCrateId };
