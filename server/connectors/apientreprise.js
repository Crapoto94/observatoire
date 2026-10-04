// Connecteur API Entreprise (DINUM) : fiches « association » de la DJEPVA (Le Compte Asso, RNA, Sirene), accès habilité.
// DONNÉES NON PUBLIQUES : la clé (API_ENTREPRISE_KEY) est délivrée à la Ville pour ses missions ; chaque appel indique
// le destinataire (SIRET de la commune), le cadre (context) et l'objet. Seuls des agrégats communaux sont stockés :
// aucune donnée nominative (dirigeants, contacts, RIB, documents) n'est conservée.
//
// 1. liste des associations actives dont le SIÈGE est dans la commune (API Recherche d'entreprises, publique) ;
// 2. fiche de chaque association (GET /v4/djepva/api-association/associations/{siren}), 250 appels par minute au plus ;
// 3. agrégats : nombre d'associations (par objet social), adhérents, bénévoles, salariés, volontaires, comptes, licenciés.

const LIMIT_PER_MIN = 230; // sous la limite de 250 appels par minute
const SPACING = Math.ceil(60000 / LIMIT_PER_MIN);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function settings() {
  const base = (process.env.API_ENTREPRISE_URL || 'https://entreprise.api.gouv.fr').replace(/\/+$/, '').replace(/\/v4$/, '');
  const key = process.env.API_ENTREPRISE_KEY || '';
  if (!key) throw new Error('API Entreprise : clé absente (API_ENTREPRISE_KEY dans .env)');
  return { base, key, recipient: process.env.API_ENTREPRISE_RECIPIENT || '21940041300015' }; // SIRET du siège de la commune d'Ivry-sur-Seine
}

// associations actives dont le siège est dans la commune
async function associationsOf(code) {
  const out = new Map();
  for (let page = 1; page <= 400; page++) {
    const r = await fetch(`https://recherche-entreprises.api.gouv.fr/search?code_commune=${code}&est_association=true&etat_administratif=A&per_page=25&page=${page}`, { signal: AbortSignal.timeout(30000) });
    if (r.status === 429) { await sleep(2000); page--; continue; }
    if (!r.ok) throw new Error(`API Recherche d'entreprises : HTTP ${r.status}`);
    const j = await r.json();
    for (const x of j.results || []) if (x.siege?.commune === code) out.set(x.siren, { siren: x.siren, rna: x.complements?.identifiant_association || null });
    if (page >= (j.total_pages || 0)) break;
    await sleep(260);
  }
  return [...out.values()];
}

async function fiche(s, siren) {
  const q = new URLSearchParams({ context: 'Observatoire de la ville', object: 'Statistiques territoriales sur la vie associative', recipient: s.recipient });
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await fetch(`${s.base}/v4/djepva/api-association/associations/${siren}?${q}`, { headers: { Authorization: `Bearer ${s.key}`, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    if (r.status === 404 || r.status === 422) return null; // association inconnue du fournisseur
    if (r.status === 429) { await sleep(Number(r.headers.get('retry-after') || r.headers.get('ratelimit-reset') || 20) * 1000); continue; }
    if (r.status === 401 || r.status === 403) throw new Error(`API Entreprise : accès refusé (HTTP ${r.status}), vérifier la clé et ses habilitations`);
    if (r.status >= 500 || r.status === 502 || r.status === 504) { await sleep(2000 * attempt); continue; }
    if (!r.ok) throw new Error(`API Entreprise : HTTP ${r.status}`);
    return (await r.json()).data || null;
  }
  return null;
}

// dernière année renseignée d'une liste [{ annee, … }]
const latest = (list) => (list || []).filter((x) => x && x.annee != null).sort((a, b) => Number(b.annee) - Number(a.annee))[0] || null;
const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

function aggregate(fiches, nbListees, year) {
  const tot = { ADHERENTS: 0, BENEVOLES: 0, SALARIES: 0, SALARIES_ETPT: 0, VOLONTAIRES: 0, EMPLOIS_AIDES: 0, SUBVENTIONS: 0, DONS: 0, PRODUITS: 0, CHARGES: 0, LICENCIES: 0 };
  const cnt = { NB_FICHES: 0, NB_RH_DECLAREES: 0, NB_COMPTES_DECLARES: 0, NB_EMPLOYEUSES: 0, NB_RUP: 0, NB_AGREMENTS: 0, NB_ESS: 0, NB_SUBVENTIONNEES: 0 };
  const byObjet = new Map();
  for (const d of fiches) {
    cnt.NB_FICHES++;
    const objet = d.activites?.objet_social1?.libelle || 'Non renseigné';
    byObjet.set(objet, (byObjet.get(objet) || 0) + 1);
    if (d.reconnue_utilite_publique) cnt.NB_RUP++;
    if ((d.agrements || []).length) cnt.NB_AGREMENTS++;
    if (d.activites?.economie_sociale_et_solidaire) cnt.NB_ESS++;
    const tr = d.activites?.tranche_effectif?.code;
    if (tr && !['NN', '00'].includes(tr)) cnt.NB_EMPLOYEUSES++;
    let rhs = false, comptes = false;
    for (const e of d.etablissements || []) {
      const r = latest(e.rhs);
      if (r) {
        rhs = true;
        tot.ADHERENTS += num(r.nombre_adherents?.total) || 0; tot.BENEVOLES += num(r.nombre_benevoles) || 0; tot.SALARIES += num(r.nombre_salaries) || 0;
        tot.SALARIES_ETPT += num(r.nombre_salaries_etpt) || 0; tot.VOLONTAIRES += num(r.nombre_volontaires) || 0; tot.EMPLOIS_AIDES += num(r.nombre_emplois_aides) || 0;
      }
      const c = latest(e.comptes);
      if (c) {
        comptes = true;
        const sub = num(c.montant_subventions) || 0;
        tot.SUBVENTIONS += sub; tot.DONS += num(c.montant_dons) || 0; tot.PRODUITS += num(c.total_produits) || 0; tot.CHARGES += num(c.total_charges) || 0;
        if (sub > 0) cnt.NB_SUBVENTIONNEES++;
      }
    }
    if (rhs) cnt.NB_RH_DECLAREES++;
    if (comptes) cnt.NB_COMPTES_DECLARES++;
    for (const a of d.reseaux_affiliation || []) tot.LICENCIES += num(a.nombre_licencies?.total) || 0;
  }
  const rows = [{ period: year, dims: { MESURE: 'NB_ASSOCIATIONS', OBJET: '_T' }, measure: 'valeur', value: nbListees }];
  for (const [o, n] of byObjet) rows.push({ period: year, dims: { MESURE: 'NB_FICHES', OBJET: o }, measure: 'valeur', value: n });
  for (const [k, v] of Object.entries(cnt)) rows.push({ period: year, dims: { MESURE: k, OBJET: '_T' }, measure: 'valeur', value: v });
  for (const [k, v] of Object.entries(tot)) rows.push({ period: year, dims: { MESURE: k, OBJET: '_T' }, measure: 'valeur', value: Math.round(v * 100) / 100 });
  return rows;
}

/** Une commune (seulement celles listées dans config.communes : accès habilité et limité en débit). */
async function fetchGeo(config, geo) {
  if ((geo.level || 'COM') !== 'COM' || !(config.communes || []).includes(geo.code)) return null;
  const s = settings();
  const list = await associationsOf(geo.code);
  const fiches = [];
  let last = 0;
  // trois appels en parallèle, espacés pour rester sous la limite par minute
  const queue = [...list];
  const worker = async () => {
    while (queue.length) {
      const a = queue.shift();
      const wait = last + SPACING - Date.now();
      last = Math.max(Date.now(), last + SPACING);
      if (wait > 0) await sleep(wait);
      const d = await fiche(s, a.siren);
      if (d) fiches.push(d);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return aggregate(fiches, list.length, String(new Date().getFullYear()));
}

module.exports = { fetchGeo, aggregate };
