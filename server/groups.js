// Territoires de comparaison construits à partir de communes : Grand-Orly Seine Bièvre (EPT T12, SIREN 200058014).
// Les valeurs de l'EPT sont recalculées à partir des données de ses communes membres après chaque import :
//  - effectifs et montants : somme des communes ;
//  - médianes, taux, prix, parts : moyenne pondérée par la population (approximation, à lire comme un ordre de grandeur).
const { all, run, tx, db } = require('./db');

const GROUPS = [
  {
    code: 'GOSB', nom: 'Grand-Orly Seine Bièvre (EPT T12)', level: 'EPT', siren: '200058014', dept: '94',
    members: [
      '94001', '94003', '94016', '94021', '94022', '94034', '94037', '94038', '94041', '94043', '94054', '94065', '94073', '94074', '94076', '94077', '94078', '94081', // Val-de-Marne
      '91027', '91326', '91432', '91479', '91589', '91687', // Essonne : Athis-Mons, Juvisy-sur-Orge, Morangis, Paray-Vieille-Poste, Savigny-sur-Orge, Viry-Châtillon
    ],
  },
];

const groupOf = (code) => GROUPS.find((g) => g.code === code) || null;
const membersOf = (code) => groupOf(code)?.members || [];
const isGroup = (code) => !!groupOf(code);

function ensureGroups() {
  for (const g of GROUPS) {
    const pop = all(`SELECT COALESCE(SUM(population), 0) AS p FROM geos WHERE code IN (${g.members.map(() => '?').join(',')})`, ...g.members)[0].p;
    run("INSERT OR IGNORE INTO geos (code, nom, dept, population, fixed, level, bulk) VALUES (?,?,?,?,0,?,0)", g.code, g.nom, g.dept, pop || null, g.level);
    if (pop) run('UPDATE geos SET population = ? WHERE code = ?', pop, g.code);
  }
}

// valeurs « intensives » : à moyenner (pondération par la population) plutôt qu'à additionner
const INTENSIVE_DATASETS = new Set(['filosofi', 'finances', 'ipr_idh2', 'ipr_mortalite', 'sinoe_dma', 'airparif_ges']); // sinoe_dma, airparif_ges : valeurs de l'EPT reportées sur chaque commune (moyenne = valeur de l'EPT) // ipr_* : indices et espérances de vie, moyennés // finances : montants par habitant, pondérés par la population
const ADDITIVE_MEASURES = new Set(['POP_BUDGET']);
// dimensions de nomenclature : leurs codes ne disent rien de la nature de la valeur (ACTIVITY « GI » n'est pas un indice de Gini)
const NOMENCLATURES = new Set(['ACTIVITY', 'FACILITY_DOM', 'FACILITY_SDOM', 'FACILITY_TYPE', 'POSTE', 'PCS', 'NAF', 'LEGAL_FORM']);
const INTENSIVE = /(^|[_\s])(MED|MEDIAN|MEDIANE|PRIX|LOYER|TAUX|PR|GI|IR|S80S20|PART|PCT|POURCENT|RATIO|MOYEN|MOYENNE|DENSITE)($|[_\s])/i;

function aggregate(datasetId) {
  const done = [];
  for (const g of GROUPS) {
    const ph = g.members.map(() => '?').join(',');
    const rows = all(`SELECT geo, period, dims, measure, value FROM data_rows WHERE dataset_id = ? AND geo IN (${ph}) AND value IS NOT NULL`, datasetId, ...g.members);
    const pops = Object.fromEntries(all(`SELECT code, population FROM geos WHERE code IN (${ph})`, ...g.members).map((r) => [r.code, r.population || 0]));
    const acc = new Map();
    // jeu chargé pour moins de 90 % des communes membres : les sommes seraient trompeuses, seules les moyennes pondérées sont écrites
    const covered = new Set(rows.map((r) => r.geo)).size;
    const imported = all("SELECT 1 FROM import_runs WHERE dataset_id = ? AND scope IN ('idf', 'gosb') AND status IN ('ok', 'partiel') LIMIT 1", datasetId).length > 0;
    const partial = !imported && covered < g.members.length * 0.9;
    for (const r of rows) {
      const k = `${r.period ?? ''}\u0001${r.dims}\u0001${r.measure}`;
      const a = acc.get(k) || acc.set(k, { period: r.period, dims: r.dims, measure: r.measure, sum: 0, w: 0, wv: 0, n: 0, intensive: null }).get(k);
      if (a.intensive === null) a.intensive = (INTENSIVE_DATASETS.has(datasetId) && !ADDITIVE_MEASURES.has(JSON.parse(a.dims || '{}').MESURE)) || INTENSIVE.test(`${a.measure} ${Object.entries(JSON.parse(a.dims || '{}')).filter(([d]) => !NOMENCLATURES.has(d)).map(([, v]) => v).join(' ')}`);
      a.sum += r.value; a.n++;
      const w = pops[r.geo] || 0;
      a.w += w; a.wv += r.value * w;
    }
    tx(() => {
      run('DELETE FROM data_rows WHERE dataset_id = ? AND geo = ?', datasetId, g.code);
      const ins = db.prepare('INSERT INTO data_rows (dataset_id, geo, period, dims, measure, value, status) VALUES (?,?,?,?,?,?,?)');
      for (const a of acc.values()) {
        if (partial && !a.intensive) continue;
        const value = a.intensive ? (a.w ? a.wv / a.w : a.sum / a.n) : a.sum;
        ins.run(datasetId, g.code, a.period, a.dims, a.measure, value, a.n < g.members.length ? `${a.n}/${g.members.length} communes` : null);
      }
    });
    done.push({ group: g.code, rows: acc.size });
  }
  return done;
}

function aggregateAll() {
  ensureGroups();
  for (const d of all('SELECT DISTINCT dataset_id FROM data_rows WHERE geo IN (' + GROUPS.flatMap((g) => g.members).map(() => '?').join(',') + ')', ...GROUPS.flatMap((g) => g.members))) aggregate(d.dataset_id);
}

module.exports = { GROUPS, groupOf, membersOf, isGroup, ensureGroups, aggregate, aggregateAll };
