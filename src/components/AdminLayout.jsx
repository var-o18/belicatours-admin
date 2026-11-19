import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { CalendarCheck, Map, Wallet, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import './AdminLayout.css';

const NAV = [
  { to: '/reservas', label: 'Reservas', icon: CalendarCheck },
  { to: '/actividades', label: 'Actividades', icon: Map },
  { to: '/pagos', label: 'Datos de pago', icon: Wallet },
];

export default function AdminLayout() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className={`shell${open ? ' shell--open' : ''}`}>
      <header className="topbar">
        <button className="topbar__menu" onClick={() => setOpen((o) => !o)} aria-label="Abrir menú" aria-expanded={open}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
        <span className="topbar__brand">Bélica Tours</span>
      </header>

      <aside className="sidebar">
        <div className="sidebar__brand">
          <img src="/logo.png" alt="" />
          <div>
            <strong>Bélica Tours</strong>
            <span>Panel de gestión</span>
          </div>
        </div>

        <nav className="sidebar__nav">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className="sidebar__link" onClick={() => setOpen(false)}>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__user">
          <span title={user?.email}>{user?.email}</span>
          <button className="btn btn--ghost" onClick={signOut}>
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="shell__backdrop" onClick={() => setOpen(false)} />

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
