import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { STATUS } from '../lib/format';
import './ui.css';

export function StatusBadge({ status }) {
  const meta = STATUS[status];
  if (!meta) return null;
  return (
    <span className="badge" style={{ '--c': meta.color }}>
      {meta.label}
    </span>
  );
}

/**
 * Ventana modal. variant="drawer" se abre desde la derecha (en móvil ocupa
 * toda la pantalla); variant="dialog" es una ventana centrada.
 */
export function Modal({ title, onClose, children, footer, variant = 'dialog', width }) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className={`modal modal--${variant}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal__panel" role="dialog" aria-modal="true" aria-label={title} style={width ? { maxWidth: width } : null}>
        <header className="modal__head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__foot">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirmar', danger, busy, onConfirm, onCancel }) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      width={420}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>
            Volver
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Un momento…' : confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{message}</p>
    </Modal>
  );
}
