// GET /api/lookup?reg=G-JZHA
// -> { reg, found, hex, icaoType, type, manufacturer, owner, operatorIcao, photo, live }
import { json, normReg, cached, fetchAircraftInfo, fetchLiveOne, fetchRoute, plausible } from '../../lib/flight.js';

export async function onRequestGet({ request, env }) {
  const reg = normReg(new URL(request.url).searchParams.get('reg'));
  if (!reg || reg.length < 3) return json({ error: 'Type a registration, for example G-JZHA.' }, 400);

  const [info, live] = await Promise.all([
    fetchAircraftInfo(reg).catch(() => ({ found: false, failed: true })),
    cached('live:' + reg, 20, () => fetchLiveOne(reg, env)).catch(() => null)
  ]);

  if (live && live.callsign && !live.onGround) {
    const route = await fetchRoute(live.callsign);
    live.route = plausible(route, live) ? route : null;
  }

  // The live feed often knows the type even when the database doesn't.
  const out = { reg, ...info, live };
  if (!out.icaoType && live && live.icaoType) out.icaoType = live.icaoType;
  if (!out.type && live && live.desc) out.type = live.desc;
  if (!out.owner && live && live.ownOp) out.owner = live.ownOp;
  out.found = !!(out.found || out.icaoType || live);
  return json(out);
}
