import { useMemo } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Chart } from '../explorer';
import { Trend, trendOf, yearOf } from '../trend';

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#475569', '#ea580c'];
const fmt = (v: number) => {
  const a = Math.abs(v);
  return v.toLocaleString('fr-FR', { maximumFractionDigits: a >= 100 ? 0 : a >= 10 ? 1 : 2 });
};
const sgn = (v: number) => `${v >= 0 ? '+' : ''}${fmt(v)}`;
const ARROW = { up: '▲ hausse', down: '▼ baisse', flat: '► stable' } as const;
const CLS = { up: 'trend-up', down: 'trend-down', flat: 'trend-flat' } as const;

// Évolution des séries d'un graphique chronologique : variation, taux annuel, tendance, projections à 1 et 5 ans.
export default function EvolutionDonnees({ chart, suffix, title }: { chart: Chart; suffix: string; title?: string }) {
  const years = useMemo(() => chart.data.map((d) => yearOf(String(d.code))), [chart]);
  const datable = years.length >= 2 && years.every((y) => y != null);
  const rows = useMemo(() => chart.names.map((n) => {
    const pts = chart.data.map((d, i) => ({ t: years[i] as number, v: d[n] as number | null })).filter((p) => p.v != null) as { t: number; v: number }[];
    return { name: n, trend: (datable ? trendOf(pts) : null) as Trend | null };
  }), [chart, years, datable]);

  // courbe : historique + projection sur 5 ans (pointillés), seulement pour des périodes annuelles
  const merged = useMemo(() => {
    if (!datable) return [] as Record<string, string | number | null>[];
    const base: Record<string, string | number | null>[] = chart.data.map((d) => ({ ...d }));
    if (!(years as number[]).every((y) => Number.isInteger(y))) return base;
    const lastT = Math.max(...(years as number[]));
    for (let h = 1; h <= 5; h++) base.push({ x: String(lastT + h), code: String(lastT + h) });
    for (const r of rows) {
      const t = r.trend;
      if (!t || t.proj1 == null || t.proj5 == null) continue;
      const key = `${r.name} (projection)`;
      const lastRow = base.find((b) => b.code === String(Math.floor(t.last.t)));
      if (lastRow) lastRow[key] = t.last.v;
      const step = (t.proj5 - t.proj1) / 4;
      for (let h = 1; h <= 5; h++) {
        const row = base.find((b) => b.code === String(Math.floor(t.last.t) + h));
        if (row) row[key] = t.proj1 + step * (h - 1);
      }
    }
    return base;
  }, [chart, years, rows, datable]);

  if (!chart.data.length) return <div className="empty">Aucune donnée pour cette sélection.</div>;
  if (!datable) return <div className="note-box">L'évolution nécessite une lecture chronologique (axe horizontal = période) : choisissez un préréglage « dans le temps » dans l'onglet Graphique.</div>;
  const ok = rows.filter((r) => r.trend);
  if (!ok.length) return <div className="empty">Moins de deux périodes disponibles pour cette sélection : l'évolution ne peut pas être calculée.</div>;
  const projKeys = ok.filter((r) => r.trend!.proj5 != null).map((r) => `${r.name} (projection)`);
  const sorted = [...ok].sort((a, b) => (b.trend!.annual ?? b.trend!.pct ?? 0) - (a.trend!.annual ?? a.trend!.pct ?? 0));
  const unitAbs = suffix === ' %' ? ' pts' : suffix;

  return (
    <div className="evol">
      {title && <div className="chart-title">{title}</div>}
      <ResponsiveContainer width="100%" height={380}>
        <LineChart data={merged}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="x" />
          <YAxis tickFormatter={fmt} width={70} />
          <Tooltip formatter={(v) => fmt(Number(v)) + suffix} />
          <Legend />
          {chart.names.map((s, k) => <Line key={s} type="monotone" dataKey={s} stroke={COLORS[k % COLORS.length]} strokeWidth={2} dot connectNulls />)}
          {chart.names.map((s, k) => projKeys.includes(`${s} (projection)`) && (
            <Line key={`${s}-p`} type="monotone" dataKey={`${s} (projection)`} stroke={COLORS[k % COLORS.length]} strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls legendType="none" />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <div className="table-wrap short">
        <table className="grid compact">
          <thead>
            <tr>
              <th>Série</th><th>Période</th><th className="num">Début</th><th className="num">Fin</th>
              <th className="num">Variation</th><th className="num">Variation relative</th><th className="num">Taux annuel moyen</th>
              <th>Tendance</th><th className="num">Projection à 1 an</th><th className="num">Projection à 5 ans</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const t = r.trend!;
              return (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td className="small">{Math.floor(t.first.t)} → {Math.floor(t.last.t)}</td>
                  <td className="num">{fmt(t.first.v)}{suffix}</td>
                  <td className="num">{fmt(t.last.v)}{suffix}</td>
                  <td className={`num ${CLS[t.dir]}`}>{sgn(t.abs)}{unitAbs}</td>
                  <td className={`num ${CLS[t.dir]}`}>{t.pct == null ? '—' : `${sgn(t.pct)} %`}</td>
                  <td className="num">{t.annual == null ? '—' : `${sgn(t.annual)} %/an`}</td>
                  <td className={CLS[t.dir]}>{ARROW[t.dir]}</td>
                  <td className="num">{t.proj1 == null ? <span className="muted">—</span> : <>{fmt(t.proj1)}{suffix}</>}</td>
                  <td className="num">{t.proj5 == null ? <span className="muted">—</span> : <>{fmt(t.proj5)}{suffix}</>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Variation entre la première et la dernière période disponibles ; tendance « stable » si le taux annuel est inférieur à 0,5 %.
        Les projections prolongent la droite de régression des 6 dernières observations (au moins 3) : elles indiquent une tendance, pas une prévision
        (elles ignorent les ruptures, les opérations de logements et les changements de méthode).
      </p>
    </div>
  );
}
