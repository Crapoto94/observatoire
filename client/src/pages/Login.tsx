import { FormEvent, useState } from 'react';
import { useAuth } from '../auth';

// Mire de connexion : identifiants de l'annuaire Active Directory de la Ville
// (ou entrée locale de secours admin/admin), sur le modèle des applications de la Ville.
export default function Login() {
  const { login } = useAuth();
  const memo = (() => { try { return localStorage.getItem('observatoire.login') || ''; } catch { return ''; } })();
  const [username, setUsername] = useState(memo);
  const [password, setPassword] = useState('');
  const [local, setLocal] = useState(false);
  const [remember, setRemember] = useState(!!memo);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await login(username, password);
      try { remember ? localStorage.setItem('observatoire.login', username.trim()) : localStorage.removeItem('observatoire.login'); } catch { /* stockage indisponible */ }
    } catch (err) {
      setError((err as Error).message || 'Identifiant ou mot de passe incorrect.');
    } finally { setBusy(false); }
  };

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="login-accent" />
        <div className="login-head">
          <img src="/logo-ivry.jpg" alt="Ivry-sur-Seine" className="login-logo" />
          <h1>Observatoire de la ville</h1>
          <p className="muted small">Ville d'Ivry-sur-Seine · accès agent</p>
        </div>
        {error && <div className="error">{error}</div>}
        <label className="field">
          <span>{local ? 'Compte de secours' : 'Identifiant ou adresse e-mail'}</span>
          <input autoFocus={!memo} autoComplete="username"
            value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label className="field">
          <span>Mot de passe</span>
          <input type="password" autoFocus={!!memo} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <label className="login-remember small">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Se souvenir de mon identifiant <span className="muted">(jamais le mot de passe)</span>
        </label>
        <button type="submit" className="login-submit" disabled={busy || !username || !password}>{busy ? 'Connexion…' : 'Se connecter'}</button>
        <button type="button" className="login-local" onClick={() => setLocal(!local)}>
          {local ? "Retour à la connexion par annuaire" : 'Compte de secours local'}
        </button>
        <p className="muted small login-hint">Authentification via l'annuaire Active Directory de la Ville.</p>
      </form>
    </div>
  );
}
