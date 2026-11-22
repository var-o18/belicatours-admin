export const ACTIVITY_STATUS = {
  publicada: { label: 'Publicada', color: 'var(--st-pagada)' },
  borrador: { label: 'Borrador', color: 'var(--st-pendiente)' },
  archivada: { label: 'Archivada', color: 'var(--st-cancelada)' },
};

export const CATEGORY_LABEL = {
  experiencias: 'Experiencias',
  visitas: 'Visitas guiadas',
  gastronomia: 'Gastronomía',
};

/** Máximo de categorías por actividad (la base de datos admite hasta 3) */
export const MAX_CATEGORIES = Object.keys(CATEGORY_LABEL).length;

/** ['visitas', 'gastronomia'] → "Visitas guiadas + Gastronomía" */
export function categoriesLabel(activity) {
  const list = activity.categories?.length ? activity.categories : [activity.category];
  return list.map((c) => CATEGORY_LABEL[c] ?? c).join(' + ');
}

export const SESSION_STATUS = {
  abierta: 'Abierta',
  cerrada: 'Cerrada (no admite reservas)',
  cancelada: 'Cancelada',
};

/** "Biar y su Obrador" → "biar-y-su-obrador" */
export function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}
