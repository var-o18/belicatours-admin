import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatDateTime, fromMadridInput } from '../../lib/format';
import { ConfirmDialog } from '../../components/ui';
import { SESSION_STATUS } from './meta';

/** Fechas y horas reservables de la actividad, con su ocupación. */
export default function SessionsManager({ activity }) {
  const [sessions, setSessions] = useState([]);
  const [booked, setBooked] = useState({});
  const [error, setError] = useState('');
  const [showPast, setShowPast] = useState(false);
  const [adding, setAdding] = useState(false);
  const [when, setWhen] = useState('');
  const [seats, setSeats] = useState('');
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => new Date().toISOString());

  const load = useCallback(async () => {
    const [s, r] = await Promise.all([
      supabase.from('activity_sessions').select('*').eq('activity_id', activity.id).order('starts_at'),
      supabase.from('reservations').select('session_id, guests, status').eq('activity_id', activity.id),
    ]);
    if (s.error) return setError(s.error.message);
    const b = {};
    (r.data ?? []).forEach((x) => {
      if (x.session_id && x.status !== 'cancelada') b[x.session_id] = (b[x.session_id] ?? 0) + x.guests;
    });
    setBooked(b);
    setSessions(s.data);
  }, [activity.id]);

  useEffect(() => {
    load();
  }, [load]);

  const upcoming = useMemo(() => sessions.filter((s) => s.starts_at >= now), [sessions, now]);
  const past = useMemo(() => sessions.filter((s) => s.starts_at < now).reverse(), [sessions, now]);

  const add = async (e) => {
    e.preventDefault();
    setError('');
    const n = parseInt(seats || activity.capacity, 10);
    if (!when) return setError('Indica fecha y hora.');
    if (!(n > 0)) return setError('Indica el número de plazas.');
    const startsAt = fromMadridInput(when);
    if (startsAt < new Date().toISOString()) return setError('Esa fecha ya ha pasado.');
    setBusy(true);
    const { error: err } = await supabase
      .from('activity_sessions')
      .insert({ activity_id: activity.id, starts_at: startsAt, seats: n });
    setBusy(false);
    if (err) return setError(err.code === '23505' ? 'Ya existe una sesión a esa hora.' : err.message);
    setWhen('');
    setSeats('');
    setAdding(false);
    load();
  };

  const patch = async (s, values) => {
    setError('');
    const { error: err } = await supabase.from('activity_sessions').update(values).eq('id', s.id);
    if (err) setError(err.message);
    load();
  };

  const remove = async () => {
    setBusy(true);
    const { error: err } = await supabase.from('activity_sessions').delete().eq('id', toDelete.id);
    setBusy(false);
    setToDelete(null);
    if (err) setError(err.message);
    load();
  };

  const row = (s) => {
    const taken = booked[s.id] ?? 0;
    const pct = Math.min(100, Math.round((taken / s.seats) * 100));
    const isPast = s.starts_at < now;
    return (
      <li key={s.id} className={`session session--${s.status}${isPast ? ' is-past' : ''}`}>
        <div className="session__when">
          <strong>{formatDateTime(s.starts_at)}</strong>
          <div className="session__bar" title={`${taken} de ${s.seats} plazas ocupadas`}>
            <span style={{ width: `${pct}%` }} className={taken >= s.seats ? 'is-full' : ''} />
          </div>
          <small>
            {taken} / {s.seats} plazas ocupadas{taken >= s.seats ? ' · COMPLETA' : ''}
          </small>
        </div>
        {!isPast ? (
          <div className="session__controls">
            <label className="session__seats">
              <span className="sr-only">Plazas</span>
              <input
                className="input"
                type="number"
                min={Math.max(1, taken)}
                defaultValue={s.seats}
                onBlur={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (v > 0 && v !== s.seats) {
                    if (v < taken) {
                      setError(`No puedes dejar menos plazas (${v}) que personas ya reservadas (${taken}).`);
                      e.target.value = s.seats;
                    } else patch(s, { seats: v });
                  }
                }}
              />
              <small>plazas</small>
            </label>
            <select
              className="input"
              value={s.status}
              onChange={(e) => patch(s, { status: e.target.value })}
              aria-label="Estado de la sesión"
            >
              {Object.entries(SESSION_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <button
              className="icon-btn"
              onClick={() => setToDelete(s)}
              disabled={taken > 0}
              title={taken > 0 ? 'Tiene reservas: ciérrala o cancélala en lugar de borrarla' : 'Borrar sesión'}
              aria-label="Borrar sesión"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">Fechas y plazas</h2>
        {!adding ? (
          <button className="btn btn--ghost btn--sm" onClick={() => setAdding(true)}>
            <CalendarPlus size={16} /> Añadir fecha
          </button>
        ) : null}
      </div>

      {error ? <p className="alert" style={{ marginBottom: 12 }}>{error}</p> : null}

      {adding ? (
        <form className="session-add" onSubmit={add}>
          <label className="field">
            <span>Fecha y hora (España)</span>
            <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} autoFocus />
          </label>
          <label className="field">
            <span>Plazas</span>
            <input
              className="input"
              type="number"
              min="1"
              placeholder={activity.capacity ? String(activity.capacity) : ''}
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
            />
          </label>
          <div className="session-add__actions">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAdding(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
              Añadir
            </button>
          </div>
        </form>
      ) : null}

      {upcoming.length ? (
        <ul className="sessions">{upcoming.map(row)}</ul>
      ) : (
        <p className="hint">No hay fechas próximas. Añade una para que se pueda reservar.</p>
      )}

      {past.length ? (
        <>
          <button className="link-btn" style={{ marginTop: 12 }} onClick={() => setShowPast((v) => !v)}>
            {showPast ? 'Ocultar' : 'Ver'} fechas pasadas ({past.length})
          </button>
          {showPast ? <ul className="sessions">{past.map(row)}</ul> : null}
        </>
      ) : null}

      {toDelete ? (
        <ConfirmDialog
          title="¿Borrar esta fecha?"
          message={`Se eliminará la sesión del ${formatDateTime(toDelete.starts_at)}.`}
          confirmLabel="Borrar"
          danger
          busy={busy}
          onConfirm={remove}
          onCancel={() => setToDelete(null)}
        />
      ) : null}
    </section>
  );
}
