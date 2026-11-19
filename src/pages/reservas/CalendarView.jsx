import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { STATUS, addDays, formatTime, fullName, madridDay, monthBounds } from '../../lib/format';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const dayLabel = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const monthName =new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Calendario mensual según la fecha de la actividad (hora de Madrid). */
export default function CalendarView({ rows, onOpen }) {
  const today = madridDay();
  const [month, setMonth] = useState(today.slice(0, 7)); // YYYY-MM

  const { first, last } = monthBounds(`${month}-01`);

  const byDay = useMemo(() => {
    const map = {};
    rows.forEach((r) => {
      const d = madridDay(r.event_at);
      (map[d] ??= []).push(r);
    });
    Object.values(map).forEach((list) => list.sort((a, b) => a.event_at.localeCompare(b.event_at)));
    return map;
  }, [rows]);

  // Rejilla de lunes a domingo que cubre el mes completo
  const days = useMemo(() => {
    const weekday = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
    const start = addDays(first, -weekday);
    const out = [];
    for (let d = start; out.length < 42; d = addDays(d, 1)) {
      out.push(d);
      if (out.length % 7 === 0 && d >= last) break;
    }
    return out;
  }, [first, last]);

  const shift = (n) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(d.toISOString().slice(0, 7));
  };

  const monthCount = rows.filter((r) => {
    const d = madridDay(r.event_at);
    return d >= first && d <= last;
  }).length;

  return (
    <div className="cal">
      <div className="cal__head">
        <button className="icon-btn" onClick={() => shift(-1)} aria-label="Mes anterior">
          <ChevronLeft size={20} />
        </button>
        <h2>{capitalize(monthName.format(new Date(`${first}T12:00:00Z`)))}</h2>
        <button className="icon-btn" onClick={() => shift(1)} aria-label="Mes siguiente">
          <ChevronRight size={20} />
        </button>
        <span className="cal__count">{monthCount} reservas</span>
        {month !== today.slice(0, 7) ? (
          <button className="btn btn--ghost btn--sm" onClick={() => setMonth(today.slice(0, 7))}>
            Hoy
          </button>
        ) : null}
      </div>

      <div className="cal__grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal__wd">
            {w}
          </div>
        ))}
        {days.map((d) => {
          const list = byDay[d] ?? [];
          const outside = d < first || d > last;
          return (
            <div key={d} className={`cal__day${outside ? ' is-out' : ''}${d === today ? ' is-today' : ''}${list.length ? ' has-items' : ''}`}>
              <span className="cal__num">{Number(d.slice(8))}</span>
              <span className="cal__label">{dayLabel.format(new Date(`${d}T12:00:00Z`))}</span>
              {list.map((r) => (
                <button
                  key={r.id}
                  className="cal__item"
                  style={{ '--c': STATUS[r.status].color }}
                  onClick={() => onOpen(r.id)}
                  title={`${r.booking_code} · ${fullName(r)} · ${r.activity?.title}`}
                >
                  <b>{formatTime(r.event_at)}</b> {fullName(r)} · {r.guests}p
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
