import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../lib/auth';

/** Protege las rutas privadas: hace falta sesión y rol de administrador. */
export default function RequireAdmin() {
  const { loading, session, role, user, signOut } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="center-screen">
        <div className="spinner" aria-label="Cargando" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (role !== 'admin') {
    return (
      <div className="center-screen">
        <div style={{ maxWidth: 380, display: 'grid', gap: 14, textAlign: 'center', justifyItems: 'center' }}>
          <ShieldAlert size={36} color="var(--terracota)" />
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.4rem' }}>Sin permiso</h1>
          <p style={{ margin: 0, color: 'var(--muted)' }}>
            La cuenta <strong>{user?.email}</strong> no tiene acceso al panel.
          </p>
          <button className="btn btn--ghost" onClick={signOut}>
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
