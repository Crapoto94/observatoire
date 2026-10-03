// Envoi de courriels via l'API centrale de la Ville (APM) : POST /api/v1/mail/send (X-API-KEY).
// Le corps est encapsulé par l'APM dans le template institutionnel ; le pied de page est paramétrable.
const { jsonRequest } = require('./httpsClient');

const apmUrl = () => (process.env.APM_API_URL || 'https://api.ivry.local').replace(/\/+$/, '');
const apmKey = () => process.env.APM_API_KEY || '';

async function sendMail({ to, subject, content, attachments, footerColor, fromName }) {
  if (!apmKey()) return { ok: false, error: 'APM_API_KEY non configurée : envoi de courriel indisponible' };
  try {
    const { status, data } = await jsonRequest(`${apmUrl()}/api/v1/mail/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': apmKey() },
      body: {
        to, subject, content,
        ...(fromName ? { from_name: fromName } : {}),
        ...(attachments?.length ? { attachments } : {}),
        footer1: "Ville d'Ivry-sur-Seine",
        footer2: "Direction des Systèmes d'Information",
        footer3: 'observatoire@ivry94.fr',
        footerColor: footerColor || '#0055A4',
      },
      timeoutMs: 30000,
    });
    if (status >= 200 && status < 300) return { ok: true, data };
    return { ok: false, error: data?.error || `API centrale : HTTP ${status}` };
  } catch (e) {
    return { ok: false, error: `API centrale injoignable : ${e.message}` };
  }
}

module.exports = { sendMail };
