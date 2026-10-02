import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import Indicateurs from './pages/Indicateurs';
import Carte from './pages/Carte';
import Donnees from './pages/Donnees';
import Pilotage from './pages/Pilotage';
import Catalogue from './pages/Catalogue';
import Database from './pages/Database';
import Cartographie from './pages/Cartographie';
import Imports from './pages/Imports';
import Nouveautes from './pages/Nouveautes';
import Dashboard from './pages/Dashboard';
import Autres from './pages/Autres';

export default function App() {
  const [build, setBuild] = useState('');
  const [version, setVersion] = useState('');
  useEffect(() => {
    fetch('/api/status').then((r) => r.json()).then((s) => { setVersion(s.version || ''); setBuild(s.build ? new Date(s.build).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : ''); }).catch(() => undefined);
  }, []);
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◉</span> Observatoire de la ville{version && <NavLink to="/nouveautes" className="ver" title="Nouveautés (historique des versions)">v{version}</NavLink>}
        </div>
        <nav>
          <NavLink to="/indicateurs">Conception des indicateurs</NavLink>
          <NavLink to="/tableau-de-bord">Tableau de bord</NavLink>
          <NavLink to="/autres">Autres</NavLink>
          <NavLink to="/pilotage">Pilotage</NavLink>
          <NavLink to="/carte">Carte mentale</NavLink>
          <NavLink to="/donnees">Données</NavLink>
          <NavLink to="/cartographie">Cartographie</NavLink>
          <NavLink to="/catalogue">Catalogue</NavLink>
          <NavLink to="/imports">Journal des imports</NavLink>
          <NavLink to="/database">Base de données</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/indicateurs" replace />} />
          <Route path="/indicateurs" element={<Indicateurs />} />
          <Route path="/tableau-de-bord" element={<Dashboard />} />
          <Route path="/autres" element={<Autres />} />
          <Route path="/emploi" element={<Navigate to="/autres" replace />} />
          <Route path="/pilotage" element={<Pilotage />} />
          <Route path="/carte" element={<Carte />} />
          <Route path="/donnees" element={<Donnees />} />
          <Route path="/cartographie" element={<Cartographie />} />
          <Route path="/catalogue" element={<Catalogue />} />
          <Route path="/imports" element={<Imports />} />
          <Route path="/nouveautes" element={<Nouveautes />} />
          <Route path="/database" element={<Database />} />
        </Routes>
      </main>
      <footer className="build">{version && <NavLink to="/nouveautes" title="Voir les nouveautés">v{version} · Nouveautés</NavLink>}{build ? ` · version du ${build}` : ''}</footer>
    </div>
  );
}
