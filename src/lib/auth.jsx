import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

const AuthContext = createContext(null);

/**
 * Sesión de Supabase + rol del usuario (tabla user_roles).
 * El rol solo sirve para la interfaz: la seguridad real la ponen las
 * políticas RLS de la base de datos.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = cargando
  const [roleState, setRoleState] = useState({ userId: null, role: null });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setRoleState({ userId, role: data?.role ?? null });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // undefined = todavía cargando
  const role =
    session === undefined ? undefined : !userId ? null : roleState.userId === userId ? roleState.role : undefined;

  const value = {
    session,
    user: session?.user ?? null,
    role,
    loading: session === undefined || role === undefined,
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signOut: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
