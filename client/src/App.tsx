import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import Indicateurs from './pages/Indicateurs';
import Carte from './pages/Carte';
import Donnees from './pages/Donnees';
import Pilotage from './pages/Pilotage';
import Catalogue from './pages/Catalogue';
import Cartographie from './pages/Cartographie';
import Couches from './pages/Couches';
import Nouveautes from './pages/Nouveautes';
import Dashboard from './pages/Dashboard';
import MonTableau from './pages/MonTableau';
import Autres from './pages/Autres';
import IA from './pages/IA';
import Login from './pages/Login';
import Parametres from './pages/Parametres';
import Quartiers from './pages/Quartiers';
import { useAuth, isAdmin } from './auth';

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!isAdmin(user)) return <section className="page"><div className="error">Cette rubrique est réservée aux administrateurs.</div></section>;
  return <>{children}</>;
}

export default function App() {
  const [build, setBuild] = useState('');
  const [version, setVersion] = useState('');
  const { user, ready, logout } = useAuth();
  useEffect(() => {
    fetch('/api/status').then((r) => r.json()).then((s) => { setVersion(s.version || ''); setBuild(s.build ? new Date(s.build).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : ''); }).catch(() => undefined);
  }, []);

  if (!ready) return <div className="boot">Chargement…</div>;
  if (!user) return <Login />;

  const admin = isAdmin(user);
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/logo-ivry.jpg" alt="Ivry-sur-Seine" className="brand-logo" />
          <span className="brand-name">Observatoire de la ville</span>
          {version && <NavLink to="/nouveautes" className="ver" title="Nouveautés (historique des versions)">v{version}</NavLink>}
        </div>
        <nav>
          <NavLink to="/mon-tableau">Mon tableau de bord</NavLink>
          <NavLink to="/tableau-de-bord">Indicateurs</NavLink>
          <NavLink to="/indicateurs">Conception des indicateurs</NavLink>
          <NavLink to="/autres">Autres</NavLink>
          <NavLink to="/ia">IA</NavLink>
          <NavLink to="/pilotage">Pilotage</NavLink>
          <NavLink to="/carte">Carte mentale</NavLink>
          <NavLink to="/donnees">Données</NavLink>
          <NavLink to="/cartographie">Cartographie</NavLink>
          <NavLink to="/quartiers" title="Les 6 quartiers officiels de la Ville, reconstitués à partir des IRIS">Quartiers</NavLink>
          <NavLink to="/couches" title="Couches géographiques du Val-de-Marne lues en direct">Couches 94</NavLink>
          <NavLink to="/catalogue" title="Catalogue des données : document de référence et liste des jeux de données (sources, périmètre, granularité, champs, indicateurs liés)">Catalogue</NavLink>
          <a className="nav-sig" href="http://sig.ivry.local/" target="_blank" rel="noreferrer" title="Ouvrir le SIG de la Ville dans un nouvel onglet">SIG Ville ↗</a>
          {admin && <NavLink to="/parametres">Paramètres</NavLink>}
        </nav>
        <div className="user-box">
          {admin
            ? <NavLink to="/parametres" className="user-name" title={user.email || user.username}>{user.display_name || user.username}</NavLink>
            : <span className="user-name" title={user.email || user.username}>{user.display_name || user.username}</span>}
          {admin && <span className="user-role">admin</span>}
          <button className="secondary" onClick={logout} title="Se déconnecter">Déconnexion</button>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/mon-tableau" replace />} />
          <Route path="/indicateurs" element={<Indicateurs />} />
          <Route path="/tableau-de-bord" element={<Dashboard />} />
          <Route path="/mon-tableau" element={<MonTableau />} />
          <Route path="/autres" element={<Autres />} />
          <Route path="/ia" element={<IA />} />
          <Route path="/emploi" element={<Navigate to="/autres" replace />} />
          <Route path="/pilotage" element={<Pilotage />} />
          <Route path="/carte" element={<Carte />} />
          <Route path="/donnees" element={<Donnees />} />
          <Route path="/cartographie" element={<Cartographie />} />
          <Route path="/couches" element={<Couches />} />
          <Route path="/quartiers" element={<Quartiers />} />
          <Route path="/jeux-de-donnees" element={<Navigate to="/catalogue?vue=jeux" replace />} />
          <Route path="/catalogue" element={<Catalogue />} />
          <Route path="/imports" element={<Navigate to="/parametres" replace />} />
          <Route path="/nouveautes" element={<Nouveautes />} />
          <Route path="/database" element={<Navigate to="/parametres" replace />} />
          <Route path="/parametres" element={<RequireAdmin><Parametres /></RequireAdmin>} />
        </Routes>
      </main>
      <footer className="site-footer">
        <div className="footer-links">
          <span className="footer-title">Observatoire des données du territoire</span>
          <a href="https://www.ivry94.fr" target="_blank" rel="noreferrer">ivry94.fr ↗</a>
          <a href="/manifest.md" target="_blank" rel="noreferrer" title="Manifest fonctionnel de l'application">Manifest fonctionnel ↗</a>
          <NavLink to="/nouveautes" title="Historique des versions">Nouveautés</NavLink>
          <NavLink to="/catalogue" title="Données ouvertes">Données ouvertes</NavLink>
        </div>
        <div className="footer-meta muted small">
          <NavLink to="/nouveautes" title="Historique des versions">Version {version || '—'}</NavLink>
          {build ? ` · déployée le ${build}` : ''}
          <span className="badge-pill" style={{ marginLeft: 8 }}>Ville d'Ivry-sur-Seine</span>
        </div>
      </footer>
    </div>
  );
}
