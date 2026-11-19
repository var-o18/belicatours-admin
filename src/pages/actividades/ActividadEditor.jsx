import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Archive, ArchiveRestore, Trash2, Save, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ConfirmDialog } from '../../components/ui';
import { ACTIVITY_STATUS, CATEGORY_LABEL, slugify } from './meta';
import PhotosManager from './PhotosManager';
import SessionsManager from './SessionsManager';
import PendingPhotos from './PendingPhotos';
import { removeActivityImage, uploadActivityImage } from '../../lib/images';
import '../reservas/reservas.css';
import './actividades.css';

const EMPTY = {
  title: '',
  slug: '',
  subtitle: '',
  category: 'experiencias',
  description: '',
  long_description: '',
  duration: '',
  difficulty: '',
  meeting_point: '',
  price_adult: '',
  price_child: '',
  capacity: '',
  highlights: '',
  sort_order: 0,
};

const toForm = (a) => ({
  ...EMPTY,
  ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, a[k] ?? ''])),
  highlights: (a.highlights ?? []).join('\n'),
  price_adult: a.price_adult != null ? String(a.price_adult) : '',
  price_child: a.price_child != null ? String(a.price_child) : '',
  capacity: a.capacity != null ? String(a.capacity) : '',
});

const num = (v) => (String(v).trim() === '' ? null : Number(String(v).replace(',', '.')));

export default function ActividadEditor() {
  const { id } = useParams();
  const isNew = id === 'nueva';
  const navigate = useNavigate();

  const [activity, setActivity] = useState(null);
  const [f, setF] = useState(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const [reservations, setReservations] = useState(0);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [savingMsg, setSavingMsg] = useState('');

  const load = useCallback(async () => {
    const [a, r] = await Promise.all([
      supabase.from('activities').select('*').eq('id', id).single(),
      supabase.from('reservations').select('id', { count: 'exact', head: true }).eq('activity_id', id),
    ]);
    setLoading(false);
    if (a.error) return setError('No se encuentra esta actividad.');
    setActivity(a.data);
    setF(toForm(a.data));
    setSlugTouched(true);
    setReservations(r.count ?? 0);
  }, [id]);

  useEffect(() => {
    if (!isNew) load();
  }, [isNew, load]);

  const set = (k) => (e) => {
    const value = e.target.value;
    setSaved(false);
    setF((prev) => {
      const next = { ...prev, [k]: value };
      if (k === 'title' && !slugTouched) next.slug = slugify(value);
      return next;
    });
  };

  const dirty = activity ? JSON.stringify(toForm(activity)) !== JSON.stringify(f) : f.title !== '';

  // Sube las fotos elegidas al crear la actividad; la primera queda de portada.
  const uploadPending = async (created) => {
    const failed = [];
    let cover = null;
    for (const [i, file] of pendingFiles.entries()) {
      setSavingMsg(`Subiendo foto ${i + 1} de ${pendingFiles.length}…`);
      try {
        const { storage_path, url } = await uploadActivityImage(created.id, file);
        const { error: err } = await supabase
          .from('activity_images')
          .insert({ activity_id: created.id, storage_path, alt_text: created.title, sort_order: i + 1 });
        if (err) {
          await removeActivityImage(storage_path).catch(() => {});
          throw err;
        }
        cover ??= url;
      } catch (err) {
        failed.push(err.message);
      }
    }
    if (cover) await supabase.from('activities').update({ cover_image_path: cover }).eq('id', created.id);
    setSavingMsg('');
    return failed;
  };

  const save = async (e) => {
    e?.preventDefault();
    setError('');
    const priceAdult = num(f.price_adult);
    const priceChild = num(f.price_child);
    const capacity = num(f.capacity);

    if (!f.title.trim()) return setError('El título es obligatorio.');
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.slug)) return setError('El identificador web solo puede tener minúsculas, números y guiones.');
    if (priceAdult == null || !(priceAdult >= 0)) return setError('Indica un precio de adulto válido.');
    if (priceChild != null && !(priceChild >= 0)) return setError('El precio de niño no es válido.');
    if (capacity != null && !(Number.isInteger(capacity) && capacity > 0)) return setError('Las plazas deben ser un número entero mayor que 0.');

    const payload = {
      title: f.title.trim(),
      slug: f.slug,
      subtitle: f.subtitle.trim() || null,
      category: f.category,
      description: f.description.trim() || null,
      long_description: f.long_description.trim() || null,
      duration: f.duration.trim() || null,
      difficulty: f.difficulty.trim() || null,
      meeting_point: f.meeting_point.trim() || null,
      price_adult: priceAdult,
      price_child: priceChild,
      capacity,
      highlights: f.highlights.split('\n').map((s) => s.trim()).filter(Boolean),
      sort_order: Number(f.sort_order) || 0,
    };

    setSaving(true);
    const { data, error: err } = isNew
      ? await supabase.from('activities').insert({ ...payload, status: 'borrador' }).select().single()
      : await supabase.from('activities').update(payload).eq('id', id).select().single();

    if (err) {
      setSaving(false);
      return setError(
        err.code === '23505' ? 'Ya existe otra actividad con ese identificador web. Cámbialo.' : err.message
      );
    }
    if (isNew) {
      const failed = await uploadPending(data);
      setSaving(false);
      setPendingFiles([]);
      if (failed.length) setError(`La actividad se creó, pero no se pudieron subir algunas fotos: ${failed.join(' ')}`);
      return navigate(`/actividades/${data.id}`, { replace: true });
    }
    setSaving(false);
    setActivity(data);
    setF(toForm(data));
    setSaved(true);
  };

  const setStatus = async (status) => {
    setSaving(true);
    const { data, error: err } = await supabase.from('activities').update({ status }).eq('id', id).select().single();
    setSaving(false);
    setConfirm(null);
    if (err) return setError(err.message);
    setActivity(data);
  };

  const remove = async () => {
    setSaving(true);
    const { data: imgs } = await supabase.from('activity_images').select('storage_path').eq('activity_id', id);
    const { error: err } = await supabase.from('activities').delete().eq('id', id);
    if (err) {
      setSaving(false);
      setConfirm(null);
      return setError(
        err.code === '23503' ? 'No se puede borrar: tiene reservas asociadas. Archívala en su lugar.' : err.message
      );
    }
    const paths = (imgs ?? []).map((i) => i.storage_path).filter((p) => !p.startsWith('/'));
    if (paths.length) await supabase.storage.from('activity-images').remove(paths);
    navigate('/actividades', { replace: true });
  };

  if (loading) {
    return (
      <div className="center-screen" style={{ minHeight: 300 }}>
        <div className="spinner" />
      </div>
    );
  }

  const status = activity?.status;

  return (
    <>
      <Link to="/actividades" className="back-link">
        <ArrowLeft size={16} /> Actividades
      </Link>

      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <h1>{isNew ? 'Nueva actividad' : activity?.title}</h1>
          {status ? (
            <p>
              <span className="badge" style={{ '--c': ACTIVITY_STATUS[status].color }}>
                {ACTIVITY_STATUS[status].label}
              </span>{' '}
              {status === 'publicada'
                ? 'Visible en la web.'
                : status === 'borrador'
                  ? 'No se muestra en la web.'
                  : 'Archivada: oculta, conserva sus reservas.'}
            </p>
          ) : (
            <p>Se guarda como borrador. Podrás añadir fotos y fechas después de guardarla.</p>
          )}
        </div>
        {!isNew && activity ? (
          <div className="page-actions">
            {status === 'publicada' ? (
              <button className="btn btn--ghost" onClick={() => setStatus('borrador')} disabled={saving}>
                <EyeOff size={16} /> Despublicar
              </button>
            ) : status === 'borrador' ? (
              <button className="btn btn--primary" onClick={() => setConfirm('publicar')} disabled={saving}>
                <Eye size={16} /> Publicar
              </button>
            ) : null}
            {status === 'archivada' ? (
              <button className="btn btn--ghost" onClick={() => setStatus('borrador')} disabled={saving}>
                <ArchiveRestore size={16} /> Restaurar
              </button>
            ) : (
              <button className="btn btn--ghost" onClick={() => setConfirm('archivar')} disabled={saving}>
                <Archive size={16} /> Archivar
              </button>
            )}
            <Link to={`/reservas?actividad=${id}`} className="btn btn--ghost">
              <ExternalLink size={16} /> Reservas ({reservations})
            </Link>
          </div>
        ) : null}
      </div>

      {error ? <p className="alert" style={{ marginBottom: 16 }}>{error}</p> : null}

      <div className="editor">
        <form className="panel" onSubmit={save} noValidate>
          <h2 className="panel__title">Información</h2>

          <div className="form-grid">
            <fieldset>
              <label className="field span-2">
                <span>Título *</span>
                <input className="input" value={f.title} onChange={set('title')} />
              </label>
              <label className="field span-2">
                <span>Subtítulo</span>
                <input className="input" value={f.subtitle} onChange={set('subtitle')} />
              </label>
              <label className="field">
                <span>Categoría</span>
                <select className="input" value={f.category} onChange={set('category')}>
                  {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>
                  Identificador web
                  <small className="field-note">aparece en la dirección</small>
                </span>
                <input
                  className="input mono"
                  value={f.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    set('slug')({ target: { value: slugify(e.target.value) || e.target.value.toLowerCase() } });
                  }}
                />
              </label>
            </fieldset>

            <fieldset>
              <legend>Precio y plazas</legend>
              <label className="field">
                <span>Precio adulto (€) *</span>
                <input className="input" inputMode="decimal" value={f.price_adult} onChange={set('price_adult')} />
              </label>
              <label className="field">
                <span>
                  Precio niño (€)
                  <small className="field-note">vacío = igual que adulto</small>
                </span>
                <input className="input" inputMode="decimal" value={f.price_child} onChange={set('price_child')} />
              </label>
              <label className="field">
                <span>Plazas por sesión</span>
                <input className="input" inputMode="numeric" value={f.capacity} onChange={set('capacity')} />
              </label>
              <label className="field">
                <span>Duración</span>
                <input className="input" placeholder="4 horas" value={f.duration} onChange={set('duration')} />
              </label>
              <label className="field">
                <span>Dificultad</span>
                <input className="input" placeholder="Fácil" value={f.difficulty} onChange={set('difficulty')} />
              </label>
              <label className="field">
                <span>Punto de encuentro</span>
                <input className="input" value={f.meeting_point} onChange={set('meeting_point')} />
              </label>
            </fieldset>

            <fieldset>
              <legend>Textos</legend>
              <label className="field span-2">
                <span>Descripción corta (tarjeta)</span>
                <textarea className="input textarea" rows={3} value={f.description} onChange={set('description')} />
              </label>
              <label className="field span-2">
                <span>Descripción completa (ficha)</span>
                <textarea className="input textarea" rows={5} value={f.long_description} onChange={set('long_description')} />
              </label>
              <label className="field span-2">
                <span>
                  Puntos destacados
                  <small className="field-note">uno por línea</small>
                </span>
                <textarea className="input textarea" rows={4} value={f.highlights} onChange={set('highlights')} />
              </label>
              <label className="field">
                <span>
                  Orden en la web
                  <small className="field-note">menor = antes</small>
                </span>
                <input className="input" inputMode="numeric" value={f.sort_order} onChange={set('sort_order')} />
              </label>
            </fieldset>
          </div>

          <div className="panel__foot">
            {saved && !dirty ? <span className="saved">Cambios guardados</span> : null}
            {!isNew && reservations === 0 ? (
              <button type="button" className="btn btn--ghost danger-text" onClick={() => setConfirm('borrar')}>
                <Trash2 size={16} /> Borrar
              </button>
            ) : null}
            <button type="submit" className="btn btn--primary" disabled={saving || !dirty}>
              <Save size={16} /> {saving ? savingMsg || 'Guardando…' : isNew ? 'Crear actividad' : 'Guardar cambios'}
            </button>
          </div>
        </form>

        {isNew ? (
          <div className="editor__side">
            <PendingPhotos files={pendingFiles} onChange={setPendingFiles} disabled={saving} />
          </div>
        ) : null}
        {!isNew && activity ? (
          <div className="editor__side">
            <PhotosManager activity={activity} onActivityChange={setActivity} />
            <SessionsManager activity={activity} />
          </div>
        ) : null}
      </div>

      {confirm === 'publicar' ? (
        <ConfirmDialog
          title="¿Publicar en la web?"
          message="La actividad y sus fechas abiertas serán visibles y se podrán reservar."
          confirmLabel="Publicar"
          busy={saving}
          onConfirm={() => setStatus('publicada')}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
      {confirm === 'archivar' ? (
        <ConfirmDialog
          title="¿Archivar la actividad?"
          message="Dejará de verse en la web y en la lista principal. Sus reservas y su historial se conservan, y podrás restaurarla cuando quieras."
          confirmLabel="Archivar"
          busy={saving}
          onConfirm={() => setStatus('archivada')}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
      {confirm === 'borrar' ? (
        <ConfirmDialog
          title="¿Borrar definitivamente?"
          message="Se eliminarán la actividad, sus fechas y sus fotos. No se puede deshacer. Si solo quieres ocultarla, archívala."
          confirmLabel="Borrar definitivamente"
          danger
          busy={saving}
          onConfirm={remove}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </>
  );
}
