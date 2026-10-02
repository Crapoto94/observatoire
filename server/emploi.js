// Page Emploi : KPI emploi / demandeurs d'emploi, lecture synthétique (aide à la décision) et pistes de sources.
const { build } = require('./kpi');
const { layerData } = require('./cartographie');
const { membersOf } = require('./groups');
const { all } = require('./db');

const f1 = (v) => v.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const sign = (v) => `${v > 0 ? '+' : ''}${f1(v)}`;

function insights(kpis) {
  const k = Object.fromEntries(kpis.map((x) => [x.id, x]));
  const out = [];
  const d = k.defm, d1 = k.defm_1000;
  if (d?.value != null) {
    const first = d.series[0];
    const pct = first && first.value ? ((d.value - first.value) / first.value) * 100 : null;
    out.push({ level: pct != null && pct > 3 ? 'alerte' : pct != null && pct < -3 ? 'positif' : 'info', text: `${f1(d.value)} demandeurs d'emploi inscrits (catégories A, B, C) fin ${d.period}` + (pct != null ? `, soit ${sign(pct)} % depuis ${first.period} (${f1(first.value)}).` : '.') });
  }
  if (d1?.value != null && (d1.ept || d1.dep || d1.reg)) {
    const parts = [];
    for (const [nom, ref] of [['le GOSB', d1.ept], ['le Val-de-Marne', d1.dep], ['l\'Île-de-France', d1.reg]]) if (ref) parts.push(`${nom} ${f1(ref.value)}`);
    const base = d1.ept || d1.dep || d1.reg;
    const baseNom = d1.ept ? 'le GOSB' : d1.dep ? 'le Val-de-Marne' : "l'Île-de-France";
    const gap = base.value ? ((d1.value - base.value) / base.value) * 100 : null;
    out.push({ level: gap != null && gap > 10 ? 'alerte' : 'info', text: `${f1(d1.value)} demandeurs d'emploi pour 1 000 habitants à Ivry-sur-Seine, contre ${parts.join(', ')}` + (gap != null ? ` (${sign(gap)} % par rapport à ${baseNom}).` : '.') });
  }
  for (const [id, label, hint] of [
    ['defm_jeunes', 'moins de 25 ans', "public cible de la mission locale et des dispositifs jeunes"],
    ['defm_50', '50 ans et plus', "enjeu de reconversion et de maintien dans l'emploi"],
  ]) {
    const x = k[id];
    if (x?.value == null) continue;
    const ref = x.ept || x.dep || x.reg;
    out.push({ level: 'info', text: `Les ${label} représentent ${f1(x.value)} % des demandeurs d'emploi` + (ref ? ` (${f1(ref.value)} % pour ${x.ept ? 'le GOSB' : x.dep ? 'le Val-de-Marne' : 'l\'Île-de-France'})` : '') + ` : ${hint}.` });
  }
  const ch = k.chomage;
  if (ch?.value != null) {
    const ref = ch.dep;
    out.push({ level: ref && ch.value - ref.value > 1 ? 'alerte' : 'info', text: `Taux de chômage au sens du recensement : ${f1(ch.value)} % en ${ch.period}` + (ref ? ` (Val-de-Marne ${f1(ref.value)} %)` : '') + (ch.prev ? `, ${sign(ch.value - ch.prev.value)} pt depuis ${ch.prev.period}.` : '.') });
  }
  const em = k.emploi_lt;
  if (em?.value != null && em.prev) {
    const pct = ((em.value - em.prev.value) / em.prev.value) * 100;
    out.push({ level: pct < 0 ? 'alerte' : 'positif', text: `${f1(em.value)} emplois au lieu de travail en ${em.period} (${sign(pct)} % depuis ${em.prev.period}) : indicateur de l'attractivité économique du territoire.` });
  }
  return out;
}

// classement des communes du GOSB sur les demandeurs d'emploi pour 1 000 habitants
function gosbRanking() {
  try {
    const d = layerData('defm_1000', 'gosb');
    if (!d?.values) return null;
    const names = Object.fromEntries(all(`SELECT code, nom FROM geos WHERE code IN (${membersOf('GOSB').map(() => '?').join(',')})`, ...membersOf('GOSB')).map((r) => [r.code, r.nom]));
    const rows = Object.entries(d.values).map(([code, v]) => ({ code, nom: names[code] || code, value: v.v, trend: v.trend })).sort((a, b) => b.value - a.value);
    return { period: d.period, rows };
  } catch { return null; }
}

const SOURCES = [
  { statut: 'intégré', titre: "Demandeurs d'emploi inscrits par commune (catégories A, B, C, sexe, âge)", detail: "DARES / France Travail (STMT), 10 années glissantes (4ᵉ trimestre). Téléchargé automatiquement depuis le portail ouvert de la DARES, sans clé. Alimente l'indicateur « Nombre de demandeurs d'emploi inscrits à France Travail », les KPI de cette page et la couche cartographique.", lien: 'https://www.data.gouv.fr/datasets/66df098924d76afbdd70938a' },
  { statut: 'piste', titre: 'API « Cadre de vie des communes » (France Travail, produit partagé eTerritoire)', detail: "Nombre d'équipements de sport, de santé, d'éducation, de loisirs et de services publics par commune, coordonnées et communes proches. Recoupe la base permanente des équipements de l'INSEE déjà intégrée : l'apport serait surtout les communes proches et l'angle « mobilité professionnelle ». La page du catalogue n'est pas lisible hors navigateur : conditions d'accès (clé ou non) à confirmer sur francetravail.io.", lien: 'https://francetravail.io/produits-partages/catalogue/cadre-vie-communes' },
  { statut: 'piste', titre: "Open data France Travail : offres d'emploi, tensions, déclarations d'embauche (DPAE)", detail: "Publiés à des mailles plus larges que la commune (région, département, zone d'emploi, bassin). Utiles pour situer le territoire (tension sur les métiers, dynamique des embauches), pas pour une carte communale.", lien: 'https://francetravail.org/opendata/' },
  { statut: 'piste', titre: "Indicateurs de suivi de l'assurance chômage (Unédic)", detail: 'Région et département : permet de comparer le Val-de-Marne à l’Île-de-France sur l’indemnisation.', lien: 'https://www.data.gouv.fr/pages/donnees_emploi' },
  { statut: 'piste', titre: 'Effectifs salariés et masse salariale trimestriels (Urssaf)', detail: "Par zone d'emploi : dynamique de l'emploi salarié privé autour d'Ivry (zone d'emploi de Créteil / Paris Sud).", lien: 'https://www.data.gouv.fr/pages/donnees_emploi' },
  { statut: 'à vérifier', titre: 'API France Travail (offres d’emploi, marché du travail, ROME)', detail: "Les API du catalogue francetravail.io demandent en général une inscription et un jeton OAuth : à confirmer avant tout développement. Je n'ai pas pu vérifier sans compte quelles API sont réellement ouvertes sans clé.", lien: 'https://francetravail.io/data/api' },
];

function build2(d = build()) {
  const kpis = d.kpis.filter((k) => k.theme === 'Emploi');
  return { generated: d.generated, kpis, insights: insights(kpis), ranking: gosbRanking(), sources: SOURCES };
}

module.exports = { build: build2 };
