// Entry point when deployed as a Cloudflare Worker.
// /api/* goes to the server functions; everything else is the website in public/.
// Every 2 minutes, the scheduled job checks planes, updates last-seen positions and sends alerts.
import * as lookup from '../functions/api/lookup.js';
import * as positions from '../functions/api/positions.js';
import * as airport from '../functions/api/airport.js';
import * as push from '../functions/api/push.js';
import * as aircraft from '../functions/api/aircraft.js';
import * as routes from '../functions/api/routes.js';
import { runCron } from '../lib/cron.js';

const ROUTES = { '/api/lookup': lookup, '/api/positions': positions, '/api/airport': airport, '/api/aircraft': aircraft, '/api/routes': routes };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/push/')) {
      try { return await push.onRequest({ request, env, ctx }); }
      catch (e) { return new Response(JSON.stringify({ error: 'Something went wrong with notifications.' }), { status: 500, headers: { 'Content-Type': 'application/json' } }); }
    }
    const mod = ROUTES[url.pathname];
    if (mod) {
      const handler = request.method === 'POST' ? mod.onRequestPost : request.method === 'GET' ? mod.onRequestGet : null;
      if (!handler) return new Response('Method not allowed', { status: 405 });
      try {
        return await handler({ request, env, ctx });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Something went wrong fetching flight data.' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
      }
    }
    if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCron(env).then(r => console.log('cron', JSON.stringify(r))).catch(e => console.log('cron failed', e.message)));
  }
};
