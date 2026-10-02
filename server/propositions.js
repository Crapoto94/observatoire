// Met à jour la « proposition » de fiches de la conception avec les données ouvertes désormais disponibles (emploi, notamment).
// Le bloc « [Données disponibles] » est placé en fin de proposition et remplacé à chaque démarrage : le texte saisi à la main avant lui est conservé.
const { all, run, tx } = require('./db');

const MARK = '[Données disponibles]';
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, ' ').toLowerCase().trim();

const RULES = [
  { re: /^nombre de demandeurs d emploi inscrits/, text: "Jeu « Demandeurs d'emploi inscrits à France Travail » intégré (DARES / France Travail, par commune, 4ᵉ trimestre, sexe et tranche d'âge, 10 années, accès sans clé). Voir Données > ft_defm et le KPI « Demandeurs d'emploi pour 1 000 habitants »." },
  { re: /^taux de chomage$|^evolution du taux de chomage$/, text: "Recensement INSEE déjà importé (tous les 5 ans). Complément annuel : demandeurs d'emploi inscrits (DARES / France Travail, jeu ft_defm), à rapporter à la population des 15-64 ans." },
  { re: /^projection du nombre de chomeurs/, text: "Projection à 1 et 5 ans calculable dès maintenant sur la série annuelle des demandeurs d'emploi (10 ans, jeu ft_defm) : onglet Évolution de la page Données." },
  { re: /^evolution du nombre d emplois$|^densite d emplois/, text: "Emplois au lieu de travail (INSEE, recensements 2012-2023, jeu rp_emploi_lt). Pour un suivi annuel, les effectifs salariés Urssaf existent en open data par zone d'emploi (maille supra-communale)." },
  { re: /^creations\/fermetures d etablissements/, text: "Créations d'entreprises par commune (INSEE, répertoire Sirene, annuel) intégrées (jeu side_creations). Les fermetures ne sont pas publiées à la commune." },
  { re: /^taux de beneficiaires des minima sociaux/, text: "RSA par commune (CAF, foyers, jeu caf_rsa) intégré ; la part de ménages à bas revenus provient de Filosofi (jeu filosofi)." },
  { re: /^nb de structures de l ess|^nb d emplois generes par les structures ess/, text: "Structures de l'ESS par commune (API Recherche d'entreprises, jeu entreprises) intégrées, stock du jour. Le nombre d'emplois n'est disponible que par tranche d'effectif (à intégrer si besoin)." },
  { re: /^part de contrats precaires/, text: "Pas de donnée communale ouverte directe (DSN non publiées à la commune). Piste : part du temps partiel et des non-salariés dans l'emploi au lieu de travail (recensement, jeu rp_emploi_lt)." },
  { re: /^identification des secteurs a potentiel/, text: "L'enquête Besoins en main-d'œuvre (France Travail) est publiée par bassin d'emploi, pas par commune. À croiser avec la répartition des emplois par secteur (recensement) et les créations d'entreprises par activité (jeu side_creations)." },
];

function apply() {
  let n = 0;
  const rows = all("SELECT id, libelle, proposition FROM indicators WHERE theme = 'emploi'");
  tx(() => {
    for (const r of rows) {
      const rule = RULES.find((x) => x.re.test(norm(r.libelle)));
      if (!rule) continue;
      const cur = String(r.proposition ?? '');
      const at = cur.indexOf(MARK);
      const base = (at >= 0 ? cur.slice(0, at) : cur).trim();
      const next = `${base}${base ? '\n\n' : ''}${MARK} ${rule.text}`;
      if (next === r.proposition) continue;
      run('UPDATE indicators SET proposition = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', next, r.id);
      run('INSERT INTO indicator_history (indicator_id, field, old_value, new_value) VALUES (?,?,?,?)', r.id, 'proposition', r.proposition ?? null, next);
      n++;
    }
  });
  return n;
}

module.exports = { apply, RULES };
