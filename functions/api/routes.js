// POST /api/routes  { "flights": [{ "reg": "G-JZHA", "callsign": "EXS21K", "lat": 45.1, "lon": -1.2, "track": 182 }] }
// -> { routes: { "G-JZHA": { from, to, airline } | null } }
// The app fetches live positions itself (from the browser), then asks here for where each flight is going.
import { json, pool, fetchRoute } from '../../lib/flight.js';

export async function onRequestPost({ request }) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Send a JSON body.' }, 400); }
  const flights = (body.flights || []).filter(f => f && f.reg && f.callsign && isFinite(f.lat) && isFinite(f.lon)).slice(0, 20);
  const routes = {};
  await pool(flights, 4, async f => {
    routes[f.reg] = await fetchRoute(String(f.callsign).trim().toUpperCase(), { lat: +f.lat, lon: +f.lon, track: typeof f.track === 'number' ? f.track : null }).catch(() => null);
  });
  return json({ routes });
}
