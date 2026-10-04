import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api';
import { isAdmin, useAuth } from '../auth';
import Imports from './Imports';
import Database from './Database';
import IaSettings from './IaSettings';

interface U {
  id: number; username: string; display_name: string | null; email: string | null;
  role: 'utilisateur' | 'admin'; provider: 'ad' | 'local'; connections: number; last_login: string | null;
}
interface Services {
  apm: { configured: boolean; url: string; ca: boolean; allowSelfSigned: boolean };
  ia: { providers?: { id: string; name: string; ok: boolean; model: string }[]; chosen?: string } | null;
  localAdmin: { enabled: boolean; username: string };
  version: string;
  database: { users: number; sessions: number };
}

type Tab = 'compte' | 'apparence' | 'roles' | 'usage' | 'imports' | 'database' | 'ia' | 'services';

interface UsageUser {
  id: number; username: string; display_name: string | null; role: string; provider: string;
  connections: number; last_login: string | null; requetes: number; analyse: number; edition: number;
  exploration: number; derniere_requete: string | null; jours_actifs: number; profil: string; taux_avance: number;
}
interface Usage {
  generated: string; days: number; depuis: string; niveaux: string[];
  totaux: { requetes: number; utilisateurs: number; sessions: number };
  parCat: Record<string, number>;
  users: UsageUser[];
  parRessource: { ressource: string; categorie: string; n: number }[];
  parJour: { j: string; n: number }[];
}

const PROFILS: Record<string, { label: string; color: string; hint: string }> = {
  consultant: { label: 'Consultation', color: '#0369a1', hint: 'Consulte surtout listes, fiches et cartes' },
  analyste: { label: 'Analyse', color: '#7c3aed', hint: 'Explore des données détaillées, séries et graphiques' },
  constructeur: { label: 'Construction', color: '#b45309', hint: 'Modifie souvent des indicateurs, tableaux de bord ou réglages' },
  explorateur: { label: 'Exploration', color: '#be185d', hint: 'Assistant IA, imports, recherche avancée (data mining)' },
  inactif: { label: 'Inactif', color: '#94a3b8', hint: 'Aucune requête sur la période' },
};

// Menu Paramètres : compte, préférences d'affichage, gestion des rôles et état des services.
export default function Parametres() {
  const { user, refresh } = useAuth();
  const admin = isAdmin(user);
  const [tab, setTab] = useState<Tab>('compte');
  const [users, setUsers] = useState<U[]>([]);
  const [services, setServices] = useState<Services | null>(null);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [usage, setUsage] = useState<Usage | null>(null);
  const [usageDays, setUsageDays] = useState(30);

  const load = () => {
    api<U[]>('/admin/users').then(setUsers).catch(() => undefined);
    api<Services>('/services/status').then(setServices).catch(() => undefined);
    api<{ settings: Record<string, unknown> }>('/settings').then((r) => setSettings(r.settings)).catch(() => undefined);
  };
  useEffect(load, []);
  useEffect(() => { if (!admin) return; api<Usage>(`/admin/usage?days=${usageDays}`).then(setUsage).catch(() => undefined); }, [admin, usageDays]);

  const setRole = async (u: U, role: string) => {
    try { await api(`/admin/users/${u.id}/role`, { method: 'PUT', body: { role } }); if (u.id === user?.id) await refresh(); api<U[]>('/admin/users').then(setUsers); }
    catch (e) { setError((e as Error).message); }
  };
  const savePref = async (key: string, value: unknown) => {
    setSettings((s) => ({ ...s, [key]: value }));
    try { await api('/settings', { method: 'PUT', body: { [key]: value } }); setSaved(key); setTimeout(() => setSaved(''), 1500); }
    catch (e) { setError((e as Error).message); }
  };

  const TABS: { key: Tab; label: string; admin?: boolean }[] = [
    { key: 'compte', label: 'Mon compte' },
    { key: 'apparence', label: 'Affichage' },
    { key: 'roles', label: 'Rôles & connexions', admin: true },
    { key: 'usage', label: 'Usage', admin: true },
    { key: 'imports', label: 'Journal des imports', admin: true },
    { key: 'database', label: 'Base de données', admin: true },
    { key: 'ia', label: 'IA' },
    { key: 'services', label: 'Services' },
  ];

  return (
    <section className="page parametres">
      <div className="page-head"><h1>Paramètres</h1></div>
      {error && <div className="error">{error}</div>}
      <div className="tabs">
        {TABS.filter((t) => !t.admin || admin).map((t) => (
          <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === 'compte' && user && (
        <div className="settings-card">
          <h2>Mon compte</h2>
          <dl className="kv">
            <dt>Identifiant</dt><dd>{user.username}</dd>
            <dt>Nom affiché</dt><dd>{user.display_name || '—'}</dd>
            <dt>Courriel</dt><dd>{user.email || '—'}</dd>
            <dt>Rôle</dt><dd><span className={`role-pill ${user.role}`}>{user.role}</span></dd>
            <dt>Source</dt><dd>{user.provider === 'local' ? 'Compte local de secours' : 'Annuaire Active Directory'}</dd>
            <dt>Connexions</dt><dd>{user.connections}</dd>
            <dt>Dernière connexion</dt><dd>{user.last_login ? fmtDate(user.last_login) : '—'}</dd>
          </dl>
          <p className="muted small">Vos identifiants sont vérifiés auprès de l'annuaire Active Directory de la Ville ; aucune donnée de mot de passe n'est conservée.</p>
        </div>
      )}

      {tab === 'apparence' && (
        <div className="settings-card">
          <h2>Affichage de mon tableau de bord</h2>
          <label className="field"><span>Nombre de colonnes de la grille</span>
            <select value={Number(settings.boardCols) || 12} onChange={(e) => savePref('boardCols', Number(e.target.value))}>
              <option value={12}>12 (défaut)</option><option value={8}>8</option><option value={6}>6</option>
            </select>
          </label>
          <label className="field"><span>Hauteur d'une rangée (pixels)</span>
            <input type="number" min={30} max={90} value={Number(settings.boardRowH) || 46} onChange={(e) => savePref('boardRowH', Number(e.target.value))} />
          </label>
          {saved && <span className="muted small">Enregistré.</span>}
        </div>
      )}

      {tab === 'roles' && admin && (
        <div className="settings-card">
          <h2>Rôles & connexions</h2>
          <p className="muted small">Les comptes sont créés automatiquement à la première connexion (annuaire Active Directory). Seuls les administrateurs accèdent au journal des imports et à la base de données.</p>
          <div className="table-wrap short">
            <table className="grid compact">
              <thead><tr><th>Utilisateur</th><th>Nom</th><th>Courriel</th><th>Source</th><th className="num">Connexions</th><th>Dernière connexion</th><th>Rôle</th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.username}{u.id === user?.id && <span className="muted small"> (vous)</span>}</td>
                    <td>{u.display_name || '—'}</td>
                    <td className="small">{u.email || '—'}</td>
                    <td className="small">{u.provider === 'local' ? 'local' : 'Active Directory'}</td>
                    <td className="num">{u.connections}</td>
                    <td className="small">{u.last_login ? fmtDate(u.last_login) : 'jamais'}</td>
                    <td>
                      <select value={u.role} onChange={(e) => setRole(u, e.target.value)} disabled={u.id === user?.id} title={u.id === user?.id ? 'Vous ne pouvez pas modifier votre propre rôle' : ''}>
                        <option value="utilisateur">utilisateur</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && <tr><td colSpan={7} className="muted">Aucun compte pour le moment.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'usage' && admin && (
        <div className="settings-card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0 }}>Usage par utilisateur</h2>
            <label className="field small" style={{ margin: 0 }}><span>Période</span>
              <select value={usageDays} onChange={(e) => setUsageDays(Number(e.target.value))}>
                <option value={7}>7 jours</option><option value={30}>30 jours</option><option value={90}>90 jours</option><option value={365}>1 an</option>
              </select>
            </label>
          </div>
          {!usage && <div className="empty">Chargement des statistiques d’usage…</div>}
          {usage && (
            <>
              <div className="cards" style={{ marginTop: 8 }}>
                <div className="card"><div className="big">{usage.totaux.requetes.toLocaleString('fr-FR')}</div><div className="muted small">requêtes sur {usage.days} jours</div></div>
                <div className="card"><div className="big">{usage.totaux.utilisateurs}</div><div className="muted small">utilisateurs actifs</div></div>
                <div className="card"><div className="big">{usage.parCat.exploration ?? 0}<span className="muted small"> · {usage.parCat.edition ?? 0} · {usage.parCat.analyse ?? 0}</span></div><div className="muted small">exploration · édition · analyse</div></div>
              </div>
              <p className="muted small">Qualification : <b>consultation</b> (listes, fiches, cartes), <b>analyse</b> (données détaillées, séries, graphiques, exports), <b>édition</b> (modification d’indicateurs, tableaux de bord, réglages, rôles), <b>exploration</b> (assistant IA, imports, recherche avancée — data mining). Les requêtes techniques et l’actualisation automatique ne sont pas comptées.</p>
              <div className="table-wrap short">
                <table className="grid compact">
                  <thead><tr><th>Utilisateur</th><th className="num">Requêtes</th><th className="num" title="Consultation = listes, fiches, cartes">Consult.</th><th className="num" title="Analyse = données détaillées, séries, graphiques, exports">Analyse</th><th className="num" title="Édition = modifications d’indicateurs, tableaux de bord, réglages, rôles">Édition</th><th className="num" title="Exploration = assistant IA, imports, recherche avancée">Explor.</th><th className="num" title="Jours distincts avec au moins une requête">Jours</th><th>Profil</th><th>Dernière activité</th></tr></thead>
                  <tbody>
                    {usage.users.map((u) => {
                      const p = PROFILS[u.profil] || PROFILS.inactif;
                      const consult = u.requetes - u.analyse - u.edition - u.exploration;
                      return (
                        <tr key={u.id}>
                          <td>{u.username}{u.display_name ? <span className="muted small"> · {u.display_name}</span> : null}</td>
                          <td className="num"><b>{u.requetes.toLocaleString('fr-FR')}</b></td>
                          <td className="num muted">{consult}</td>
                          <td className="num">{u.analyse}</td>
                          <td className="num">{u.edition}</td>
                          <td className="num">{u.exploration}</td>
                          <td className="num">{u.jours_actifs}</td>
                          <td><span className="chip" style={{ background: p.color, color: '#fff' }} title={p.hint}>{p.label}</span>{u.taux_avance > 0 && <span className="muted small"> {u.taux_avance}% avancé</span>}</td>
                          <td className="small">{u.derniere_requete ? fmtDate(u.derniere_requete) : '—'}</td>
                        </tr>
                      );
                    })}
                    {usage.users.length === 0 && <tr><td colSpan={9} className="muted">Aucune donnée d’usage.</td></tr>}
                  </tbody>
                </table>
              </div>
              {usage.parRessource.length > 0 && (
                <>
                  <h3>Ressources les plus consultées</h3>
                  <div className="table-wrap short">
                    <table className="grid compact">
                      <thead><tr><th>Ressource</th><th>Catégorie</th><th className="num">Requêtes</th></tr></thead>
                      <tbody>{usage.parRessource.slice(0, 15).map((r) => <tr key={`${r.ressource}-${r.categorie}`}><td><code>{r.ressource}</code></td><td className="small">{r.categorie}</td><td className="num">{r.n.toLocaleString('fr-FR')}</td></tr>)}</tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
      {tab === 'ia' && <IaSettings />}
      {tab === 'imports' && admin && <Imports embedded />}
      {tab === 'database' && admin && <Database embedded />}

      {tab === 'services' && services && (
        <div className="settings-card">
          <h2>État des services</h2>
          <dl className="kv">
            <dt>Annuaire Active Directory (APM)</dt>
            <dd>{services.apm.configured ? <span className="trend-up">configuré</span> : <span className="al-attention">non configuré</span>}
              <span className="muted small"> · {services.apm.url}{services.apm.ca ? ' · autorité fournie' : services.apm.allowSelfSigned ? ' · certificat auto-signé accepté' : ''}</span></dd>
            <dt>Fournisseur IA</dt>
            <dd>{services.ia?.chosen ? <span className="trend-up">{services.ia.chosen}</span> : <span className="muted">non configuré</span>}
              {services.ia?.providers?.length ? <span className="muted small"> · {services.ia.providers.map((p) => `${p.name}${p.ok ? '' : ' (non configuré)'}`).join(', ')}</span> : null}</dd>
            <dt>Compte local de secours</dt>
            <dd>{services.localAdmin.enabled ? <span className="muted">{services.localAdmin.username} (actif)</span> : <span className="muted">désactivé</span>}</dd>
            <dt>Version</dt><dd>v{services.version}</dd>
            {admin && <><dt>Comptes enregistrés</dt><dd>{services.database.users} · {services.database.sessions} session(s) active(s)</dd></>}
          </dl>
        </div>
      )}
    </section>
  );
}
