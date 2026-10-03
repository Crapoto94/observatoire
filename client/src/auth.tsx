import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, setToken } from './api';

export interface User {
  id: number; username: string; display_name: string | null; email: string | null;
  role: 'utilisateur' | 'admin'; provider: 'ad' | 'local'; connections: number; last_login: string | null;
}
interface AuthState { user: User | null; ready: boolean; login: (u: string, p: string) => Promise<void>; logout: () => Promise<void>; refresh: () => Promise<void> }
export const isAdmin = (u: User | null) => u?.role === 'admin';

const Ctx = createContext<AuthState>(null as unknown as AuthState);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try { const r = await api<{ user: User | null }>('/auth/me'); setUser(r.user); }
    catch { setUser(null); }
    finally { setReady(true); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const onExpired = () => { setToken(null); setUser(null); };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const r = await api<{ user: User; token: string }>('/auth/login', { body: { username, password } });
    setToken(r.token);
    setUser(r.user);
  }, []);

  const logout = useCallback(async () => {
    try { await api('/auth/logout', { body: {} }); } catch { /* session déjà close */ }
    setToken(null);
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, ready, login, logout, refresh }}>{children}</Ctx.Provider>;
}
