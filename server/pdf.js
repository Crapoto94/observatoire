// Génération PDF du tableau de bord, côté serveur (cronable, sans navigateur) : les tuiles KPI et
// les graphiques sont rendus en SVG maison puis assemblés avec PDFKit.
const PDFDocument = require('pdfkit');
const SVGtoPDF = require('svg-to-pdfkit');
const { all } = require('./db');
const { buildConfigRows } = require('./explorer');

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#475569', '#ea580c'];
const NAVY = '#0f2942';
const MUTE = '#64748b';
// Paramétrage fin par défaut d'une tuile (reflète DEFAULT_TILE_STYLE côté client).
const DEFAULT_STYLE = {
  titleSize: 12, valueSize: 20, bold: true, textColor: null, titleColor: null,
  showTheme: true, showPeriod: true, showDelta: true, showCompare: false, showBadge: true, showLink: true,
  display: null, boundsPerSeries: true, histoBins: 0, histoPerSeries: false, multiRows: 2,
  showLegend: true, showGrid: true, showAxes: true, showValues: false, chartColor: null,
};
const styleColors = (st) => (st.chartColor ? [st.chartColor, ...COLORS.filter((c) => c !== st.chartColor)] : COLORS);
const fmt = (v) => (v == null ? '—' : Number(v).toLocaleString('fr-FR', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2 }));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- rendu SVG d'un graphique ----------
function chartSvg(chart, width, height, style = {}) {
  const st = { ...DEFAULT_STYLE, ...style };
  const cols = styleColors(st);
  const names = chart.names.length ? chart.names : ['Valeur'];
  const data = chart.data;
  if (!data.length) return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"></svg>`;
  const display = st.display || (chart.__x === '@PERIOD' ? 'line' : 'bar');

  // Histogramme : répartition des valeurs en classes ; une classe par indicateur (bornes propres).
  if (display === 'histo') return histoSvg(names, data, width, height, st, cols);

  // Chaque indicateur (série) peut avoir ses propres bornes : une échelle Y indépendante par série.
  const perSeries = st.boundsPerSeries !== false && names.length > 1;
  const bounds = (n) => {
    const v = data.map((d) => d[n]).filter((x) => x != null);
    return { min: Math.min(0, ...v), max: Math.max(1, ...v) };
  };
  const b0 = bounds(names[0]);
  const globalMin = Math.min(...names.map((n) => bounds(n).min));
  const globalMax = Math.max(...names.map((n) => bounds(n).max));
  const pad = { l: st.showAxes !== false ? 60 : 10, r: st.showAxes !== false && perSeries ? 52 : 16, t: 16, b: 54 };
  const w = width - pad.l - pad.r, h = height - pad.t - pad.b;
  const yOf = (v, n) => {
    const b = perSeries ? bounds(n) : { min: globalMin, max: globalMax };
    return pad.t + h - ((v - b.min) / (b.max - b.min || 1)) * h;
  };
  const isLine = display === 'line';

  let g = '';
  const yAxisName = perSeries ? names[0] : names[0];
  for (let k = 0; k <= 4; k++) {
    const frac = k / 4, y = pad.t + h - frac * h;
    if (st.showGrid !== false) g += `<line x1="${pad.l}" y1="${y}" x2="${pad.l + w}" y2="${y}" stroke="#e2e5ea" stroke-width="1"/>`;
    if (st.showAxes !== false) {
      const b = perSeries ? bounds(yAxisName) : { min: globalMin, max: globalMax };
      const v = b.min + (b.max - b.min) * frac;
      g += `<text x="${pad.l - 6}" y="${y + 3}" font-size="9" fill="${MUTE}" text-anchor="end">${esc(fmt(v))}</text>`;
      if (perSeries) {
        const bn = names[names.length - 1];
        const bb = bounds(bn);
        g += `<text x="${pad.l + w + 6}" y="${y + 3}" font-size="9" fill="${cols[(names.length - 1) % cols.length]}" text-anchor="start">${esc(fmt(bb.min + (bb.max - bb.min) * frac))}</text>`;
      }
    }
  }
  if (isLine) {
    const xOf = (i) => pad.l + (data.length === 1 ? w / 2 : (i / (data.length - 1)) * w);
    names.forEach((n, ni) => {
      const pts = data.map((d, i) => (d[n] == null ? null : `${xOf(i)},${yOf(d[n], n)}`)).filter(Boolean);
      if (pts.length) g += `<polyline points="${pts.join(' ')}" fill="none" stroke="${cols[ni % cols.length]}" stroke-width="2"/>`;
    });
    if (st.showAxes !== false) data.forEach((d, i) => { g += `<text x="${xOf(i)}" y="${pad.t + h + 14}" font-size="9" fill="${MUTE}" text-anchor="middle">${esc(String(d.x).slice(0, 10))}</text>`; });
  } else {
    const groups = data.length || 1;
    const gw = w / groups, bw = Math.min(28, (gw * 0.7) / names.length);
    data.forEach((d, i) => {
      const cx = pad.l + gw * i + gw / 2;
      names.forEach((n, ni) => {
        const v = d[n];
        if (v == null) return;
        const x = cx - (names.length * bw) / 2 + ni * bw, y = yOf(v, n);
        g += `<rect x="${x}" y="${y}" width="${bw - 2}" height="${pad.t + h - y}" fill="${cols[ni % cols.length]}"/>`;
        if (st.showValues) g += `<text x="${x + bw / 2}" y="${y - 2}" font-size="8" fill="#1c2330" text-anchor="middle">${esc(fmt(v))}</text>`;
      });
      if (st.showAxes !== false) {
        const lab = String(d.x).slice(0, 14);
        g += `<text x="${cx}" y="${pad.t + h + 14}" font-size="9" fill="${MUTE}" text-anchor="middle" transform="rotate(-25 ${cx} ${pad.t + h + 14})">${esc(lab)}</text>`;
      }
    });
  }
  if (st.showLegend !== false) {
    let lx = pad.l, ly = 8;
    names.forEach((n, ni) => {
      g += `<rect x="${lx}" y="${ly - 7}" width="9" height="9" fill="${cols[ni % cols.length]}"/>`;
      g += `<text x="${lx + 13}" y="${ly}" font-size="9" fill="#1c2330">${esc(String(n).slice(0, 26))}</text>`;
      lx += 20 + Math.min(26, String(n).length) * 5.4 + 14;
    });
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${g}</svg>`;
}

// Histogramme : classes par indicateur, bornes propres à chacun (min/max de ses valeurs).
function histoSvg(names, data, width, height, st, cols) {
  const perSeries = st.histoPerSeries || (st.boundsPerSeries !== false && names.length > 1);
  const series = perSeries ? names : [names[0]];
  const n = Number(st.histoBins) || 0;
  const colsN = Math.min(series.length, 3);
  const cellW = width / colsN;
  let g = '';
  series.forEach((name, si) => {
    const values = data.map((d) => d[name]).filter((v) => v != null);
    if (!values.length) return;
    const min = Math.min(...values), max = Math.max(...values);
    const bins = n || Math.max(4, Math.min(12, Math.ceil(Math.sqrt(values.length))));
    const span = max - min || 1;
    const counts = Array.from({ length: bins }, (_, i) => {
      const lo = min + (span * i) / bins, hi = min + (span * (i + 1)) / bins;
      return values.filter((v) => (i === bins - 1 ? v <= hi : v >= lo && v < hi)).length;
    });
    const maxCount = Math.max(1, ...counts);
    const ox = si * cellW + 8, oy = 20, cw = cellW - 24, ch = height - 24 - 44;
    if (perSeries) g += `<text x="${ox}" y="${oy - 6}" font-size="9" fill="#1c2330">${esc(String(name).slice(0, 30))}</text>`;
    const bw = cw / bins;
    counts.forEach((c, i) => {
      const bh = (c / maxCount) * ch;
      const x = ox + i * bw, y = oy + ch - bh;
      g += `<rect x="${x}" y="${y}" width="${Math.max(1, bw - 2)}" height="${bh}" fill="${cols[si % cols.length]}"/>`;
      if (st.showValues) g += `<text x="${x + bw / 2}" y="${y - 2}" font-size="7" fill="#1c2330" text-anchor="middle">${c}</text>`;
      const lo = min + (span * i) / bins;
      if (i % (bins > 8 ? 2 : 1) === 0) g += `<text x="${x + bw / 2}" y="${oy + ch + 10}" font-size="7" fill="${MUTE}" text-anchor="middle">${esc(fmt(lo))}</text>`;
    });
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${g}</svg>`;
}

// ---------- données ----------
function loadKpis() { return Object.fromEntries(require('./kpi').build().kpis.map((k) => [k.id, k])); }

function geoExtras() {
  const geos = all('SELECT code, nom, population FROM geos');
  const geoNames = {}, popSeries = {};
  for (const g of geos) geoNames[g.code] = g.nom;
  try { Object.assign(popSeries, require('./importer').populationSeries()); } catch { /* populations indisponibles */ }
  return { geoNames, popSeries, geoName: (c) => geoNames[c] || c };
}

function rowsForChart(cfg) {
  const codes = cfg.geoCodes?.length ? cfg.geoCodes : [require('./seed').REF_GEO.code];
  const rows = all(
    `SELECT geo, period, dims, measure, value FROM data_rows WHERE dataset_id = ? AND geo IN (${codes.map(() => '?').join(',')})`,
    cfg.ds, ...codes,
  ).map((r) => ({ ...r, dims: JSON.parse(r.dims || '{}') }));
  return rows;
}

function chartTile(cfg, extras) {
  const rows = rowsForChart(cfg);
  const chart = buildConfigRows(rows, cfg, extras);
  chart.__x = cfg.x;
  const suffix = chart.unit === '%' ? ' %' : chart.unit === 'idx' ? ' (base 100)' : '';
  return { chart, suffix };
}

// ---------- PDF ----------
function buildDashboardPdf({ title = 'Mon tableau de bord', items = [], user = {} }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const kpis = loadKpis();
  const extras = geoExtras();
  const pageW = doc.page.width - 80;

  // en-tête
  doc.rect(0, 0, doc.page.width, 74).fill(NAVY);
  doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold').text(title, 40, 22, { width: pageW });
  doc.fontSize(9).font('Helvetica').fillColor('#c7d2e8')
    .text(`Observatoire de la ville · Ivry-sur-Seine${user.display_name ? ' · ' + user.display_name : ''}`, 40, 48);
  const now = new Date().toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
  doc.fontSize(8).fillColor('#8fa3c8').text(now, doc.page.width - 40 - 200, 48, { width: 200, align: 'right' });
  doc.fillColor('#000').moveDown();
  let y = 96;

  const ensure = (need) => {
    if (y + need > doc.page.height - 50) { doc.addPage(); y = 50; }
  };

  for (const it of items) {
    const tileW = pageW;
    const st = { ...DEFAULT_STYLE, ...(it.config?.style || {}) };
    const kpiIds = it.config?.kpiIds?.length ? it.config.kpiIds : (it.config?.kpiId ? [it.config.kpiId] : []);
    const kpiList = kpiIds.map((id) => kpis[id]).filter(Boolean);
    const kpi = kpiList[0] || null;
    const heading = (it.title && String(it.title).trim()) || kpi?.label || 'KPI';
    ensure(it.kind === 'chart' ? 250 : 96);
    doc.font('Helvetica-Bold').fontSize(Math.max(11, st.titleSize)).fillColor(st.titleColor || NAVY).text(String(heading).slice(0, 90), 40, y, { width: tileW });
    doc.moveTo(40, y + 17).lineTo(40 + tileW, y + 17).strokeColor('#e2e5ea').stroke();
    y += 24;

    if (it.kind === 'kpi') {
      // Tuile multi-indicateurs : plusieurs KPI sur une ligne (colonnes).
      const shown = kpiList.filter((k) => k.value != null);
      if (!shown.length) { doc.fontSize(10).fillColor(MUTE).text('KPI indisponible', 40, y); y += 20; continue; }
      const cols = Math.max(1, Math.min(4, st.multiRows || shown.length));
      const colGap = 12, colW = (tileW - colGap * (cols - 1)) / cols;
      const vSize = Math.max(12, Math.min(30, (st.valueSize || 20) * 0.7));
      const textY0 = y;
      shown.forEach((k, i) => {
        const cx = 40 + (i % cols) * (colW + colGap);
        const cy = textY0 + Math.floor(i / cols) * 44;
        const unit = k.unit === '%' ? ' %' : k.unit ? ` ${k.unit}` : '';
        doc.fontSize(10).font('Helvetica').fillColor(MUTE).text(String(k.label).slice(0, Math.floor(colW / 5.2)), cx, cy, { width: colW });
        doc.fontSize(vSize).font(st.bold === false ? 'Helvetica' : 'Helvetica-Bold').fillColor(st.textColor || '#1c2330').text(`${fmt(k.value)}${unit}`, cx, cy + 12, { width: colW });
        const sub = [st.showPeriod !== false ? k.period : null, st.showDelta !== false && k.prev ? `vs ${k.prev.period} : ${fmt(k.value - k.prev.value)}` : null].filter(Boolean).join(' · ');
        if (sub) doc.fontSize(8).font('Helvetica').fillColor(MUTE).text(sub, cx, cy + 12 + vSize, { width: colW });
      });
      y = textY0 + Math.ceil(shown.length / cols) * 44 + 6;
    } else {
      try {
        const { chart, suffix } = chartTile(it.config, extras);
        if (!chart.data.length) { doc.fontSize(10).fillColor(MUTE).text('Aucune donnée pour ce graphique.', 40, y); y += 20; continue; }
        const h = 200;
        const svg = chartSvg(chart, tileW, h, st);
        SVGtoPDF(doc, svg, 40, y, { width: tileW, height: h, assumePt: true });
        y += h + 6;
        if (suffix) { doc.fontSize(8).fillColor(MUTE).text(`Valeurs${suffix}`, 40, y); y += 12; }
        y += 10;
      } catch (e) {
        doc.fontSize(10).fillColor('#b91c1c').text(`Graphique indisponible : ${e.message}`, 40, y); y += 20;
      }
    }
  }

  // pied de page (toutes les pages)
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor(MUTE).text('Observatoire de la ville — document interne', 40, doc.page.height - 34, { width: pageW, align: 'left' });
    doc.text(`page ${i - range.start + 1} / ${range.count}`, doc.page.width - 40 - 100, doc.page.height - 34, { width: 100, align: 'right' });
  }

  doc.end();
  return done;
}

module.exports = { buildDashboardPdf, chartSvg };
