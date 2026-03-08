const db = require('../database/db');
const { generateCrateId } = require('./idService');
const { queueSyncEvent } = require('./easyvereinService');

const createAction = db.prepare(`
  INSERT INTO actions (action_type, crate_id, article_id, user_id, payload_json)
  VALUES (?, ?, ?, ?, ?)
`);

function checkMinStockAndAlert(articleId) {
  const inStock = db.prepare("SELECT COUNT(*) AS c FROM crates WHERE article_id = ? AND status = 'in_stock' AND is_active = 1").get(articleId).c;
  const article = db.prepare('SELECT min_stock FROM articles WHERE id = ?').get(articleId);
  if (!article) return;

  if (inStock <= article.min_stock) {
    db.prepare('INSERT OR IGNORE INTO minimum_stock_alerts (article_id, is_open) VALUES (?, 1)').run(articleId);
  } else {
    db.prepare("UPDATE minimum_stock_alerts SET is_open = 0, closed_at=CURRENT_TIMESTAMP WHERE article_id=? AND is_open=1").run(articleId);
  }
}

function einbuchen(articleId, quantity, userId, location) {
  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(articleId);
  if (!article) throw new Error('Artikel nicht gefunden');

  const tx = db.transaction(() => {
    const crateIds = [];
    for (let i = 0; i < quantity; i++) {
      const generated = generateCrateId(article.article_number);
      const result = db.prepare(`
        INSERT INTO crates (crate_id, article_id, status, location)
        VALUES (?, ?, 'in_stock', ?)
      `).run(generated, articleId, location || article.default_location || 'Unbekannt');
      createAction.run('einbuchen', result.lastInsertRowid, articleId, userId, JSON.stringify({ generated }));
      crateIds.push(generated);
    }
    queueSyncEvent('einbuchen', { articleId, quantity });
    checkMinStockAndAlert(articleId);
    return crateIds;
  });

  return tx();
}

function applyAction(crateDbId, actionType, userId, options = {}) {
  const crate = db.prepare('SELECT * FROM crates WHERE id = ?').get(crateDbId);
  if (!crate) throw new Error('Kasten nicht gefunden');

  const tx = db.transaction(() => {
    switch (actionType) {
      case 'pfand_umbuchen':
        if (!options.newLocation) throw new Error('Neuer Lagerort ist erforderlich');
        db.prepare("UPDATE crates SET status='pfand', location=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .run(options.newLocation, crateDbId);
        queueSyncEvent('pfand_umbuchen', { crateId: crate.crate_id });
        break;
      case 'umlagern':
        if (!options.newLocation) throw new Error('Neuer Lagerort ist erforderlich');
        db.prepare('UPDATE crates SET location=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(options.newLocation, crateDbId);
        break;
      case 'korrigieren':
        db.prepare("UPDATE crates SET status='in_stock', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(crateDbId);
        break;
      case 'ausbuchen_an_dritte':
        db.prepare("UPDATE crates SET status='sold', is_active=0, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(crateDbId);
        queueSyncEvent('ausbuchen_an_dritte', { crateId: crate.crate_id });
        break;
      case 'defekt_setzen':
        db.prepare("UPDATE crates SET status='defect', is_active=0, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(crateDbId);
        queueSyncEvent('defekt_setzen', { crateId: crate.crate_id });
        break;
      case 'pfand_rueckgabe':
        if (crate.status !== 'pfand') throw new Error('Nur Pfandkästen können zurückgegeben werden');
        db.prepare('DELETE FROM crates WHERE id=?').run(crateDbId);
        queueSyncEvent('pfand_rueckgabe', { crateId: crate.crate_id });
        break;
      default:
        throw new Error('Unbekannte Aktion');
    }

    createAction.run(actionType, crateDbId, crate.article_id, userId, JSON.stringify(options));
    checkMinStockAndAlert(crate.article_id);
  });

  tx();
}

module.exports = { einbuchen, applyAction, checkMinStockAndAlert };
