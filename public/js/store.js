// Data layer. Two backends with the same shape:
//  - Supabase (the real thing) when config.js has a URL and key
//  - Demo (sample planes, nothing saved) otherwise
import { demoPlanes, DEMO_LOOKUP, demoLive, addSim } from './demo.js';

const SIGNED_URL_SECONDS = 6 * 3600;

export async function createStore(config) {
  if (config && config.SUPABASE_URL && config.SUPABASE_ANON_KEY) return supabaseStore(config);
  return demoStore();
}

/* ---------------- Supabase ---------------- */
async function supabaseStore(config) {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  const sb = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  const bucket = () => sb.storage.from('media');

  async function profileFor(user) {
    if (!user) return null;
    const { data, error } = await sb.from('profiles').select('display_name, role').eq('id', user.id).maybeSingle();
    if (error) throw error;
    if (!data) return { id: user.id, email: user.email, role: null, name: '' };
    return { id: user.id, email: user.email, role: data.role, name: data.display_name };
  }

  async function loadAll() {
    const [pl, si, me] = await Promise.all([
      sb.from('planes').select('*').order('created_at'),
      sb.from('sightings').select('*').order('spotted_on', { ascending: false }),
      sb.from('media').select('*').order('created_at')
    ]);
    for (const r of [pl, si, me]) if (r.error) throw r.error;
    const paths = [];
    me.data.forEach(m => { paths.push(m.path); if (m.poster_path) paths.push(m.poster_path); });
    const urls = {};
    for (let i = 0; i < paths.length; i += 100) {
      const { data, error } = await bucket().createSignedUrls(paths.slice(i, i + 100), SIGNED_URL_SECONDS);
      if (error) throw error;
      data.forEach(d => { if (d.signedUrl) urls[d.path] = d.signedUrl; });
    }
    const mediaBy = {};
    me.data.forEach(m => {
      (mediaBy[m.sighting_id] = mediaBy[m.sighting_id] || []).push({
        id: m.id, kind: m.kind, path: m.path, poster_path: m.poster_path,
        url: urls[m.path] || null, poster: m.poster_path ? urls[m.poster_path] : (m.kind === 'photo' ? urls[m.path] : null),
        created_by: m.created_by
      });
    });
    const sightBy = {};
    si.data.forEach(s => {
      (sightBy[s.plane_id] = sightBy[s.plane_id] || []).push({ ...s, media: mediaBy[s.id] || [] });
    });
    return pl.data.map(p => ({
      id: p.id, reg: p.reg, hex: p.hex, icao_type: p.icao_type, type_name: p.type_name, airline: p.airline, airline_icao: p.airline_icao,
      last: p.last_seen_at && p.last_lat != null ? { lat: p.last_lat, lon: p.last_lon, alt: p.last_alt, track: p.last_track, onGround: !!p.last_on_ground, at: Date.parse(p.last_seen_at) } : null,
      live: null,
      sightings: sightBy[p.id] || []
    })).filter(p => p.sightings.length);
  }

  async function removeFiles(paths) {
    const list = paths.filter(Boolean);
    if (list.length) { const { error } = await bucket().remove(list); if (error) throw error; }
  }

  return {
    mode: 'live',
    async currentUser() {
      const { data } = await sb.auth.getSession();
      return profileFor(data.session && data.session.user);
    },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return profileFor(data.user);
    },
    async signOut() { await sb.auth.signOut(); },
    onSignedOut(fn) { sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') fn(); }); },
    loadAll,
    async lookup(reg) {
      const r = await fetch('/api/lookup?reg=' + encodeURIComponent(reg));
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'The lookup service did not answer.');
      return r.json();
    },
    async positions(regs) {
      const r = await fetch('/api/positions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ regs }) });
      if (!r.ok) throw new Error('Live positions are not available right now.');
      return r.json();
    },
    async savePosition(plane, live) {
      const row = { last_lat: live.lat, last_lon: live.lon, last_alt: live.alt, last_track: live.track, last_on_ground: !!live.onGround, last_seen_at: new Date().toISOString() };
      const { error } = await sb.from('planes').update(row).eq('id', plane.id);
      if (error) throw error;
    },
    async updatePlane(plane, fields) {
      const { error } = await sb.from('planes').update(fields).eq('id', plane.id);
      if (error) throw error;
    },
    // spot = { reg, existingPlaneId, plane:{...fields}, sighting:{airport, spotted_on, note}, files:[{kind, blob, ext, poster}] }
    async addSpot(spot, onProgress) {
      let planeId = spot.existingPlaneId;
      if (!planeId) {
        const ins = await sb.from('planes').insert({ reg: spot.reg, ...spot.plane }).select('id').single();
        if (ins.error) {
          const again = await sb.from('planes').select('id').eq('reg', spot.reg).maybeSingle();
          if (!again.data) throw ins.error;
          planeId = again.data.id;
        } else planeId = ins.data.id;
      }
      const user = (await sb.auth.getUser()).data.user;
      const si = await sb.from('sightings').insert({ plane_id: planeId, ...spot.sighting, created_by: user.id }).select('id').single();
      if (si.error) throw si.error;
      let done = 0;
      for (const f of spot.files) {
        onProgress && onProgress(++done, spot.files.length);
        const base = `${planeId}/${si.data.id}/${crypto.randomUUID()}`;
        const path = `${base}.${f.ext}`;
        const up = await bucket().upload(path, f.blob, { contentType: f.blob.type, upsert: false });
        if (up.error) throw new Error(`Couldn't upload a ${f.kind}: ${up.error.message}`);
        let poster_path = null;
        if (f.poster) {
          poster_path = `${base}-thumb.jpg`;
          const pu = await bucket().upload(poster_path, f.poster, { contentType: 'image/jpeg', upsert: false });
          if (pu.error) poster_path = null;
        }
        const mi = await sb.from('media').insert({ sighting_id: si.data.id, kind: f.kind, path, poster_path, created_by: user.id });
        if (mi.error) throw mi.error;
      }
      return planeId;
    },
    async deleteSighting(s) {
      await removeFiles(s.media.flatMap(m => [m.path, m.poster_path]));
      const { error } = await sb.from('sightings').delete().eq('id', s.id);
      if (error) throw error;
    },
    async deleteMedia(m) {
      await removeFiles([m.path, m.poster_path]);
      const { error } = await sb.from('media').delete().eq('id', m.id);
      if (error) throw error;
    },
    async deletePlane(p) {
      await removeFiles(p.sightings.flatMap(s => s.media.flatMap(m => [m.path, m.poster_path])));
      const { error } = await sb.from('planes').delete().eq('id', p.id);
      if (error) throw error;
    }
  };
}

/* ---------------- Demo ---------------- */
function demoStore() {
  let planes = demoPlanes();
  const me = { id: 'demo', email: 'demo', role: 'admin', name: 'Demo' };
  const lid = () => 'local-' + Math.random().toString(36).slice(2);
  return {
    mode: 'demo',
    async currentUser() { return null; },
    async signIn() { return me; },
    async signOut() {},
    onSignedOut() {},
    async loadAll() { return planes.map(p => ({ ...p, live: null, sightings: p.sightings.map(s => ({ ...s, media: s.media.slice() })) })); },
    async lookup(reg) {
      const own = planes.find(p => p.reg === reg);
      const hit = DEMO_LOOKUP[reg];
      if (hit) { if (hit.sim) addSim(reg, hit.sim); return { reg, ...hit, live: demoLive(reg) }; }
      if (own) return { reg, found: true, icaoType: own.icao_type, type: own.type_name, owner: own.airline, operatorIcao: own.airline_icao, live: demoLive(reg) };
      return { reg, found: false, live: null };
    },
    async positions(regs) {
      const out = {}; regs.forEach(r => { out[r] = demoLive(r); });
      return { at: Date.now(), planes: out, errors: 0 };
    },
    async savePosition() {},
    async updatePlane(plane, fields) { const p = planes.find(x => x.id === plane.id); if (p) Object.assign(p, fields); },
    async addSpot(spot) {
      let p = planes.find(x => x.id === spot.existingPlaneId);
      if (!p) { p = { id: lid(), reg: spot.reg, hex: null, last: null, live: null, sightings: [], ...spot.plane }; planes.push(p); }
      p.sightings.unshift({
        id: lid(), ...spot.sighting, created_by: 'demo',
        media: spot.files.map(f => {
          const url = URL.createObjectURL(f.blob);
          return { id: lid(), kind: f.kind, url, poster: f.poster ? URL.createObjectURL(f.poster) : (f.kind === 'photo' ? url : null) };
        })
      });
      return p.id;
    },
    async deleteSighting(s) { planes.forEach(p => { p.sightings = p.sightings.filter(x => x.id !== s.id); }); planes = planes.filter(p => p.sightings.length); },
    async deleteMedia(m) { planes.forEach(p => p.sightings.forEach(s => { s.media = s.media.filter(x => x.id !== m.id); })); },
    async deletePlane(p) { planes = planes.filter(x => x.id !== p.id); }
  };
}
