// Initialisation de la base : indicateurs (server/seed/indicators.json), jeux de données, rattachements, commune de référence.
const fs = require('fs');
const path = require('path');
const { db, all, get, run, tx } = require('./db');
const DATASETS = require('./datasets');
const { enrich, norm, classify } = require('./seed/enrichment');

const REF_GEO = { code: '94041', nom: 'Ivry-sur-Seine', dept: '94', population: 65064, level: 'COM' };

// Territoires de comparaison disponibles d'emblée (retirables depuis l'interface)
const DEFAULT_GEOS = [
  { code: '94', nom: 'Val-de-Marne (département)', level: 'DEP' },
  { code: '200054781', nom: 'Métropole du Grand Paris', level: 'EPCI' },
  { code: '11', nom: 'Île-de-France (région)', level: 'REG' },
  { code: '94081', nom: 'Vitry-sur-Seine', dept: '94', population: 93963, level: 'COM' },
  { code: '94076', nom: 'Villejuif', dept: '94', population: 60183, level: 'COM' },
  { code: '94043', nom: 'Le Kremlin-Bicêtre', dept: '94', population: 24110, level: 'COM' },
  { code: '94037', nom: 'Gentilly', dept: '94', population: 19963, level: 'COM' },
  { code: '94002', nom: 'Alfortville', dept: '94', population: 45531, level: 'COM' },
  { code: '94022', nom: 'Choisy-le-Roi', dept: '94', population: 45946, level: 'COM' },
  { code: '94028', nom: 'Créteil', dept: '94', population: 93397, level: 'COM' },
  { code: '94017', nom: 'Champigny-sur-Marne', dept: '94', population: 78072, level: 'COM' },
  { code: '93048', nom: 'Montreuil', dept: '93', population: 111934, level: 'COM' },
  { code: '93066', nom: 'Saint-Denis', dept: '93', population: 149077, level: 'COM' },
  { code: '92050', nom: 'Nanterre', dept: '92', population: 97783, level: 'COM' },
];

function seedIndicators() {
  const file = path.join(__dirname, 'seed', 'indicators.json');
  const list = JSON.parse(fs.readFileSync(file, 'utf8'));
  tx(() => {
    for (const i of list) {
      const e = enrich(i);
      run(
        `INSERT INTO indicators (theme, theme_label, groupe, groupe_label, excel_sheet, excel_row, sous_ligne, ordre, niveau,
          libelle, libelle_carte, priorite, source, lien_origine, lien_corrige, periodicite, proposition, lien_donnees, notes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        i.theme, i.theme_label, i.groupe, i.groupe_label, i.excel_sheet, i.excel_row, i.sous_ligne, i.ordre, i.niveau,
        i.libelle, i.libelle_carte, i.priorite, i.source, i.lien_origine, e.lien_corrige, i.periodicite,
        e.proposition, e.lien_donnees,
        e.notes || (i.niveau_carte ? `Incohérence : niveau « ${i.niveau} » dans le classeur, « ${i.niveau_carte} » dans la carte mentale.` : null)
      );
    }
  });
  return list.length;
}

// Renseigne origine et cartographie des indicateurs qui n'en ont pas encore (sans toucher aux valeurs déjà saisies)
function classifyMissing() {
  const rows = all('SELECT id, libelle, niveau FROM indicators WHERE origine IS NULL OR cartographie IS NULL');
  for (const r of rows) {
    const c = classify(r);
    run('UPDATE indicators SET origine = COALESCE(origine, ?), cartographie = COALESCE(cartographie, ?) WHERE id = ?', c.origine, c.cartographie, r.id);
  }
  if (rows.length) console.log(`[seed] origine et cartographie renseignées pour ${rows.length} indicateurs`);
}

function upsertDatasets() {
  const fresh = [];
  for (const d of DATASETS) {
    const exists = get('SELECT id FROM datasets WHERE id = ?', d.id);
    if (!exists) fresh.push(d);
    run(
      `INSERT INTO datasets (id, label, provider, config, description, themes, doc_url) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET label=excluded.label, provider=excluded.provider, config=excluded.config,
         description=excluded.description, themes=excluded.themes, doc_url=excluded.doc_url`,
      d.id, d.label, d.provider, JSON.stringify(d.config), d.description, JSON.stringify(d.themes), d.doc_url
    );
  }
  return fresh;
}

function autoLink(datasets) {
  const inds = all('SELECT id, theme, groupe, libelle FROM indicators');
  let n = 0;
  for (const d of datasets) {
    for (const rule of d.link) {
      for (const i of inds) {
        if (rule.theme && rule.theme !== i.theme) continue;
        if (rule.groupe && rule.groupe !== i.groupe) continue;
        if (!rule.re.test(norm(i.libelle))) continue;
        n += run('INSERT OR IGNORE INTO indicator_datasets (indicator_id, dataset_id) VALUES (?,?)', i.id, d.id).changes;
      }
    }
  }
  return n;
}

function seed({ reset = false } = {}) {
  let seeded = false;
  if (reset) {
    run('DELETE FROM indicator_datasets');
    run('DELETE FROM indicators');
    run('DELETE FROM indicator_history');
  }
  if (get('SELECT COUNT(*) AS n FROM indicators').n === 0) {
    console.log(`[seed] ${seedIndicators()} indicateurs importés`);
    seeded = true;
  }
  const fresh = upsertDatasets();
  const toLink = seeded ? DATASETS : fresh;
  if (toLink.length) console.log(`[seed] ${autoLink(toLink)} rattachements indicateur/jeu de données`);
  classifyMissing();
  if (seeded) {
    // faisabilité proposée : 1 = jeu importable, 2 = source identifiée sans import, 3 = à produire ou source à définir
    run(`UPDATE indicators SET faisabilite = CASE
      WHEN id IN (SELECT indicator_id FROM indicator_datasets) THEN 1
      WHEN niveau = 'prospective' THEN 3
      WHEN lien_donnees IS NOT NULL AND lien_donnees <> '' THEN 2
      ELSE 3 END`);
  }
  run(
    `INSERT INTO geos (code, nom, dept, population, fixed, level) VALUES (?,?,?,?,1,'COM')
     ON CONFLICT(code) DO UPDATE SET fixed = 1`,
    REF_GEO.code, REF_GEO.nom, REF_GEO.dept, REF_GEO.population
  );
  // les territoires par défaut ne sont ajoutés qu'au premier démarrage (un territoire retiré ne réapparaît pas)
  if (get('SELECT COUNT(*) AS n FROM geos').n === 1) {
    for (const g of DEFAULT_GEOS) {
      run('INSERT OR IGNORE INTO geos (code, nom, dept, population, fixed, level) VALUES (?,?,?,?,0,?)', g.code, g.nom, g.dept, g.population, g.level);
    }
    console.log(`[seed] ${DEFAULT_GEOS.length} territoires de comparaison ajoutés`);
  }
}

module.exports = { seed, REF_GEO };

if (require.main === module) {
  seed({ reset: process.argv.includes('--reset') });
  console.log('[seed] terminé');
}
