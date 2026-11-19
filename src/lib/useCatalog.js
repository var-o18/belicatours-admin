import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/** Actividades y sesiones (todas, también borradores) para los formularios del panel. */
export function useCatalog() {
  const [state, setState] = useState({ activities: [], sessions: [], loading: true });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase
        .from('activities')
        .select('id, title, status, price_adult, price_child, currency')
        .order('sort_order'),
      supabase.from('activity_sessions').select('id, activity_id, starts_at, seats, status').order('starts_at'),
    ]).then(([a, s]) => {
      if (!cancelled) setState({ activities: a.data ?? [], sessions: s.data ?? [], loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
