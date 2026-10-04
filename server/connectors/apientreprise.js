// Connecteur API Entreprise (DINUM) : fiches « association » de la DJEPVA (Le Compte Asso, RNA, Sirene), accès habilité.
// DONNÉES NON PUBLIQUES : la clé (API_ENTREPRISE_KEY) est délivrée à la Ville pour ses missions ; chaque appel indique
// le destinataire (SIRET de la commune), le cadre (context) et l'objet. Seuls des agrégats communaux sont stockés :
// aucune donnée nominative (dirigeants, contacts, RIB, documents) n'est conservée, ni en agrégat ni dans le cache des fiches.
//
// 1. liste des associations actives dont le SIÈGE est dans la commune (API Recherche d'entreprises, publique) ;
// 2. fiche de chaque association (GET /v4/djepva/api-association/associations/{siren}), 250 appels par minute au plus ;
// 3. agrégats : nombre d'associations (par objet social), adhérents, bénévoles, salariés, volontaires, comptes, affiliations ;
//    chiffres du siège uniquement, têtes de réseau nationales exclues des totaux (comptées à part).

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

// ---------------- cache des fiches (extrait NON NOMINATIF) ----------------
// Une fiche n'est réinterrogée qu'au-delà de 30 jours : le premier import lit toutes les associations (≈ 6 min pour 1 300),
// les suivants seulement les fiches anciennes ou nouvelles. Aucun nom de personne, contact, RIB ni document n'est conservé.
const { db, all, run } = require('../db');
db.exec(`CREATE TABLE IF NOT EXISTS asso_fiches (siren TEXT PRIMARY KEY, commune TEXT, fetched_at TEXT, extrait TEXT)`);
const MAX_AGE = 30 * 24 * 3600 * 1000;

function extract(d) {
  const rhs = (r) => r && { annee: r.annee, adherents: num(r.nombre_adherents?.total), benevoles: num(r.nombre_benevoles), salaries: num(r.nombre_salaries), etpt: num(r.nombre_salaries_etpt), volontaires: num(r.nombre_volontaires), aides: num(r.nombre_emplois_aides) };
  const cpt = (c) => c && { annee: c.annee, subventions: num(c.montant_subventions), dons: num(c.montant_dons), produits: num(c.total_produits), charges: num(c.total_charges) };
  return {
    objet: d.activites?.objet_social1?.libelle || null, tranche: d.activites?.tranche_effectif?.code || null, rup: !!d.reconnue_utilite_publique,
    agrements: (d.agrements || []).length, affiliations: (d.reseaux_affiliation || []).length,
    etablissements: (d.etablissements || []).map((e) => ({ commune: e.adresse?.code_insee || null, siege: !!e.siege, rhs: rhs(latest(e.rhs)), comptes: cpt(latest(e.comptes)) })),
  };
}

// Têtes de réseau : associations nationales ou régionales domiciliées dans la commune (plusieurs établissements ailleurs, ou effectifs
// déclarés hors d'échelle) : leurs ressources humaines et leurs comptes sont nationaux, ils sont exclus des totaux et comptés à part.
const MAX_LOCAL_ADHERENTS = 20000;
const siegeOf = (x) => x.etablissements.find((e) => e.siege) || x.etablissements[0] || null;
const isReseau = (x, code) => x.etablissements.filter((e) => e.commune && e.commune !== code).length >= 2 || (siegeOf(x)?.rhs?.adherents || 0) > MAX_LOCAL_ADHERENTS;

function aggregate(extraits, nbListees, year, code) {
  const tot = { ADHERENTS: 0, BENEVOLES: 0, SALARIES: 0, SALARIES_ETPT: 0, VOLONTAIRES: 0, EMPLOIS_AIDES: 0, SUBVENTIONS: 0, DONS: 0, PRODUITS: 0, CHARGES: 0 };
  const cnt = { NB_FICHES: 0, NB_TETES_RESEAU: 0, NB_RH_DECLAREES: 0, NB_COMPTES_DECLARES: 0, NB_EMPLOYEUSES: 0, NB_RUP: 0, NB_AGREMENTS: 0, NB_AFFILIEES: 0, NB_SUBVENTIONNEES: 0 };
  const byObjet = new Map();
  for (const x of extraits) {
    cnt.NB_FICHES++;
    const objet = x.objet || 'Non renseigné';
    byObjet.set(objet, (byObjet.get(objet) || 0) + 1);
    if (x.rup) cnt.NB_RUP++;
    if (x.agrements) cnt.NB_AGREMENTS++;
    if (x.affiliations) cnt.NB_AFFILIEES++;
    if (x.tranche && !['NN', '00'].includes(x.tranche)) cnt.NB_EMPLOYEUSES++;
    if (isReseau(x, code)) { cnt.NB_TETES_RESEAU++; continue; } // effectifs et comptes nationaux : hors totaux communaux
    const siege = siegeOf(x);
    const r = siege?.rhs;
    if (r) {
      cnt.NB_RH_DECLAREES++;
      tot.ADHERENTS += r.adherents || 0; tot.BENEVOLES += r.benevoles || 0; tot.SALARIES += r.salaries || 0;
      tot.SALARIES_ETPT += r.etpt || 0; tot.VOLONTAIRES += r.volontaires || 0; tot.EMPLOIS_AIDES += r.aides || 0;
    }
    const c = siege?.comptes;
    if (c) {
      cnt.NB_COMPTES_DECLARES++;
      tot.SUBVENTIONS += c.subventions || 0; tot.DONS += c.dons || 0; tot.PRODUITS += c.produits || 0; tot.CHARGES += c.charges || 0;
      if ((c.subventions || 0) > 0) cnt.NB_SUBVENTIONNEES++;
    }
  }
  const rows = [{ period: year, dims: { MESURE: 'NB_ASSOCIATIONS', OBJET: '_T' }, measure: 'valeur', value: nbListees }];
  for (const [o, n] of byObjet) rows.push({ period: year, dims: { MESURE: 'NB_FICHES', OBJET: o }, measure: 'valeur', value: n });
  for (const [k, v] of Object.entries(cnt)) rows.push({ period: year, dims: { MESURE: k, OBJET: '_T' }, measure: 'valeur', value: v });
  for (const [k, v] of Object.entries(tot)) rows.push({ period: year, dims: { MESURE: k, OBJET: '_T' }, measure: 'valeur', value: Math.round(v * 100) / 100 });
  return rows;
}

// communes analysées : API_ENTREPRISE_COMMUNES (codes INSEE séparés par des virgules) sinon config.communes (Ivry).
// Une commune de comparaison coûte une fiche par association ayant son siège chez elle (≈ 5 min pour 1 000 associations la première fois).
const communesOf = (config) => (process.env.API_ENTREPRISE_COMMUNES || '').split(/[,\s]+/).filter((c) => /^\d[\dAB]\d{3}$/.test(c)).concat(config.communes || []);

/** Une commune (seulement celles analysées : accès habilité et limité en débit). */
async function fetchGeo(config, geo) {
  if ((geo.level || 'COM') !== 'COM' || !communesOf(config).includes(geo.code)) return null;
  const s = settings();
  const list = await associationsOf(geo.code);
  const cached = new Map(all('SELECT siren, fetched_at, extrait FROM asso_fiches WHERE commune = ?', geo.code).map((r) => [r.siren, r]));
  const stale = list.filter((a) => { const c = cached.get(a.siren); return !c || Date.now() - Date.parse(c.fetched_at) > MAX_AGE; });
  console.log(`[api-entreprise] ${geo.code} : ${list.length} associations, ${stale.length} fiche(s) à lire (${list.length - stale.length} en cache)`);
  let last = 0, done = 0;
  const queue = [...stale];
  // trois appels en parallèle, espacés pour rester sous la limite par minute
  const worker = async () => {
    while (queue.length) {
      const a = queue.shift();
      const wait = last + SPACING - Date.now();
      last = Math.max(Date.now(), last + SPACING);
      if (wait > 0) await sleep(wait);
      const d = await fiche(s, a.siren);
      const x = d ? JSON.stringify(extract(d)) : null;
      run('INSERT INTO asso_fiches (siren, commune, fetched_at, extrait) VALUES (?,?,?,?) ON CONFLICT(siren) DO UPDATE SET commune = excluded.commune, fetched_at = excluded.fetched_at, extrait = excluded.extrait', a.siren, geo.code, new Date().toISOString(), x);
      if (++done % 200 === 0) console.log(`[api-entreprise] ${geo.code} : ${done} / ${stale.length} fiches lues`);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  const ids = new Set(list.map((a) => a.siren));
  const extraits = all('SELECT siren, extrait FROM asso_fiches WHERE commune = ? AND extrait IS NOT NULL', geo.code).filter((r) => ids.has(r.siren)).map((r) => JSON.parse(r.extrait));
  return aggregate(extraits, list.length, String(new Date().getFullYear()), geo.code);
}

module.exports = { fetchGeo, aggregate, extract };
