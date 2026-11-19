import { useEffect, useState } from 'react';
import { Save, Smartphone, Landmark } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './reservas/reservas.css';
import './actividades/actividades.css';
import './Pagos.css';

const EMPTY = {
  bizum_enabled: false,
  bizum_phone: '',
  bizum_holder: '',
  transfer_enabled: false,
  transfer_holder: '',
  transfer_iban: '',
  transfer_bank: '',
};

const toForm = (row) => Object.fromEntries(Object.keys(EMPTY).map((k) => [k, row?.[k] ?? EMPTY[k]]));

/** Comprobación oficial del IBAN (módulo 97) */
function ibanValid(raw) {
  const iban = raw.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const moved = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => c.charCodeAt(0) - 55);
  let rest = 0;
  for (const d of moved) rest = (rest * 10 + Number(d)) % 97;
  return rest === 1;
}
const formatIban = (raw) =>
  raw
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/(.{4})/g, '$1 ')
    .trim();

export default function Pagos() {
  const [saved, setSaved] = useState(null);
  const [f, setF] = useState(EMPTY);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from('payment_settings')
      .select('*')
      .eq('id', 1)
      .single()
      .then(({ data, error: err }) => {
        if (err) return setError(err.message);
        setSaved(data);
        setF(toForm(data));
      });
  }, []);

  const set = (k) => (e) => {
    setOk(false);
    setF((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  };

  const dirty = saved && JSON.stringify(toForm(saved)) !== JSON.stringify(f);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    const phone = f.bizum_phone.replace(/\s+/g, '');
    const iban = f.transfer_iban.replace(/\s+/g, '').toUpperCase();

    if (f.bizum_enabled && !/^(\+34)?[67]\d{8}$/.test(phone))
      return setError('El teléfono de Bizum debe ser un móvil español (9 cifras, empieza por 6 o 7).');
    if (f.transfer_enabled && !f.transfer_holder.trim()) return setError('Indica el titular de la cuenta.');
    if (f.transfer_enabled && !ibanValid(iban)) return setError('El IBAN no es correcto. Revisa que no falte ningún número.');
    if (!f.bizum_enabled && !f.transfer_enabled)
      return setError('Activa al menos un método de pago: si no, el correo de aceptación no podrá indicar cómo pagar.');

    const { data: user } = await supabase.auth.getUser();
    setSaving(true);
    const { data, error: err } = await supabase
      .from('payment_settings')
      .update({
        bizum_enabled: f.bizum_enabled,
        bizum_phone: phone || null,
        bizum_holder: f.bizum_holder.trim() || null,
        transfer_enabled: f.transfer_enabled,
        transfer_holder: f.transfer_holder.trim() || null,
        transfer_iban: iban || null,
        transfer_bank: f.transfer_bank.trim() || null,
        updated_by: user.user?.id ?? null,
      })
      .eq('id', 1)
      .select()
      .single();
    setSaving(false);
    if (err) return setError(err.message);
    setSaved(data);
    setF(toForm(data));
    setOk(true);
  };

  if (!saved && !error) {
    return (
      <div className="center-screen" style={{ minHeight: 300 }}>
        <div className="spinner" />
      </div>
    );
  }

  const code = 'RES-7K4P92';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Datos de pago</h1>
          <p>Se incluyen en el correo que recibe el cliente cuando aceptas su reserva.</p>
        </div>
      </div>

      <div className="editor">
        <form className="panel" onSubmit={save} noValidate>
          <div className={`pay-method${f.bizum_enabled ? ' is-on' : ''}`}>
            <label className="switch">
              <input type="checkbox" checked={f.bizum_enabled} onChange={set('bizum_enabled')} />
              <span className="switch__track" />
              <Smartphone size={18} />
              <strong>Bizum</strong>
            </label>
            {f.bizum_enabled ? (
              <div className="form-grid">
                <fieldset>
                  <label className="field">
                    <span>Teléfono de Bizum *</span>
                    <input className="input" type="tel" inputMode="tel" value={f.bizum_phone} onChange={set('bizum_phone')} />
                  </label>
                  <label className="field">
                    <span>Titular (opcional)</span>
                    <input className="input" value={f.bizum_holder} onChange={set('bizum_holder')} />
                  </label>
                </fieldset>
              </div>
            ) : null}
          </div>

          <div className={`pay-method${f.transfer_enabled ? ' is-on' : ''}`}>
            <label className="switch">
              <input type="checkbox" checked={f.transfer_enabled} onChange={set('transfer_enabled')} />
              <span className="switch__track" />
              <Landmark size={18} />
              <strong>Transferencia bancaria</strong>
            </label>
            {f.transfer_enabled ? (
              <div className="form-grid">
                <fieldset>
                  <label className="field span-2">
                    <span>Titular de la cuenta *</span>
                    <input className="input" value={f.transfer_holder} onChange={set('transfer_holder')} />
                  </label>
                  <label className="field span-2">
                    <span>IBAN *</span>
                    <input
                      className="input mono"
                      value={f.transfer_iban}
                      onChange={set('transfer_iban')}
                      onBlur={() => setF((p) => ({ ...p, transfer_iban: formatIban(p.transfer_iban) }))}
                      placeholder="ES00 0000 0000 0000 0000 0000"
                      autoComplete="off"
                    />
                  </label>
                  <label className="field span-2">
                    <span>Banco (opcional)</span>
                    <input className="input" value={f.transfer_bank} onChange={set('transfer_bank')} />
                  </label>
                </fieldset>
              </div>
            ) : null}
          </div>

          {error ? <p className="alert" style={{ marginTop: 16 }}>{error}</p> : null}

          <div className="panel__foot">
            {ok && !dirty ? <span className="saved">Datos guardados</span> : null}
            <button type="submit" className="btn btn--primary" disabled={saving || !dirty}>
              <Save size={16} /> {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>

        <aside className="panel">
          <h2 className="panel__title">Así lo verá el cliente</h2>
          <div className="pay-preview">
            <p className="pay-preview__lead">
              Tu reserva <b>{code}</b> ha sido aceptada. Importe a pagar: <b>60,00 €</b>
            </p>
            {f.bizum_enabled ? (
              <p>
                <strong>Bizum:</strong> {f.bizum_phone || '[teléfono]'}
                {f.bizum_holder ? ` (${f.bizum_holder})` : ''}. En el concepto escribe: <b>{code}</b>
              </p>
            ) : null}
            {f.transfer_enabled ? (
              <p>
                <strong>Transferencia bancaria:</strong> titular {f.transfer_holder || '[titular]'}, IBAN{' '}
                <span className="mono">{f.transfer_iban ? formatIban(f.transfer_iban) : '[IBAN]'}</span>
                {f.transfer_bank ? ` (${f.transfer_bank})` : ''}. En el concepto escribe: <b>{code}</b>
              </p>
            ) : null}
            {!f.bizum_enabled && !f.transfer_enabled ? <p className="hint">Activa al menos un método.</p> : null}
            <p className="pay-preview__note">
              Importante: utiliza el mismo código de reserva que aparece en este correo para que podamos identificar tu
              pago.
            </p>
          </div>
          <p className="hint">Si cambias estos datos, los próximos correos usarán los nuevos. Los ya enviados no cambian.</p>
        </aside>
      </div>
    </>
  );
}
