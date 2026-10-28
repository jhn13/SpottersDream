// GET /api/aircraft?reg=G-JZHA[&hex=406CAB]
// -> { reg, hex, built, firstFlight, year, msn, line, engines, model, manufacturer, owner, operator }
import { json, normReg, cached, fetchAircraftInfo, fetchAircraftDetails, fetchLiveOne } from '../../lib/flight.js';

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const reg = normReg(u.searchParams.get('reg'));
  let hex = (u.searchParams.get('hex') || '').toUpperCase().replace(/[^0-9A-F]/g, '');
  if (!reg && !hex) return json({ error: 'Send a registration.' }, 400);
  let live = null;
  if (!hex && reg) {
    const info = await fetchAircraftInfo(reg).catch(() => null);
    hex = info && info.hex ? info.hex : '';
  }
  if (!hex && reg) { live = await cached('live:' + reg, 20, () => fetchLiveOne(reg, env)).catch(() => null); hex = live && live.hex ? live.hex : ''; }
  const d = await fetchAircraftDetails(hex);
  let year = null;
  if (!(d && (d.built || d.firstFlight)) && reg) {
    if (!live) live = await cached('live:' + reg, 20, () => fetchLiveOne(reg, env)).catch(() => null);
    year = live && live.year ? live.year : null;
  }
  return json({ reg, hex: hex || null, ...(d || {}), year }, 200, 3600);
}
