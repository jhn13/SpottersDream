// Entry point when deployed as a Cloudflare Worker.
// /api/* goes to the flight data functions; everything else is the website in public/.
import * as lookup from '../functions/api/lookup.js';
import * as positions from '../functions/api/positions.js';
import * as airport from '../functions/api/airport.js';

const ROUTES = { '/api/lookup': lookup, '/api/positions': positions, '/api/airport': airport };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
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
  }
};
