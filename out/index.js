var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// functions/api/lookup.js
var lookup_exports = {};
__export(lookup_exports, {
  onRequestGet: () => onRequestGet
});

// lib/flight.js
var HEADERS = {
  "Accept": "application/json",
  "User-Agent": "SpottersDream/1.0 (personal plane-spotting logbook)"
};
var ADSBDB = "https://api.adsbdb.com/v0";
function normReg(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12);
}
__name(normReg, "normReg");
function json(body, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": maxAge ? `public, max-age=${maxAge}` : "no-store"
    }
  });
}
__name(json, "json");
async function getJSONPublic(url, init = {}, ms = 7e3) {
  return getJSON(url, init, ms);
}
__name(getJSONPublic, "getJSONPublic");
async function getJSON(url, init = {}, ms = 7e3) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...init, headers: { ...HEADERS, ...init.headers || {} }, signal: ctl.signal });
    if (r.status === 404) return { __notFound: true };
    if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}
__name(getJSON, "getJSON");
var MEM = /* @__PURE__ */ new Map();
var MEM_MAX = 2e3;
async function cached(key, ttlSeconds, fn) {
  const now = Date.now(), hit = MEM.get(key);
  if (hit && hit.exp > now) return hit.value;
  const value = await fn();
  if (value !== void 0) {
    if (MEM.size >= MEM_MAX) {
      for (const [k, v] of MEM) {
        if (v.exp <= now || MEM.size >= MEM_MAX) MEM.delete(k);
        if (MEM.size < MEM_MAX * 0.9) break;
      }
    }
    MEM.set(key, { value, exp: now + ttlSeconds * 1e3 });
  }
  return value;
}
__name(cached, "cached");
async function pool(items, size, worker) {
  const queue = items.slice();
  const runners = Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift());
  });
  await Promise.all(runners);
}
__name(pool, "pool");
function shapeAircraft(ac) {
  if (!ac) return null;
  let lat = ac.lat, lon = ac.lon, seenPos = ac.seen_pos;
  if ((lat == null || lon == null) && ac.lastPosition) {
    lat = ac.lastPosition.lat;
    lon = ac.lastPosition.lon;
    seenPos = ac.lastPosition.seen_pos;
  }
  if (lat == null || lon == null) return null;
  const onGround = ac.alt_baro === "ground";
  const alt = onGround ? 0 : typeof ac.alt_baro === "number" ? ac.alt_baro : typeof ac.alt_geom === "number" ? ac.alt_geom : null;
  return {
    lat: +lat,
    lon: +lon,
    alt,
    onGround,
    gs: typeof ac.gs === "number" ? Math.round(ac.gs) : null,
    rate: typeof ac.baro_rate === "number" ? ac.baro_rate : typeof ac.geom_rate === "number" ? ac.geom_rate : null,
    track: typeof ac.track === "number" ? ac.track : typeof ac.true_heading === "number" ? ac.true_heading : null,
    callsign: (ac.flight || "").trim() || null,
    hex: ac.hex ? String(ac.hex).replace(/^~/, "").toUpperCase() : null,
    icaoType: ac.t || null,
    desc: ac.desc || null,
    ownOp: ac.ownOp || null,
    year: ac.year ? parseInt(ac.year, 10) || null : null,
    seenPos: typeof seenPos === "number" ? Math.round(seenPos) : typeof ac.seen === "number" ? Math.round(ac.seen) : null
  };
}
__name(shapeAircraft, "shapeAircraft");
var liveErrors = [];
var noteErr = /* @__PURE__ */ __name((base, e) => {
  liveErrors.push(`${new URL(base).host}: ${e.name === "AbortError" ? "timed out" : e.message}`);
  if (liveErrors.length > 20) liveErrors.splice(0, liveErrors.length - 20);
}, "noteErr");
var LIVE_BATCH_SOURCES = [
  "https://api.adsb.lol/v2/reg/",
  "https://api.airplanes.live/v2/reg/"
  // backup only: its free tier allows about 500 requests a day
];
async function fetchLiveMany(regs, env) {
  regs = [...new Set(regs.map(normReg).filter(Boolean))];
  if (!regs.length) return {};
  let lastErr = null;
  for (const base of LIVE_BATCH_SOURCES) {
    try {
      const headers = {};
      if (env && env.ADSBLOL_API_KEY && base.includes("adsb.lol")) headers["api-auth"] = env.ADSBLOL_API_KEY;
      const out = {};
      for (let i = 0; i < regs.length; i += 60) {
        const chunk = regs.slice(i, i + 60);
        const j = await getJSON(base + chunk.map(encodeURIComponent).join(","), { headers }, 9e3);
        const list = j.__notFound ? [] : j.ac || j.aircraft || [];
        chunk.forEach((r) => {
          out[r] = null;
        });
        for (const ac of list) {
          const r = normReg(ac.r);
          if (r && r in out && !out[r]) out[r] = shapeAircraft(ac);
        }
      }
      return out;
    } catch (e) {
      lastErr = e;
      noteErr(base, e);
    }
  }
  throw lastErr || new Error("No live source answered");
}
__name(fetchLiveMany, "fetchLiveMany");
async function fetchLiveOne(reg, env) {
  const r = normReg(reg);
  const out = await fetchLiveMany([r], env);
  return out[r] || null;
}
__name(fetchLiveOne, "fetchLiveOne");
function airportOf(a) {
  if (!a || a.latitude == null) return null;
  return {
    code: a.iata_code || a.icao_code || "",
    icao: a.icao_code || null,
    name: a.name || a.municipality || "",
    city: a.municipality || "",
    country: a.country_name || "",
    lat: +a.latitude,
    lon: +a.longitude
  };
}
__name(airportOf, "airportOf");
async function routeFromAdsbdb(callsign) {
  return cached("route:" + callsign, 6 * 3600, async () => {
    try {
      const j = await getJSON(`${ADSBDB}/callsign/${encodeURIComponent(callsign)}`);
      const fr = j && j.response && j.response.flightroute;
      if (!fr) return null;
      const from = airportOf(fr.origin), to = airportOf(fr.destination);
      if (!from || !to) return null;
      return {
        from,
        to,
        airline: fr.airline ? { name: fr.airline.name || null, icao: fr.airline.icao || null } : null
      };
    } catch (e) {
      return null;
    }
  });
}
__name(routeFromAdsbdb, "routeFromAdsbdb");
function airportOfLol(a) {
  if (!a || a.lat == null || a.lon == null) return null;
  return { code: a.iata || a.icao || "", icao: a.icao || null, name: a.name || a.location || "", city: a.location || "", country: "", lat: +a.lat, lon: +a.lon };
}
__name(airportOfLol, "airportOfLol");
async function routeFromAdsbLol(callsign, pos) {
  return cached("route2:" + callsign, 1800, async () => {
    try {
      const j = await getJSON("https://api.adsb.lol/api/0/routeset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planes: [{ callsign, lat: pos.lat, lng: pos.lon }] })
      });
      const r = Array.isArray(j) ? j[0] : null;
      if (!r || r.plausible === false || r.plausible === 0) return null;
      const aps = Array.isArray(r._airports) ? r._airports : [];
      if (aps.length < 2) return null;
      const from = airportOfLol(aps[0]), to = airportOfLol(aps[aps.length - 1]);
      return from && to ? { from, to, airline: null } : null;
    } catch (e) {
      return null;
    }
  });
}
__name(routeFromAdsbLol, "routeFromAdsbLol");
async function fetchRoute(callsign, pos) {
  if (!callsign) return null;
  const a = await routeFromAdsbdb(callsign);
  if (a && (!pos || plausible(a, pos))) return a;
  if (!pos) return null;
  const b = await routeFromAdsbLol(callsign, pos);
  return b && plausible(b, pos) ? b : null;
}
__name(fetchRoute, "fetchRoute");
function dateOf(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const d2 = new Date(v > 1e11 ? v : v * 1e3);
    return isNaN(d2) ? null : d2.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (/^\d{4}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}
__name(dateOf, "dateOf");
async function fetchAircraftDetails(hex) {
  if (!hex) return null;
  hex = String(hex).toLowerCase().replace(/[^0-9a-f]/g, "");
  if (hex.length !== 6) return null;
  return cached("details:" + hex, 7 * 24 * 3600, async () => {
    try {
      const j = await getJSON(`https://opensky-network.org/api/metadata/aircraft/icao/${hex}`);
      if (!j || j.__notFound) return null;
      const out = {
        built: dateOf(j.built),
        firstFlight: dateOf(j.firstFlightDate),
        msn: j.serialNumber || null,
        line: j.lineNumber || null,
        engines: j.engines || null,
        model: j.model || null,
        manufacturer: j.manufacturerName || null,
        owner: j.owner || null,
        operator: j.operator || null,
        registered: dateOf(j.registered)
      };
      return Object.values(out).some(Boolean) ? out : null;
    } catch (e) {
      return null;
    }
  });
}
__name(fetchAircraftDetails, "fetchAircraftDetails");
async function fetchAircraftInfo(reg) {
  return cached("aircraft:" + reg, 7 * 24 * 3600, async () => {
    const j = await getJSON(`${ADSBDB}/aircraft/${encodeURIComponent(reg)}`);
    const a = j && j.response && j.response.aircraft;
    if (!a) return { found: false };
    return {
      found: true,
      hex: a.mode_s || null,
      icaoType: a.icao_type || null,
      type: a.type || null,
      manufacturer: a.manufacturer || null,
      owner: a.registered_owner || null,
      operatorIcao: a.registered_owner_operator_flag_code || null,
      country: a.registered_owner_country_name || null,
      photo: a.url_photo_thumbnail || a.url_photo || null
    };
  });
}
__name(fetchAircraftInfo, "fetchAircraftInfo");
function distKm(a, b) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
__name(distKm, "distKm");
function bearingDeg(a, b) {
  const r = Math.PI / 180, y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}
__name(bearingDeg, "bearingDeg");
function plausible(route, pos) {
  if (!route || !pos) return false;
  const total = distKm(route.from, route.to);
  if (total < 30) return false;
  const fromO = distKm(route.from, pos), toD = distKm(pos, route.to);
  if (fromO + toD > total * 1.15 + 100) return false;
  if (typeof pos.track === "number" && fromO > 150 && toD > 150) {
    const want = bearingDeg(pos, route.to);
    const off = Math.abs((pos.track - want + 540) % 360 - 180);
    if (off > 60) return false;
  }
  return true;
}
__name(plausible, "plausible");

// functions/api/lookup.js
async function onRequestGet({ request, env }) {
  const reg = normReg(new URL(request.url).searchParams.get("reg"));
  if (!reg || reg.length < 3) return json({ error: "Type a registration, for example G-JZHA." }, 400);
  const [info, live] = await Promise.all([
    fetchAircraftInfo(reg).catch(() => ({ found: false, failed: true })),
    cached("live:" + reg, 20, () => fetchLiveOne(reg, env)).catch(() => null)
  ]);
  if (live && live.callsign && !live.onGround) {
    live.route = await fetchRoute(live.callsign, live);
  }
  const out = { reg, ...info, live };
  if (!out.icaoType && live && live.icaoType) out.icaoType = live.icaoType;
  if (!out.type && live && live.desc) out.type = live.desc;
  if (!out.owner && live && live.ownOp) out.owner = live.ownOp;
  out.found = !!(out.found || out.icaoType || live);
  return json(out);
}
__name(onRequestGet, "onRequestGet");

// functions/api/positions.js
var positions_exports = {};
__export(positions_exports, {
  onRequestGet: () => onRequestGet2,
  onRequestPost: () => onRequestPost
});
var MAX_REGS = 120;
async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Send a JSON body like {"regs":["G-JZHA"]}' }, 400);
  }
  const regs = [...new Set((body.regs || []).map(normReg).filter(Boolean))].slice(0, MAX_REGS);
  if (!regs.length) return json({ at: Date.now(), planes: {}, errors: 0 });
  let planes = {}, failed = [];
  try {
    const key = "many:" + regs.slice().sort().join(",");
    planes = await cached(key, 15, () => fetchLiveMany(regs, env));
  } catch (e) {
    failed = regs.slice();
    regs.forEach((r) => {
      planes[r] = null;
    });
  }
  const errors = failed.length;
  await pool(Object.keys(planes).filter((r) => planes[r] && planes[r].callsign && !planes[r].onGround).slice(0, 20), 4, async (reg) => {
    const p = planes[reg];
    p.route = await fetchRoute(p.callsign, p);
  });
  return json({ at: Date.now(), planes, errors, failed, sourceErrors: failed.length ? [...new Set(liveErrors.slice(-8))] : [] });
}
__name(onRequestPost, "onRequestPost");
async function onRequestGet2({ request, env }) {
  const url = new URL(request.url);
  const regs = (url.searchParams.get("regs") || "").split(",");
  return onRequestPost({ request: new Request(request.url, { method: "POST", body: JSON.stringify({ regs }) }), env });
}
__name(onRequestGet2, "onRequestGet");

// functions/api/airport.js
var airport_exports = {};
__export(airport_exports, {
  onRequestGet: () => onRequestGet3
});
var RADIUS_NM = 25;
function metarOf(m) {
  if (!m) return null;
  const clouds = Array.isArray(m.clouds) ? m.clouds.map((c) => ({ cover: c.cover, base: c.base })) : [];
  return {
    station: m.icaoId || null,
    name: m.name || null,
    raw: m.rawOb || null,
    time: m.reportTime || (m.obsTime ? new Date(m.obsTime * 1e3).toISOString() : null),
    wdir: m.wdir === "VRB" ? "VRB" : typeof m.wdir === "number" ? m.wdir : null,
    wspd: typeof m.wspd === "number" ? m.wspd : null,
    wgst: typeof m.wgst === "number" ? m.wgst : null,
    temp: typeof m.temp === "number" ? m.temp : null,
    visib: m.visib != null ? String(m.visib) : null,
    wx: m.wxString || null,
    cover: m.cover || null,
    clouds,
    cat: m.fltCat || null
  };
}
__name(metarOf, "metarOf");
function distNm(lat1, lon1, lat2, lon2) {
  const R = 3440.1, r = Math.PI / 180;
  const h = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
__name(distNm, "distNm");
function phaseOf(ac, elev) {
  const ground = ac.alt_baro === "ground";
  const alt = ground ? elev : typeof ac.alt_baro === "number" ? ac.alt_baro : typeof ac.alt_geom === "number" ? ac.alt_geom : null;
  if (alt == null) return null;
  const agl = alt - elev;
  const rate = typeof ac.baro_rate === "number" ? ac.baro_rate : typeof ac.geom_rate === "number" ? ac.geom_rate : 0;
  const gs = typeof ac.gs === "number" ? ac.gs : 0;
  if (ground || agl < 200 && gs < 80) return { phase: "ground", alt: 0 };
  if (agl >= 12e3) return { phase: "high", alt };
  if (rate <= -300) return { phase: "landing", alt };
  if (rate >= 300) return { phase: "departing", alt };
  return { phase: "nearby", alt };
}
__name(phaseOf, "phaseOf");
async function traffic(lat, lon, elev, env) {
  const paths = [
    `https://api.adsb.lol/v2/point/${lat}/${lon}/${RADIUS_NM}`,
    `https://api.airplanes.live/v2/point/${lat}/${lon}/${RADIUS_NM}`
  ];
  let list = null, lastErr;
  for (const u of paths) {
    try {
      const headers = env && env.ADSBLOL_API_KEY && u.includes("adsb.lol") ? { "api-auth": env.ADSBLOL_API_KEY } : {};
      const j = await getJSONPublic(u, { headers });
      list = j.ac || j.aircraft || [];
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!list) throw lastErr || new Error("No traffic source answered");
  const out = [];
  let overhead = 0;
  for (const ac of list) {
    if (ac.lat == null || ac.lon == null) continue;
    if (typeof ac.category === "string" && /^C/.test(ac.category)) continue;
    if (!ac.r && !ac.flight && !ac.t) continue;
    const ph = phaseOf(ac, elev);
    if (!ph) continue;
    if (ph.phase === "high") {
      overhead++;
      continue;
    }
    out.push({
      key: (ac.hex || ac.r || ac.flight || "").toString().replace(/^~/, "").toUpperCase(),
      reg: ac.r || null,
      type: ac.t || null,
      desc: ac.desc || null,
      callsign: (ac.flight || "").trim() || null,
      alt: ph.alt,
      gs: typeof ac.gs === "number" ? Math.round(ac.gs) : null,
      rate: typeof ac.baro_rate === "number" ? ac.baro_rate : typeof ac.geom_rate === "number" ? ac.geom_rate : null,
      track: typeof ac.track === "number" ? ac.track : typeof ac.true_heading === "number" ? ac.true_heading : null,
      lat: ac.lat,
      lon: ac.lon,
      dist: Math.round(distNm(lat, lon, ac.lat, ac.lon) * 10) / 10,
      phase: ph.phase
    });
  }
  const order = { landing: 0, departing: 1, nearby: 2, ground: 3 };
  out.sort((a, b) => order[a.phase] - order[b.phase] || a.dist - b.dist);
  return { traffic: out.slice(0, 40), overhead };
}
__name(traffic, "traffic");
async function onRequestGet3({ request, env }) {
  const u = new URL(request.url);
  const icao = (u.searchParams.get("icao") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  const lat = Math.round(parseFloat(u.searchParams.get("lat")) * 1e3) / 1e3;
  const lon = Math.round(parseFloat(u.searchParams.get("lon")) * 1e3) / 1e3;
  const elev = parseInt(u.searchParams.get("elev") || "0", 10) || 0;
  if (!isFinite(lat) || !isFinite(lon)) return json({ error: "Missing airport position." }, 400);
  const [metar, tr] = await Promise.all([
    icao.length === 4 ? cached("metar:" + icao, 300, async () => {
      try {
        const j = await getJSONPublic(`https://aviationweather.gov/api/data/metar?ids=${icao}&format=json`);
        return metarOf(Array.isArray(j) ? j[0] : null);
      } catch (e) {
        return null;
      }
    }) : Promise.resolve(null),
    u.searchParams.get("traffic") === "0" ? Promise.resolve(null) : cached(`traffic:${lat},${lon}`, 12, () => traffic(lat, lon, elev, env)).catch(() => null)
  ]);
  if (tr) {
    const want = tr.traffic.filter((t) => t.callsign && t.phase !== "ground").slice(0, 10);
    await Promise.all(want.map(async (t) => {
      const r = await fetchRoute(t.callsign, { lat: t.lat, lon: t.lon });
      if (r) t.route = { from: r.from.code, fromName: r.from.city || r.from.name, to: r.to.code, toName: r.to.city || r.to.name };
    }));
  }
  return json({ at: Date.now(), metar, traffic: tr ? tr.traffic : null, overhead: tr ? tr.overhead : 0 });
}
__name(onRequestGet3, "onRequestGet");

// lib/db.js
function db(env) {
  const url = env.SUPABASE_URL, key = env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  const base = { apikey: key };
  if (key.startsWith("eyJ")) base.Authorization = "Bearer " + key;
  const req = /* @__PURE__ */ __name(async (path, init = {}) => {
    const r = await fetch(`${url}${path}`, { ...init, headers: { ...base, "Content-Type": "application/json", ...init.headers || {} } });
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  }, "req");
  return {
    get: /* @__PURE__ */ __name((path) => req(`/rest/v1/${path}`), "get"),
    upsert: /* @__PURE__ */ __name((table, rows, onConflict) => rows.length ? req(`/rest/v1/${table}${onConflict ? `?on_conflict=${onConflict}` : ""}`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows)
    }) : null, "upsert"),
    del: /* @__PURE__ */ __name((path) => req(`/rest/v1/${path}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }), "del"),
    // Temporary links to private photos and videos.
    async signMedia(paths, expiresIn) {
      if (!paths.length) return {};
      const out = {};
      for (let i = 0; i < paths.length; i += 200) {
        const rows = await req("/storage/v1/object/sign/media", { method: "POST", body: JSON.stringify({ expiresIn, paths: paths.slice(i, i + 200) }) });
        (rows || []).forEach((r) => {
          if (r.signedURL && r.path) out[r.path] = `${url}/storage/v1${r.signedURL.startsWith("/") ? "" : "/"}${r.signedURL}`;
        });
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
      const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: "Bearer " + token } });
      if (!r.ok) return null;
      const u = await r.json();
      return u && u.id ? u : null;
    }
  };
}
__name(db, "db");

// lib/push.js
var enc = new TextEncoder();
var b64u = {
  encode(buf) {
    const b = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  decode(str) {
    const s = atob(str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
};
var concat = /* @__PURE__ */ __name((...parts) => {
  const len = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(len);
  let o = 0;
  parts.forEach((p) => {
    out.set(p, o);
    o += p.length;
  });
  return out;
}, "concat");
async function generateVapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  return { publicKey: b64u.encode(pub), privateKey: jwk.d };
}
__name(generateVapidKeys, "generateVapidKeys");
async function vapidHeader(endpoint, vapid) {
  const pub = b64u.decode(vapid.publicKey);
  const key = await crypto.subtle.importKey("jwk", {
    kty: "EC",
    crv: "P-256",
    d: vapid.privateKey,
    x: b64u.encode(pub.slice(1, 33)),
    y: b64u.encode(pub.slice(33, 65)),
    ext: true
  }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u.encode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u.encode(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1e3) + 12 * 3600, sub: vapid.subject })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${claims}`));
  return `vapid t=${head}.${claims}.${b64u.encode(sig)}, k=${vapid.publicKey}`;
}
__name(vapidHeader, "vapidHeader");
async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}
__name(hkdf, "hkdf");
async function encryptPayload(payload, p256dh, authSecret) {
  const uaPublic = b64u.decode(p256dh), auth = b64u.decode(authSecret);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plain = concat(enc.encode(payload), new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, plain));
  const header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}
__name(encryptPayload, "encryptPayload");
async function sendPush(sub, message, vapid) {
  try {
    const body = await encryptPayload(JSON.stringify(message), sub.p256dh, sub.auth);
    const r = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: await vapidHeader(sub.endpoint, vapid),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "3600",
        Urgency: "high"
      },
      body
    });
    if (r.status === 404 || r.status === 410) return "gone";
    return r.ok ? "ok" : "error";
  } catch (e) {
    return "error";
  }
}
__name(sendPush, "sendPush");
var vapidCache = null;
async function getVapid(d, env) {
  if (vapidCache) return vapidCache;
  const rows = await d.get("app_secrets?name=eq.vapid&select=value");
  let v = rows && rows[0] ? JSON.parse(rows[0].value) : null;
  if (!v) {
    v = await generateVapidKeys();
    await d.upsert("app_secrets", [{ name: "vapid", value: JSON.stringify(v) }], "name");
  }
  vapidCache = { ...v, subject: env.VAPID_SUBJECT || "https://spottersdream.joshnaylor.workers.dev" };
  return vapidCache;
}
__name(getVapid, "getVapid");

// functions/api/push.js
async function onRequest({ request, env }) {
  const d = db(env);
  if (!d) {
    const missing = ["SUPABASE_URL", "SUPABASE_SECRET_KEY"].filter((k) => !env[k]);
    return json({ error: "Notifications aren't set up yet.", missing, hint: "Add these under the worker's Settings -> Variables and Secrets (not the Build section)." }, 503);
  }
  const path = new URL(request.url).pathname;
  if (path.endsWith("/key") && request.method === "GET") {
    try {
      const v = await getVapid(d, env);
      return json({ publicKey: v.publicKey });
    } catch (e) {
      return json({ error: "Couldn't load the notification key. Has database update 3 been run?" }, 500);
    }
  }
  if (path.endsWith("/test") && request.method === "POST") {
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const user = await d.userFromToken(token);
    if (!user) return json({ error: "Please sign in again." }, 401);
    const subs = await d.get(`push_subscriptions?select=*&user_id=eq.${user.id}`);
    if (!subs.length) return json({ error: "This device isn't signed up for notifications yet." }, 400);
    const vapid = await getVapid(d, env);
    let ok = 0;
    for (const s of subs) {
      const res = await sendPush(s, { title: "Alerts are working!", body: "You'll get a message like this when one of your planes is nearby.", url: "/" }, vapid);
      if (res === "gone") await d.del(`push_subscriptions?id=eq.${s.id}`).catch(() => {
      });
      if (res === "ok") ok++;
    }
    return ok ? json({ sent: ok }) : json({ error: "The notification couldn't be delivered. Try turning notifications off and on again." }, 502);
  }
  return json({ error: "Not found" }, 404);
}
__name(onRequest, "onRequest");

// functions/api/aircraft.js
var aircraft_exports = {};
__export(aircraft_exports, {
  onRequestGet: () => onRequestGet4
});
async function onRequestGet4({ request, env }) {
  const u = new URL(request.url);
  const reg = normReg(u.searchParams.get("reg"));
  let hex = (u.searchParams.get("hex") || "").toUpperCase().replace(/[^0-9A-F]/g, "");
  if (!reg && !hex) return json({ error: "Send a registration." }, 400);
  let live = null;
  if (!hex && reg) {
    const info = await fetchAircraftInfo(reg).catch(() => null);
    hex = info && info.hex ? info.hex : "";
  }
  if (!hex && reg) {
    live = await cached("live:" + reg, 20, () => fetchLiveOne(reg, env)).catch(() => null);
    hex = live && live.hex ? live.hex : "";
  }
  const d = await fetchAircraftDetails(hex);
  let year = null;
  if (!(d && (d.built || d.firstFlight)) && reg) {
    if (!live) live = await cached("live:" + reg, 20, () => fetchLiveOne(reg, env)).catch(() => null);
    year = live && live.year ? live.year : null;
  }
  return json({ reg, hex: hex || null, ...d || {}, year }, 200, 3600);
}
__name(onRequestGet4, "onRequestGet");

// functions/api/routes.js
var routes_exports = {};
__export(routes_exports, {
  onRequestPost: () => onRequestPost2
});
async function onRequestPost2({ request }) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Send a JSON body." }, 400);
  }
  const flights = (body.flights || []).filter((f) => f && f.reg && f.callsign && isFinite(f.lat) && isFinite(f.lon)).slice(0, 20);
  const routes = {};
  await pool(flights, 4, async (f) => {
    routes[f.reg] = await fetchRoute(String(f.callsign).trim().toUpperCase(), { lat: +f.lat, lon: +f.lon, track: typeof f.track === "number" ? f.track : null }).catch(() => null);
  });
  return json({ routes });
}
__name(onRequestPost2, "onRequestPost");

// functions/api/share.js
var MEDIA_LINK_SECONDS = 24 * 3600;
var cache = null;
function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(newToken, "newToken");
async function getShare(d) {
  const rows = await d.get("app_secrets?name=eq.share&select=value");
  return rows && rows[0] ? JSON.parse(rows[0].value) : null;
}
__name(getShare, "getShare");
var saveShare = /* @__PURE__ */ __name((d, v) => d.upsert("app_secrets", [{ name: "share", value: JSON.stringify(v) }], "name"), "saveShare");
async function requireAdmin(d, request) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const user = await d.userFromToken(token);
  if (!user) return null;
  return await d.roleOf(user.id) === "admin" ? user : null;
}
__name(requireAdmin, "requireAdmin");
async function publicLogbook(d, share) {
  const [planes, sightings, media] = await Promise.all([
    d.get("planes?select=*&order=created_at"),
    d.get("sightings?select=*&order=spotted_on.desc"),
    d.get("media?select=id,sighting_id,kind,path,poster_path,created_at&order=created_at")
  ]);
  const paths = [];
  media.forEach((m) => {
    paths.push(m.path);
    if (m.poster_path) paths.push(m.poster_path);
  });
  const urls = await d.signMedia(paths, MEDIA_LINK_SECONDS);
  const mediaBy = {};
  media.forEach((m) => {
    (mediaBy[m.sighting_id] = mediaBy[m.sighting_id] || []).push({
      id: m.id,
      kind: m.kind,
      url: urls[m.path] || null,
      poster: m.poster_path ? urls[m.poster_path] || null : m.kind === "photo" ? urls[m.path] || null : null
    });
  });
  const sightBy = {};
  sightings.forEach((s) => {
    (sightBy[s.plane_id] = sightBy[s.plane_id] || []).push({
      id: s.id,
      airport: s.airport,
      spotted_on: s.spotted_on,
      created_at: s.created_at,
      note: share.notes ? s.note : "",
      media: mediaBy[s.id] || []
    });
  });
  return planes.map((p) => ({
    id: p.id,
    reg: p.reg,
    hex: p.hex,
    icao_type: p.icao_type,
    type_name: p.type_name,
    airline: p.airline,
    airline_icao: p.airline_icao,
    details: p.details || null,
    last: p.last_seen_at && p.last_lat != null ? { lat: p.last_lat, lon: p.last_lon, alt: p.last_alt, track: p.last_track, onGround: !!p.last_on_ground, at: Date.parse(p.last_seen_at) } : null,
    sightings: sightBy[p.id] || []
  })).filter((p) => p.sightings.length);
}
__name(publicLogbook, "publicLogbook");
async function onRequest2({ request, env }) {
  const d = db(env);
  if (!d) return json({ error: "Sharing isn't set up yet." }, 503);
  const path = new URL(request.url).pathname;
  if (path.startsWith("/api/public/")) {
    const token = decodeURIComponent(path.slice("/api/public/".length));
    const share = await getShare(d).catch(() => null);
    if (!share || !share.enabled || !token || token !== share.token) return json({ error: "This link has been turned off or doesn't exist." }, 404);
    if (cache && cache.token === token && cache.notes === !!share.notes && Date.now() - cache.at < 6e4) return json(cache.body);
    const body = { planes: await publicLogbook(d, share), at: Date.now() };
    cache = { token, notes: !!share.notes, at: Date.now(), body };
    return json(body);
  }
  if (path === "/api/share") {
    const admin = await requireAdmin(d, request);
    if (!admin) return json({ error: "Only the admin account can manage the share link." }, 403);
    let share = await getShare(d).catch(() => null);
    if (request.method === "GET") return json(share && share.enabled ? share : { enabled: false });
    if (request.method === "DELETE") {
      await saveShare(d, { enabled: false });
      cache = null;
      return json({ enabled: false });
    }
    const body = await request.json().catch(() => ({}));
    if (request.method === "POST") {
      share = { enabled: true, token: newToken(), notes: !!body.notes, created: (/* @__PURE__ */ new Date()).toISOString() };
      await saveShare(d, share);
      cache = null;
      return json(share);
    }
    if (request.method === "PATCH") {
      if (!share || !share.enabled) return json({ error: "Sharing is off." }, 400);
      share.notes = !!body.notes;
      await saveShare(d, share);
      cache = null;
      return json(share);
    }
  }
  return json({ error: "Not found" }, 404);
}
__name(onRequest2, "onRequest");

// lib/cron.js
var PLANES_PER_RUN = 60;
var LIVE_MAX_AGE_S = 120;
var MIN_GAP_MS = 20 * 6e4;
function miles(aLat, aLon, bLat, bLon) {
  const R = 3958.8, r = Math.PI / 180;
  const h = Math.sin((bLat - aLat) * r / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin((bLon - aLon) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
__name(miles, "miles");
function ukHour(date = /* @__PURE__ */ new Date()) {
  return parseInt(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", hour12: false }).format(date), 10) % 24;
}
__name(ukHour, "ukHour");
function inQuiet(start, end, hour) {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}
__name(inQuiet, "inQuiet");
var fmtFt = /* @__PURE__ */ __name((n) => Math.round(n).toLocaleString("en-GB"), "fmtFt");
var compass = /* @__PURE__ */ __name((d) => ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(((d || 0) % 360 + 360) % 360 / 45) % 8], "compass");
function evaluate(alert, L, settings, hour) {
  const state = { ...alert.state || {} };
  const visible = L && L.seenPos != null && L.seenPos <= LIVE_MAX_AGE_S;
  const quiet = inQuiet(settings.quiet_start ?? 21, settings.quiet_end ?? 7, hour);
  const recently = alert.last_fired_at && Date.now() - Date.parse(alert.last_fired_at) < MIN_GAP_MS;
  let message = null;
  const reg = alert.reg;
  if (alert.kind === "near") {
    let lat = alert.lat, lon = alert.lon, name = alert.place_name || "your spot";
    if (alert.place === "home") {
      lat = settings.home_lat;
      lon = settings.home_lon;
      name = "home";
    }
    if (alert.place === "me") {
      lat = settings.here_lat;
      lon = settings.here_lon;
      name = "you";
    }
    if (lat == null || lon == null || !visible) return { state, message };
    const d = miles(lat, lon, L.lat, L.lon), r = alert.radius_mi;
    const inside = d <= r ? true : d > r * 1.2 ? false : !!state.inside;
    if (inside && !state.inside && !quiet && !recently) {
      const where = L.onGround ? "on the ground" : `at ${fmtFt(L.alt || 0)} ft, heading ${compass(L.track)}`;
      message = {
        title: `${reg} is nearby!`,
        body: `${reg} is ${d < 1 ? "less than a mile" : Math.round(d) + (Math.round(d) === 1 ? " mile" : " miles")} from ${name}, ${where}.${L.onGround ? "" : " Look up!"}`
      };
    }
    state.inside = inside;
    state.dist = Math.round(d * 10) / 10;
    return { state, message };
  }
  if (!visible) return { state, message };
  const phase = L.onGround ? "ground" : "air";
  const prev = state.phase;
  const rate = L.rate || 0, alt = L.alt || 0;
  if (alert.kind === "takeoff") {
    const justOff = phase === "air" && (prev === "ground" || prev !== "air" && alt < 8e3 && rate > 300);
    if (justOff && !quiet && !recently) {
      message = { title: `${reg} has taken off!`, body: `${reg} just took off and is climbing through ${fmtFt(alt)} ft, heading ${compass(L.track)}.` };
    }
  }
  if (alert.kind === "landing") {
    if (phase === "air" && alt > 8e3) state.finals = false;
    const finals = phase === "air" && alt < 2500 && rate < -300 && !state.finals;
    const touchdown = phase === "ground" && prev === "air" && !state.finals;
    if ((finals || touchdown) && !quiet && !recently) {
      message = finals ? { title: `${reg} is coming in to land!`, body: `${reg} is on its final approach, ${fmtFt(alt)} ft up and descending.` } : { title: `${reg} has landed!`, body: `${reg} has just touched down.` };
    }
    if (finals || touchdown) state.finals = true;
  }
  state.phase = phase;
  return { state, message };
}
__name(evaluate, "evaluate");
async function runCron(env) {
  const d = db(env);
  if (!d) return { skipped: "Supabase secret key not set" };
  const [alerts, settingsRows, planes] = await Promise.all([
    d.get("alerts?active=eq.true&select=*").catch(() => []),
    d.get("user_settings?select=*").catch(() => []),
    d.get("planes?select=id,reg,last_lat,last_lon,last_alt,last_track,last_on_ground,last_seen_at,last_checked_at&order=last_checked_at.asc.nullsfirst&limit=500")
  ]);
  const settings = Object.fromEntries((settingsRows || []).map((s) => [s.user_id, s]));
  const alertRegs = [...new Set((alerts || []).map((a) => a.reg))].slice(0, PLANES_PER_RUN);
  const rotate = (/* @__PURE__ */ new Date()).getUTCMinutes() % 10 === 0;
  const rotation = rotate ? planes.filter((p) => !alertRegs.includes(p.reg)).slice(0, Math.max(0, PLANES_PER_RUN - alertRegs.length)).map((p) => p.reg) : [];
  const regs = [...alertRegs, ...rotation];
  if (!regs.length) return { checked: 0, alerts: 0, fired: 0, sent: 0 };
  let live = {};
  try {
    live = await fetchLiveMany(regs, env);
  } catch (e) {
    regs.forEach((r) => {
      live[r] = void 0;
    });
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const byReg = Object.fromEntries(planes.map((p) => [p.reg, p]));
  const posRows = regs.filter((r) => byReg[r] && live[r] !== void 0).map((r) => {
    const p = byReg[r], L = live[r];
    const ok = L && L.seenPos != null && L.seenPos <= LIVE_MAX_AGE_S;
    return {
      id: p.id,
      reg: p.reg,
      last_lat: ok ? L.lat : p.last_lat,
      last_lon: ok ? L.lon : p.last_lon,
      last_alt: ok ? L.alt == null ? null : Math.round(L.alt) : p.last_alt,
      last_track: ok ? L.track : p.last_track,
      last_on_ground: ok ? !!L.onGround : p.last_on_ground,
      last_seen_at: ok ? now : p.last_seen_at,
      last_checked_at: now
    };
  });
  await d.upsert("planes", posRows, "id").catch(() => {
  });
  const hour = ukHour();
  const fired = [], changed = [];
  for (const a of alerts || []) {
    if (live[a.reg] === void 0) continue;
    const { state, message } = evaluate(a, live[a.reg], settings[a.user_id] || {}, hour);
    const row = { ...a, state };
    if (message) {
      row.last_fired_at = now;
      fired.push({ alert: a, message });
    }
    if (message || JSON.stringify(state) !== JSON.stringify(a.state || {})) changed.push(row);
  }
  if (changed.length) await d.upsert("alerts", changed, "id").catch(() => {
  });
  let sent = 0;
  if (fired.length) {
    const users = [...new Set(fired.map((f) => f.alert.user_id))];
    const subs = await d.get(`push_subscriptions?select=*&user_id=in.(${users.join(",")})`).catch(() => []);
    const vapid = await getVapid(d, env);
    for (const f of fired) {
      for (const s of subs.filter((s2) => s2.user_id === f.alert.user_id)) {
        const res = await sendPush(s, { ...f.message, url: `/?plane=${encodeURIComponent(f.alert.reg)}`, tag: f.alert.id }, vapid);
        if (res === "gone") await d.del(`push_subscriptions?id=eq.${s.id}`).catch(() => {
        });
        if (res === "ok") sent++;
      }
    }
  }
  return { checked: regs.length, positions: posRows.length, alerts: (alerts || []).length, fired: fired.length, sent };
}
__name(runCron, "runCron");

// worker/index.js
var ROUTES = { "/api/lookup": lookup_exports, "/api/positions": positions_exports, "/api/airport": airport_exports, "/api/aircraft": aircraft_exports, "/api/routes": routes_exports };
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/share" || url.pathname.startsWith("/api/public/")) {
      try {
        return await onRequest2({ request, env, ctx });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Something went wrong loading the shared logbook." }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }
    if (url.pathname.startsWith("/api/push/")) {
      try {
        return await onRequest({ request, env, ctx });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Something went wrong with notifications." }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }
    const mod = ROUTES[url.pathname];
    if (mod) {
      const handler = request.method === "POST" ? mod.onRequestPost : request.method === "GET" ? mod.onRequestGet : null;
      if (!handler) return new Response("Method not allowed", { status: 405 });
      try {
        return await handler({ request, env, ctx });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Something went wrong fetching flight data." }), { status: 502, headers: { "Content-Type": "application/json" } });
      }
    }
    if (url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });
    return env.ASSETS.fetch(request);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCron(env).then((r) => console.log("cron", JSON.stringify(r))).catch((e) => console.log("cron failed", e.message)));
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
