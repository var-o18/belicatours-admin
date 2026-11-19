import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Star, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { imageUrl, removeActivityImage, uploadActivityImage } from '../../lib/images';
import { ConfirmDialog } from '../../components/ui';

/**
 * Fotos de la actividad (Supabase Storage + tabla activity_images).
 * La «portada» es la que usa la web en tarjetas y cabecera.
 */
export default function PhotosManager({ activity, onActivityChange }) {
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState('');
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('activity_images')
      .select('*')
      .eq('activity_id', activity.id)
      .order('sort_order');
    setImages(data ?? []);
  }, [activity.id]);

  useEffect(() => {
    load();
  }, [load]);

  const setCover = async (path) => {
    const { data, error: err } = await supabase
      .from('activities')
      .update({ cover_image_path: path })
      .eq('id', activity.id)
      .select()
      .single();
    if (err) return setError(err.message);
    onActivityChange(data);
  };

  const onFiles = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    setError('');
    setUploading(files.length);
    let order = images.reduce((m, i) => Math.max(m, i.sort_order), 0);
    let firstUrl = null;
    const failed = [];

    for (const file of files) {
      try {
        const { storage_path, url } = await uploadActivityImage(activity.id, file);
        const { error: err } = await supabase
          .from('activity_images')
          .insert({ activity_id: activity.id, storage_path, alt_text: activity.title, sort_order: ++order });
        if (err) {
          await removeActivityImage(storage_path);
          throw err;
        }
        firstUrl ??= url;
      } catch (err) {
        failed.push(err.message);
      }
      setUploading((n) => n - 1);
    }

    if (failed.length) setError(failed.join(' '));
    if (firstUrl && !activity.cover_image_path) await setCover(firstUrl);
    load();
  };

  const move = async (index, dir) => {
    const a = images[index];
    const b = images[index + dir];
    if (!a || !b) return;
    const next = [...images];
    next[index] = { ...b, sort_order: a.sort_order };
    next[index + dir] = { ...a, sort_order: b.sort_order };
    setImages(next);
    await Promise.all([
      supabase.from('activity_images').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('activity_images').update({ sort_order: a.sort_order }).eq('id', b.id),
    ]);
  };

  const saveAlt = async (img, alt) => {
    if (alt === (img.alt_text ?? '')) return;
    await supabase.from('activity_images').update({ alt_text: alt || null }).eq('id', img.id);
    setImages((list) => list.map((i) => (i.id === img.id ? { ...i, alt_text: alt } : i)));
  };

  const confirmDelete = async () => {
    setBusy(true);
    const img = toDelete;
    const url = imageUrl(img.storage_path);
    const { error: err } = await supabase.from('activity_images').delete().eq('id', img.id);
    if (!err) {
      await removeActivityImage(img.storage_path).catch(() => {});
      if (activity.cover_image_path === url) {
        const other = images.find((i) => i.id !== img.id);
        await setCover(other ? imageUrl(other.storage_path) : null);
      }
    } else setError(err.message);
    setBusy(false);
    setToDelete(null);
    load();
  };

  const cover = imageUrl(activity.cover_image_path);
  const coverIsLegacy = activity.cover_image_path?.startsWith('/');

  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">Fotos</h2>
        <button className="btn btn--ghost btn--sm" onClick={() => inputRef.current.click()} disabled={uploading > 0}>
          <ImagePlus size={16} /> {uploading ? `Subiendo ${uploading}…` : 'Subir fotos'}
        </button>
        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
      </div>

      {error ? <p className="alert" style={{ marginBottom: 12 }}>{error}</p> : null}

      <div className="cover">
        {cover ? <img src={cover} alt="" /> : <div className="cover__empty">Sin portada</div>}
        <span>Portada{coverIsLegacy ? ' (foto de la web actual)' : ''}</span>
      </div>

      {images.length ? (
        <ul className="photos">
          {images.map((img, i) => {
            const url = imageUrl(img.storage_path);
            const isCover = url === cover;
            return (
              <li key={img.id} className={isCover ? 'is-cover' : ''}>
                <img src={url} alt={img.alt_text ?? ''} loading="lazy" />
                <div className="photos__tools">
                  <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Mover a la izquierda">
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => setCover(url)}
                    disabled={isCover}
                    aria-label="Usar como portada"
                    title="Usar como portada"
                  >
                    <Star size={16} fill={isCover ? 'currentColor' : 'none'} />
                  </button>
                  <button className="icon-btn" onClick={() => setToDelete(img)} aria-label="Eliminar foto">
                    <Trash2 size={16} />
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => move(i, 1)}
                    disabled={i === images.length - 1}
                    aria-label="Mover a la derecha"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                <input
                  className="photos__alt"
                  defaultValue={img.alt_text ?? ''}
                  placeholder="Descripción de la foto"
                  aria-label="Descripción de la foto"
                  onBlur={(e) => saveAlt(img, e.target.value.trim())}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="hint">
          Sube fotos para la galería. Se reducen automáticamente para que la web cargue rápido. La estrella marca la
          portada.
        </p>
      )}

      {toDelete ? (
        <ConfirmDialog
          title="¿Eliminar la foto?"
          message="Se borrará de la galería y del almacenamiento."
          confirmLabel="Eliminar"
          danger
          busy={busy}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        />
      ) : null}
    </section>
  );
}
