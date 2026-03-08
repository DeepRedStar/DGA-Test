const express = require('express');
const db = require('../database/db');
const { ensureAuthenticated, ensureRole } = require('../middleware/auth');
const { einbuchen, applyAction } = require('../services/stockService');
const { logAudit } = require('../services/auditService');
const { trySyncQueue } = require('../services/easyvereinService');
const { createBackup } = require('../services/backupService');

const router = express.Router();

router.get('/', (req, res) => res.redirect('/dashboard'));

router.get('/dashboard', ensureAuthenticated, (req, res) => {
  const stats = {
    inStock: db.prepare("SELECT COUNT(*) AS c FROM crates WHERE status='in_stock' AND is_active=1").get().c,
    pfand: db.prepare("SELECT COUNT(*) AS c FROM crates WHERE status='pfand' AND is_active=1").get().c,
    sold: db.prepare("SELECT COUNT(*) AS c FROM crates WHERE status='sold'").get().c,
    defect: db.prepare("SELECT COUNT(*) AS c FROM crates WHERE status='defect'").get().c,
    alerts: db.prepare("SELECT COUNT(*) AS c FROM minimum_stock_alerts WHERE is_open=1").get().c,
    syncErrors: db.prepare("SELECT COUNT(*) AS c FROM sync_queue WHERE status='failed'").get().c
  };
  res.render('dashboard', { stats });
});

router.get('/scan', ensureAuthenticated, (req, res) => {
  res.render('scan', { result: null, error: null });
});

router.post('/scan/action', ensureAuthenticated, (req, res) => {
  const { crateCode, actionType, newLocation } = req.body;
  const crate = db.prepare('SELECT * FROM crates WHERE crate_id = ?').get(crateCode);
  if (!crate) return res.status(404).render('scan', { result: null, error: 'Kasten-ID nicht gefunden' });

  try {
    applyAction(crate.id, actionType, req.session.user.id, { newLocation });
    logAudit({ userId: req.session.user.id, eventType: actionType, targetType: 'crate', targetId: crateCode, details: { newLocation } });
    return res.render('scan', { result: `Aktion ${actionType} für ${crateCode} ausgeführt.`, error: null });
  } catch (error) {
    return res.status(400).render('scan', { result: null, error: error.message });
  }
});


router.post('/scan/bulk', ensureAuthenticated, (req, res) => {
  const { crateCodes = '', actionType, newLocation } = req.body;
  const uniqueCodes = [...new Set(crateCodes.split(/\s+/).map((v) => v.trim()).filter(Boolean))];
  let done = 0;
  const errors = [];

  uniqueCodes.forEach((code) => {
    const crate = db.prepare('SELECT * FROM crates WHERE crate_id = ?').get(code);
    if (!crate) {
      errors.push(`${code}: nicht gefunden`);
      return;
    }
    try {
      applyAction(crate.id, actionType, req.session.user.id, { newLocation });
      done += 1;
    } catch (error) {
      errors.push(`${code}: ${error.message}`);
    }
  });

  logAudit({ userId: req.session.user.id, eventType: `bulk_${actionType}`, targetType: 'crate_bulk', details: { scanned: uniqueCodes.length, done, errors } });
  return res.render('scan', {
    result: `${done}/${uniqueCodes.length} Aktionen ausgeführt. Doppelte Scans wurden ignoriert.`,
    error: errors.length ? errors.join(' | ') : null
  });
});

router.get('/crates', ensureAuthenticated, (req, res) => {
  const crates = db.prepare(`
    SELECT c.*, a.article_name, a.article_number
    FROM crates c JOIN articles a ON a.id = c.article_id
    ORDER BY c.created_at DESC LIMIT 300
  `).all();
  res.render('crates', { crates });
});

router.get('/pfand', ensureAuthenticated, (req, res) => {
  const crates = db.prepare(`
    SELECT c.*, a.article_name
    FROM crates c JOIN articles a ON a.id = c.article_id
    WHERE c.status='pfand' AND c.is_active=1
    ORDER BY c.updated_at DESC
  `).all();
  res.render('pfand', { crates });
});

router.get('/history', ensureAuthenticated, (req, res) => {
  const actions = db.prepare(`
    SELECT ac.*, u.username, c.crate_id AS external_crate_id, ar.article_name
    FROM actions ac
    JOIN users u ON u.id = ac.user_id
    LEFT JOIN crates c ON c.id = ac.crate_id
    LEFT JOIN articles ar ON ar.id = ac.article_id
    ORDER BY ac.created_at DESC LIMIT 500
  `).all();
  res.render('history', { actions });
});

router.get('/stock/book', ensureAuthenticated, (req, res) => {
  const articles = db.prepare('SELECT * FROM articles ORDER BY article_name').all();
  res.render('book', { articles, error: null, result: null });
});

router.post('/stock/book', ensureAuthenticated, (req, res) => {
  const { articleId, quantity, location } = req.body;
  try {
    const generated = einbuchen(Number(articleId), Number(quantity), req.session.user.id, location);
    logAudit({ userId: req.session.user.id, eventType: 'einbuchen', targetType: 'article', targetId: articleId, details: { quantity } });
    const articles = db.prepare('SELECT * FROM articles ORDER BY article_name').all();
    return res.render('book', { articles, error: null, result: `${generated.length} Kästen erzeugt.` });
  } catch (error) {
    const articles = db.prepare('SELECT * FROM articles ORDER BY article_name').all();
    return res.status(400).render('book', { articles, error: error.message, result: null });
  }
});

router.get('/admin/users', ensureRole('admin'), (req, res) => {
  const users = db.prepare('SELECT id, username, role, easyverein_user_id, created_at FROM users').all();
  res.render('users', { users, error: null });
});

router.post('/admin/users', ensureRole('admin'), async (req, res) => {
  const bcrypt = require('bcrypt');
  const { username, password, role, easyvereinUserId } = req.body;

  if (role === 'getraenkewart' && !easyvereinUserId) {
    const users = db.prepare('SELECT id, username, role, easyverein_user_id, created_at FROM users').all();
    return res.status(400).render('users', { users, error: 'Getränkewart braucht EasyVerein-Zuordnung.' });
  }

  const hash = await bcrypt.hash(password, 12);
  db.prepare('INSERT INTO users (username, password_hash, role, easyverein_user_id) VALUES (?, ?, ?, ?)')
    .run(username, hash, role, easyvereinUserId || null);
  logAudit({ userId: req.session.user.id, eventType: 'user_create', targetType: 'user', targetId: username, details: { role } });
  return res.redirect('/admin/users');
});

router.get('/admin/settings', ensureRole('admin'), (req, res) => {
  const cfgRows = db.prepare('SELECT key, value FROM app_config').all();
  const config = cfgRows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
  res.render('settings', { config, synced: null });
});

router.post('/admin/settings', ensureRole('admin'), (req, res) => {
  const keys = ['easyverein_api_key', 'easyverein_base_url', 'local_domain', 'network_mode', 'static_ip'];
  const upsert = db.prepare(`
    INSERT INTO app_config (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP
  `);
  keys.forEach((key) => upsert.run(key, req.body[key] || ''));
  logAudit({ userId: req.session.user.id, eventType: 'settings_update', targetType: 'config' });
  res.redirect('/admin/settings');
});



router.post('/admin/backup', ensureRole('admin'), (req, res) => {
  try {
    const backup = createBackup();
    logAudit({ userId: req.session.user.id, eventType: 'backup_created', targetType: 'backup', targetId: backup.filename });
    return res.download(backup.fullPath, backup.filename);
  } catch (error) {
    return res.status(500).render('error', { message: `Backup fehlgeschlagen: ${error.message}` });
  }
});

router.post('/admin/articles/sample', ensureRole('admin'), (req, res) => {
  db.prepare(`
    INSERT INTO articles (easyverein_article_id, article_name, article_number, default_location, shelf, min_stock)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(article_number) DO UPDATE SET
      article_name=excluded.article_name,
      default_location=excluded.default_location,
      shelf=excluded.shelf,
      min_stock=excluded.min_stock
  `).run('sample-1', 'Paulaner Spezi Kasten', 'VW-G-001', 'Vereinslager', 'D2', 10);

  logAudit({ userId: req.session.user.id, eventType: 'sample_article_import' });
  res.redirect('/admin/settings');
});

router.post('/admin/sync', ensureRole('admin'), (req, res) => {
  const count = trySyncQueue();
  res.redirect(`/admin/settings?synced=${count}`);
});

router.get('/alerts', ensureAuthenticated, (req, res) => {
  const alerts = db.prepare(`
    SELECT msa.*, a.article_name, a.article_number
    FROM minimum_stock_alerts msa
    JOIN articles a ON a.id = msa.article_id
    WHERE msa.is_open=1
  `).all();
  const syncErrors = db.prepare("SELECT * FROM sync_queue WHERE status='failed' ORDER BY updated_at DESC").all();
  res.render('alerts', { alerts, syncErrors });
});

module.exports = router;
