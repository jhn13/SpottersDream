// POST /api/positions  { "regs": ["G-JZHA", "EI-DWF"] }
// -> { at, planes: { "G-JZHA": { lat, lon, alt, gs, track, onGround, callsign, seenPos, route } | null }, errors }
import { json, normReg, cached, pool, fetchLiveMany, fetchRoute, liveErrors } from '../../lib/flight.js';

// All planes are looked up in a single call; routes are added for up to 20 flying planes.
const MAX_REGS = 120;

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Send a JSON body like {"regs":["G-JZHA"]}' }, 400); }
  const regs = [...new Set((body.regs || []).map(normReg).filter(Boolean))].slice(0, MAX_REGS);
  if (!regs.length) return json({ at: Date.now(), planes: {}, errors: 0 });

  let planes = {}, failed = [];
  try {
    const key = 'many:' + regs.slice().sort().join(',');
    planes = await cached(key, 15, () => fetchLiveMany(regs, env));
  } catch (e) {
    failed = regs.slice();
    regs.forEach(r => { planes[r] = null; });
  }
  const errors = failed.length;

  // Add routes for anything flying with a callsign.
  await pool(Object.keys(planes).filter(r => planes[r] && planes[r].callsign && !planes[r].onGround).slice(0, 20), 4, async reg => {
    const p = planes[reg];
    p.route = await fetchRoute(p.callsign, p);
  });

  return json({ at: Date.now(), planes, errors, failed, sourceErrors: failed.length ? [...new Set(liveErrors.slice(-8))] : [] });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const regs = (url.searchParams.get('regs') || '').split(',');
  return onRequestPost({ request: new Request(request.url, { method: 'POST', body: JSON.stringify({ regs }) }), env });
}
