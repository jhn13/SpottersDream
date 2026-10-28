// Background job, run by Cloudflare every 2 minutes:
//  1. checks the planes that have alerts, plus a few logbook planes in rotation
//  2. updates each plane's last-seen position (and keeps the free Supabase project awake)
//  3. sends notifications for alerts that have just been triggered
import { db } from './db.js';
import { fetchLiveMany } from './flight.js';
import { getVapid, sendPush } from './push.js';

// Planes are looked up in one batched call, so each run can check plenty of them.
const PLANES_PER_RUN = 60;
const LIVE_MAX_AGE_S = 120;
const MIN_GAP_MS = 20 * 60000; // never repeat the same alert within 20 minutes

function miles(aLat, aLon, bLat, bLon) {
  const R = 3958.8, r = Math.PI / 180;
  const h = Math.sin((bLat - aLat) * r / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin((bLon - aLon) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function ukHour(date = new Date()) {
  return parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hour12: false }).format(date), 10) % 24;
}
export function inQuiet(start, end, hour) {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}
const fmtFt = n => Math.round(n).toLocaleString('en-GB');
const compass = d => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round((((d || 0) % 360) + 360) % 360 / 45) % 8];

// Decide whether one alert should fire. Returns { state, message | null }.
export function evaluate(alert, L, settings, hour) {
  const state = { ...(alert.state || {}) };
  const visible = L && L.seenPos != null && L.seenPos <= LIVE_MAX_AGE_S;
  const quiet = inQuiet(settings.quiet_start ?? 21, settings.quiet_end ?? 7, hour);
  const recently = alert.last_fired_at && Date.now() - Date.parse(alert.last_fired_at) < MIN_GAP_MS;
  let message = null;
  const reg = alert.reg;

  if (alert.kind === 'near') {
    let lat = alert.lat, lon = alert.lon, name = alert.place_name || 'your spot';
    if (alert.place === 'home') { lat = settings.home_lat; lon = settings.home_lon; name = 'home'; }
    if (alert.place === 'me') { lat = settings.here_lat; lon = settings.here_lon; name = 'you'; }
    if (lat == null || lon == null || !visible) return { state, message };
    const d = miles(lat, lon, L.lat, L.lon), r = alert.radius_mi;
    const inside = d <= r ? true : d > r * 1.2 ? false : !!state.inside;
    if (inside && !state.inside && !quiet && !recently) {
      const where = L.onGround ? 'on the ground' : `at ${fmtFt(L.alt || 0)} ft, heading ${compass(L.track)}`;
      message = {
        title: `${reg} is nearby!`,
        body: `${reg} is ${d < 1 ? 'less than a mile' : Math.round(d) + (Math.round(d) === 1 ? ' mile' : ' miles')} from ${name}, ${where}.${L.onGround ? '' : ' Look up!'}`
      };
    }
    state.inside = inside;
    state.dist = Math.round(d * 10) / 10;
    return { state, message };
  }

  if (!visible) return { state, message };
  const phase = L.onGround ? 'ground' : 'air';
  const prev = state.phase;
  const rate = L.rate || 0, alt = L.alt || 0;

  if (alert.kind === 'takeoff') {
    const justOff = phase === 'air' && (prev === 'ground' || (prev !== 'air' && alt < 8000 && rate > 300));
    if (justOff && !quiet && !recently) {
      message = { title: `${reg} has taken off!`, body: `${reg} just took off and is climbing through ${fmtFt(alt)} ft, heading ${compass(L.track)}.` };
    }
  }
  if (alert.kind === 'landing') {
    if (phase === 'air' && alt > 8000) state.finals = false;
    const finals = phase === 'air' && alt < 2500 && rate < -300 && !state.finals;
    const touchdown = phase === 'ground' && prev === 'air' && !state.finals;
    if ((finals || touchdown) && !quiet && !recently) {
      message = finals
        ? { title: `${reg} is coming in to land!`, body: `${reg} is on its final approach, ${fmtFt(alt)} ft up and descending.` }
        : { title: `${reg} has landed!`, body: `${reg} has just touched down.` };
    }
    if (finals || touchdown) state.finals = true;
  }
  state.phase = phase;
  return { state, message };
}

export async function runCron(env) {
  const d = db(env);
  if (!d) return { skipped: 'Supabase secret key not set' };
  const [alerts, settingsRows, planes] = await Promise.all([
    d.get('alerts?active=eq.true&select=*').catch(() => []),
    d.get('user_settings?select=*').catch(() => []),
    d.get('planes?select=id,reg,last_lat,last_lon,last_alt,last_track,last_on_ground,last_seen_at,last_checked_at&order=last_checked_at.asc.nullsfirst&limit=500')
  ]);
  const settings = Object.fromEntries((settingsRows || []).map(s => [s.user_id, s]));

  // Which planes to check this run: alert planes first, then the logbook planes checked longest ago.
  const alertRegs = [...new Set((alerts || []).map(a => a.reg))].slice(0, PLANES_PER_RUN);
  // Logbook planes only every 10 minutes, to stay well inside the free trackers' limits.
  const rotate = new Date().getUTCMinutes() % 10 === 0;
  const rotation = rotate ? planes.filter(p => !alertRegs.includes(p.reg)).slice(0, Math.max(0, PLANES_PER_RUN - alertRegs.length)).map(p => p.reg) : [];
  const regs = [...alertRegs, ...rotation];
  if (!regs.length) return { checked: 0, alerts: 0, fired: 0, sent: 0 };
  let live = {};
  try { live = await fetchLiveMany(regs, env); } catch (e) { regs.forEach(r => { live[r] = undefined; }); }

  // 1. Save last-seen positions.
  const now = new Date().toISOString();
  const byReg = Object.fromEntries(planes.map(p => [p.reg, p]));
  const posRows = regs.filter(r => byReg[r] && live[r] !== undefined).map(r => {
    const p = byReg[r], L = live[r];
    const ok = L && L.seenPos != null && L.seenPos <= LIVE_MAX_AGE_S;
    return {
      id: p.id, reg: p.reg,
      last_lat: ok ? L.lat : p.last_lat, last_lon: ok ? L.lon : p.last_lon,
      last_alt: ok ? (L.alt == null ? null : Math.round(L.alt)) : p.last_alt,
      last_track: ok ? L.track : p.last_track, last_on_ground: ok ? !!L.onGround : p.last_on_ground,
      last_seen_at: ok ? now : p.last_seen_at, last_checked_at: now
    };
  });
  await d.upsert('planes', posRows, 'id').catch(() => {});

  // 2. Alerts.
  const hour = ukHour();
  const fired = [], changed = [];
  for (const a of alerts || []) {
    if (live[a.reg] === undefined) continue;
    const { state, message } = evaluate(a, live[a.reg], settings[a.user_id] || {}, hour);
    const row = { ...a, state };
    if (message) { row.last_fired_at = now; fired.push({ alert: a, message }); }
    if (message || JSON.stringify(state) !== JSON.stringify(a.state || {})) changed.push(row);
  }
  if (changed.length) await d.upsert('alerts', changed, 'id').catch(() => {});

  // 3. Notifications.
  let sent = 0;
  if (fired.length) {
    const users = [...new Set(fired.map(f => f.alert.user_id))];
    const subs = await d.get(`push_subscriptions?select=*&user_id=in.(${users.join(',')})`).catch(() => []);
    const vapid = await getVapid(d, env);
    for (const f of fired) {
      for (const s of subs.filter(s => s.user_id === f.alert.user_id)) {
        const res = await sendPush(s, { ...f.message, url: `/?plane=${encodeURIComponent(f.alert.reg)}`, tag: f.alert.id }, vapid);
        if (res === 'gone') await d.del(`push_subscriptions?id=eq.${s.id}`).catch(() => {});
        if (res === 'ok') sent++;
      }
    }
  }
  return { checked: regs.length, positions: posRows.length, alerts: (alerts || []).length, fired: fired.length, sent };
}
