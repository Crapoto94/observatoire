import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmtDate } from '../api';
import { CarteVersion, Indicator, NIVEAUX, NIVEAU_FILL, PRIO_COLOR, PRIO_TEXT } from '../types';
import {
  CENTER, GROUPS, PAGE, PlacedGroup, Rect, THEMES, CELL, clampToRect, placeGroup, rectCenter,
} from '../carteLayout';

const FONT = 'Arial, Helvetica, sans-serif';
const darker = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.round(v * 0.75)).toString(16).padStart(2, '0');
  return `#${c(n >> 16)}${c((n >> 8) & 255)}${c(n & 255)}`;
};

function edge(from: Rect, to: Rect) {
  const a = clampToRect(from, rectCenter(to));
  const b = clampToRect(to, rectCenter(from));
  return { a, b };
}

export default function Carte() {
  const nav = useNavigate();
  const [items, setItems] = useState<Indicator[]>([]);
  const [error, setError] = useState('');
  const [levels, setLevels] = useState<Record<string, boolean>>({ contexte: true, suivi: true, evaluation: true, prospective: true });
  const [maxPrio, setMaxPrio] = useState(4);
  const [contrast, setContrast] = useState(false);
  const [title, setTitle] = useState('CODIR - 06/10/2026');
  const [showAbandoned, setShowAbandoned] = useState(false);
  const [versions, setVersions] = useState<CarteVersion[]>([]);
  const [versionId, setVersionId] = useState('');
  const [snapshot, setSnapshot] = useState<{ label: string; created_at: string; indicators: Indicator[] } | null>(null);
  const [vb, setVb] = useState({ x: 0, y: 0, w: PAGE.w, h: PAGE.h });
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const loadVersions = () => api<CarteVersion[]>('/carte/versions').then(setVersions).catch(() => setVersions([]));
  useEffect(() => { api<Indicator[]>('/indicators').then(setItems).catch((e) => setError(e.message)); loadVersions(); }, []);

  // affichage d'une version enregistrée (lecture seule)
  useEffect(() => {
    if (!versionId) { setSnapshot(null); return; }
    api<{ label: string; created_at: string; indicators: Indicator[] }>(`/carte/versions/${versionId}`).then(setSnapshot).catch((e) => setError(e.message));
  }, [versionId]);
  const saveVersion = async () => {
    const label = prompt('Nom de la version (ex. CODIR du 06/10/2026)', `Version du ${new Date().toLocaleDateString('fr-FR')}`);
    if (!label) return;
    try { const v = await api<CarteVersion>('/carte/versions', { body: { label } }); await loadVersions(); setVersionId(String(v.id)); } catch (e) { setError((e as Error).message); }
  };
  const deleteVersion = async () => {
    if (!versionId || !confirm('Supprimer cette version ?')) return;
    await api(`/carte/versions/${versionId}`, { method: 'DELETE' });
    setVersionId(''); loadVersions();
  };

  const displayItems = useMemo(
    () => (snapshot?.indicators ?? items).filter((i) => showAbandoned || i.statut !== 'abandonne'),
    [snapshot, items, showAbandoned]
  );
  const placed: PlacedGroup[] = useMemo(() => {
    if (!displayItems.length) return [];
    return GROUPS.map((g) => placeGroup(g, displayItems));
  }, [displayItems]);

  // zoom molette centré sur le pointeur
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const f = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      setVb((v) => {
        const px = v.x + ((e.clientX - r.left) / r.width) * v.w;
        const py = v.y + ((e.clientY - r.top) / r.height) * v.h;
        const w = Math.min(PAGE.w * 1.5, Math.max(300, v.w * f));
        const h = w * (v.h / v.w);
        return { x: px - ((px - v.x) / v.w) * w, y: py - ((py - v.y) / v.h) * h, w, h };
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [placed.length]);

  const moved = useRef(false);
  const onDown = (e: React.MouseEvent) => { moved.current = false; drag.current = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y }; };
  const onMove = (e: React.MouseEvent) => {
    if (!drag.current || !svgRef.current) return;
    if (Math.abs(e.clientX - drag.current.x) + Math.abs(e.clientY - drag.current.y) > 4) moved.current = true;
    const r = svgRef.current.getBoundingClientRect();
    const dx = ((e.clientX - drag.current.x) / r.width) * vb.w;
    const dy = ((e.clientY - drag.current.y) / r.height) * vb.h;
    setVb((v) => ({ ...v, x: drag.current!.vx - dx, y: drag.current!.vy - dy }));
  };
  const onUp = () => { drag.current = null; };

  const exportSvg = () => {
    const svg = svgRef.current!.cloneNode(true) as SVGSVGElement;
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('viewBox', `0 0 ${PAGE.w} ${PAGE.h}`);
    svg.setAttribute('width', String(PAGE.w));
    svg.setAttribute('height', String(PAGE.h));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
    a.download = 'carte-observatoire.svg';
    a.click();
  };

  const prioColor = (p: number | null) => (p ? (contrast ? PRIO_TEXT : PRIO_COLOR)[p] : '#555');
  const themeByKey = Object.fromEntries(THEMES.map((t) => [t.key, t]));

  return (
    <section className="page carte-page">
      <div className="page-head">
        <h1>Carte mentale</h1>
        <div className="actions">
          <button className="secondary" onClick={() => setVb({ x: 0, y: 0, w: PAGE.w, h: PAGE.h })}>Recentrer</button>
          <button className="secondary" onClick={exportSvg}>Exporter SVG</button>
        </div>
      </div>
      <div className="toolbar">
        {NIVEAUX.map((n) => (
          <label key={n.key} className="inline" style={{ background: NIVEAU_FILL[n.key], padding: '2px 8px', borderRadius: 4 }}>
            <input type="checkbox" checked={levels[n.key]} onChange={(e) => setLevels({ ...levels, [n.key]: e.target.checked })} /> {n.label}
          </label>
        ))}
        <label className="inline">Priorité jusqu'à
          <select value={maxPrio} onChange={(e) => setMaxPrio(Number(e.target.value))}>
            {[1, 2, 3, 4].map((p) => <option key={p} value={p}>P{p}</option>)}
          </select>
        </label>
        <label className="inline"><input type="checkbox" checked={contrast} onChange={(e) => setContrast(e.target.checked)} /> Contraste renforcé</label>
        <label className="inline"><input type="checkbox" checked={showAbandoned} onChange={(e) => setShowAbandoned(e.target.checked)} /> Afficher les abandonnés</label>
        <label className="inline">Version
          <select value={versionId} onChange={(e) => setVersionId(e.target.value)}>
            <option value="">Version actuelle</option>
            {versions.map((v) => <option key={v.id} value={v.id}>{v.label} ({fmtDate(v.created_at.replace(' ', 'T') + 'Z')})</option>)}
          </select>
        </label>
        <button className="secondary" onClick={saveVersion} disabled={!!versionId}>Enregistrer une version</button>
        {versionId && <button className="secondary" onClick={deleteVersion}>Supprimer cette version</button>}
        <label className="inline">Sous-titre <input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <span className="muted small">Molette : zoom · glisser : déplacer · clic sur un indicateur : fiche · ▦ données · ◔ KPI</span>
      </div>
      {error && <div className="error">{error}</div>}
      {snapshot && <div className="version-banner">Version « {snapshot.label} » enregistrée le {fmtDate(snapshot.created_at.replace(' ', 'T') + 'Z')} (lecture seule).</div>}

      <svg
        ref={svgRef}
        className="carte"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
        fontFamily={FONT}
      >
        <rect x={0} y={0} width={PAGE.w} height={PAGE.h} fill="#fff" />

        {/* liaisons */}
        {THEMES.map((t) => {
          const e = edge(CENTER, t.label);
          return <line key={`c-${t.key}`} x1={e.a[0]} y1={e.a[1]} x2={e.b[0]} y2={e.b[1]} stroke={t.color} strokeWidth={3} />;
        })}
        {placed.map((pg) => {
          if (!pg.cells.length) return null;
          const t = themeByKey[pg.def.theme];
          const f: Rect = [pg.frame.x, pg.frame.y, pg.frame.x + pg.frame.w, pg.frame.y + pg.frame.h];
          const sub = pg.def.label;
          const out = [];
          if (sub) {
            const e1 = edge(t.label, sub);
            out.push(<line key={`s1-${pg.def.key}`} x1={e1.a[0]} y1={e1.a[1]} x2={e1.b[0]} y2={e1.b[1]} stroke={pg.def.color} strokeWidth={3} />);
            const e2 = edge(sub, f);
            out.push(<line key={`s2-${pg.def.key}`} x1={e2.a[0]} y1={e2.a[1]} x2={e2.b[0]} y2={e2.b[1]} stroke={pg.def.stroke} strokeWidth={3} />);
          } else {
            const e = edge(t.label, f);
            out.push(<line key={`s-${pg.def.key}`} x1={e.a[0]} y1={e.a[1]} x2={e.b[0]} y2={e.b[1]} stroke={pg.def.stroke} strokeWidth={3} />);
          }
          return out;
        })}

        {/* cadres et cellules */}
        {placed.map((pg) => pg.cells.length > 0 && (
          <g key={pg.def.key}>
            <rect x={pg.frame.x} y={pg.frame.y} width={pg.frame.w} height={pg.frame.h} rx={46} fill="#fff" stroke={pg.def.stroke} strokeWidth={3.5} />
            {pg.cells.map((c) => {
              const i = c.ind;
              const hidden = !levels[i.niveau];
              if (hidden) return null;
              const dim = i.priorite != null && i.priorite > maxPrio;
              const top = c.y + (c.h - c.lines.length * CELL.lineH) / 2 + CELL.lineH * 0.8;
              return (
                <g key={i.id} opacity={dim ? 0.18 : 1} style={{ cursor: 'pointer' }} onClick={() => !moved.current && !snapshot && nav(`/indicateurs?edit=${i.id}`)}>
                  <title>{`${i.libelle}\nNiveau : ${i.niveau} · Priorité : ${i.priorite ?? '—'}\nSource : ${i.source || '—'}`}</title>
                  <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={9} fill={NIVEAU_FILL[i.niveau]} stroke={darker(NIVEAU_FILL[i.niveau])} strokeWidth={1} />
                  {i.statut === 'valide' && <circle cx={c.x + c.w - 8} cy={c.y + 8} r={5} fill="#2e9d4f" stroke="#fff" strokeWidth={1.5} />}
                  {(i.dataset_ids?.length ?? 0) > 0 && (
                    <g onClick={(e) => { e.stopPropagation(); if (!moved.current) nav(`/donnees?ds=${i.dataset_ids[0]}`); }}>
                      <title>Voir les données</title>
                      <rect x={c.x + 3} y={c.y + c.h - 15} width={14} height={12} rx={3} fill="#2563eb" /><text x={c.x + 10} y={c.y + c.h - 5.5} textAnchor="middle" fontSize={9} fill="#fff">▦</text>
                    </g>
                  )}
                  {(i.kpi_ids?.length ?? 0) > 0 && (
                    <g onClick={(e) => { e.stopPropagation(); if (!moved.current) nav(`/tableau-de-bord?kpi=${i.kpi_ids![0]}`); }}>
                      <title>Voir le KPI dans le tableau de bord</title>
                      <rect x={c.x + 20} y={c.y + c.h - 15} width={14} height={12} rx={3} fill="#16a34a" /><text x={c.x + 27} y={c.y + c.h - 5.5} textAnchor="middle" fontSize={9} fill="#fff">◔</text>
                    </g>
                  )}
                  {i.statut === 'abandonne' && <line x1={c.x + 6} y1={c.y + c.h - 6} x2={c.x + c.w - 6} y2={c.y + 6} stroke="#b91c1c" strokeWidth={2} />}
                  <text textAnchor="middle" fontSize={CELL.font} fontWeight={i.priorite === 1 ? 700 : 400} fill={prioColor(i.priorite)}>
                    {c.lines.map((ln, k) => <tspan key={k} x={c.x + c.w / 2} y={top + k * CELL.lineH}>{ln}</tspan>)}
                  </text>
                </g>
              );
            })}
          </g>
        ))}

        {/* pastilles de rubrique */}
        {placed.map((pg) => pg.cells.length > 0 && pg.def.label && (
          <g key={`l-${pg.def.key}`}>
            <rect x={pg.def.label[0]} y={pg.def.label[1]} width={pg.def.label[2] - pg.def.label[0]} height={pg.def.label[3] - pg.def.label[1]} rx={8} fill={pg.def.color} stroke="#222" strokeWidth={0.8} />
            <text x={(pg.def.label[0] + pg.def.label[2]) / 2} y={(pg.def.label[1] + pg.def.label[3]) / 2 + 7} textAnchor="middle" fontSize={21} fontWeight={700} fill="#fff">{pg.def.title}</text>
          </g>
        ))}

        {/* thèmes */}
        {THEMES.map((t) => {
          const [x0, y0, x1, y1] = t.label;
          const parts = t.title.includes('&') ? [t.title.split(' & ')[0], '& ' + t.title.split(' & ')[1]] : [t.title];
          const fs = t.size;
          return (
            <g key={t.key}>
              <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={10} fill={t.color} stroke="#222" strokeWidth={0.8} />
              <text textAnchor="middle" fontSize={fs} fontWeight={700} fill="#fff">
                {parts.map((p, k) => (
                  <tspan key={k} x={(x0 + x1) / 2} y={(y0 + y1) / 2 + fs * 0.35 + (k - (parts.length - 1) / 2) * fs * 1.15}>{p}</tspan>
                ))}
              </text>
            </g>
          );
        })}

        {/* centre */}
        <ellipse cx={(CENTER[0] + CENTER[2]) / 2} cy={(CENTER[1] + CENTER[3]) / 2} rx={(CENTER[2] - CENTER[0]) / 2} ry={(CENTER[3] - CENTER[1]) / 2} fill="#d9e8fc" stroke="#222" strokeWidth={1} />
        <text textAnchor="middle" fontSize={34} fontWeight={700}>
          <tspan x={(CENTER[0] + CENTER[2]) / 2} y={(CENTER[1] + CENTER[3]) / 2 - 4}>Observatoire</tspan>
          <tspan x={(CENTER[0] + CENTER[2]) / 2} y={(CENTER[1] + CENTER[3]) / 2 + 36}>de la Ville</tspan>
        </text>

        {/* légende */}
        <g>
          <line x1={40} y1={2040} x2={1083} y2={2040} stroke="#000" strokeWidth={1.5} />
          <text x={60} y={2078} fontSize={21} fontWeight={700} fontStyle="italic">Indicateurs de...</text>
          <circle cx={1020} cy={2107} r={5} fill="#2e9d4f" />
          <text x={1032} y={2113} fontSize={17}>validé</text>
          {NIVEAUX.map((n, k) => (
            <g key={n.key}>
              <rect x={150 + k * 211} y={2090} width={185} height={34} rx={6} fill={NIVEAU_FILL[n.key]} stroke={darker(NIVEAU_FILL[n.key])} />
              <text x={150 + k * 211 + 92} y={2113} textAnchor="middle" fontSize={19} fontWeight={700}>{n.label === 'Prospective' ? 'Prospectives' : n.label}</text>
              {[1, 2, 3, 4].map((p, r) => (
                <g key={p}>
                  <rect x={150 + k * 211} y={2152 + r * 44} width={185} height={34} rx={6} fill={NIVEAU_FILL[n.key]} stroke={darker(NIVEAU_FILL[n.key])} />
                  <text x={150 + k * 211 + 92} y={2176 + r * 44} textAnchor="middle" fontSize={CELL.font} fontWeight={p === 1 ? 700 : 400} fill={prioColor(p)}>Priorité {p}</text>
                </g>
              ))}
            </g>
          ))}
        </g>

        {/* titre */}
        <g>
          <rect x={2640} y={2140} width={700} height={190} rx={6} fill="#fff" stroke="#222" strokeWidth={2} />
          <text x={2700} y={2210} fontSize={34} fontStyle="italic" fontWeight={700}>Observatoire de la ville</text>
          <text x={2700} y={2258} fontSize={34} fontStyle="italic" fontWeight={700}>Indicateurs par thème</text>
          <text x={2700} y={2304} fontSize={30} fontStyle="italic">{title}</text>
        </g>
      </svg>
    </section>
  );
}
