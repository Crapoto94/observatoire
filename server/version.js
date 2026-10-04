// Numéro de version et « Nouveautés » déduits des commits git : version = 0.<nombre de commits + décalage>.
// En développement, lus directement dans git. Dans l'image Docker (sans git), lus dans deux fichiers générés avant le build
// par tools/gen-version.sh (server/commit-count.txt et server/whatsnew.txt).
// Chaque entrée des Nouveautés reprend le sujet du commit, son corps (description détaillée) et la liste des fichiers modifiés.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OFFSET = 9; // calage : le 28ᵉ commit correspond à la version 0.37
const TYPES = { feat: 'Nouveauté', fix: 'Correction', docs: 'Documentation', perf: 'Performance', refactor: 'Amélioration', chore: 'Maintenance' };
const SEP = '\x1e'; // séparateur d'enregistrement (commits)
const FS = '\x1f'; // séparateur de champs (hash, date, sujet, corps)

const git = (args) => {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; }
};
const read = (f) => { try { return fs.readFileSync(path.join(__dirname, f), 'utf8'); } catch { return null; } };

// Un enregistrement = en-tête (hash / date / sujet / corps, séparés par FS) puis les lignes numstat « ajouts\tsuppressions\tchemin ».
function parseRecord(record) {
  const lines = record.split('\n');
  const [hash, date, sujet = '', ...corps] = (lines.shift() || '').split(FS);
  const bodyLines = [corps.join(FS)];
  const files = [];
  for (const line of lines) {
    const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
    if (m) files.push({ path: m[3].trim(), add: m[1] === '-' ? 0 : Number(m[1]), del: m[2] === '-' ? 0 : Number(m[2]) });
    else bodyLines.push(line);
  }
  const subject = sujet.trim();
  const m = /^(\w+)(?:\(([^)]+)\))?!?:\s*(.*)$/.exec(subject);
  return {
    hash, date, body: bodyLines.join('\n').trim(), files,
    type: m && TYPES[m[1]] ? m[1] : 'autre', label: m && TYPES[m[1]] ? TYPES[m[1]] : 'Autre',
    scope: m?.[2] || null, subject: m ? m[3] : subject,
  };
}

const parseLog = (text) => String(text || '').split(SEP).filter((r) => r.trim()).map(parseRecord);

let cache = null;
function info() {
  if (cache && Date.now() - cache.at < 60000) return cache.value;
  let count = null, records = null, source = 'git';
  const c = git(['rev-list', '--count', 'HEAD']);
  const l = git(['log', '-n', '120', '--pretty=format:' + SEP + '%h' + FS + '%ad' + FS + '%s' + FS + '%b', '--numstat', '--date=short']);
  if (c && l != null) { count = Number(c.trim()); records = parseLog(l); } else {
    source = 'fichiers';
    count = Number((read('commit-count.txt') || '').trim()) || null;
    records = parseLog(read('whatsnew.txt'));
  }
  const value = {
    version: count != null ? `0.${count + OFFSET}` : require('../package.json').version,
    commits: count, source,
    whatsnew: records.map((e, i) => ({ ...e, version: count != null ? `0.${count - i + OFFSET}` : null })), // chaque commit correspond à une version
  };
  cache = { at: Date.now(), value };
  return value;
}

module.exports = { info };
