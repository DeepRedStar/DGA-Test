const db = require('../database/db');

function logAudit({ userId = null, eventType, targetType = null, targetId = null, details = {}, ipAddress = null }) {
  db.prepare(`
    INSERT INTO audit_logs (user_id, event_type, target_type, target_id, details_json, ip_address)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, eventType, targetType, targetId, JSON.stringify(details), ipAddress);
}

module.exports = { logAudit };
