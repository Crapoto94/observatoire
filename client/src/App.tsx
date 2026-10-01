import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import Indicateurs from './pages/Indicateurs';
import Carte from './pages/Carte';
import Donnees from './pages/Donnees';
import Pilotage from './pages/Pilotage';

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◉</span> Observatoire de la ville
        </div>
        <nav>
          <NavLink to="/indicateurs">Conception des indicateurs</NavLink>
          <NavLink to="/pilotage">Pilotage</NavLink>
          <NavLink to="/carte">Carte mentale</NavLink>
          <NavLink to="/donnees">Données</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/indicateurs" replace />} />
          <Route path="/indicateurs" element={<Indicateurs />} />
          <Route path="/pilotage" element={<Pilotage />} />
          <Route path="/carte" element={<Carte />} />
          <Route path="/donnees" element={<Donnees />} />
        </Routes>
      </main>
    </div>
  );
}
