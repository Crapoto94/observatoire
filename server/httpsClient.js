// Appels HTTPS vers les services internes de la Ville (API centrale APM), qui présentent un
// certificat auto-signé. On accepte ce certificat CLIENT PAR CLIENT : soit via l'autorité fournie
// (VILLE_CA_FILE), soit, à défaut, un contournement limité à cet agent. Jamais de
// NODE_TLS_REJECT_UNAUTHORIZED=0, qui affaiblirait tout le processus.
//
// Le fetch natif de Node (undici) n'accepte pas https.Agent : on passe donc par https.request.
const fs = require('fs');
const https = require('https');

function httpsAgent() {
  const caFile = process.env.VILLE_CA_FILE;
  const opts = {};
  if (caFile) { try { opts.ca = fs.readFileSync(caFile); } catch { /* fichier illisible : autorité ignorée */ } }
  else if (process.env.VILLE_ALLOW_SELF_SIGNED_CERTS !== 'false') opts.rejectUnauthorized = false;
  return new https.Agent(opts);
}

// Requête JSON vers un service interne. Renvoie { status, data }. Lève une erreur réseau (DNS,
// TLS, timeout) telle quelle pour que l'appelant distingue « injoignable » d'un statut HTTP.
function jsonRequest(url, { method = 'GET', headers = {}, body, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method,
      headers, agent: httpsAgent(),
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { text += c; });
      res.on('end', () => {
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
        resolve({ status: res.statusCode, data });
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('délai dépassé')));
    req.on('error', reject);
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

module.exports = { httpsAgent, jsonRequest };
