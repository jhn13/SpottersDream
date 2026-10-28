// POST /api/positions  { "regs": ["G-JZHA", "EI-DWF"] }
// -> { at, planes: { "G-JZHA": { lat, lon, alt, gs, track, onGround, callsign, seenPos, route } | null }, errors }
import { json, normReg, cached, pool, fetchLiveOne, fetchRoute } from '../../lib/flight.js';

const MAX_REGS = 80;

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Send a JSON body like {"regs":["G-JZHA"]}' }, 400); }
  const regs = [...new Set((body.regs || []).map(normReg).filter(Boolean))].slice(0, MAX_REGS);
  if (!regs.length) return json({ at: Date.now(), planes: {}, errors: 0 });

  const planes = {};
  let errors = 0;
  await pool(regs, 4, async reg => {
    try {
      planes[reg] = await cached('live:' + reg, 20, () => fetchLiveOne(reg, env));
    } catch (e) {
      errors++;
      planes[reg] = null;
    }
  });

  // Add routes for anything flying with a callsign.
  await pool(Object.keys(planes).filter(r => planes[r] && planes[r].callsign && !planes[r].onGround), 4, async reg => {
    const p = planes[reg];
    p.route = await fetchRoute(p.callsign, p);
  });

  return json({ at: Date.now(), planes, errors });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const regs = (url.searchParams.get('regs') || '').split(',');
  return onRequestPost({ request: new Request(request.url, { method: 'POST', body: JSON.stringify({ regs }) }), env });
}
