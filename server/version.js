// Numéro de version et « Nouveautés » déduits des commits git : version = 0.<nombre de commits + décalage>.
// En développement, lus directement dans git. Dans l'image Docker (sans git), lus dans deux fichiers générés avant le build
// par tools/gen-version.sh (server/commit-count.txt et server/whatsnew.txt).
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OFFSET = 9; // calage : le 28ᵉ commit correspond à la version 0.37
const TYPES = { feat: 'Nouveauté', fix: 'Correction', docs: 'Documentation', perf: 'Performance', refactor: 'Amélioration', chore: 'Maintenance' };

const git = (args) => {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; }
};
const read = (f) => { try { return fs.readFileSync(path.join(__dirname, f), 'utf8'); } catch { return null; } };

function parse(line) {
  const i = line.indexOf('|'), j = line.indexOf('|', i + 1);
  const hash = line.slice(0, i), date = line.slice(i + 1, j), subject = line.slice(j + 1).trim();
  const m = /^(\w+)(?:\(([^)]+)\))?!?:\s*(.*)$/.exec(subject);
  return { hash, date, type: m && TYPES[m[1]] ? m[1] : 'autre', label: m && TYPES[m[1]] ? TYPES[m[1]] : 'Autre', scope: m?.[2] || null, subject: m ? m[3] : subject };
}

let cache = null;
function info() {
  if (cache && Date.now() - cache.at < 60000) return cache.value;
  let count = null, lines = null, source = 'git';
  const c = git(['rev-list', '--count', 'HEAD']), l = git(['log', '-n', '120', '--pretty=format:%h|%ad|%s', '--date=short']);
  if (c && l) { count = Number(c.trim()); lines = l.split('\n'); } else {
    source = 'fichiers';
    count = Number((read('commit-count.txt') || '').trim()) || null;
    lines = (read('whatsnew.txt') || '').split('\n').filter((x) => x.includes('|'));
  }
  const value = {
    version: count != null ? `0.${count + OFFSET}` : require('../package.json').version,
    commits: count, source,
    whatsnew: lines.map(parse),
  };
  cache = { at: Date.now(), value };
  return value;
}

module.exports = { info };
