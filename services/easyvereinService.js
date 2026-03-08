const db = require('../database/db');

function getConfig() {
  const rows = db.prepare('SELECT key, value FROM app_config').all();
  return rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
}

function isConfigured() {
  const cfg = getConfig();
  return !!(cfg.easyverein_api_key && cfg.easyverein_base_url);
}

function queueSyncEvent(eventType, payload) {
  db.prepare('INSERT INTO sync_queue (event_type, payload_json) VALUES (?, ?)').run(eventType, JSON.stringify(payload));
}

function trySyncQueue() {
  // Placeholder for API sync. In production this would call EasyVerein endpoints.
  const pending = db.prepare("SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY id LIMIT 20").all();
  const markDone = db.prepare("UPDATE sync_queue SET status='done', updated_at=CURRENT_TIMESTAMP WHERE id=?");
  pending.forEach((row) => {
    markDone.run(row.id);
  });
  return pending.length;
}

module.exports = { getConfig, isConfigured, queueSyncEvent, trySyncQueue };
