import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatDateTime, formatMoney, fromMadridInput, toMadridInput } from '../../lib/format';
import { Modal } from '../../components/ui';

const OTHER = 'otra';

/**
 * Alta manual (initial = null) o edición de una reserva.
 * El código RES-XXXXXX lo genera siempre la base de datos.
 */
export default function ReservationForm({ catalog, initial, defaultActivityId = '', onClose, onSaved }) {
  const editing = Boolean(initial);
  const { activities, sessions } = catalog;

  const [f, setF] = useState(() => ({
    activity_id: initial?.activity_id ?? defaultActivityId ?? '',
    session_id: initial ? (initial.session_id ?? OTHER) : '',
    event_local: initial ? toMadridInput(initial.event_at) : '',
    adults: initial?.adults ?? 1,
    children: initial?.children ?? 0,
    amount: initial ? String(initial.amount) : '',
    first_name: initial?.first_name ?? '',
    last_name: initial?.last_name ?? '',
    email: initial?.email ?? '',
    phone: initial?.phone ?? '',
    customer_notes: initial?.customer_notes ?? '',
    internal_notes: initial?.internal_notes ?? '',
  }));
  const [amountTouched, setAmountTouched] = useState(editing);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const activity = activities.find((a) => a.id === f.activity_id);
  const [now] = useState(() => new Date().toISOString());
  const activitySessions = useMemo(
    () =>
      sessions.filter(
        (s) => s.activity_id === f.activity_id && (s.starts_at >= now || s.id === initial?.session_id)
      ),
    [sessions, f.activity_id, now, initial?.session_id]
  );

  const suggested = activity
    ? (Number(f.adults) || 0) * Number(activity.price_adult) +
      (Number(f.children) || 0) * Number(activity.price_child ?? activity.price_adult)
    : 0;
  const amount = amountTouched ? f.amount : suggested.toFixed(2);

  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));

  const onActivity = (e) => setF((prev) => ({ ...prev, activity_id: e.target.value, session_id: '' }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    const session = sessions.find((s) => s.id === f.session_id);
    const adults = parseInt(f.adults, 10) || 0;
    const children = parseInt(f.children, 10) || 0;
    const amountNum = Number(String(amount).replace(',', '.'));

    if (!f.activity_id) return setError('Elige una actividad.');
    if (!session && !(f.session_id === OTHER && f.event_local)) return setError('Elige una sesión o indica fecha y hora.');
    if (adults + children < 1) return setError('Tiene que haber al menos una persona.');
    if (!f.first_name.trim()) return setError('El nombre es obligatorio.');
    if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return setError('El email no es válido.');
    if (!Number.isFinite(amountNum) || amountNum < 0) return setError('El importe no es válido.');

    const payload = {
      activity_id: f.activity_id,
      session_id: session?.id ?? null,
      event_at: session ? session.starts_at : fromMadridInput(f.event_local),
      adults,
      children,
      amount: amountNum.toFixed(2),
      currency: activity?.currency ?? 'EUR',
      first_name: f.first_name.trim(),
      last_name: f.last_name.trim(),
      email: f.email.trim().toLowerCase() || null,
      phone: f.phone.trim() || null,
      customer_notes: f.customer_notes.trim() || null,
      internal_notes: f.internal_notes.trim() || null,
    };

    setSaving(true);
    const query = editing
      ? supabase.from('reservations').update(payload).eq('id', initial.id).select('id').single()
      : supabase
          .from('reservations')
          .insert({ ...payload, source: 'manual', status: 'pendiente' })
          .select('id')
          .single();
    const { data, error: err } = await query;
    setSaving(false);
    if (err) return setError(err.message);
    onSaved(data.id);
  };

  return (
    <Modal
      title={editing ? `Editar ${initial.booking_code}` : 'Nueva reserva manual'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" form="res-form" className="btn btn--primary" disabled={saving}>
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear reserva'}
          </button>
        </>
      }
    >
      <form id="res-form" className="form-grid" onSubmit={submit} noValidate>
        <fieldset>
          <legend>Actividad</legend>
          <label className="field span-2">
            <span>Actividad *</span>
            <select className="input" value={f.activity_id} onChange={onActivity}>
              <option value="">Elige una actividad…</option>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                  {a.status !== 'publicada' ? ` (${a.status})` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="field span-2">
            <span>Sesión *</span>
            <select className="input" value={f.session_id} onChange={set('session_id')} disabled={!f.activity_id}>
              <option value="">{f.activity_id ? 'Elige una fecha…' : 'Primero elige la actividad'}</option>
              {activitySessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatDateTime(s.starts_at)} · {s.seats} plazas{s.status !== 'abierta' ? ` (${s.status})` : ''}
                </option>
              ))}
              <option value={OTHER}>Otra fecha y hora…</option>
            </select>
          </label>

          {f.session_id === OTHER ? (
            <label className="field span-2">
              <span>Fecha y hora (hora de España) *</span>
              <input className="input" type="datetime-local" value={f.event_local} onChange={set('event_local')} />
            </label>
          ) : null}

          <label className="field">
            <span>Adultos</span>
            <input className="input" type="number" min="0" max="99" inputMode="numeric" value={f.adults} onChange={set('adults')} />
          </label>
          <label className="field">
            <span>Niños</span>
            <input className="input" type="number" min="0" max="99" inputMode="numeric" value={f.children} onChange={set('children')} />
          </label>

          <label className="field span-2">
            <span>
              Importe total (€)
              {activity && amountTouched && Number(amount) !== suggested ? (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setAmountTouched(false)}
                >
                  Usar precio de la actividad ({formatMoney(suggested)})
                </button>
              ) : null}
            </span>
            <input
              className="input"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmountTouched(true);
                setF((p) => ({ ...p, amount: e.target.value }));
              }}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>Cliente</legend>
          <label className="field">
            <span>Nombre *</span>
            <input className="input" value={f.first_name} onChange={set('first_name')} autoComplete="off" />
          </label>
          <label className="field">
            <span>Apellidos</span>
            <input className="input" value={f.last_name} onChange={set('last_name')} autoComplete="off" />
          </label>
          <label className="field">
            <span>Email</span>
            <input className="input" type="email" value={f.email} onChange={set('email')} autoComplete="off" />
          </label>
          <label className="field">
            <span>Teléfono</span>
            <input className="input" type="tel" value={f.phone} onChange={set('phone')} autoComplete="off" />
          </label>
          <label className="field span-2">
            <span>Observaciones del cliente</span>
            <textarea className="input textarea" rows={2} value={f.customer_notes} onChange={set('customer_notes')} />
          </label>
          <label className="field span-2">
            <span>Notas internas (solo tú)</span>
            <textarea className="input textarea" rows={2} value={f.internal_notes} onChange={set('internal_notes')} />
          </label>
        </fieldset>

        {error ? (
          <p className="alert span-2" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
