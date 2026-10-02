import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import Indicateurs from './pages/Indicateurs';
import Carte from './pages/Carte';
import Donnees from './pages/Donnees';
import Pilotage from './pages/Pilotage';
import Catalogue from './pages/Catalogue';
import Database from './pages/Database';
import Imports from './pages/Imports';
import Dashboard from './pages/Dashboard';

export default function App() {
  const [build, setBuild] = useState('');
  useEffect(() => {
    fetch('/api/status').then((r) => r.json()).then((s) => setBuild(s.build ? new Date(s.build).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '')).catch(() => undefined);
  }, []);
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◉</span> Observatoire de la ville
        </div>
        <nav>
          <NavLink to="/indicateurs">Conception des indicateurs</NavLink>
          <NavLink to="/tableau-de-bord">Tableau de bord</NavLink>
          <NavLink to="/pilotage">Pilotage</NavLink>
          <NavLink to="/carte">Carte mentale</NavLink>
          <NavLink to="/donnees">Données</NavLink>
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
          <Route path="/pilotage" element={<Pilotage />} />
          <Route path="/carte" element={<Carte />} />
          <Route path="/donnees" element={<Donnees />} />
          <Route path="/catalogue" element={<Catalogue />} />
          <Route path="/imports" element={<Imports />} />
          <Route path="/database" element={<Database />} />
        </Routes>
      </main>
      {build && <footer className="build">Version du {build}</footer>}
    </div>
  );
}
