// Export Excel : un onglet par thème, présenté comme le classeur d'origine (contexte / suivi / évaluation / prospectives,
// source, lien, périodicité) avec les colonnes de conception ajoutées, plus un onglet à plat avec tous les champs.
const ExcelJS = require('exceljs');

const LEVELS = ['contexte', 'suivi', 'evaluation', 'prospective'];
const FILL = { contexte: 'FFD6E8D4', suivi: 'FFFFE6CC', evaluation: 'FFE0D6E8', prospective: 'FFFFF2CC' };
const STATUT = { brouillon: 'Brouillon', valide: 'Validé', abandonne: 'Abandonné' };
const ORIGINE = { externe: 'Externe', interne: 'Interne (SI de la collectivité)', mixte: 'Mixte' };
const CARTO = { oui: 'Oui', possible: 'Possible (maille infra-communale)', non: 'Non' };
const FAISA = { 1: 'Facile (données importables)', 2: 'Moyenne (source identifiée)', 3: 'Difficile / à définir' };
const sheetName = (s) => String(s).replace(/[\\/?*[\]:]/g, ' ').replace(/&/g, 'et').slice(0, 31);

function buildWorkbook(items) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Observatoire de la ville';
  wb.created = new Date();

  const byTheme = new Map();
  for (const i of items) (byTheme.get(i.theme) || byTheme.set(i.theme, []).get(i.theme)).push(i);

  for (const [, list] of byTheme) {
    const ws = wb.addWorksheet(sheetName(list[0].theme_label || list[0].theme));
    ws.columns = [
      { header: 'Rubrique', width: 26 },
      { header: 'Indicateurs de contexte', width: 36 },
      { header: 'Indicateurs de suivi', width: 36 },
      { header: "Indicateurs d'évaluation", width: 36 },
      { header: 'Prospectives', width: 36 },
      { header: 'Source données', width: 40 },
      { header: "Lien d'accès", width: 40 },
      { header: 'Périodicité / date MAJ', width: 20 },
      { header: 'Lien corrigé', width: 40 },
      { header: 'Proposition', width: 60 },
      { header: 'Lien données', width: 40 },
      { header: 'Priorités (C / S / É / P)', width: 22 },
      { header: 'Statut', width: 12 },
      { header: 'Origine', width: 16 },
      { header: 'Cartographiable', width: 16 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    const groups = new Map();
    for (const i of list) (groups.get(i.groupe) || groups.set(i.groupe, []).get(i.groupe)).push(i);
    for (const [, gi] of groups) {
      const rows = new Map();
      for (const i of gi) {
        const k = i.ordre ?? `id${i.id}`;
        (rows.get(k) || rows.set(k, []).get(k)).push(i);
      }
      let first = true;
      for (const [, ri] of rows) {
        const cell = (lvl) => ri.find((i) => i.niveau === lvl);
        const ref = ri[0];
        const r = ws.addRow([
          first ? ref.groupe_label : '',
          ...LEVELS.map((l) => cell(l)?.libelle ?? ''),
          ref.source ?? '', ref.lien_origine ?? '', ref.periodicite ?? '', ref.lien_corrige ?? '', ref.proposition ?? '', ref.lien_donnees ?? '',
          LEVELS.map((l) => (cell(l)?.priorite ? `P${cell(l).priorite}` : '—')).join(' / '),
          [...new Set(ri.map((i) => STATUT[i.statut] || 'Brouillon'))].join(', '),
          [...new Set(ri.map((i) => ORIGINE[i.origine]?.split(' ')[0] || ''))].filter(Boolean).join(', '),
          [...new Set(ri.map((i) => CARTO[i.cartographie]?.split(' ')[0] || ''))].filter(Boolean).join(', '),
        ]);
        LEVELS.forEach((l, k) => {
          if (cell(l)) r.getCell(2 + k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[l] } };
        });
        r.alignment = { vertical: 'top', wrapText: true };
        first = false;
      }
    }
  }

  const flat = wb.addWorksheet('Tous les indicateurs');
  const cols = [
    ['Thème', (i) => i.theme_label], ['Rubrique', (i) => i.groupe_label], ['Niveau', (i) => i.niveau], ['Indicateur', (i) => i.libelle],
    ['Libellé carte', (i) => i.libelle_carte], ['Priorité', (i) => i.priorite], ['Statut', (i) => STATUT[i.statut] || 'Brouillon'],
    ['Décision / arbitrage', (i) => i.decision], ['Définition', (i) => i.definition], ['Formule de calcul', (i) => i.formule],
    ['Unité', (i) => i.unite], ['Périmètre', (i) => i.perimetre], ['Porteur', (i) => i.porteur], ['Cible / seuil', (i) => i.cible],
    ['Faisabilité', (i) => FAISA[i.faisabilite] || ''], ['Origine de la donnée', (i) => ORIGINE[i.origine] || ''], ['Cartographiable', (i) => CARTO[i.cartographie] || ''], ['Source', (i) => i.source], ["Lien d'origine", (i) => i.lien_origine],
    ['Lien corrigé', (i) => i.lien_corrige], ['Périodicité', (i) => i.periodicite], ['Proposition', (i) => i.proposition],
    ['Lien données', (i) => i.lien_donnees], ['Jeux importés', (i) => i.dataset_ids.join(', ')], ['Remarques', (i) => i.notes],
    ['Indicateur parent', (i) => items.find((p) => p.id === i.parent_id)?.libelle ?? ''],
  ];
  flat.columns = cols.map(([header]) => ({ header, width: Math.max(14, Math.min(48, header.length + 8)) }));
  flat.getRow(1).font = { bold: true };
  flat.views = [{ state: 'frozen', ySplit: 1 }];
  flat.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  for (const i of items) flat.addRow(cols.map(([, f]) => f(i) ?? ''));
  return wb;
}

module.exports = { buildWorkbook };
