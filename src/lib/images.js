import { supabase } from './supabase';

export const BUCKET = 'activity-images';
const MAX_SIDE = 2000;
const MAX_INPUT_MB = 25;

/**
 * Convierte la ruta guardada en una URL que se puede mostrar.
 * - "/images/..."  → foto que ya existía en la web (copiada también en el panel)
 * - "https://..."  → URL completa (fotos subidas a Supabase Storage)
 * - "carpeta/x.jpg" → ruta dentro del bucket de Storage
 */
export function imageUrl(path) {
  if (!path) return null;
  if (path.startsWith('http') || path.startsWith('/')) return path;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Reduce la foto (máx. 2000 px) y la pasa a JPEG para que la web cargue rápido. */
async function resizeImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen'))), 'image/jpeg', 0.85)
  );
}

/** Sube una foto al bucket y devuelve { storage_path, url }. */
export async function uploadActivityImage(activityId, file) {
  if (!file.type.startsWith('image/')) throw new Error(`«${file.name}» no es una imagen.`);
  if (file.size > MAX_INPUT_MB * 1024 * 1024) throw new Error(`«${file.name}» pesa más de ${MAX_INPUT_MB} MB.`);

  const blob = await resizeImage(file);
  const path = `${activityId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw error;
  return { storage_path: path, url: imageUrl(path) };
}

export async function removeActivityImage(storagePath) {
  if (!storagePath || storagePath.startsWith('/') || storagePath.startsWith('http')) return;
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) throw error;
}
