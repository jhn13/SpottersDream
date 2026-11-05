// Server-side access to Supabase with the secret key (bypasses row-level security).
// Only used by the background job and the push endpoints. Never sent to the browser.

export function db(env) {
  const url = env.SUPABASE_URL, key = env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  const base = { apikey: key };
  // Legacy service_role keys are JWTs and also go in Authorization. New sb_secret_ keys go in apikey only.
  if (key.startsWith('eyJ')) base.Authorization = 'Bearer ' + key;
  const req = async (path, init = {}) => {
    const r = await fetch(`${url}${path}`, { ...init, headers: { ...base, 'Content-Type': 'application/json', ...(init.headers || {}) } });
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  };
  return {
    get: path => req(`/rest/v1/${path}`),
    upsert: (table, rows, onConflict) => rows.length ? req(`/rest/v1/${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`, {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows)
    }) : null,
    del: path => req(`/rest/v1/${path}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }),
    // Temporary links to private photos and videos.
    async signMedia(paths, expiresIn) {
      if (!paths.length) return {};
      const out = {};
      for (let i = 0; i < paths.length; i += 200) {
        const rows = await req('/storage/v1/object/sign/media', { method: 'POST', body: JSON.stringify({ expiresIn, paths: paths.slice(i, i + 200) }) });
        (rows || []).forEach(r => { if (r.signedURL && r.path) out[r.path] = `${url}/storage/v1${r.signedURL.startsWith('/') ? '' : '/'}${r.signedURL}`; });
      }
      return out;
    },
    async roleOf(userId) {
      const rows = await req(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role`);
      return rows && rows[0] ? rows[0].role : null;
    },
    // Check a signed-in user's token and return their id.
    async userFromToken(token) {
      if (!token) return null;
      const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: 'Bearer ' + token } });
      if (!r.ok) return null;
      const u = await r.json();
      return u && u.id ? u : null;
    }
  };
}
