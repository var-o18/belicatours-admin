import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const STATUS_LABEL = { publicada: 'Publicada', borrador: 'Borrador', archivada: 'Archivada' };
const euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

// Primera versión: listado de comprobación. La gestión completa (crear,
// editar, fotos, sesiones) llegará en el siguiente paso.
export default function Actividades() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase
      .from('activities')
      .select('id, title, category, price_adult, status, activity_sessions(count)')
      .order('sort_order')
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setRows(data);
      });
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Actividades</h1>
          <p>{rows ? `${rows.length} actividades` : 'Cargando…'}</p>
        </div>
      </div>

      {error ? <p className="alert">{error}</p> : null}

      {rows ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {rows.map((a) => (
            <li
              key={a.id}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '4px 16px',
                alignItems: 'baseline',
                padding: '14px 16px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
              }}
            >
              <strong style={{ flex: '1 1 260px' }}>{a.title}</strong>
              <span style={{ color: 'var(--muted)', fontSize: 14 }}>
                {euros.format(a.price_adult)} · {a.activity_sessions?.[0]?.count ?? 0} sesiones ·{' '}
                {STATUS_LABEL[a.status]}
              </span>
              <Link to={`/reservas?actividad=${a.id}`} className="btn btn--ghost btn--sm">
                Ver reservas
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
