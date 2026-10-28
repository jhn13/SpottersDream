// GET /api/airport?icao=EGNM&lat=53.87&lon=-1.66&elev=681
// -> { at, metar, traffic: [...], overhead }
// Weather: aviationweather.gov (US National Weather Service, free). Planes nearby: adsb.lol / airplanes.live.
import { json, cached, fetchRoute, getJSONPublic as getJSON } from '../../lib/flight.js';

const RADIUS_NM = 25;

function metarOf(m) {
  if (!m) return null;
  const clouds = Array.isArray(m.clouds) ? m.clouds.map(c => ({ cover: c.cover, base: c.base })) : [];
  return {
    station: m.icaoId || null,
    name: m.name || null,
    raw: m.rawOb || null,
    time: m.reportTime || (m.obsTime ? new Date(m.obsTime * 1000).toISOString() : null),
    wdir: m.wdir === 'VRB' ? 'VRB' : (typeof m.wdir === 'number' ? m.wdir : null),
    wspd: typeof m.wspd === 'number' ? m.wspd : null,
    wgst: typeof m.wgst === 'number' ? m.wgst : null,
    temp: typeof m.temp === 'number' ? m.temp : null,
    visib: m.visib != null ? String(m.visib) : null,
    wx: m.wxString || null,
    cover: m.cover || null,
    clouds,
    cat: m.fltCat || null
  };
}

function distNm(lat1, lon1, lat2, lon2) {
  const R = 3440.1, r = Math.PI / 180;
  const h = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function phaseOf(ac, elev) {
  const ground = ac.alt_baro === 'ground';
  const alt = ground ? elev : (typeof ac.alt_baro === 'number' ? ac.alt_baro : (typeof ac.alt_geom === 'number' ? ac.alt_geom : null));
  if (alt == null) return null;
  const agl = alt - elev;
  const rate = typeof ac.baro_rate === 'number' ? ac.baro_rate : (typeof ac.geom_rate === 'number' ? ac.geom_rate : 0);
  const gs = typeof ac.gs === 'number' ? ac.gs : 0;
  if (ground || (agl < 200 && gs < 80)) return { phase: 'ground', alt: 0 };
  if (agl >= 12000) return { phase: 'high', alt };
  if (rate <= -300) return { phase: 'landing', alt };
  if (rate >= 300) return { phase: 'departing', alt };
  return { phase: 'nearby', alt };
}

async function traffic(lat, lon, elev, env) {
  const paths = [
    `https://api.adsb.lol/v2/point/${lat}/${lon}/${RADIUS_NM}`,
    `https://api.airplanes.live/v2/point/${lat}/${lon}/${RADIUS_NM}`
  ];
  let list = null, lastErr;
  for (const u of paths) {
    try {
      const headers = (env && env.ADSBLOL_API_KEY && u.includes('adsb.lol')) ? { 'api-auth': env.ADSBLOL_API_KEY } : {};
      const j = await getJSON(u, { headers });
      list = j.ac || j.aircraft || [];
      break;
    } catch (e) { lastErr = e; }
  }
  if (!list) throw lastErr || new Error('No traffic source answered');
  const out = []; let overhead = 0;
  for (const ac of list) {
    if (ac.lat == null || ac.lon == null) continue;
    if (typeof ac.category === 'string' && /^C/.test(ac.category)) continue; // airport vehicles
    if (!ac.r && !ac.flight && !ac.t) continue;
    const ph = phaseOf(ac, elev); if (!ph) continue;
    if (ph.phase === 'high') { overhead++; continue; }
    out.push({
      key: (ac.hex || ac.r || ac.flight || '').toString().replace(/^~/, '').toUpperCase(),
      reg: ac.r || null,
      type: ac.t || null,
      desc: ac.desc || null,
      callsign: (ac.flight || '').trim() || null,
      alt: ph.alt,
      gs: typeof ac.gs === 'number' ? Math.round(ac.gs) : null,
      rate: typeof ac.baro_rate === 'number' ? ac.baro_rate : (typeof ac.geom_rate === 'number' ? ac.geom_rate : null),
      track: typeof ac.track === 'number' ? ac.track : (typeof ac.true_heading === 'number' ? ac.true_heading : null),
      lat: ac.lat, lon: ac.lon,
      dist: Math.round(distNm(lat, lon, ac.lat, ac.lon) * 10) / 10,
      phase: ph.phase
    });
  }
  const order = { landing: 0, departing: 1, nearby: 2, ground: 3 };
  out.sort((a, b) => order[a.phase] - order[b.phase] || a.dist - b.dist);
  return { traffic: out.slice(0, 40), overhead };
}

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const icao = (u.searchParams.get('icao') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  const lat = Math.round(parseFloat(u.searchParams.get('lat')) * 1000) / 1000;
  const lon = Math.round(parseFloat(u.searchParams.get('lon')) * 1000) / 1000;
  const elev = parseInt(u.searchParams.get('elev') || '0', 10) || 0;
  if (!isFinite(lat) || !isFinite(lon)) return json({ error: 'Missing airport position.' }, 400);

  const [metar, tr] = await Promise.all([
    icao.length === 4 ? cached('metar:' + icao, 300, async () => {
      try {
        const j = await getJSON(`https://aviationweather.gov/api/data/metar?ids=${icao}&format=json`);
        return metarOf(Array.isArray(j) ? j[0] : null);
      } catch (e) { return null; }
    }) : Promise.resolve(null),
    u.searchParams.get('traffic') === '0' ? Promise.resolve(null) : cached(`traffic:${lat},${lon}`, 12, () => traffic(lat, lon, elev, env)).catch(() => null)
  ]);

  // Where are the arriving and departing ones going or coming from? (cached, so cheap)
  if (tr) {
    const want = tr.traffic.filter(t => t.callsign && t.phase !== 'ground').slice(0, 10);
    await Promise.all(want.map(async t => {
      const r = await fetchRoute(t.callsign, { lat: t.lat, lon: t.lon });
      if (r) t.route = { from: r.from.code, fromName: r.from.city || r.from.name, to: r.to.code, toName: r.to.city || r.to.name };
    }));
  }
  return json({ at: Date.now(), metar, traffic: tr ? tr.traffic : null, overhead: tr ? tr.overhead : 0 });
}
