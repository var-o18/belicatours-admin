import { useEffect, useMemo, useRef } from 'react';
import { ImagePlus, Star, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Fotos elegidas antes de crear la actividad. Aún no se suben: se guardan en
 * memoria y el editor las sube justo después de crear la actividad.
 * La primera de la lista será la portada.
 */
export default function PendingPhotos({ files, onChange, disabled }) {
  const inputRef = useRef(null);
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);

  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const add = (e) => {
    const picked = [...e.target.files].filter((file) => file.type.startsWith('image/'));
    e.target.value = '';
    if (picked.length) onChange([...files, ...picked]);
  };

  const move = (from, to) => {
    if (to < 0 || to >= files.length) return;
    const next = [...files];
    [next[from], next[to]] = [next[to], next[from]];
    onChange(next);
  };

  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">Fotos</h2>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => inputRef.current.click()}
          disabled={disabled}
        >
          <ImagePlus size={16} /> Añadir fotos
        </button>
        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={add} />
      </div>

      <div className="cover">
        {previews[0] ? <img src={previews[0]} alt="" /> : <div className="cover__empty">Sin portada</div>}
        <span>Portada</span>
      </div>

      {files.length ? (
        <ul className="photos">
          {files.map((file, i) => (
            <li key={previews[i]} className={i === 0 ? 'is-cover' : ''}>
              <img src={previews[i]} alt={file.name} />
              <div className="photos__tools">
                <button type="button" className="icon-btn" onClick={() => move(i, i - 1)} disabled={disabled || i === 0} aria-label="Mover a la izquierda">
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => onChange([file, ...files.filter((_, j) => j !== i)])}
                  disabled={disabled || i === 0}
                  aria-label="Usar como portada"
                  title="Usar como portada"
                >
                  <Star size={16} fill={i === 0 ? 'currentColor' : 'none'} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => onChange(files.filter((_, j) => j !== i))}
                  disabled={disabled}
                  aria-label="Quitar foto"
                >
                  <Trash2 size={16} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => move(i, i + 1)}
                  disabled={disabled || i === files.length - 1}
                  aria-label="Mover a la derecha"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="hint">
        Las fotos se suben al pulsar «Crear actividad». La estrella marca la portada. Las fechas se añaden después de
        crearla.
      </p>
    </section>
  );
}
