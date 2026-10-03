// Charge le fichier .env (à la racine du projet) dans process.env, sans écraser les variables déjà
// définies ni dépendre d'un paquet externe. Appelé en tout premier par index.js : c'est ce qui rend
// disponibles APM_API_URL, APM_API_KEY, GROQ_API_KEY, LOCAL_LLM_*… pour l'authentification AD et l'IA.
const fs = require('fs');
const path = require('path');

function loadEnv(file = path.join(__dirname, '..', '.env')) {
  if (process.env.ENV_FILE) file = process.env.ENV_FILE;
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return; } // pas de .env : environnement système seul
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue; // l'environnement existant a priorité
    let value = line.slice(eq + 1).trim();
    // valeurs entre guillemets (simples ou doubles) : on retire les guillemets encadrants
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(' #'); // commentaire en fin de ligne (hors valeur)
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    process.env[key] = value;
  }
}

loadEnv();

module.exports = { loadEnv };
