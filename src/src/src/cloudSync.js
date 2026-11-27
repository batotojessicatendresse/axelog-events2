import { useEffect, useRef, useState } from 'react';
import { supabase, supabaseConfigured, FILES_BUCKET } from './supabaseClient.js';

/* Tables Supabase ↔ clés du tableau de données de l'application */
export const TABLES = {
  clients: 'axelog_clients',
  transactions: 'axelog_transactions',
  articles: 'axelog_articles',
  prestataires: 'axelog_prestataires',
  tasks: 'axelog_tasks',
  devis: 'axelog_devis',
  assign: 'axelog_assignations'
};
export const SETTINGS_TABLE = 'axelog_app_settings';
export const SETTINGS_ID = 'main';
const PAGE = 1000;
const CHUNK = 200;

/* ---------- conversion données <-> lignes ---------- */
export function toRows(data) {
  const tables = {};
  Object.keys(TABLES).forEach((k) => {
    tables[k] = (Array.isArray(data[k]) ? data[k] : []).map((item, i) => ({ id: String(item.id), pos: i, data: item }));
  });
  const settings = {
    id: SETTINGS_ID,
    data: { v: data.v, seq: data.seq, settings: data.settings, docProfile: data.docProfile || {} }
  };
  return { tables, settings };
}
const rowSig = (r) => r.pos + '|' + JSON.stringify(r.data);
export function sigsOf(rows) {
  const out = { tables: {}, settings: JSON.stringify(rows.settings.data) };
  Object.keys(TABLES).forEach((k) => {
    const m = new Map();
    rows.tables[k].forEach((r) => m.set(r.id, rowSig(r)));
    out.tables[k] = m;
  });
  return out;
}
export function sameSigs(a, b) {
  if (a.settings !== b.settings) return false;
  return Object.keys(TABLES).every((k) => {
    if (a.tables[k].size !== b.tables[k].size) return false;
    for (const [id, s] of a.tables[k]) if (b.tables[k].get(id) !== s) return false;
    return true;
  });
}
export function fromRows(remote) {
  const s = remote.settings ? remote.settings.data || {} : {};
  const d = { v: s.v || 2, seq: typeof s.seq === 'number' ? s.seq : 0, settings: s.settings, docProfile: s.docProfile || {} };
  Object.keys(TABLES).forEach((k) => {
    d[k] = remote.tables[k].map((r) => r.data);
  });
  if (!d.settings) delete d.settings;
  if (!d.seq) d.seq = d.transactions.length;
  return d;
}

/* ---------- moteur de synchronisation (testable sans React) ---------- */
export function createEngine(client) {
  let snapshot = null; // signatures de ce que Supabase contient

  async function fetchAll(table) {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await client.from(table).select('id,pos,data').order('pos', { ascending: true }).range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    return rows;
  }

  async function pull() {
    const tables = {};
    for (const k of Object.keys(TABLES)) tables[k] = await fetchAll(TABLES[k]);
    const { data: srows, error } = await client.from(SETTINGS_TABLE).select('id,data').eq('id', SETTINGS_ID).limit(1);
    if (error) throw error;
    const remote = { tables, settings: srows && srows.length ? srows[0] : null };
    const sigTables = {};
    Object.keys(TABLES).forEach((k) => {
      const m = new Map();
      tables[k].forEach((r) => m.set(String(r.id), rowSig({ pos: r.pos, data: r.data })));
      sigTables[k] = m;
    });
    snapshot = { tables: sigTables, settings: remote.settings ? JSON.stringify(remote.settings.data) : null };
    return { remote, initialized: Boolean(remote.settings), data: remote.settings ? fromRows(remote) : null };
  }

  /** Envoie uniquement ce qui a changé depuis le dernier état connu de Supabase. Retourne le nombre d'opérations. */
  async function push(data) {
    if (!snapshot) throw new Error('pull() requis avant push()');
    const rows = toRows(data);
    let ops = 0;
    for (const k of Object.keys(TABLES)) {
      const table = TABLES[k];
      const snap = snapshot.tables[k];
      const up = rows.tables[k].filter((r) => snap.get(r.id) !== rowSig(r));
      const keep = new Set(rows.tables[k].map((r) => r.id));
      const del = Array.from(snap.keys()).filter((id) => !keep.has(id));
      for (let i = 0; i < up.length; i += CHUNK) {
        const part = up.slice(i, i + CHUNK);
        const { error } = await client.from(table).upsert(part, { onConflict: 'id' });
        if (error) throw error;
        part.forEach((r) => snap.set(r.id, rowSig(r)));
        ops += part.length;
      }
      for (let i = 0; i < del.length; i += CHUNK) {
        const part = del.slice(i, i + CHUNK);
        const { error } = await client.from(table).delete().in('id', part);
        if (error) throw error;
        part.forEach((id) => snap.delete(id));
        ops += part.length;
      }
    }
    const sSig = JSON.stringify(rows.settings.data);
    if (snapshot.settings !== sSig) {
      const { error } = await client.from(SETTINGS_TABLE).upsert(rows.settings, { onConflict: 'id' });
      if (error) throw error;
      snapshot.settings = sSig;
      ops += 1;
    }
    return ops;
  }

  return { pull, push, getSnapshot: () => snapshot };
}

/* ---------- fichiers prestataires : Supabase Storage ---------- */
export const cloudFiles = {
  async put(id, blob) {
    if (!supabaseConfigured) return false;
    try {
      const { error } = await supabase.storage.from(FILES_BUCKET).upload(id, blob, { upsert: true, contentType: blob.type || 'application/octet-stream' });
      return !error;
    } catch (e) {
      return false;
    }
  },
  async get(id) {
    if (!supabaseConfigured) return null;
    try {
      const { data, error } = await supabase.storage.from(FILES_BUCKET).download(id);
      return error ? null : data;
    } catch (e) {
      return null;
    }
  },
  async del(id) {
    if (!supabaseConfigured) return;
    try {
      await supabase.storage.from(FILES_BUCKET).remove([id]);
    } catch (e) {
      /* ignoré : la suppression locale a déjà eu lieu */
    }
  }
};

/* ---------- hook React ---------- */
const DIRTY_KEY = 'axelog-events-dirty';
const getDirty = () => { try { return localStorage.getItem(DIRTY_KEY) === '1'; } catch (e) { return false; } };
const setDirty = (v) => { try { if (v) localStorage.setItem(DIRTY_KEY, '1'); else localStorage.removeItem(DIRTY_KEY); } catch (e) { /* ignoré */ } };

/**
 * Synchronise `data` avec Supabase. localStorage reste la copie de secours (gérée par l'application).
 * status : 'off' (variables absentes) | 'loading' | 'saving' | 'ok' | 'error'
 */
export function useCloudSync(data, setData, normalize) {
  const [status, setStatus] = useState(supabaseConfigured ? 'loading' : 'off');
  const [lastSync, setLastSync] = useState(null);
  const engine = useRef(null);
  const ready = useRef(false);
  const busy = useRef(false);
  const latest = useRef(data);
  const edited = useRef(false);
  const timer = useRef(0);
  const first = useRef(true);
  const retryT = useRef(0);
  latest.current = data;

  const flush = async () => {
    if (!engine.current || busy.current) return;
    busy.current = true;
    setStatus('saving');
    try {
      await engine.current.push(latest.current);
      setDirty(false);
      setLastSync(new Date());
      setStatus('ok');
    } catch (e) {
      setStatus('error');
      clearTimeout(retryT.current);
      retryT.current = setTimeout(() => { if (ready.current) schedule(300); }, 15000);
    }
    busy.current = false;
  };
  const schedule = (ms) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, ms);
  };

  const initialSync = async () => {
    if (!supabaseConfigured) return;
    if (!engine.current) engine.current = createEngine(supabase);
    busy.current = true;
    setStatus('loading');
    try {
      const r = await engine.current.pull();
      if (r.initialized && !getDirty() && !edited.current) {
        setData(normalize(r.data));
        setDirty(false);
        setLastSync(new Date());
        setStatus('ok');
      } else {
        await engine.current.push(latest.current);
        setDirty(false);
        setLastSync(new Date());
        setStatus('ok');
      }
      ready.current = true;
    } catch (e) {
      setStatus('error');
      clearTimeout(retryT.current);
      retryT.current = setTimeout(initialSync, 15000);
    }
    busy.current = false;
    if (ready.current && edited.current) schedule(300);
  };

  useEffect(() => {
    initialSync();
    const onVisible = async () => {
      if (document.visibilityState !== 'visible' || !ready.current || busy.current || getDirty()) return;
      busy.current = true;
      try {
        const r = await engine.current.pull();
        if (r.initialized && !getDirty()) {
          const remote = normalize(r.data);
          if (!sameSigs(sigsOf(toRows(remote)), sigsOf(toRows(latest.current)))) setData(remote);
        }
        setStatus('ok');
      } catch (e) {
        setStatus('error');
      }
      busy.current = false;
    };
    const onOnline = () => { if (ready.current) schedule(300); else initialSync(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      clearTimeout(timer.current);
      clearTimeout(retryT.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!supabaseConfigured) return;
    edited.current = true;
    setDirty(true);
    if (ready.current) schedule(700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const retry = () => {
    if (!supabaseConfigured) return;
    if (ready.current) { setDirty(true); schedule(0); } else initialSync();
  };
  return { status, lastSync, retry, enabled: supabaseConfigured };
}
