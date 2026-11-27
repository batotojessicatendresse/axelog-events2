import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** true si les deux variables d'environnement sont renseignées */
export const supabaseConfigured = Boolean(url && anonKey);

/** Client Supabase (null si les variables sont absentes : l'application fonctionne alors avec localStorage seul). */
export const supabase = supabaseConfigured
  ? createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

export const FILES_BUCKET = 'prestataire-files';
