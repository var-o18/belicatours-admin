import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, CalendarDays, Users, ImageOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatDate, formatMoney } from '../../lib/format';
import { imageUrl } from '../../lib/images';
import { ACTIVITY_STATUS, CATEGORY_LABEL } from './meta';
import '../reservas/reservas.css';
import './actividades.css';

const TABS = [
  { id: 'activas', label: 'Activas', test: (a) => a.status !== 'archivada' },
  { id: 'publicada', label: 'Publicadas', test: (a) => a.status === 'publicada' },
  { id: 'borrador', label: 'Borradores', test: (a) => a.status === 'borrador' },
  { id: 'archivada', label: 'Archivadas', test: (a) => a.status === 'archivada' },
];

export default function ActividadesList() {
  const [rows, setRows] = useState(null);
  const [stats, setStats] = useState({});
  const [error, setError] = useState('');
  const [tab, setTab] = useState('activas');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase
        .from('activities')
        .select('id, slug, title, category, price_adult, status, cover_image_path, activity_sessions(starts_at, status)')
        .order('sort_order'),
      supabase.from('reservations').select('activity_id, guests, status, event_at'),
    ]).then(([a, r]) => {
      if (cancelled) return;
      if (a.error) return setError(a.error.message);
      const now = new Date().toISOString();
      const s = {};
      (r.data ?? []).forEach((x) => {
        if (x.status === 'cancelada' || x.event_at < now) return;
        s[x.activity_id] ??= { reservas: 0, personas: 0 };
        s[x.activity_id].reservas++;
        s[x.activity_id].personas += x.guests;
      });
      setStats(s);
      setRows(
        a.data.map((act) => {
          const upcoming = act.activity_sessions
            .filter((x) => x.status === 'abierta' && x.starts_at > now)
            .sort((x, y) => x.starts_at.localeCompare(y.starts_at));
          return { ...act, upcoming };
        })
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t.id, rows ? rows.filter(t.test).length : 0])),
    [rows]
  );
  const visible = rows ? rows.filter(TABS.find((t) => t.id === tab).test) : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Actividades</h1>
          <p>Las rutas publicadas son las que se muestran en la web.</p>
        </div>
        <Link to="/actividades/nueva" className="btn btn--primary">
          <Plus size={17} /> Nueva actividad
        </Link>
      </div>

      <div className="status-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'is-on' : ''} onClick={() => setTab(t.id)}>
            {t.label} <b>{counts[t.id]}</b>
          </button>
        ))}
      </div>

      {error ? <p className="alert">{error}</p> : null}

      {!rows ? (
        <div className="center-screen" style={{ minHeight: 200 }}>
          <div className="spinner" />
        </div>
      ) : visible.length === 0 ? (
        <div className="empty">
          <p>No hay actividades en este apartado.</p>
        </div>
      ) : (
        <div className="act-grid">
          {visible.map((a) => {
            const st = stats[a.id];
            const img = imageUrl(a.cover_image_path);
            return (
              <Link key={a.id} to={`/actividades/${a.id}`} className={`act-card act-card--${a.status}`}>
                <div className="act-card__img">
                  {img ? <img src={img} alt="" loading="lazy" /> : <ImageOff size={28} />}
                  <span className="act-card__status" style={{ '--c': ACTIVITY_STATUS[a.status].color }}>
                    {ACTIVITY_STATUS[a.status].label}
                  </span>
                </div>
                <div className="act-card__body">
                  <small>{CATEGORY_LABEL[a.category]}</small>
                  <h2>{a.title}</h2>
                  <div className="act-card__meta">
                    <span>
                      <strong>{formatMoney(a.price_adult)}</strong>
                    </span>
                    <span>
                      <CalendarDays size={14} />
                      {a.upcoming.length
                        ? `${a.upcoming.length} ${a.upcoming.length === 1 ? 'fecha' : 'fechas'} · próx. ${formatDate(a.upcoming[0].starts_at)}`
                        : 'Sin fechas próximas'}
                    </span>
                    <span>
                      <Users size={14} />
                      {st ? `${st.reservas} reservas · ${st.personas} pers.` : 'Sin reservas próximas'}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
