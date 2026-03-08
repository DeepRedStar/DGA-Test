const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../database/db');
const { logAudit } = require('../services/auditService');
const { getIp } = require('../middleware/network');

const router = express.Router();

router.get('/login', (req, res) => {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) return res.redirect('/setup');
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).render('login', { error: 'Ungültige Zugangsdaten' });
  }

  req.session.user = { id: user.id, username: user.username, role: user.role };
  logAudit({ userId: user.id, eventType: 'login_success', details: { username }, ipAddress: getIp(req) });
  return res.redirect('/dashboard');
});

router.post('/logout', (req, res) => {
  if (req.session.user) {
    logAudit({ userId: req.session.user.id, eventType: 'logout' });
  }
  req.session.destroy(() => res.redirect('/login'));
});

router.get('/setup', (req, res) => {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount > 0) return res.redirect('/login');
  return res.render('setup', { error: null });
});

router.post('/setup', async (req, res) => {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount > 0) return res.redirect('/login');

  const { username, password } = req.body;
  if (!username || !password || password.length < 10) {
    return res.status(400).render('setup', { error: 'Bitte gültigen Benutzernamen und Passwort (>=10 Zeichen) eingeben.' });
  }

  const hash = await bcrypt.hash(password, 12);
  db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')").run(username, hash);
  return res.redirect('/login');
});

module.exports = router;
