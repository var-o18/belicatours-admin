import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, List, Plus, Search, Check, Wallet } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useCatalog } from '../../lib/useCatalog';
import {
  STATUS,
  STATUS_ORDER,
  SOURCE_LABEL,
  addDays,
  formatDate,
  formatMoney,
  formatTime,
  fullName,
  madridDay,
  monthBounds,
} from '../../lib/format';
import { StatusBadge } from '../../components/ui';
import ReservationDrawer from './ReservationDrawer';
import ReservationForm from './ReservationForm';
import CalendarView from './CalendarView';
import './reservas.css';

const QUICK = [
  { id: 'todas', label: 'Todas' },
  { id: 'hoy', label: 'Hoy' },
  { id: '7dias', label: 'Próximos 7 días' },
  { id: 'mes', label: 'Este mes' },
];

const SORTS = {
  event_asc: { label: 'Fecha de actividad ↑', fn: (a, b) => a.event_at.localeCompare(b.event_at) },
  event_desc: { label: 'Fecha de actividad ↓', fn: (a, b) => b.event_at.localeCompare(a.event_at) },
  created_desc: { label: 'Recibidas recientemente', fn: (a, b) => b.created_at.localeCompare(a.created_at) },
  status: {
    label: 'Estado',
    fn: (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.event_at.localeCompare(b.event_at),
  },
};

// Acción rápida desde la propia fila
const NEXT = {
  pendiente: { to: 'aceptada', label: 'Aceptar', icon: Check },
  aceptada: { to: 'pagada', label: 'Pagada', icon: Wallet },
};

export default function Reservas() {
  const catalog = useCatalog();
  const [params, setParams] = useSearchParams();
  const activityId = params.get('actividad') ?? '';

  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState('lista');
  const [status, setStatus] = useState('');
  const [quick, setQuick] = useState('todas');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('event_asc');
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('reservations')
      .select('*, activity:activities(id, title)')
      .order('created_at', { ascending: false });
    if (err) setError(err.message);
    else {
      setError('');
      setRows(data);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pickQuick = (id) => {
    setQuick(id);
    const today = madridDay();
    if (id === 'hoy') {
      setFrom(today);
      setTo(today);
    } else if (id === '7dias') {
      setFrom(today);
      setTo(addDays(today, 6));
    } else if (id === 'mes') {
      const { first, last } = monthBounds(today);
      setFrom(first);
      setTo(last);
    } else {
      setFrom('');
      setTo('');
    }
  };

  const setActivity = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('actividad', id);
    else next.delete('actividad');
    setParams(next, { replace: true });
  };

  // Todo menos el estado: así los contadores por estado reflejan los demás filtros
  const base = useMemo(() => {
    if (!rows) return [];
    const term = q.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    return rows.filter((r) => {
      if (activityId && r.activity_id !== activityId) return false;
      const day = madridDay(r.event_at);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (!term) return true;
      return (
        r.booking_code.toLowerCase().includes(term) ||
        fullName(r).toLowerCase().includes(term) ||
        (r.email ?? '').toLowerCase().includes(term) ||
        (digits.length >= 3 && (r.phone ?? '').replace(/\D/g, '').includes(digits))
      );
    });
  }, [rows, activityId, from, to, q]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0]));
    base.forEach((r) => c[r.status]++);
    return c;
  }, [base]);

  const visible = useMemo(
    () => base.filter((r) => !status || r.status === status).sort(SORTS[sort].fn),
    [base, status, sort]
  );

  const quickChange = async (r) => {
    const next = NEXT[r.status];
    setBusyId(r.id);
    const { error: err } = await supabase.from('reservations').update({ status: next.to }).eq('id', r.id);
    setBusyId(null);
    if (err) setError(err.message);
    else load();
  };

  const filtersActive = activityId || status || from || to || q;
  const clearFilters = () => {
    setStatus('');
    pickQuick('todas');
    setQ('');
    setActivity('');
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reservas</h1>
          <p>
            {rows ? `${visible.length} ${visible.length === 1 ? 'resultado' : 'resultados'}` : 'Cargando…'}
            {rows && filtersActive ? ` de ${rows.length}` : ''}
          </p>
        </div>
        <div className="page-actions">
          <div className="segmented" role="tablist" aria-label="Vista">
            <button className={view === 'lista' ? 'is-on' : ''} onClick={() => setView('lista')}>
              <List size={16} /> Lista
            </button>
            <button className={view === 'calendario' ? 'is-on' : ''} onClick={() => setView('calendario')}>
              <CalendarDays size={16} /> Calendario
            </button>
          </div>
          <button className="btn btn--primary" onClick={() => setCreating(true)}>
            <Plus size={17} /> Nueva reserva
          </button>
        </div>
      </div>

      {/* Estados con contador: también funcionan como filtro */}
      <div className="status-tabs">
        <button className={!status ? 'is-on' : ''} onClick={() => setStatus('')}>
          Todos <b>{base.length}</b>
        </button>
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            className={status === s ? 'is-on' : ''}
            style={{ '--c': STATUS[s].color }}
            onClick={() => setStatus(status === s ? '' : s)}
          >
            <i />
            {STATUS[s].label} <b>{counts[s]}</b>
          </button>
        ))}
      </div>

      <div className="filters">
        <label className="filters__search">
          <Search size={17} />
          <input
            className="input"
            type="search"
            placeholder="Código, nombre, email o teléfono"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>

        <select className="input" value={activityId} onChange={(e) => setActivity(e.target.value)} aria-label="Actividad">
          <option value="">Todas las actividades</option>
          {catalog.activities.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>

        <div className="filters__dates">
          <input
            className="input"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setQuick('');
            }}
            aria-label="Desde"
          />
          <span>—</span>
          <input
            className="input"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setQuick('');
            }}
            aria-label="Hasta"
          />
        </div>

        {view === 'lista' ? (
          <select className="input" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar">
            {Object.entries(SORTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="quick">
        {QUICK.map((v) => (
          <button key={v.id} className={quick === v.id ? 'is-on' : ''} onClick={() => pickQuick(v.id)}>
            {v.label}
          </button>
        ))}
        {filtersActive ? (
          <button className="quick__clear" onClick={clearFilters}>
            Quitar filtros
          </button>
        ) : null}
      </div>

      {error ? <p className="alert">{error}</p> : null}

      {!rows ? (
        <div className="center-screen" style={{ minHeight: 200 }}>
          <div className="spinner" />
        </div>
      ) : view === 'calendario' ? (
        <CalendarView rows={visible} onOpen={setOpenId} />
      ) : visible.length === 0 ? (
        <div className="empty">
          <p>{rows.length === 0 ? 'Todavía no hay reservas.' : 'No hay reservas con estos filtros.'}</p>
          {rows.length === 0 ? (
            <button className="btn btn--ghost" onClick={() => setCreating(true)}>
              <Plus size={16} /> Crear la primera
            </button>
          ) : null}
        </div>
      ) : (
        <div className="res-table" role="table">
          <div className="res-row res-row--head" role="row">
            <span>Código</span>
            <span>Cliente</span>
            <span>Actividad</span>
            <span>Fecha</span>
            <span>Pers.</span>
            <span>Importe</span>
            <span>Estado</span>
            <span />
          </div>
          {visible.map((r) => {
            const next = NEXT[r.status];
            return (
              <div key={r.id} className="res-row" role="row" onClick={() => setOpenId(r.id)}>
                <span className="res-code">
                  {r.booking_code}
                  <small>{SOURCE_LABEL[r.source]}</small>
                </span>
                <span className="res-client">
                  <strong>{fullName(r)}</strong>
                  <small>{r.email || r.phone || '—'}</small>
                </span>
                <span className="res-activity">{r.activity?.title}</span>
                <span className="res-date">
                  {formatDate(r.event_at)}
                  <small>{formatTime(r.event_at)}</small>
                </span>
                <span className="res-guests">
                  {r.guests}
                  <small className="only-mobile"> pers.</small>
                </span>
                <span className="res-amount">{formatMoney(r.amount, r.currency)}</span>
                <span className="res-status">
                  <StatusBadge status={r.status} />
                </span>
                <span className="res-action">
                  {next ? (
                    <button
                      className="btn btn--ghost btn--sm"
                      disabled={busyId === r.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        quickChange(r);
                      }}
                    >
                      <next.icon size={15} />
                      {next.label}
                    </button>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {openId ? (
        <ReservationDrawer id={openId} catalog={catalog} onClose={() => setOpenId(null)} onChanged={load} />
      ) : null}

      {creating ? (
        <ReservationForm
          catalog={catalog}
          defaultActivityId={activityId}
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false);
            load();
            setOpenId(id);
          }}
        />
      ) : null}
    </>
  );
}
