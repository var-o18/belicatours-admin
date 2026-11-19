// Utilidades de formato. Toda la hora de negocio es la de Madrid,
// independientemente de dónde esté el ordenador del administrador.
export const TZ = 'Europe/Madrid';

export const STATUS = {
  pendiente: { label: 'Pendiente', color: 'var(--st-pendiente)' },
  aceptada: { label: 'Aceptada', color: 'var(--st-aceptada)' },
  pagada: { label: 'Pagada', color: 'var(--st-pagada)' },
  cancelada: { label: 'Cancelada', color: 'var(--st-cancelada)' },
};
export const STATUS_ORDER = ['pendiente', 'aceptada', 'pagada', 'cancelada'];

export const SOURCE_LABEL = { web: 'Web', manual: 'Manual' };

export function formatMoney(amount, currency = 'EUR') {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(Number(amount || 0));
}

const fmtDateTime = new Intl.DateTimeFormat('es-ES', {
  timeZone: TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const fmtDate = new Intl.DateTimeFormat('es-ES', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = new Intl.DateTimeFormat('es-ES', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

export const formatDateTime = (iso) => (iso ? fmtDateTime.format(new Date(iso)) : '—');
export const formatDate = (iso) => (iso ? fmtDate.format(new Date(iso)) : '—');
export const formatTime = (iso) => (iso ? fmtTime.format(new Date(iso)) : '—');

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
function madridParts(date) {
  return Object.fromEntries(partsFmt.formatToParts(date).map((p) => [p.type, p.value]));
}

/** Día (YYYY-MM-DD) en hora de Madrid */
export function madridDay(value = new Date()) {
  const p = madridParts(new Date(value));
  return `${p.year}-${p.month}-${p.day}`;
}

/** ISO → valor para <input type="datetime-local"> en hora de Madrid */
export function toMadridInput(iso) {
  if (!iso) return '';
  const p = madridParts(new Date(iso));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Valor de <input type="datetime-local"> (hora de Madrid) → ISO UTC */
export function fromMadridInput(value) {
  const wanted = new Date(`${value}:00Z`).getTime();
  let t = wanted;
  for (let i = 0; i < 2; i++) {
    const p = madridParts(new Date(t));
    const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    t -= shown - wanted;
  }
  return new Date(t).toISOString();
}

/** Suma días a un YYYY-MM-DD */
export function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function monthBounds(day) {
  const [y, m] = day.split('-').map(Number);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { first, last };
}

export const fullName = (r) => [r.first_name, r.last_name].filter(Boolean).join(' ');
