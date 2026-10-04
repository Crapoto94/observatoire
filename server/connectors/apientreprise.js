// Connecteur API Entreprise (DINUM), accès habilité : fiches « association » de la DJEPVA (Le Compte Asso, RNA, Sirene)
// et subventions publiques reçues par les associations (Data Subvention).
// DONNÉES NON PUBLIQUES : la clé (API_ENTREPRISE_KEY) est délivrée à la Ville pour ses missions ; chaque appel indique
// le destinataire (SIRET de la commune), le cadre (context) et l'objet. Seuls des agrégats communaux sont stockés :
// aucune donnée nominative (dirigeants, contacts, RIB, documents) n'est conservée, ni en agrégat ni dans les caches.
//
// Unité d'analyse : les associations actives dont le SIÈGE est dans la commune (API Recherche d'entreprises, publique).
// 1. fiches DJEPVA (associations_api) : objet social, champ d'action, création, effectifs et comptes déclarés du siège ;
//    têtes de réseau (champ d'action régional, national ou international, plusieurs établissements ailleurs, effectifs hors
//    d'échelle) exclues des totaux et comptées à part ;
// 2. subventions (subventions_asso) : demandes (montants demandés et accordés, statut) et versements de l'État, par année,
//    financeur et politique publique, pour les associations locales (têtes de réseau exclues).
// Caches de 30 jours (extraits non nominatifs) : seul le premier import interroge toutes les associations.

const { db, all, run } = require('../db');

const LIMIT_PER_MIN = 230; // sous la limite de 250 appels par minute (jeton)
const SPACING = Math.ceil(60000 / LIMIT_PER_MIN);
const MAX_AGE = 30 * 24 * 3600 * 1000;
const ECHEC_AGE = 7 * 24 * 3600 * 1000;
const EXTRACT_VERSION = 2; // version des extraits mis en cache : un changement provoque une relecture
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

db.exec(`CREATE TABLE IF NOT EXISTS asso_fiches (siren TEXT PRIMARY KEY, commune TEXT, fetched_at TEXT, extrait TEXT)`);
db.exec(`CREATE TABLE IF NOT EXISTS asso_subventions (siren TEXT PRIMARY KEY, commune TEXT, fetched_at TEXT, extrait TEXT)`);

function settings() {
  const base = (process.env.API_ENTREPRISE_URL || 'https://entreprise.api.gouv.fr').replace(/\/+$/, '').replace(/\/v4$/, '');
  const key = process.env.API_ENTREPRISE_KEY || '';
  if (!key) throw new Error('API Entreprise : clé absente (API_ENTREPRISE_KEY dans .env)');
  return { base, key, recipient: process.env.API_ENTREPRISE_RECIPIENT || '21940041300015' }; // SIRET du siège de la commune d'Ivry-sur-Seine
}

// rythme commun à tous les appels (la limite s'applique au jeton)
let lastCall = 0;
async function slot() {
  const wait = lastCall + SPACING - Date.now();
  lastCall = Math.max(Date.now(), lastCall + SPACING);
  if (wait > 0) await sleep(wait);
}

// null = aucune information (404) ; undefined = échec (erreurs du fournisseur) : non mis en cache, retenté au prochain import
async function callApi(s, path, { retries5xx = 1 } = {}) {
  const q = new URLSearchParams({ context: 'Observatoire de la ville', object: 'Statistiques territoriales sur la vie associative', recipient: s.recipient });
  let fails = 0;
  for (let attempt = 1; attempt <= 6; attempt++) {
    await slot();
    const r = await fetch(`${s.base}${path}?${q}`, { headers: { Authorization: `Bearer ${s.key}`, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    if (r.status === 404 || r.status === 422) return null; // inconnu du fournisseur ou sans information
    if (r.status === 429) { await sleep(Math.min(60, Number(r.headers.get('retry-after') || 20)) * 1000); continue; }
    if (r.status === 401 || r.status === 403) throw new Error(`API Entreprise : accès refusé (HTTP ${r.status}), vérifier la clé et ses habilitations`);
    // erreurs du fournisseur : souvent persistantes pour une même association (502 immédiats sur Data Subvention)
    if (r.status >= 500) { if (++fails > retries5xx) return undefined; await sleep(2500); continue; }
    if (!r.ok) throw new Error(`API Entreprise : HTTP ${r.status}`);
    return (await r.json()).data ?? null;
  }
  return undefined;
}

// associations actives dont le siège est dans la commune
async function associationsOf(code) {
  const out = new Map();
  for (let page = 1; page <= 400; page++) {
    const r = await fetch(`https://recherche-entreprises.api.gouv.fr/search?code_commune=${code}&est_association=true&etat_administratif=A&per_page=25&page=${page}`, { signal: AbortSignal.timeout(30000) });
    if (r.status === 429) { await sleep(2000); page--; continue; }
    if (!r.ok) throw new Error(`API Recherche d'entreprises : HTTP ${r.status}`);
    const j = await r.json();
    for (const x of j.results || []) if (x.siege?.commune === code) out.set(x.siren, { siren: x.siren });
    if (page >= (j.total_pages || 0)) break;
    await sleep(260);
  }
  return [...out.values()];
}

// lecture des fiches manquantes ou anciennes, avec cache (trois appels en parallèle, rythme commun)
async function refresh(table, list, code, read, label, { workers = 3, budgetMs = 18 * 60000 } = {}) {
  const deadline = Date.now() + budgetMs;
  const cached = new Map(all(`SELECT siren, fetched_at, extrait FROM ${table} WHERE commune = ?`, code).map((r) => [r.siren, r]));
  const stale = list.filter((a) => {
    const c = cached.get(a.siren);
    if (!c || Date.now() - Date.parse(c.fetched_at) > MAX_AGE) return true;
    try {
      const x = c.extrait != null ? JSON.parse(c.extrait) : null;
      if (x?.echec) return Date.now() - Date.parse(c.fetched_at) > ECHEC_AGE; // erreur persistante du fournisseur : nouvel essai après 7 jours
      return x != null && x.v !== EXTRACT_VERSION;
    } catch { return true; }
  });
  console.log(`[api-entreprise] ${label} ${code} : ${list.length} associations, ${stale.length} à lire (${list.length - stale.length} en cache)`);
  let done = 0, failed = 0;
  const queue = [...stale];
  const worker = async () => {
    while (queue.length && Date.now() < deadline) {
      const a = queue.shift();
      const x = await read(a.siren);
      if (x === undefined) failed++; // échec persistant du fournisseur : mémorisé 7 jours pour ne pas le retenter à chaque import
      run(`INSERT INTO ${table} (siren, commune, fetched_at, extrait) VALUES (?,?,?,?) ON CONFLICT(siren) DO UPDATE SET commune = excluded.commune, fetched_at = excluded.fetched_at, extrait = excluded.extrait`,
        a.siren, code, new Date().toISOString(), x === undefined ? JSON.stringify({ v: EXTRACT_VERSION, echec: true }) : x ? JSON.stringify({ v: EXTRACT_VERSION, ...x }) : null);
      if (++done % 200 === 0) console.log(`[api-entreprise] ${label} ${code} : ${done} / ${stale.length}`);
    }
  };
  await Promise.all(Array.from({ length: workers }, worker));
  if (failed || queue.length) console.log(`[api-entreprise] ${label} ${code} : ${failed} échec(s) du fournisseur, ${queue.length} reportée(s) au prochain import (budget de temps)`);
  const ids = new Set(list.map((a) => a.siren));
  const rows = all(`SELECT siren, extrait FROM ${table} WHERE commune = ? AND extrait IS NOT NULL`, code).filter((r) => ids.has(r.siren)).map((r) => [r.siren, JSON.parse(r.extrait)]);
  const echecs = rows.filter(([, x]) => x.echec).length;
  if (echecs) console.log(`[api-entreprise] ${label} ${code} : ${echecs} association(s) non renseignée(s) (erreur du fournisseur)`);
  return new Map(rows.filter(([, x]) => !x.echec));
}

// ---------------- 1. fiches DJEPVA ----------------
const latest = (list) => (list || []).filter((x) => x && x.annee != null).sort((a, b) => Number(b.annee) - Number(a.annee))[0] || null;

function extract(d) {
  const rhs = (r) => r && { annee: r.annee, adherents: num(r.nombre_adherents?.total), benevoles: num(r.nombre_benevoles), salaries: num(r.nombre_salaries), etpt: num(r.nombre_salaries_etpt), volontaires: num(r.nombre_volontaires), aides: num(r.nombre_emplois_aides) };
  const cpt = (c) => c && { annee: c.annee, subventions: num(c.montant_subventions), dons: num(c.montant_dons), produits: num(c.total_produits), charges: num(c.total_charges) };
  return {
    objet: d.activites?.objet_social1?.libelle || null, tranche: d.activites?.tranche_effectif?.code || null, rup: !!d.reconnue_utilite_publique,
    champ: d.activites?.champ_action_territorial || null, creation: d.date_creation ? String(d.date_creation).slice(0, 4) : null,
    agrements: (d.agrements || []).length, affiliations: (d.reseaux_affiliation || []).length,
    etablissements: (d.etablissements || []).map((e) => ({ commune: e.adresse?.code_insee || null, siege: !!e.siege, rhs: rhs(latest(e.rhs)), comptes: cpt(latest(e.comptes)) })),
  };
}

const MAX_LOCAL_ADHERENTS = 20000;
const CHAMPS_RESEAU = /regional|national|international|europeen/;
const siegeOf = (x) => (x.etablissements || []).find((e) => e.siege) || (x.etablissements || [])[0] || null;
const isReseau = (x, code) => CHAMPS_RESEAU.test(plain(x.champ))
  || (x.etablissements || []).filter((e) => e.commune && e.commune !== code).length >= 2
  || (siegeOf(x)?.rhs?.adherents || 0) > MAX_LOCAL_ADHERENTS;

function aggregate(extraits, nbListees, year, code) {
  const tot = { ADHERENTS: 0, BENEVOLES: 0, SALARIES: 0, SALARIES_ETPT: 0, VOLONTAIRES: 0, EMPLOIS_AIDES: 0, SUBVENTIONS: 0, DONS: 0, PRODUITS: 0, CHARGES: 0 };
  const cnt = { NB_FICHES: 0, NB_TETES_RESEAU: 0, NB_RH_DECLAREES: 0, NB_COMPTES_DECLARES: 0, NB_EMPLOYEUSES: 0, NB_RUP: 0, NB_AGREMENTS: 0, NB_AFFILIEES: 0, NB_SUBVENTIONNEES: 0 };
  const byObjet = new Map(), byChamp = new Map(), byCreation = new Map();
  const thisYear = Number(year);
  for (const x of extraits) {
    cnt.NB_FICHES++;
    const objet = x.objet || 'Non renseigné';
    byObjet.set(objet, (byObjet.get(objet) || 0) + 1);
    const champ = x.champ || 'non renseigné';
    byChamp.set(champ, (byChamp.get(champ) || 0) + 1);
    const y = Number(x.creation);
    if (y >= thisYear - 25 && y <= thisYear) byCreation.set(String(y), (byCreation.get(String(y)) || 0) + 1);
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
  const row = (period, dims, value) => ({ period, dims: { OBJET: '_T', CHAMP: '_T', ...dims }, measure: 'valeur', value });
  const rows = [row(year, { MESURE: 'NB_ASSOCIATIONS' }, nbListees)];
  for (const [o, n] of byObjet) rows.push(row(year, { MESURE: 'NB_FICHES', OBJET: o }, n));
  for (const [c, n] of byChamp) rows.push(row(year, { MESURE: 'NB_FICHES', CHAMP: c }, n));
  // créations par année des associations encore actives (ancienneté du tissu associatif, pas un flux complet)
  for (const [y, n] of byCreation) rows.push(row(y, { MESURE: 'NB_CREEES' }, n));
  for (const [k, v] of Object.entries(cnt)) rows.push(row(year, { MESURE: k }, v));
  for (const [k, v] of Object.entries(tot)) rows.push(row(year, { MESURE: k }, Math.round(v * 100) / 100));
  return rows;
}

// communes analysées : API_ENTREPRISE_COMMUNES (codes INSEE séparés par des virgules) en plus de config.communes (Ivry).
// Une commune de comparaison coûte une fiche par association ayant son siège chez elle (≈ 5 min pour 1 000 associations la première fois).
const communesOf = (config) => (process.env.API_ENTREPRISE_COMMUNES || '').split(/[,\s]+/).filter((c) => /^\d[\dAB]\d{3}$/.test(c)).concat(config.communes || []);
const listCache = new Map(); // liste des associations d'une commune, réutilisée par les deux jeux pendant une heure
async function listOf(code) {
  const c = listCache.get(code);
  if (c && Date.now() - c.at < 3600 * 1000) return c.list;
  const list = await associationsOf(code);
  listCache.set(code, { at: Date.now(), list });
  return list;
}

/** Fiches DJEPVA d'une commune analysée. */
async function fetchGeo(config, geo) {
  if ((geo.level || 'COM') !== 'COM' || !communesOf(config).includes(geo.code)) return null;
  const s = settings();
  const list = await listOf(geo.code);
  const fiches = await refresh('asso_fiches', list, geo.code, async (siren) => { const d = await callApi(s, `/v4/djepva/api-association/associations/${siren}`, { retries5xx: 2 }); return d === undefined ? undefined : d ? extract(d) : null; }, 'fiches', { workers: 3, budgetMs: 8 * 60000 });
  return aggregate([...fiches.values()], list.length, String(new Date().getFullYear()), geo.code);
}

// ---------------- 2. subventions (Data Subvention) ----------------
// financeur : collectivités publiant leurs subventions au format SCDL (fournisseur « scdl-<SIRET> ») selon le SIREN, sinon l'État
function financeurOf(fournisseur, communeSiren) {
  const m = /^scdl-(\d{9})/.exec(String(fournisseur || ''));
  if (!m) return 'ETAT';
  const siren = m[1];
  if (communeSiren && siren === communeSiren) return 'COMMUNE';
  if (siren === '200058014') return 'EPT';
  if (/^21/.test(siren)) return 'AUTRE_COMMUNE';
  if (/^22/.test(siren)) return 'DEPARTEMENT';
  if (/^23/.test(siren)) return 'REGION';
  if (/^2(00|4)/.test(siren)) return 'INTERCOMMUNALITE';
  return 'AUTRE';
}
const PROGRAMMES = {
  147: 'POLITIQUE_VILLE', 219: 'SPORT', 163: 'JEUNESSE_VIE_ASSO', 224: 'CULTURE', 131: 'CULTURE', 175: 'CULTURE', 361: 'CULTURE', 334: 'CULTURE',
  102: 'EMPLOI', 103: 'EMPLOI', 111: 'EMPLOI', 304: 'SOLIDARITES', 177: 'SOLIDARITES', 157: 'SOLIDARITES', 183: 'SOLIDARITES', 104: 'INTEGRATION', 303: 'INTEGRATION',
  137: 'EGALITE', 230: 'EDUCATION', 214: 'EDUCATION', 139: 'EDUCATION', 140: 'EDUCATION', 141: 'EDUCATION', 113: 'ENVIRONNEMENT', 181: 'ENVIRONNEMENT', 204: 'SANTE',
};
function domaineOf(dispositif) {
  const t = plain(dispositif);
  if (!t) return 'AUTRE';
  if (/politique de la ville|vvv|quartier|contrat de ville|adultes.relais/.test(t)) return 'POLITIQUE_VILLE';
  if (/\bans\b|sport|pass.?sport/.test(t)) return 'SPORT';
  if (/fdva|fonjep|jeunesse|vie associative|service civique|education populaire/.test(t)) return 'JEUNESSE_VIE_ASSO';
  if (/cultur|\bart|patrimoine|livre|musique|spectacle|cinema/.test(t)) return 'CULTURE';
  if (/emploi|insertion|formation|apprentissage/.test(t)) return 'EMPLOI';
  if (/egalite|femmes|violences/.test(t)) return 'EGALITE';
  if (/integration|refugi|migrant|langue/.test(t)) return 'INTEGRATION';
  if (/solidarit|social|pauvret|handicap|famil|precarit|alimentaire/.test(t)) return 'SOLIDARITES';
  if (/environnement|climat|biodiversit|transition|nature/.test(t)) return 'ENVIRONNEMENT';
  if (/sante|prevention/.test(t)) return 'SANTE';
  if (/education|scolaire|ecole/.test(t)) return 'EDUCATION';
  return 'AUTRE';
}
const statutOf = (s) => { const t = plain(s); return /accord/.test(t) ? 'accorde' : /refus|ineligible|rejet|irrecevable/.test(t) ? 'refuse' : /instruction|cours|depose/.test(t) ? 'instruction' : 'autre'; };

function extractSubventions(items, communeSiren) {
  const out = [];
  for (const it of items || []) {
    const d = it?.data || it || {};
    const ds = d.demande_subvention;
    if (ds && ds.annee_exercice_demande) {
      const disp = ds.subvention_demandee?.dispositif || ds.subvention_demandee?.sous_dispositif || '';
      out.push({ k: 'd', a: String(ds.annee_exercice_demande), f: financeurOf(ds.fournisseur, communeSiren), dom: domaineOf(disp), dem: num(ds.subvention_demandee?.montant_demande), acc: num(ds.instruction?.montant_accorde), st: statutOf(ds.instruction?.statut_demande) });
    }
    for (const p of d.paiements || []) {
      if (!p.date_versement || num(p.montant_verse) == null) continue;
      const prog = num(p.programme?.numero);
      out.push({ k: 'p', a: String(p.date_versement).slice(0, 4), f: financeurOf(p.fournisseur, communeSiren), dom: PROGRAMMES[prog] || domaineOf(p.programme?.libelle || p.domaine_fonctionnel), v: num(p.montant_verse) });
    }
  }
  return { r: out };
}

function aggregateSubventions(bySiren, exclus) {
  const acc = new Map();
  const assos = new Map();
  const thisYear = new Date().getFullYear();
  const add = (period, mesure, fin, dom, v, siren) => {
    for (const f of [fin, '_T']) for (const d of [dom, '_T']) {
      const key = `${period}|${mesure}|${f}|${d}`;
      acc.set(key, (acc.get(key) || 0) + v);
      if (siren) { const k2 = `${period}|${f}|${d}`; (assos.get(k2) || assos.set(k2, new Set()).get(k2)).add(siren); }
    }
  };
  for (const [siren, x] of bySiren) {
    if (exclus.has(siren)) continue;
    for (const r of x.r || []) {
      const y = Number(r.a);
      if (!(y >= 2015 && y <= thisYear)) continue;
      if (r.k === 'p') { add(r.a, 'MONTANT_VERSE', r.f, r.dom, r.v || 0, (r.v || 0) > 0 ? siren : null); continue; }
      add(r.a, 'NB_DEMANDES', r.f, r.dom, 1);
      if (r.dem != null) add(r.a, 'MONTANT_DEMANDE', r.f, r.dom, r.dem);
      if (r.st === 'accorde' || r.st === 'refuse') add(r.a, 'NB_DECIDEES', r.f, r.dom, 1);
      if (r.st === 'accorde') { add(r.a, 'NB_ACCORDEES', r.f, r.dom, 1, siren); if (r.acc != null) add(r.a, 'MONTANT_ACCORDE', r.f, r.dom, r.acc); }
    }
  }
  const rows = [];
  for (const [key, v] of acc) {
    const [period, MESURE, FINANCEUR, DOMAINE] = key.split('|');
    rows.push({ period, dims: { MESURE, FINANCEUR, DOMAINE }, measure: 'valeur', value: Math.round(v * 100) / 100 });
  }
  for (const [key, set] of assos) {
    const [period, FINANCEUR, DOMAINE] = key.split('|');
    rows.push({ period, dims: { MESURE: 'NB_ASSOCIATIONS_SOUTENUES', FINANCEUR, DOMAINE }, measure: 'valeur', value: set.size });
  }
  return rows;
}

const COMMUNE_SIREN = { 94041: '219400413' }; // SIREN des communes analysées, pour reconnaître leurs propres subventions (SCDL)

/** Subventions reçues par les associations ayant leur siège dans une commune analysée. */
async function fetchSubventions(config, geo) {
  if ((geo.level || 'COM') !== 'COM' || !communesOf(config).includes(geo.code)) return null;
  const s = settings();
  const list = await listOf(geo.code);
  const communeSiren = COMMUNE_SIREN[geo.code] || null;
  const subs = await refresh('asso_subventions', list, geo.code, async (siren) => { const d = await callApi(s, `/v3/data_subvention/associations/${siren}/subventions`, { retries5xx: 2 }); return d === undefined ? undefined : d ? extractSubventions(d, communeSiren) : null; }, 'subventions', { workers: 2, budgetMs: 18 * 60000 });
  // têtes de réseau exclues (subventions nationales), d'après les fiches DJEPVA déjà lues
  const exclus = new Set(all('SELECT siren, extrait FROM asso_fiches WHERE commune = ? AND extrait IS NOT NULL', geo.code)
    .filter((r) => { try { return isReseau(JSON.parse(r.extrait), geo.code); } catch { return false; } }).map((r) => r.siren));
  return aggregateSubventions(subs, exclus);
}

module.exports = { fetchGeo, fetchSubventions, aggregate, extract, extractSubventions, aggregateSubventions, financeurOf, domaineOf };
