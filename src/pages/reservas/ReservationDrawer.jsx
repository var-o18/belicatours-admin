import { useCallback, useEffect, useState } from 'react';
import { Copy, Pencil, Trash2, Mail, Phone } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { STATUS, STATUS_ORDER, SOURCE_LABEL, formatDateTime, formatMoney, fullName } from '../../lib/format';
import { ConfirmDialog, Modal, StatusBadge } from '../../components/ui';
import ReservationForm from './ReservationForm';

const EVENT_LABEL = { creada: 'Reserva creada', editada: 'Datos editados', eliminada: 'Eliminada' };

// Cambios que piden confirmación antes de aplicarse
const CONFIRM = {
  cancelada: 'La reserva quedará cancelada y dejará de ocupar plazas. Se conserva en el historial.',
  pendiente: 'La reserva volverá a «Pendiente». Úsalo solo si la aceptaste por error.',
};

export default function ReservationDrawer({ id, catalog, onClose, onChanged }) {
  const [res, setRes] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // { status } | { delete: true }
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const [r, e] = await Promise.all([
      supabase.from('reservations').select('*, activity:activities(id, title)').eq('id', id).single(),
      supabase
        .from('reservation_events')
        .select('id, event_type, old_status, new_status, created_at')
        .eq('reservation_id', id)
        .order('created_at', { ascending: false }),
    ]);
    if (r.error) return setError(r.error.message);
    setRes(r.data);
    setNotes(r.data.internal_notes ?? '');
    setEvents(e.data ?? []);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const update = async (patch) => {
    setBusy(true);
    setError('');
    const { error: err } = await supabase.from('reservations').update(patch).eq('id', id);
    setBusy(false);
    setConfirm(null);
    if (err) return setError(err.message);
    await load();
    onChanged();
  };

  const changeStatus = (status) => (CONFIRM[status] ? setConfirm({ status }) : update({ status }));

  const remove = async () => {
    setBusy(true);
    const { error: err } = await supabase.from('reservations').delete().eq('id', id);
    setBusy(false);
    if (err) {
      setConfirm(null);
      return setError(err.message);
    }
    onChanged();
    onClose();
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    await update({ internal_notes: notes.trim() || null });
    setSavingNotes(false);
  };

  const copyCode = async () => {
    await navigator.clipboard?.writeText(res.booking_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <Modal
        variant="drawer"
        title="Detalle de la reserva"
        onClose={onClose}
        footer={
          res ? (
            <>
              <button className="btn btn--ghost" style={{ marginRight: 'auto', color: 'var(--terracota)' }} onClick={() => setConfirm({ delete: true })}>
                <Trash2 size={16} /> Eliminar
              </button>
              <button className="btn btn--ghost" onClick={() => setEditing(true)}>
                <Pencil size={16} /> Editar datos
              </button>
            </>
          ) : null
        }
      >
        {error ? <p className="alert" style={{ marginBottom: 16 }}>{error}</p> : null}

        {!res ? (
          <div className="center-screen" style={{ minHeight: 200 }}>
            <div className="spinner" />
          </div>
        ) : (
          <div className="detail">
            <div className="detail__top">
              <button className="detail__code" onClick={copyCode} title="Copiar código">
                {res.booking_code}
                <Copy size={15} />
                {copied ? <em>Copiado</em> : null}
              </button>
              <StatusBadge status={res.status} />
            </div>

            <section>
              <h3>Cambiar estado</h3>
              <div className="status-picker">
                {STATUS_ORDER.map((s) => (
                  <button
                    key={s}
                    style={{ '--c': STATUS[s].color }}
                    className={res.status === s ? 'is-on' : ''}
                    disabled={busy || res.status === s}
                    onClick={() => changeStatus(s)}
                  >
                    {STATUS[s].label}
                  </button>
                ))}
              </div>
              {res.status === 'aceptada' ? (
                <p className="hint">Marca «Pagada» solo cuando hayas comprobado el Bizum o la transferencia con este código.</p>
              ) : null}
            </section>

            <section>
              <h3>Actividad</h3>
              <dl className="kv">
                <dt>Actividad</dt>
                <dd>{res.activity?.title}</dd>
                <dt>Fecha y hora</dt>
                <dd>{formatDateTime(res.event_at)}</dd>
                <dt>Personas</dt>
                <dd>
                  {res.adults} {res.adults === 1 ? 'adulto' : 'adultos'}
                  {res.children ? ` · ${res.children} ${res.children === 1 ? 'niño' : 'niños'}` : ''}
                </dd>
                <dt>Importe</dt>
                <dd>
                  <strong>{formatMoney(res.amount, res.currency)}</strong>
                </dd>
              </dl>
            </section>

            <section>
              <h3>Cliente</h3>
              <dl className="kv">
                <dt>Nombre</dt>
                <dd>{fullName(res)}</dd>
                <dt>Email</dt>
                <dd>
                  {res.email ? (
                    <a href={`mailto:${res.email}`}>
                      <Mail size={14} /> {res.email}
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
                <dt>Teléfono</dt>
                <dd>
                  {res.phone ? (
                    <a href={`tel:${res.phone}`}>
                      <Phone size={14} /> {res.phone}
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
                {res.customer_notes ? (
                  <>
                    <dt>Observaciones</dt>
                    <dd style={{ whiteSpace: 'pre-wrap' }}>{res.customer_notes}</dd>
                  </>
                ) : null}
              </dl>
            </section>

            <section>
              <h3>Notas internas</h3>
              <textarea
                className="input textarea"
                rows={3}
                placeholder="Solo las ves tú. El cliente nunca las recibe."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              {notes !== (res.internal_notes ?? '') ? (
                <button className="btn btn--primary btn--sm" style={{ marginTop: 8 }} onClick={saveNotes} disabled={savingNotes}>
                  {savingNotes ? 'Guardando…' : 'Guardar nota'}
                </button>
              ) : null}
            </section>

            <section>
              <h3>Historial</h3>
              <ol className="timeline">
                {events.map((ev) => (
                  <li key={ev.id}>
                    <span>
                      {ev.event_type === 'estado' ? (
                        <>
                          {STATUS[ev.old_status]?.label} → <b>{STATUS[ev.new_status]?.label}</b>
                        </>
                      ) : (
                        EVENT_LABEL[ev.event_type]
                      )}
                    </span>
                    <small>{formatDateTime(ev.created_at)}</small>
                  </li>
                ))}
              </ol>
              <p className="hint">
                Origen: {SOURCE_LABEL[res.source]} · Recibida el {formatDateTime(res.created_at)}
              </p>
            </section>
          </div>
        )}
      </Modal>

      {confirm?.status ? (
        <ConfirmDialog
          title={`¿Pasar a «${STATUS[confirm.status].label}»?`}
          message={CONFIRM[confirm.status]}
          confirmLabel={`Sí, ${STATUS[confirm.status].label.toLowerCase()}`}
          danger={confirm.status === 'cancelada'}
          busy={busy}
          onConfirm={() => update({ status: confirm.status })}
          onCancel={() => setConfirm(null)}
        />
      ) : null}

      {confirm?.delete ? (
        <ConfirmDialog
          title="¿Eliminar la reserva?"
          message={`Se borrará ${res.booking_code} definitivamente. Si solo no va a venir, es mejor cancelarla para conservar el historial. El código no se volverá a usar.`}
          confirmLabel="Eliminar definitivamente"
          danger
          busy={busy}
          onConfirm={remove}
          onCancel={() => setConfirm(null)}
        />
      ) : null}

      {editing ? (
        <ReservationForm
          catalog={catalog}
          initial={res}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await load();
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}
