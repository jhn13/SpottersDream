// GET  /api/push/key   -> { publicKey } for subscribing to notifications
// POST /api/push/test  (signed in) -> sends a test notification to your devices
import { json } from '../../lib/flight.js';
import { db } from '../../lib/db.js';
import { getVapid, sendPush } from '../../lib/push.js';

export async function onRequest({ request, env }) {
  const d = db(env);
  if (!d) {
    const missing = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY'].filter(k => !env[k]);
    return json({ error: 'Notifications aren\'t set up yet.', missing, hint: 'Add these under the worker\'s Settings -> Variables and Secrets (not the Build section).' }, 503);
  }
  const path = new URL(request.url).pathname;

  if (path.endsWith('/key') && request.method === 'GET') {
    try { const v = await getVapid(d, env); return json({ publicKey: v.publicKey }); }
    catch (e) { return json({ error: 'Couldn\'t load the notification key. Has database update 3 been run?' }, 500); }
  }

  if (path.endsWith('/test') && request.method === 'POST') {
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const user = await d.userFromToken(token);
    if (!user) return json({ error: 'Please sign in again.' }, 401);
    const subs = await d.get(`push_subscriptions?select=*&user_id=eq.${user.id}`);
    if (!subs.length) return json({ error: 'This device isn\'t signed up for notifications yet.' }, 400);
    const vapid = await getVapid(d, env);
    let ok = 0;
    for (const s of subs) {
      const res = await sendPush(s, { title: 'Alerts are working!', body: "You'll get a message like this when one of your planes is nearby.", url: '/' }, vapid);
      if (res === 'gone') await d.del(`push_subscriptions?id=eq.${s.id}`).catch(() => {});
      if (res === 'ok') ok++;
    }
    return ok ? json({ sent: ok }) : json({ error: 'The notification couldn\'t be delivered. Try turning notifications off and on again.' }, 502);
  }
  return json({ error: 'Not found' }, 404);
}
