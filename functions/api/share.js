// View-only share link: anyone with the link sees the logbook without signing in.
//   GET    /api/share          (admin) -> { enabled, token, notes, created }
//   POST   /api/share          (admin) { notes } -> creates a new link (the old one stops working)
//   PATCH  /api/share          (admin) { notes } -> change whether notes are shown
//   DELETE /api/share          (admin) -> turns sharing off
//   GET    /api/public/<token>          -> the logbook, read only
// The link's secret lives in the server-only app_secrets table.
import { json } from '../../lib/flight.js';
import { db } from '../../lib/db.js';

const MEDIA_LINK_SECONDS = 24 * 3600;
let cache = null; // { token, at, body }

function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function getShare(d) {
  const rows = await d.get('app_secrets?name=eq.share&select=value');
  return rows && rows[0] ? JSON.parse(rows[0].value) : null;
}
const saveShare = (d, v) => d.upsert('app_secrets', [{ name: 'share', value: JSON.stringify(v) }], 'name');

async function requireAdmin(d, request) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const user = await d.userFromToken(token);
  if (!user) return null;
  return (await d.roleOf(user.id)) === 'admin' ? user : null;
}

async function publicLogbook(d, share) {
  const [planes, sightings, media] = await Promise.all([
    d.get('planes?select=*&order=created_at'),
    d.get('sightings?select=*&order=spotted_on.desc'),
    d.get('media?select=id,sighting_id,kind,path,poster_path,created_at&order=created_at')
  ]);
  const paths = [];
  media.forEach(m => { paths.push(m.path); if (m.poster_path) paths.push(m.poster_path); });
  const urls = await d.signMedia(paths, MEDIA_LINK_SECONDS);
  const mediaBy = {};
  media.forEach(m => {
    (mediaBy[m.sighting_id] = mediaBy[m.sighting_id] || []).push({
      id: m.id, kind: m.kind, url: urls[m.path] || null,
      poster: m.poster_path ? urls[m.poster_path] || null : (m.kind === 'photo' ? urls[m.path] || null : null)
    });
  });
  const sightBy = {};
  sightings.forEach(s => {
    (sightBy[s.plane_id] = sightBy[s.plane_id] || []).push({
      id: s.id, airport: s.airport, spotted_on: s.spotted_on, created_at: s.created_at,
      note: share.notes ? s.note : '', media: mediaBy[s.id] || []
    });
  });
  return planes.map(p => ({
    id: p.id, reg: p.reg, hex: p.hex, icao_type: p.icao_type, type_name: p.type_name, airline: p.airline, airline_icao: p.airline_icao,
    details: p.details || null,
    last: p.last_seen_at && p.last_lat != null ? { lat: p.last_lat, lon: p.last_lon, alt: p.last_alt, track: p.last_track, onGround: !!p.last_on_ground, at: Date.parse(p.last_seen_at) } : null,
    sightings: sightBy[p.id] || []
  })).filter(p => p.sightings.length);
}

export async function onRequest({ request, env }) {
  const d = db(env);
  if (!d) return json({ error: 'Sharing isn\'t set up yet.' }, 503);
  const path = new URL(request.url).pathname;

  if (path.startsWith('/api/public/')) {
    const token = decodeURIComponent(path.slice('/api/public/'.length));
    const share = await getShare(d).catch(() => null);
    if (!share || !share.enabled || !token || token !== share.token) return json({ error: 'This link has been turned off or doesn\'t exist.' }, 404);
    if (cache && cache.token === token && cache.notes === !!share.notes && Date.now() - cache.at < 60000) return json(cache.body);
    const body = { planes: await publicLogbook(d, share), at: Date.now() };
    cache = { token, notes: !!share.notes, at: Date.now(), body };
    return json(body);
  }

  if (path === '/api/share') {
    const admin = await requireAdmin(d, request);
    if (!admin) return json({ error: 'Only the admin account can manage the share link.' }, 403);
    let share = await getShare(d).catch(() => null);
    if (request.method === 'GET') return json(share && share.enabled ? share : { enabled: false });
    if (request.method === 'DELETE') { await saveShare(d, { enabled: false }); cache = null; return json({ enabled: false }); }
    const body = await request.json().catch(() => ({}));
    if (request.method === 'POST') {
      share = { enabled: true, token: newToken(), notes: !!body.notes, created: new Date().toISOString() };
      await saveShare(d, share); cache = null; return json(share);
    }
    if (request.method === 'PATCH') {
      if (!share || !share.enabled) return json({ error: 'Sharing is off.' }, 400);
      share.notes = !!body.notes; await saveShare(d, share); cache = null; return json(share);
    }
  }
  return json({ error: 'Not found' }, 404);
}
