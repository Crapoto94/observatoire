import { useState } from 'react';
import { DEFAULT_TILE_STYLE, TileStyle, tileStyle } from '../dashConfig';
import type { Item } from './MonTableau';
import type { Kpi } from './Dashboard';

// Paramétrage fin d'une tuile (roue dentée) : titre, typographie, couleurs, éléments affichés, type de
// graphique, bornes par indicateur, et sélection multi-indicateurs. Les options s'appliquent au rendu
// du tableau de bord et au PDF envoyé par e-mail.
export default function TileSettings({ item, kpis, series, onSave, onClose }: {
  item: Item; kpis: Record<string, Kpi>; series: string[];
  onSave: (title: string, style: TileStyle, kpiIds?: string[]) => void; onClose: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [s, setS] = useState<TileStyle>({ ...DEFAULT_TILE_STYLE, ...tileStyle(item.config) });
  const set = <K extends keyof TileStyle>(k: K, v: TileStyle[K]) => setS((o) => ({ ...o, [k]: v }));
  // Fixe une borne (début/fin) d'un axe : '' = axe commun, sinon l'index de la série (axe séparé).
  const setAxisBound = (key: string, field: 'min' | 'max', raw: string) => {
    const v = raw.trim() === '' ? null : Number(raw);
    setS((o) => {
      const axisBounds = { ...(o.axisBounds || {}) };
      const cur = { ...(axisBounds[key] || {}), [field]: Number.isNaN(v as number) ? null : v };
      if (cur.min == null && cur.max == null) delete axisBounds[key]; else axisBounds[key] = cur;
      return { ...o, axisBounds };
    });
  };
  const isKpi = item.kind === 'kpi';
  const [ids, setIds] = useState<string[]>(item.config.kpiIds?.length ? item.config.kpiIds : (item.config.kpiId ? [item.config.kpiId] : []));
  const toggleId = (id: string) => setIds((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const allKpis = Object.values(kpis);

  return (
    <div className="modal-back" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal tile-settings">
        <h2>Paramètres de la tuile</h2>

        <div className="ts-grid">
          <label className="field ts-full"><span>Titre</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} /></label>

          <label className="field"><span>Taille du titre (px)</span>
            <input type="number" min={9} max={28} value={s.titleSize ?? 13} onChange={(e) => set('titleSize', Number(e.target.value))} /></label>
          {isKpi && (
            <label className="field"><span>Taille de la valeur (px)</span>
              <input type="number" min={14} max={72} value={s.valueSize ?? 28} onChange={(e) => set('valueSize', Number(e.target.value))} /></label>
          )}
          <label className="field"><span>Couleur du texte</span>
            <input type="color" value={s.textColor || '#1c2330'} onChange={(e) => set('textColor', e.target.value)} /></label>
          <label className="field"><span>Couleur du titre</span>
            <input type="color" value={s.titleColor || '#0f2942'} onChange={(e) => set('titleColor', e.target.value)} /></label>
          <label className="field"><span>Fond de la tuile</span>
            <input type="color" value={s.background || '#ffffff'} onChange={(e) => set('background', e.target.value)} /></label>
          <label className="field"><span>Alignement</span>
            <select value={s.align || 'left'} onChange={(e) => set('align', e.target.value as TileStyle['align'])}>
              <option value="left">Gauche</option><option value="center">Centré</option><option value="right">Droite</option>
            </select></label>

          {isKpi && (
            <label className="field"><span>Courbe de tendance</span>
              <select value={s.trend || 'spark'} onChange={(e) => set('trend', e.target.value as TileStyle['trend'])}>
                <option value="spark">À côté de la valeur</option>
                <option value="background">En fond</option>
                <option value="none">Aucune</option>
              </select></label>
          )}
          {isKpi && (
            <label className="field"><span>Indicateurs par ligne (multi)</span>
              <select value={s.multiRows || 2} onChange={(e) => set('multiRows', Number(e.target.value))}>
                <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option>
              </select></label>
          )}
          {!isKpi && (
            <>
              <label className="field"><span>Type d'affichage</span>
                <select value={s.display || 'line'} onChange={(e) => set('display', e.target.value as TileStyle['display'])}>
                  <option value="line">Courbe</option>
                  <option value="bar">Barres</option>
                  <option value="histo">Histogramme</option>
                </select></label>
              <label className="field"><span>Bornes par indicateur</span>
                <select value={s.boundsPerSeries === false ? 'non' : 'oui'} onChange={(e) => set('boundsPerSeries', e.target.value === 'oui')} title="Chaque indicateur a sa propre échelle d'axe">
                  <option value="oui">Oui (échelles indépendantes)</option><option value="non">Non (échelle commune)</option></select></label>
              <div className="ts-full">
                <span className="muted small">Bornes d'axe (début / fin) — laisser vide pour automatique{s.boundsPerSeries !== false && series.length > 1 ? ', une échelle par indicateur' : ''}</span>
                <div className="axis-bounds">
                  {(s.boundsPerSeries !== false && series.length > 1 ? series.map((name, i) => ({ key: String(i), label: name })) : [{ key: '', label: 'Axe commun' }]).map(({ key, label }) => {
                    const b = s.axisBounds?.[key] || {};
                    return (
                      <div key={key || 'common'} className="axis-bound-row">
                        <span className="axis-bound-name small" title={label}>{label}</span>
                        <input type="number" placeholder="début" value={b.min ?? ''} onChange={(e) => setAxisBound(key, 'min', e.target.value)} />
                        <input type="number" placeholder="fin" value={b.max ?? ''} onChange={(e) => setAxisBound(key, 'max', e.target.value)} />
                      </div>
                    );
                  })}
                </div>
              </div>
              {(s.display === 'histo') && (
                <>
                  <label className="field"><span>Nombre de classes</span>
                    <input type="number" min={0} max={20} value={s.histoBins || 0} onChange={(e) => set('histoBins', Number(e.target.value))} title="0 = automatique" /></label>
                  <label className="field"><span>Un histogramme par indicateur</span>
                    <select value={s.histoPerSeries ? 'oui' : 'non'} onChange={(e) => set('histoPerSeries', e.target.value === 'oui')}><option value="non">Non</option><option value="oui">Oui</option></select></label>
                </>
              )}
              <label className="field"><span>Légende</span>
                <select value={s.showLegend === false ? 'non' : 'oui'} onChange={(e) => set('showLegend', e.target.value === 'oui')}><option value="oui">Oui</option><option value="non">Non</option></select></label>
              <label className="field"><span>Grille</span>
                <select value={s.showGrid === false ? 'non' : 'oui'} onChange={(e) => set('showGrid', e.target.value === 'oui')}><option value="oui">Oui</option><option value="non">Non</option></select></label>
              <label className="field"><span>Axes</span>
                <select value={s.showAxes === false ? 'non' : 'oui'} onChange={(e) => set('showAxes', e.target.value === 'oui')}><option value="oui">Oui</option><option value="non">Non</option></select></label>
              <label className="field"><span>Valeurs sur le graphique</span>
                <select value={s.showValues ? 'oui' : 'non'} onChange={(e) => set('showValues', e.target.value === 'oui')}><option value="non">Non</option><option value="oui">Oui</option></select></label>
              <label className="field"><span>Couleur des séries</span>
                <input type="color" value={s.chartColor || '#2563eb'} onChange={(e) => set('chartColor', e.target.value)} /></label>
            </>
          )}
        </div>

        {isKpi && (
          <fieldset className="ts-checks ts-kpi-pick">
            <legend>Indicateurs de la tuile ({ids.length})</legend>
            <p className="muted small" style={{ flexBasis: '100%' }}>Cochez un ou plusieurs indicateurs : plusieurs forment une tuile multi-indicateurs.</p>
            <div className="kpi-pick-list">
              {allKpis.map((k) => (
                <label key={k.id} className="inline small"><input type="checkbox" checked={ids.includes(k.id)} onChange={() => toggleId(k.id)} /> {k.label}{k.value == null ? ' (non disponible)' : ''}</label>
              ))}
            </div>
          </fieldset>
        )}

        {isKpi && (
          <fieldset className="ts-checks">
            <legend>Éléments affichés</legend>
            {([
              ['showTheme', 'Thème'], ['showBadge', 'Pastille de statut'], ['showPeriod', 'Période de la donnée'],
              ['showDelta', 'Évolution vs période précédente'], ['showCompare', 'Comparaison (GOSB / département / région)'],
              ['showLink', 'Lien vers les données'],
            ] as [keyof TileStyle, string][]).map(([key, label]) => (
              <label key={key} className="inline small"><input type="checkbox" checked={s[key] !== false} onChange={(e) => set(key, e.target.checked)} /> {label}</label>
            ))}
          </fieldset>
        )}

        <fieldset className="ts-checks">
          <legend>Cadre</legend>
          <label className="inline small"><input type="checkbox" checked={s.bold !== false} onChange={(e) => set('bold', e.target.checked)} /> Valeur en gras</label>
          <label className="inline small"><input type="checkbox" checked={s.border !== false} onChange={(e) => set('border', e.target.checked)} /> Bordure</label>
          <label className="inline small"><input type="checkbox" checked={!!s.accent} onChange={(e) => set('accent', e.target.checked)} /> Liseré d'accent</label>
        </fieldset>

        <div className="modal-actions">
          <button className="secondary" onClick={() => setS({ ...DEFAULT_TILE_STYLE })}>Réinitialiser</button>
          <span className="spacer" />
          <button className="secondary" onClick={onClose}>Annuler</button>
          <button onClick={() => onSave(title, s, isKpi ? ids : undefined)}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}
