// Shared helpers for the /api functions.
// Live positions: adsb.lol (falls back to airplanes.live). Aircraft details and routes: adsbdb.com.
// All three are free community services for non-commercial use.

const HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'SpottersDream/1.0 (personal plane-spotting logbook)'
};

export const LIVE_SOURCES = [
  'https://api.adsb.lol/v2/reg/',
  'https://api.airplanes.live/v2/reg/'
];
const ADSBDB = 'https://api.adsbdb.com/v0';

export function normReg(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
}

export function json(body, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store'
    }
  });
}

async function getJSON(url, init = {}, ms = 7000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...init, headers: { ...HEADERS, ...(init.headers || {}) }, signal: ctl.signal });
    if (r.status === 404) return { __notFound: true };
    if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

// Small cache on top of Cloudflare's edge cache, so repeated calls don't hammer the free APIs.
export async function cached(key, ttlSeconds, fn) {
  let cache = null;
  try { cache = caches.default; } catch (e) { /* not available locally */ }
  const req = new Request('https://cache.spottersdream.internal/' + encodeURIComponent(key));
  if (cache) {
    try { const hit = await cache.match(req); if (hit) return await hit.json(); } catch (e) { /* ignore */ }
  }
  const value = await fn();
  if (cache && value !== undefined) {
    try {
      await cache.put(req, new Response(JSON.stringify(value), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttlSeconds}` }
      }));
    } catch (e) { /* ignore */ }
  }
  return value;
}

export async function pool(items, size, worker) {
  const queue = items.slice();
  const runners = Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift());
  });
  await Promise.all(runners);
}

// readsb / tar1090 aircraft object -> our compact shape
export function shapeAircraft(ac) {
  if (!ac) return null;
  let lat = ac.lat, lon = ac.lon, seenPos = ac.seen_pos;
  if ((lat == null || lon == null) && ac.lastPosition) {
    lat = ac.lastPosition.lat; lon = ac.lastPosition.lon; seenPos = ac.lastPosition.seen_pos;
  }
  if (lat == null || lon == null) return null;
  const onGround = ac.alt_baro === 'ground';
  const alt = onGround ? 0 : (typeof ac.alt_baro === 'number' ? ac.alt_baro : (typeof ac.alt_geom === 'number' ? ac.alt_geom : null));
  return {
    lat: +lat, lon: +lon,
    alt, onGround,
    gs: typeof ac.gs === 'number' ? Math.round(ac.gs) : null,
    track: typeof ac.track === 'number' ? ac.track : (typeof ac.true_heading === 'number' ? ac.true_heading : null),
    callsign: (ac.flight || '').trim() || null,
    hex: ac.hex ? String(ac.hex).replace(/^~/, '').toUpperCase() : null,
    icaoType: ac.t || null,
    desc: ac.desc || null,
    ownOp: ac.ownOp || null,
    seenPos: typeof seenPos === 'number' ? Math.round(seenPos) : (typeof ac.seen === 'number' ? Math.round(ac.seen) : null)
  };
}

export async function fetchLiveOne(reg, env) {
  let lastErr = null;
  for (const base of LIVE_SOURCES) {
    try {
      const headers = {};
      if (env && env.ADSBLOL_API_KEY && base.includes('adsb.lol')) headers['api-auth'] = env.ADSBLOL_API_KEY;
      const j = await getJSON(base + encodeURIComponent(reg), { headers });
      if (j.__notFound) return null;
      const list = j.ac || j.aircraft || [];
      const ac = list.find(a => normReg(a.r) === reg) || list[0] || null;
      return shapeAircraft(ac);
    } catch (e) {
      lastErr = e; // try the next source
    }
  }
  throw lastErr || new Error('No live source answered');
}

function airportOf(a) {
  if (!a || a.latitude == null) return null;
  return {
    code: a.iata_code || a.icao_code || '',
    icao: a.icao_code || null,
    name: a.name || a.municipality || '',
    city: a.municipality || '',
    country: a.country_name || '',
    lat: +a.latitude, lon: +a.longitude
  };
}

async function routeFromAdsbdb(callsign) {
  return cached('route:' + callsign, 6 * 3600, async () => {
    try {
      const j = await getJSON(`${ADSBDB}/callsign/${encodeURIComponent(callsign)}`);
      const fr = j && j.response && j.response.flightroute;
      if (!fr) return null;
      const from = airportOf(fr.origin), to = airportOf(fr.destination);
      if (!from || !to) return null;
      return {
        from, to,
        airline: fr.airline ? { name: fr.airline.name || null, icao: fr.airline.icao || null } : null
      };
    } catch (e) {
      return null;
    }
  });
}

// adsb.lol's route lookup (the one tar1090 maps use). It's a POST with the plane's position.
function airportOfLol(a) {
  if (!a || a.lat == null || a.lon == null) return null;
  return { code: a.iata || a.icao || '', icao: a.icao || null, name: a.name || a.location || '', city: a.location || '', country: '', lat: +a.lat, lon: +a.lon };
}
async function routeFromAdsbLol(callsign, pos) {
  return cached('route2:' + callsign, 1800, async () => {
    try {
      const j = await getJSON('https://api.adsb.lol/api/0/routeset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planes: [{ callsign, lat: pos.lat, lng: pos.lon }] })
      });
      const r = Array.isArray(j) ? j[0] : null;
      if (!r || r.plausible === false || r.plausible === 0) return null;
      const aps = Array.isArray(r._airports) ? r._airports : [];
      if (aps.length < 2) return null;
      const from = airportOfLol(aps[0]), to = airportOfLol(aps[aps.length - 1]);
      return from && to ? { from, to, airline: null } : null;
    } catch (e) {
      return null;
    }
  });
}

export async function fetchRoute(callsign, pos) {
  if (!callsign) return null;
  const a = await routeFromAdsbdb(callsign);
  if (a && (!pos || plausible(a, pos))) return a;
  if (!pos) return null;
  const b = await routeFromAdsbLol(callsign, pos);
  return b && plausible(b, pos) ? b : null;
}

export async function fetchAircraftInfo(reg) {
  return cached('aircraft:' + reg, 7 * 24 * 3600, async () => {
    const j = await getJSON(`${ADSBDB}/aircraft/${encodeURIComponent(reg)}`);
    const a = j && j.response && j.response.aircraft;
    if (!a) return { found: false };
    return {
      found: true,
      hex: a.mode_s || null,
      icaoType: a.icao_type || null,
      type: a.type || null,
      manufacturer: a.manufacturer || null,
      owner: a.registered_owner || null,
      operatorIcao: a.registered_owner_operator_flag_code || null,
      country: a.registered_owner_country_name || null,
      photo: a.url_photo_thumbnail || a.url_photo || null
    };
  });
}

// Great-circle distance in km
export function distKm(a, b) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Callsign databases can be out of date. Only keep a route if the plane is roughly between the two airports.
export function plausible(route, pos) {
  if (!route || !pos) return false;
  const total = distKm(route.from, route.to);
  if (total < 30) return false;
  const via = distKm(route.from, pos) + distKm(pos, route.to);
  return via <= total * 1.3 + 250;
}
