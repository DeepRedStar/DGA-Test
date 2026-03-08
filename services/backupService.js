const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

function createBackup() {
  const root = path.join(__dirname, '..');
  const backupDir = path.join(root, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const filename = `dga-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.tar.gz`;
  const fullPath = path.join(backupDir, filename);

  execFileSync('tar', ['-czf', fullPath, 'data', 'config', 'logs'], { cwd: root });
  return { filename, fullPath };
}

module.exports = { createBackup };
