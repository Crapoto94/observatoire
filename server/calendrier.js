// Calendrier des sources : date attendue de la prochaine édition de chaque jeu importé et réimport automatique.
// Prochaine édition = fin de la période suivant la dernière période en base + délai de publication habituel de la source.
// Jeux « stock du jour » (millésime unique de l'année en cours) : réimport mensuel. Une fois la date passée, l'import est
// relancé (Ivry et territoires suivis, GOSB, puis communes d'Île-de-France si le jeu y a déjà été importé) ; si la source
// n'a rien publié de nouveau, un nouvel essai a lieu 14 jours plus tard.
const { all, get, run } = require('./db');
const { REF_GEO } = require('./seed');

// délai de publication (mois après la fin de la période) et pas entre deux éditions, par jeu puis par connecteur
const RULES = {
  // recensement : millésime N (enquêtes N-2 à N+2) publié à l'été N+3
  melodi: { step: 'annee', lag: 30 }, filosofi: { step: 'annee', lag: 24 }, filosofi_fichier: { step: 'annee', lag: 24 },
  ft_defm: { step: 'annee', lag: 3 }, // situation au 4e trimestre de chaque année ssmsi: { step: 'annee', lag: 3 }, finances: { step: 'annee', lag: 9 }, ircom: { step: 'annee', lag: 9 },
  caf_rsa: { step: 'annee', lag: 6 }, caf_prestations: { step: 'annee', lag: 6 }, caf_qf: { step: 'annee', lag: 6 }, caf_qf_qpv: { step: 'annee', lag: 6 },
  dvf: { step: 'annee', lag: 5 }, sitadel: { step: 'annee', lag: 2 }, lovac: { step: 'annee', lag: 2 }, sru: { step: 'annee', lag: 10 }, rpls: { step: 'annee', lag: 10 },
  side_stocks: { step: 'annee', lag: 6 }, side_creations: { step: 'annee', lag: 2 }, flores: { step: 'annee', lag: 18 }, urssaf_effectifs: { step: 'annee', lag: 4 },
  ore_parc_auto: { step: 'trimestre', lag: 3 }, ore_irve: { step: 'annee', lag: 6 }, sinoe_dma: { step: 'annee', lag: 18 }, airparif_ges: { step: 'annee', lag: 30 }, atmo_indices: { step: 'annee', lag: 0 },
  apl_drees: { step: 'annee', lag: 18 }, c2s_cnam: { step: 'annee', lag: 12 }, ameli_ald: { step: 'annee', lag: 10 }, ameli_sas: { step: 'annee', lag: 4 },
  ips_ecoles: { step: 'annee', lag: 6 }, conso: { step: 'annee', lag: 10 }, etat_civil_nais: { step: 'annee', lag: 3 }, etat_civil_deces: { step: 'annee', lag: 3 },
  artificialisation: { step: 'annee', years: 3, lag: 24 }, ipr_mortalite: { step: 'annee', lag: 36 },
  // éditions ponctuelles ou arrêtées : pas de nouvelle édition attendue
  ipr_idh2: { step: 'ponctuel' }, licences_sportives: { step: 'ponctuel' }, icu: { step: 'ponctuel' }, nuisances: { step: 'ponctuel' }, multiexposition: { step: 'ponctuel' }, filosofi_fichier: { step: 'ponctuel' },
  mos: { step: 'annee', lag: 18 }, pop_hist: { step: 'annee', lag: 24 },
};
const MONTH = 30.44 * 86400000;
const RETRY_DAYS = 14;

// fin de période : 2024 → 31/12/2024, 2024-T4 → 31/12/2024, 2024-12 → 31/12/2024, 2023-2024 (année scolaire) → 31/08/2024
function endOf(p) {
  let m;
  if ((m = /^(\d{4})-T(\d)$/.exec(p))) return new Date(Date.UTC(+m[1], +m[2] * 3, 0));
  if ((m = /^(\d{4})-(\d{2})$/.exec(p))) return new Date(Date.UTC(+m[1], +m[2], 0));
  if ((m = /^\d{4}-(\d{4})$/.exec(p))) return new Date(Date.UTC(+m[1], 7, 31));
  if ((m = /^(\d{4})$/.exec(p))) return new Date(Date.UTC(+m[1], 11, 31));
  return null;
}
const stepMonths = (step) => (step === 'trimestre' ? 3 : step === 'mois' ? 1 : 12);

/** Calendrier d'un jeu importé : fréquence, dernière période, date attendue de la prochaine édition, état. */
function of(d, periods) {
  const last = periods.filter((p) => endOf(p)).sort((a, b) => endOf(a) - endOf(b)).pop() || null;
  const thisYear = new Date().getFullYear();
  const imported = d.last_import ? Date.parse(d.last_import) : null;
  if (!last || (periods.length === 1 && Number(last) >= thisYear)) { // stock du jour : réimport mensuel
    const attendue = imported ? new Date(imported + MONTH) : new Date();
    return { frequence: 'stock du jour, réimport mensuel', derniere: last, attendue: attendue.toISOString().slice(0, 10), etat: Date.now() >= attendue ? 'a_actualiser' : 'a_jour' };
  }
  const r0 = RULES[d.id] || RULES[d.provider];
  if (r0?.step === 'ponctuel') return { frequence: 'édition ponctuelle ou arrêtée', derniere: last, attendue: null, etat: 'a_jour' };
  const r = r0 || { step: /T\d$/.test(last) ? 'trimestre' : /^\d{4}-\d{2}$/.test(last) ? 'mois' : 'annee', lag: 12 };
  const next = new Date(endOf(last).getTime() + (r.years ? r.years * 12 : stepMonths(r.step)) * MONTH + r.lag * MONTH);
  const essai = essais()[d.id];
  const retry = essai && Date.now() - Date.parse(essai) < RETRY_DAYS * 86400000;
  return {
    frequence: r.years ? `tous les ${r.years} ans` : { annee: 'annuelle', trimestre: 'trimestrielle', mois: 'mensuelle' }[r.step], derniere: last, attendue: next.toISOString().slice(0, 10),
    delai: `${r.lag} mois après la fin de la période`, etat: Date.now() < next ? 'a_jour' : retry ? 'en_attente' : 'a_actualiser',
    essai: essai || null,
  };
}

const essais = () => { try { return JSON.parse(get("SELECT value FROM app_settings WHERE key = 'calendrier_essais'")?.value || '{}'); } catch { return {}; } };
function noteEssai(ids) {
  const e = essais(), now = new Date().toISOString();
  for (const id of ids) e[id] = now;
  run("INSERT INTO app_settings (key, value) VALUES ('calendrier_essais', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(e));
}

function list() {
  const prives = new Set(require('./datasets').filter((d) => d.prive).map((d) => d.id));
  const live = require('./live').etat().jeux || {};
  return all('SELECT id, provider, last_import FROM datasets').map((d) => {
    const periods = all('SELECT DISTINCT period FROM data_rows WHERE dataset_id = ? AND geo = ?', d.id, REF_GEO.code).map((r) => r.period).filter((p) => p != null).map(String);
    const c = of(d, periods);
    return { id: d.id, ...c, auto: !prives.has(d.id) && live[d.id]?.mode !== 'live' && periods.length > 0 };
  });
}

const waitJob = async (imp, job) => { const j = imp.jobs.get(job.id); while (j && !['terminé', 'terminé avec erreurs', 'arrêté'].includes(j.status)) await new Promise((r) => setTimeout(r, 5000)); return j; };

let running = false;
/** Réimporte les jeux dont la nouvelle édition est attendue (un seul passage à la fois, aucun si un import tourne déjà). */
async function tick({ log = (m) => console.log(`[calendrier] ${m}`) } = {}) {
  if (running) return null;
  const imp = require('./importer');
  if (imp.currentJob()) return null;
  // les plus en retard d'abord, 3 jeux par passage quotidien (les imports Île-de-France sont longs)
  const due = list().filter((c) => c.auto && c.etat === 'a_actualiser').sort((a, b) => String(a.attendue).localeCompare(String(b.attendue))).slice(0, 3).map((c) => c.id);
  if (!due.length) return { due: [] };
  running = true;
  try {
    log(`nouvelle édition attendue : ${due.join(', ')}`);
    noteEssai(due);
    await waitJob(imp, imp.startImport({ datasetIds: due }));
    await waitJob(imp, imp.startImport({ datasetIds: due, scope: 'gosb' }));
    const idf = due.filter((id) => get("SELECT 1 FROM import_runs WHERE dataset_id = ? AND scope = 'idf' AND status IN ('ok', 'partiel') LIMIT 1", id));
    if (idf.length) await waitJob(imp, imp.startImport({ datasetIds: idf, scope: 'idf' }));
    return { due };
  } finally { running = false; }
}

module.exports = { list, of, tick, endOf };
