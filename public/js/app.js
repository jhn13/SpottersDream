import { PLANE_D, AIRPORT_LIST, AIRPORTS, AIRLINES, liveryFor, typeInfo } from './data.js';
import { createStore } from './store.js';
import { preparePhoto, prepareVideo, readExif } from './media.js';
import { createMap, arc } from './map.js';

const d3 = window.d3, topojson = window.topojson;
const EARTH_MI = 3958.8, EARTH_KM = 6371;
const LIVE_MAX_AGE_S = 120;
const KEEP_LIVE_ON_ERROR_MS = 5 * 60000;

/* ================= small helpers ================= */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = d => { const x = new Date(d + "T12:00:00"); return isNaN(x) ? d : x.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };
const fmtAgo = m => m < 1.5 ? "just now" : m < 60 ? `${Math.round(m)} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} hours ago` : `${Math.round(m / 1440)} days ago`;
const agoShort = m => m < 60 ? `${Math.max(1, Math.round(m))}m` : m < 48 * 60 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
const num = n => Math.round(n).toLocaleString("en-GB");
const todayISO = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const ICON_CLOCK = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const CLOSE_SVG = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
let toastT;
function toast(m, ms = 3500) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms); }

/* ================= airports ================= */
// Bundled list for the "Spotted at" menu, plus ~3,300 airports worldwide for the map (OurAirports).
let AP_DB = [], AP_BY = {};
async function loadAirports() {
  try {
    AP_DB = await fetch("/data/airports.json").then(r => r.json());
    AP_DB.forEach(a => { a.key = a.i; AP_BY[a.i] = a; if (a.a) AP_BY[a.a] = AP_BY[a.a] || a; });
  } catch (e) { AP_DB = []; }
}
function getAirport(code) {
  if (!code) return null;
  const db = AP_BY[code];
  if (AIRPORTS[code]) return { code, n: AIRPORTS[code].n, c: AIRPORTS[code].c, db };
  if (db) return { code, n: db.n.replace(/ (International )?Airport$/i, ""), c: [db.x, db.y], db };
  return null;
}
const apName = code => { const a = getAirport(code); return a ? a.n : code; };
function nearestAirport(ll, maxKm) {
  let best = null, bd = Infinity;
  const list = AP_DB.length ? AP_DB.map(a => [a.a || a.i, a.n, a.y, a.x]) : AIRPORT_LIST;
  list.forEach(([code, n, lat, lon]) => { const d = d3.geoDistance(ll, [lon, lat]) * EARTH_KM; if (d < bd) { bd = d; best = { code, n }; } });
  return bd <= maxKm ? best : null;
}

/* ================= state ================= */
let store = null, me = null, mapApi = null;
let PLANES = [];
let feedState = { ok: true, at: 0 };
let dataLoadedAt = 0;
let selected = null, filter = "all", showPins = false;
const isAdmin = () => !!me && me.role === "admin";
const canAdd = () => !!me && (me.role === "admin" || me.role === "spotter");

const spots = p => p.sightings.length;
const latest = p => p.sightings.slice().sort((a, b) => b.spotted_on.localeCompare(a.spotted_on))[0];
const allMedia = p => p.sightings.slice().sort((a, b) => b.spotted_on.localeCompare(a.spotted_on)).flatMap(s => s.media.map(m => ({ ...m, date: s.spotted_on, sighting: s })));
const thumbOf = p => { const m = allMedia(p).find(m => m.poster); return m ? m.poster : null; };
const status = p => p.live ? "live" : p.last ? "last" : "none";
const lastAgo = p => (Date.now() - p.last.at) / 60000;
const visible = p => filter === "all" || status(p) === filter;
function posOf(p) { if (p.live) return [p.live.lon, p.live.lat]; if (p.last) return [p.last.lon, p.last.lat]; return null; }
function onGround(p) { return p.live ? !!p.live.onGround : p.last ? (p.last.onGround || (p.last.alt || 0) < 500) : false; }
function routeGeo(p) {
  const r = p.live && p.live.route; if (!r) return null;
  const A = [r.from.lon, r.from.lat], B = [r.to.lon, r.to.lat], pos = posOf(p);
  const dA = d3.geoDistance(A, pos), dB = d3.geoDistance(pos, B);
  return { A, B, pos, d: d3.geoDistance(A, B), f: dA + dB > 0 ? dA / (dA + dB) : 0 };
}

/* ================= place names ================= */
let landHi = null;
function loadCountries() {
  fetch("/data/world-hi.json").then(r => r.json()).then(w => { landHi = topojson.feature(w, w.objects.c); }).catch(() => {});
}
const NICE = { "United States of America": "the USA", "United Kingdom": "the UK", "United Arab Emirates": "the UAE", "Netherlands": "the Netherlands", "Czechia": "the Czech Republic", "Dem. Rep. Congo": "the DR Congo", "Central African Rep.": "the Central African Republic", "Philippines": "the Philippines", "Dominican Rep.": "the Dominican Republic", "Bahamas": "the Bahamas" };
function sea([lon, lat]) {
  if (lat > 66) return "the Arctic Ocean"; if (lat < -60) return "the Southern Ocean";
  if (lon > -6.6 && lon < -3 && lat > 52 && lat < 55.5) return "the Irish Sea";
  if (lon > -2 && lon < 2 && lat > 49.3 && lat < 51.1) return "the English Channel";
  if (lon > -4 && lon < 9 && lat > 51 && lat < 61) return "the North Sea";
  if (lon > -10 && lon < -1 && lat > 43 && lat < 48.5) return "the Bay of Biscay";
  if (lon > -6 && lon < 36 && lat > 30 && lat < 46) return "the Mediterranean Sea";
  if (lon > 32 && lon < 44 && lat > 12 && lat < 30) return "the Red Sea";
  if (lon > 48 && lon < 57 && lat > 23 && lat < 31) return "the Persian Gulf";
  if (lon > 50 && lon < 77 && lat > 5 && lat < 25) return "the Arabian Sea";
  if (lon > 79 && lon < 96 && lat > 5 && lat < 23) return "the Bay of Bengal";
  if (lon > 20 && lon < 120 && lat < 25) return "the Indian Ocean";
  if (lon > -100 && lon < 20) return "the Atlantic Ocean";
  return "the Pacific Ocean";
}
function countryAt(ll) { const f = landHi && landHi.features.find(f => d3.geoContains(f, ll)); return f ? (NICE[f.properties.n] || f.properties.n) : null; }
const overName = ll => countryAt(ll) || sea(ll);
function whereText(p) {
  const ll = posOf(p); if (!ll) return "";
  if (onGround(p)) { const a = nearestAirport(ll, 15); return a ? `On the ground at ${a.n}` : `On the ground in ${countryAt(ll) || "an unknown spot"}`; }
  return `Over ${overName(ll)}`;
}

/* ================= map ================= */
function chromeTop() { const r = document.querySelector(".chrome.top").getBoundingClientRect(); return Math.round(r.bottom + 8); }
function mapPadding() {
  const open = document.body.classList.contains("sheet-open"), top = chromeTop();
  if (open && innerWidth >= 768) return { top, right: 440, bottom: 24, left: 24 };
  if (open) return { top, bottom: Math.round(innerHeight * 0.62), left: 0, right: 0 };
  return { top, bottom: 24, left: 0, right: 0 };
}
function flyTo(ll, zoom) { if (!mapApi || !ll) return; setSpin(false); mapApi.flyTo(ll, zoom, mapPadding()); }

function syncMap() {
  if (!mapApi) return;
  const sel = PLANES.find(p => p.id === selected);
  mapApi.setPlanes(PLANES.filter(p => posOf(p)).map(p => {
    const st = status(p);
    return {
      id: p.id, ll: posOf(p), status: st, sel: p.id === selected, dim: !!selected && p.id !== selected,
      show: visible(p), track: p.live ? p.live.track : p.last ? p.last.track : 0,
      label: p.reg + (st === "last" ? ` · ${agoShort(lastAgo(p))} ago` : ""),
      aria: `${p.reg}, ${st === "live" ? "broadcasting now" : "last seen " + fmtAgo(lastAgo(p))}`
    };
  }));
  const feats = [];
  PLANES.forEach(p => {
    const g = routeGeo(p); if (!g || !visible(p) || p.live.onGround) return;
    const flown = arc(g.A, g.pos, 48), next = arc(g.pos, g.B, 48);
    const shift = flown[flown.length - 1][0] - next[0][0];
    if (shift) next.forEach(q => { q[0] += shift; });
    const props = { sel: p.id === selected, dim: !!selected && p.id !== selected };
    feats.push({ type: "Feature", properties: { ...props, k: "flown" }, geometry: { type: "LineString", coordinates: flown } });
    feats.push({ type: "Feature", properties: { ...props, k: "next" }, geometry: { type: "LineString", coordinates: next } });
  });
  mapApi.setRoutes(feats);
  const spotAp = sel && getAirport(latest(sel).airport);
  const g = sel && routeGeo(sel);
  const sameAsOrigin = g && spotAp && d3.geoDistance(spotAp.c, g.A) * EARTH_KM < 40;
  mapApi.setSpotLine(sel && spotAp && posOf(sel) && !sameAsOrigin ? arc(spotAp.c, posOf(sel), 40) : null);
  const counts = {};
  PLANES.forEach(p => p.sightings.forEach(s => { counts[s.airport] = (counts[s.airport] || 0) + 1; }));
  mapApi.setPins(Object.keys(counts).map(code => { const a = getAirport(code); return a ? { code, ll: a.c, count: counts[code], name: a.n, show: showPins || !!(sel && sel.sightings.some(s => s.airport === code)) } : null; }).filter(Boolean));
  const mine = new Set(); Object.keys(counts).forEach(c => { const a = getAirport(c); if (a && a.db) mine.add(a.db.i); });
  mapApi.setAirports(AP_DB.map(a => ({ type: "Feature", properties: { key: a.i, code: a.a || a.i, name: a.n.replace(/ (International )?Airport$/i, ""), s: a.s, mine: mine.has(a.i) }, geometry: { type: "Point", coordinates: [a.x, a.y] } })));
}

let spinOn = !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
function setSpin(on) { spinOn = on; $("#spin").setAttribute("aria-pressed", String(on)); if (mapApi) mapApi.setSpin(on); }

async function initMap() {
  const mode = lsGet("spotters.mapMode") === "satellite" ? "satellite" : "map";
  updStyleBtn(mode);
  try {
    mapApi = await createMap({
      container: $("#map"), mode, spin: spinOn, styleUrl: window.SPOTTERS_MAP_STYLE,
      onPlane: id => select(id, true),
      onAirport: key => openAirport(AP_BY[key]),
      onPin: code => openLogbook(code),
      onTraffic: key => highlightTraffic(key, true),
      onBackground: () => { if (document.body.classList.contains("sheet-open")) closeSheets(); },
      onSpinStop: () => { spinOn = false; $("#spin").setAttribute("aria-pressed", "false"); }
    });
    mapApi.onReady(() => syncMap());
    syncMap();
  } catch (e) {
    toast(e.message, 8000);
  }
}
function updStyleBtn(mode) {
  const b = $("#styleBtn");
  b.setAttribute("aria-label", mode === "satellite" ? "Switch to map view" : "Switch to satellite view");
  b.classList.toggle("sat", mode === "satellite");
}
$("#styleBtn").addEventListener("click", () => {
  if (!mapApi) return;
  const next = mapApi.mode === "satellite" ? "map" : "satellite";
  mapApi.setMode(next); lsSet("spotters.mapMode", next); updStyleBtn(next);
  toast(next === "satellite" ? "Satellite view" : "Map view", 1500);
});
$("#zin").addEventListener("click", () => mapApi && mapApi.zoomBy(1));
$("#zout").addEventListener("click", () => mapApi && mapApi.zoomBy(-1));
$("#zfit").addEventListener("click", () => { closeSheets(true); mapApi && mapApi.flyHome(mapPadding()); });
$("#spin").addEventListener("click", () => { const on = !spinOn; if (on) { closeSheets(true); mapApi && mapApi.flyHome(mapPadding()); setTimeout(() => setSpin(true), 1600); } else setSpin(false); });
document.querySelectorAll(".seg [data-f]").forEach(b => b.addEventListener("click", () => {
  filter = b.dataset.f; document.querySelectorAll(".seg [data-f]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  const s = PLANES.find(p => p.id === selected); if (s && !visible(s)) closeSheets();
  syncMap();
}));
$("#pinToggle").addEventListener("click", e => { showPins = !showPins; e.currentTarget.setAttribute("aria-pressed", String(showPins)); syncMap(); });

/* ================= panels ================= */
function updWelcome() {
  const w = $("#welcome");
  w.hidden = PLANES.length > 0 || !me || document.body.classList.contains("sheet-open");
  $("#welcomeTitle").textContent = canAdd() ? "Your globe is waiting" : "Nothing to see yet";
  $("#welcomeText").textContent = canAdd() ? "Log your first plane and it'll appear here, wherever it is in the world." : "No planes have been logged yet. Check back soon.";
}
function openSheet(id) {
  document.querySelectorAll(".sheet").forEach(s => s.classList.toggle("open", s.id === id));
  document.body.classList.add("sheet-open"); updWelcome();
  if (id !== "airport") stopAirport();
  const b = document.querySelector(`#${id} [data-close]`); if (b) setTimeout(() => b.focus({ preventScroll: true }), 60);
}
function closeSheets(keepView) {
  const was = document.body.classList.contains("sheet-open");
  document.querySelectorAll(".sheet").forEach(s => s.classList.remove("open"));
  document.body.classList.remove("sheet-open");
  stopAirport();
  if (selected) { selected = null; syncMap(); }
  if (was && !keepView && mapApi) mapApi.setPadding(mapPadding());
  updWelcome();
}
document.addEventListener("click", e => { if (e.target.closest("[data-close]")) closeSheets(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") { if (!$("#lightbox").hidden) closeLightbox(); else closeSheets(); } });

/* ================= plane detail ================= */
const busSVG = '<svg viewBox="0 0 18 11"><rect x=".5" y=".5" width="17" height="8.5" rx="1.6" fill="#D2232A"/><rect x="2" y="2" width="14" height="2.2" fill="#fff" opacity=".85"/><rect x="2" y="5.4" width="14" height="2" fill="#fff" opacity=".6"/><circle cx="4.5" cy="9.5" r="1.3" fill="#222"/><circle cx="13.5" cy="9.5" r="1.3" fill="#222"/></svg>';
function statusBlock(p) {
  if (p.live) {
    const L = p.live, g = routeGeo(p), cs = L.callsign ? ` · ${esc(L.callsign)}` : "";
    const kv = `<dl class="kv"><div><dt>Altitude</dt><dd>${L.onGround ? "Ground" : L.alt != null ? num(L.alt) + " ft" : "–"}</dd></div><div><dt>Speed</dt><dd>${L.gs != null ? L.gs + " kt" : "–"}</dd></div>`;
    if (g && !L.onGround) {
      const r = L.route, pc = Math.round(g.f * 100), leftKm = d3.geoDistance(g.pos, g.B) * EARTH_KM;
      const mins = L.gs ? leftKm / (L.gs * 1.852) * 60 : null;
      const eta = mins == null ? "–" : mins < 60 ? `${Math.round(mins)} min` : `${Math.floor(mins / 60)}h ${String(Math.round(mins % 60)).padStart(2, "0")}m`;
      return `<section class="status live">
        <div class="st-top"><span class="pill live"><i></i>Flying now${cs}</span><span class="upd" data-upd></span></div>
        <p class="over">${esc(whereText(p))}</p>
        <div class="route"><div class="ap"><b>${esc(r.from.code)}</b><span>${esc(r.from.city || r.from.name)}</span></div>
          <div class="track" aria-label="${pc}% of the way"><div class="bar" style="width:${pc}%"></div><svg viewBox="0 0 24 24" style="left:${pc}%"><path d="${PLANE_D}"/></svg></div>
          <div class="ap r"><b>${esc(r.to.code)}</b><span>${esc(r.to.city || r.to.name)}</span></div></div>
        ${kv}<div><dt>Lands in</dt><dd>${eta}</dd></div></dl>
      </section>`;
    }
    return `<section class="status live">
      <div class="st-top"><span class="pill live"><i></i>${L.onGround ? "On the move" : "Flying now"}${cs}</span><span class="upd" data-upd></span></div>
      <p class="over">${esc(whereText(p))}</p>
      ${kv}<div><dt>Heading</dt><dd>${L.track != null ? Math.round(L.track) + "°" : "–"}</dd></div></dl>
      ${L.onGround ? "" : `<p class="expl">We can't tell where this flight is going, so there's no route line.</p>`}
    </section>`;
  }
  if (p.last) {
    return `<section class="status last">
      <div class="st-top"><span class="pill last">${ICON_CLOCK}Last seen ${fmtAgo(lastAgo(p))}</span></div>
      <p class="where">${esc(whereText(p))}${!p.last.onGround && p.last.alt ? ` · ${num(p.last.alt)} ft` : ""}</p>
      <p class="expl">It isn't broadcasting right now, so the map shows where it was last heard. ${onGround(p) ? "It's probably parked between flights." : "It's flying where no receivers can hear it, and will pop back up when it's in range."}</p>
    </section>`;
  }
  return `<section class="status none"><div class="st-top"><span class="pill none">No position yet</span></div><p class="expl">We haven't heard this plane since it was logged. It'll appear on the map as soon as it starts broadcasting.</p></section>`;
}
function renderDetail(p) {
  const media = allMedia(p), ty = typeInfo(p.icao_type), n = spots(p), admin = isAdmin();
  const tiles = media.map((m, i) => {
    const dt = `<span class="dt">${fmtDate(m.date)}</span>`;
    if (m.kind === "video") return `<button class="mtile" type="button" data-m="${i}" aria-label="Play video">${m.poster ? `<img src="${m.poster}" alt="" loading="lazy">` : ""}<span class="play"><span><svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg></span></span>${dt}</button>`;
    return `<button class="mtile" type="button" data-m="${i}" aria-label="Open photo ${i + 1}"><img src="${m.poster || m.url}" alt="Photo of ${esc(p.reg)}" loading="lazy">${dt}</button>`;
  }).join("");
  const sights = p.sightings.slice().sort((a, b) => b.spotted_on.localeCompare(a.spotted_on)).map(s => `<li><span class="nd"></span><div><b>${esc(apName(s.airport))}</b> <span class="m">${fmtDate(s.spotted_on)}</span>${s.note ? `<q>${esc(s.note)}</q>` : ""}${admin ? `<div class="acts"><button class="mini del" type="button" data-dels="${s.id}">Delete this spot</button></div>` : ""}</div></li>`).join("");
  const buses = ty ? Math.round(ty.span / 11.2 * 2) / 2 : 0;
  const spotAp = getAirport(latest(p).airport);
  $("#detail").innerHTML = `
    <div class="sh-head"><div><div class="reg">${esc(p.reg)}</div><div class="sh-sub">${esc(p.type_name || "Type not set")} · ${esc(p.airline || "Airline not set")}</div></div>
      <button class="icon-btn" data-close type="button" aria-label="Close">${CLOSE_SVG}</button></div>
    <div class="sh-body">
      ${statusBlock(p)}
      ${media.length ? `<section><h3 class="eyebrow">Photos and videos · ${media.length}</h3><div class="media">${tiles}</div></section>` : ""}
      <section><h3 class="eyebrow">Spotted ${n === 1 ? "once" : n === 2 ? "twice" : n + " times"}</h3><ul class="sightings">${sights}</ul></section>
      ${ty ? `<section><h3 class="eyebrow">About the ${esc(ty.name)}</h3>
        <dl class="pfacts"><div><dt>Wingspan</dt><dd>${ty.span.toFixed(1)} m<small>About ${buses} London buses end to end</small><span class="buses">${busSVG.repeat(Math.ceil(buses))}</span></dd></div>
        <div><dt>Seats</dt><dd>${esc(ty.seats)}<small>${ty.wide ? "Wide-body: two aisles" : "Narrow-body: one aisle"}</small></dd></div></dl>
        <p class="didyou"><b>Did you know?</b>${esc(ty.fact)}</p></section>` : ""}
      <div class="btnrow">
        ${spotAp ? `<button class="btn flat" type="button" data-go="spot"><svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>Where I saw it</button>` : ""}
        ${posOf(p) ? `<button class="btn flat" type="button" data-go="plane"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>${p.live ? "Where it is now" : "Last position"}</button>` : ""}
      </div>
      ${admin ? `<div class="btnrow"><button class="btn danger" type="button" data-delp>Delete ${esc(p.reg)} from the logbook</button></div>` : ""}
    </div>`;
  const d = $("#detail");
  d.querySelectorAll("[data-m]").forEach(b => b.addEventListener("click", () => openLightbox(media[+b.dataset.m])));
  const gs = d.querySelector('[data-go="spot"]'); if (gs) gs.addEventListener("click", () => flyTo(spotAp.c, 12));
  const gp = d.querySelector('[data-go="plane"]'); if (gp) gp.addEventListener("click", () => flyTo(posOf(p), onGround(p) ? 13 : 7));
  d.querySelectorAll("[data-dels]").forEach(b => b.addEventListener("click", () => deleteSighting(p, p.sightings.find(s => s.id === b.dataset.dels))));
  const dp = d.querySelector("[data-delp]"); if (dp) dp.addEventListener("click", () => deletePlane(p));
  updClock();
}
function select(id, fly) {
  const p = PLANES.find(x => x.id === id); if (!p) return;
  selected = id; renderDetail(p); openSheet("detail"); syncMap();
  if (fly) { const ll = posOf(p) || (getAirport(latest(p).airport) || {}).c; if (ll) flyTo(ll, !posOf(p) ? 10 : onGround(p) ? 12 : 4.2); }
}

/* ================= photo / video viewer ================= */
let lbItem = null;
function openLightbox(m) {
  lbItem = m;
  const body = $("#lbBody");
  if (m.kind === "video") body.innerHTML = m.url ? `<video src="${m.url}" controls playsinline autoplay ${m.poster ? `poster="${m.poster}"` : ""}></video>` : `<p style="color:#fff">This is a sample video, so there's nothing to play.</p>`;
  else body.innerHTML = `<img src="${m.url || m.poster}" alt="">`;
  $("#lbDel").hidden = !isAdmin() || m.sample;
  $("#lightbox").hidden = false;
}
function closeLightbox() { $("#lightbox").hidden = true; $("#lbBody").innerHTML = ""; lbItem = null; }
$("#lbClose").addEventListener("click", closeLightbox);
$("#lightbox").addEventListener("click", e => { if (e.target.id === "lightbox" || e.target.id === "lbBody") closeLightbox(); });
$("#lbDel").addEventListener("click", async () => {
  if (!lbItem || !confirm(`Delete this ${lbItem.kind}? This can't be undone.`)) return;
  const kind = lbItem.kind;
  try { await store.deleteMedia(lbItem); closeLightbox(); toast(`${kind === "video" ? "Video" : "Photo"} deleted`); await reload(selected); }
  catch (e) { toast("Couldn't delete it: " + e.message); }
});

/* ================= admin deletes ================= */
async function deleteSighting(p, s) {
  if (!s) return;
  const last = p.sightings.length === 1;
  if (!confirm(last ? `Delete this spot? It's the only one for ${p.reg}, so ${p.reg} will disappear from the logbook too.` : `Delete the ${fmtDate(s.spotted_on)} spot at ${apName(s.airport)}, and its photos?`)) return;
  try {
    if (last) await store.deletePlane(p); else await store.deleteSighting(s);
    toast("Spot deleted");
    await reload(last ? null : p.id);
    if (last) closeSheets();
  } catch (e) { toast("Couldn't delete it: " + e.message); }
}
async function deletePlane(p) {
  if (!confirm(`Delete ${p.reg} and all ${spots(p)} of its spots and photos? This can't be undone.`)) return;
  try { await store.deletePlane(p); toast(`${p.reg} deleted`); closeSheets(); await reload(null); }
  catch (e) { toast("Couldn't delete it: " + e.message); }
}

/* ================= logbook + account ================= */
let logAp = null;
function renderList() {
  const q = ($("#q").value || "").trim().toLowerCase();
  let rows = PLANES.slice().sort((a, b) => latest(b).spotted_on.localeCompare(latest(a).spotted_on));
  if (logAp) rows = rows.filter(p => p.sightings.some(s => s.airport === logAp));
  if (q) rows = rows.filter(p => [p.reg, p.airline, p.type_name].join(" ").toLowerCase().includes(q));
  const total = PLANES.reduce((a, p) => a + spots(p), 0);
  $("#logSub").textContent = logAp ? `Spotted at ${apName(logAp)}` : `${PLANES.length} planes, ${total} spots`;
  $("#list").innerHTML = rows.length ? rows.map(p => {
    const th = thumbOf(p), n = spots(p), l = latest(p), st = status(p);
    const chip = st === "live" ? `<span class="chip live">Live</span>` : st === "last" ? `<span class="chip last">${agoShort(lastAgo(p))} ago</span>` : `<span class="chip none">No position</span>`;
    return `<button class="row" type="button" data-id="${p.id}">${th ? `<img src="${th}" alt="" loading="lazy">` : `<span class="noimg"></span>`}<div><div class="r1">${esc(p.reg)}${n > 1 ? `<em>×${n}</em>` : ""}</div><div class="r2">${esc(p.type_name || "Type not set")} · ${esc(p.airline || "Airline not set")}</div><div class="r2">Last spotted ${fmtDate(l.spotted_on)}, ${esc(apName(l.airport))}</div></div>${chip}</button>`;
  }).join("") : PLANES.length ? `<p class="empty">No planes match “${esc(q)}”.</p>` : `<p class="empty">Nothing logged yet.${canAdd() ? " Tap Add spot to log your first plane." : ""}</p>`;
  $("#list").querySelectorAll(".row").forEach(r => r.addEventListener("click", () => select(r.dataset.id, true)));
  const roleLabel = { admin: " (admin)", spotter: "", viewer: " (view only)" }[me.role] || "";
  $("#acct").innerHTML = `
    ${store.mode === "demo" ? `<div class="banner">Demo mode: these are sample planes and nothing is saved.</div>` : ""}
    <div class="who">Signed in as <b>${esc(me.name || me.email)}</b>${roleLabel}</div>
    <div class="btnrow">
      ${isAdmin() ? `<button class="btn flat" type="button" id="exportBtn">Download backup</button>` : ""}
      ${store.mode !== "demo" ? `<button class="btn flat" type="button" id="chPwBtn">Change password</button>` : ""}
      <button class="btn flat" type="button" id="signOutBtn">Sign out</button>
    </div>`;
  $("#signOutBtn").addEventListener("click", signOut);
  const ex = $("#exportBtn"); if (ex) ex.addEventListener("click", exportBackup);
  const cp = $("#chPwBtn"); if (cp) cp.addEventListener("click", () => showAuth("newpw", { mode: "change" }));
}
function openLogbook(ap) { logAp = ap || null; selected = null; $("#q").value = ""; renderList(); openSheet("logbook"); syncMap(); if (mapApi) mapApi.setPadding(mapPadding()); }
$("#openLog").addEventListener("click", () => openLogbook());
$("#q").addEventListener("input", renderList);
function exportBackup() {
  const data = PLANES.map(p => ({ reg: p.reg, type: p.type_name, icao_type: p.icao_type, airline: p.airline, airline_icao: p.airline_icao, last: p.last,
    sightings: p.sightings.map(s => ({ airport: s.airport, date: s.spotted_on, note: s.note, media: s.media.map(m => ({ kind: m.kind, path: m.path })) })) }));
  const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), planes: data }, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `spotters-logbook-${todayISO()}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ================= stats ================= */
function tally(fn) { const m = new Map(); PLANES.forEach(p => p.sightings.forEach(s => { const k = fn(p, s); if (k) m.set(k, (m.get(k) || 0) + 1); })); return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))); }
const tailSVG = p => `<svg class="tail" viewBox="0 0 18 22"><path d="M3 21 L7 2 H13 L16 21Z" fill="${liveryFor(p).tail}"/></svg>`;
function badgeList() {
  const types = new Set(PLANES.map(p => p.icao_type).filter(Boolean)), airlines = new Set(PLANES.map(p => p.airline).filter(Boolean));
  const aps = new Set(PLANES.flatMap(p => p.sightings.map(s => s.airport)));
  const total = PLANES.reduce((a, p) => a + spots(p), 0), maxSame = Math.max(0, ...PLANES.map(spots));
  const wide = PLANES.filter(p => (typeInfo(p.icao_type) || {}).wide).length;
  const longest = Math.max(0, ...PLANES.map(p => { const g = routeGeo(p); return g ? g.d * EARTH_MI : 0; }));
  return [
    ["Super Jumbo", "Spot an Airbus A380", types.has("A388") ? 1 : 0, 1, '<path d="M3 15l8-2 4-8h2l-1.5 8 6 1v2l-6 1 1.5 6h-2l-4-6-8-1z"/>'],
    ["Hat-trick", "Spot the same plane 3 times", Math.min(maxSame, 3), 3, '<path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.8z"/>'],
    ["Twin aisles", "Spot 5 wide-body planes", Math.min(wide, 5), 5, '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M9.5 3v18M14.5 3v18"/>'],
    ["Airport hopper", "Spot planes at 3 airports", Math.min(aps.size, 3), 3, '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'],
    ["Long hauler", "One of your planes flies 5,000 miles in one go", longest >= 5000 ? 1 : 0, 1, '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>'],
    ["Airline collector", "Spot 10 different airlines", Math.min(airlines.size, 10), 10, '<path d="M5 21l4-17h6l4 17z"/><path d="M8 13h8"/>'],
    ["Queen of the Skies", "Spot a Boeing 747", [...types].some(t => /^B74/.test(t)) ? 1 : 0, 1, '<path d="M12 2l2 6h6l-5 4 2 7-5-4-5 4 2-7-5-4h6z"/>'],
    ["Half century", "Log 50 spots", Math.min(total, 50), 50, '<circle cx="12" cy="12" r="9"/><path d="M9 8.5h5M9 8.5v3.5h2.5a2.5 2.5 0 0 1 0 5H9"/>']
  ];
}
function renderStats() {
  const total = PLANES.reduce((a, p) => a + spots(p), 0);
  const B = badgeList(), earned = B.filter(b => b[2] >= b[3]).length;
  const badgesHTML = B.map(([n, d, v, max, ic]) => { const done = v >= max; return `<div class="bdg${done ? "" : " lock"}"><div class="md"><svg viewBox="0 0 24 24">${ic}</svg></div><b>${n}</b><span>${d}</span>${done ? "" : `<div class="prog" aria-label="${v} of ${max}"><i style="width:${Math.round(v / max * 100)}%"></i></div><span>${v} / ${max}</span>`}</div>`; }).join("");
  const head = `<div class="sh-head"><div><h2>Hangar stats</h2><div class="sh-sub">Everything spotted so far</div></div><button class="icon-btn" data-close type="button" aria-label="Close">${CLOSE_SVG}</button></div>`;
  if (!total) {
    $("#stats").innerHTML = head + `<div class="sh-body"><p class="empty">No spots yet. Stats and badges start filling up as soon as the first plane is logged.</p><section><h3 class="eyebrow">Badges to earn</h3><div class="badges">${badgesHTML}</div></section></div>`;
    return;
  }
  const air = tally(p => p.airline), types = tally(p => p.type_name), aps = tally((p, s) => s.airport);
  const airPlane = name => PLANES.find(p => p.airline === name);
  const topPlane = PLANES.slice().sort((a, b) => spots(b) - spots(a) || latest(b).spotted_on.localeCompare(latest(a).spotted_on))[0];
  const live = PLANES.filter(p => p.live && !p.live.onGround);
  const hi = live.filter(p => p.live.alt != null).sort((a, b) => b.live.alt - a.live.alt)[0];
  const fast = live.filter(p => p.live.gs != null).sort((a, b) => b.live.gs - a.live.gs)[0];
  const far = PLANES.filter(p => posOf(p) && getAirport(latest(p).airport)).map(p => ({ p, mi: d3.geoDistance(getAirport(latest(p).airport).c, posOf(p)) * EARTH_MI })).sort((a, b) => b.mi - a.mi)[0];
  const inAir = PLANES.filter(p => posOf(p) && !onGround(p)).length, ground = PLANES.filter(p => posOf(p) && onGround(p)).length;
  const maxA = air.length ? air[0][1] : 1;
  const months = [], now = new Date();
  for (let i = 6; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("en-GB", { month: "short" }), v: 0 }); }
  PLANES.forEach(p => p.sightings.forEach(s => { const m = months.find(m => m.key === s.spotted_on.slice(0, 7)); if (m) m.v++; }));
  const maxM = Math.max(1, ...months.map(m => m.v));
  const thumb = thumbOf(topPlane);
  const tile = (k, v, n, extra = "", sel) => `<${sel ? `button class="top1" type="button" data-sel="${sel}"` : `div class="top1"`}><span class="k">${k}</span>${extra}${v}<span class="n">${n}</span></${sel ? "button" : "div"}>`;
  $("#stats").innerHTML = head + `
    <div class="sh-body">
      <div class="hero"><div><b>${total}</b><span>Spots</span></div><div><b>${PLANES.length}</b><span>Planes</span></div><div><b>${air.length}</b><span>Airlines</span></div><div><b>${types.length}</b><span>Types</span></div></div>
      <section><h3 class="eyebrow">Top of the logbook</h3><div class="tops">
        ${air.length ? tile("Most spotted airline", `<span class="sw">${tailSVG(airPlane(air[0][0]))}<span class="v">${esc(air[0][0])}</span></span>`, `${air[0][1]} spots`) : ""}
        ${tile("Most spotted plane", `<span class="v mono">${esc(topPlane.reg)}</span>`, `${spots(topPlane)} ${spots(topPlane) === 1 ? "time" : "times"}${topPlane.airline ? " · " + esc(topPlane.airline) : ""}`, thumb ? `<img src="${thumb}" alt="">` : "", topPlane.id)}
        ${types.length ? tile("Favourite type", `<span class="v">${esc(types[0][0])}</span>`, `${types[0][1]} spots`) : ""}
        ${tile("Favourite airport", `<span class="v">${esc(apName(aps[0][0]))}</span>`, `${aps[0][1]} spots`)}
      </div></section>
      <section><h3 class="eyebrow">Your planes right now</h3><div class="now">
        ${hi ? tile("Highest flyer", `<span class="v mono">${esc(hi.reg)}</span>`, `${num(hi.live.alt)} ft up`, "", hi.id) : tile("Highest flyer", `<span class="v">None flying</span>`, "Check back later")}
        ${fast ? tile("Fastest", `<span class="v mono">${esc(fast.reg)}</span>`, `${fast.live.gs} knots (${num(fast.live.gs * 1.15078)} mph)`, "", fast.id) : tile("Fastest", `<span class="v">None flying</span>`, "Check back later")}
        ${far ? tile("Furthest from where it was spotted", `<span class="v mono">${esc(far.p.reg)}</span>`, `${num(far.mi)} miles away`, "", far.p.id) : ""}
        ${tile("In the air / on the ground", `<span class="v">${inAir} / ${ground}</span>`, `${PLANES.filter(p => p.live).length} broadcasting live`)}
      </div></section>
      ${air.length ? `<section><h3 class="eyebrow">Spots by airline</h3><div class="chart">${air.map(([n, v]) => `<div class="bar-row" title="${esc(n)}: ${v} spots"><span class="nm">${tailSVG(airPlane(n))}${esc(n)}</span><span class="trk"><span class="fill" style="width:${v / maxA * 100}%"></span></span><span class="val">${v}</span></div>`).join("")}</div></section>` : ""}
      <section><h3 class="eyebrow">Spots by month</h3><div class="cols">${months.map(m => `<div class="col" title="${m.label}: ${m.v} spots"><span class="cv${m.v ? "" : " z"}">${m.v}</span><span class="c" style="height:${m.v / maxM * 80}%"></span></div>`).join("")}</div><div class="collbl">${months.map(m => `<span>${m.label}</span>`).join("")}</div></section>
      <section><h3 class="eyebrow">Badges · ${earned} earned</h3><div class="badges">${badgesHTML}</div></section>
    </div>`;
  $("#stats").querySelectorAll("[data-sel]").forEach(b => b.addEventListener("click", () => select(b.dataset.sel, true)));
}
$("#openStats").addEventListener("click", () => { selected = null; renderStats(); openSheet("stats"); syncMap(); if (mapApi) mapApi.setPadding(mapPadding()); });

/* ================= airport panel ================= */
let apOpen = null, apTimer = null, apLive = null, apHl = null;
const COVER = { SKC: "Clear sky", CLR: "Clear sky", NSC: "No significant cloud", NCD: "No cloud", CAVOK: "Clear and great visibility", FEW: "A few clouds", SCT: "Scattered clouds", BKN: "Mostly cloudy", OVC: "Overcast", OVX: "Sky hidden" };
const WX = [[/TS/, "Thunderstorms"], [/SN/, "Snow"], [/FZ/, "Freezing"], [/\+RA|RA/, "Rain"], [/DZ/, "Drizzle"], [/SH/, "Showers"], [/FG/, "Fog"], [/BR/, "Mist"], [/HZ/, "Haze"]];
const compass = d => ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(((d % 360) + 360) % 360 / 45) % 8];
function skyText(m) {
  if (m.wx) { const hit = WX.find(([re]) => re.test(m.wx)); if (hit) return hit[1]; }
  if (m.cover && COVER[m.cover]) return COVER[m.cover];
  const order = ["OVC", "BKN", "SCT", "FEW"]; const c = (m.clouds || []).map(c => c.cover).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
  return c && COVER[c] ? COVER[c] : (m.cat === "VFR" ? "Clear" : "");
}
function runwayInUse(ap, m) {
  if (!ap.r || !ap.r.length || !m) return null;
  if (typeof m.wdir !== "number" || (m.wspd || 0) < 3) return { calm: true };
  let best = null;
  ap.r.forEach(([le, h1, he, h2, L]) => [[le, h1], [he, h2]].forEach(([id, h]) => {
    const diff = Math.abs(((h - m.wdir) + 540) % 360 - 180);
    if (!best || diff < best.diff - 5 || (Math.abs(diff - best.diff) <= 5 && L > best.L)) best = { id, h, diff, L };
  }));
  return best;
}
function runwaySVG(ap, m, best) {
  const R = 46, c = 60, rw = ap.r[0] ? ap.r : [];
  const pt = (deg, r) => [c + r * Math.sin(deg * Math.PI / 180), c - r * Math.cos(deg * Math.PI / 180)];
  const lines = rw.slice(0, 3).map(([le, h1, he, h2], i) => {
    const off = (i - (Math.min(rw.length, 3) - 1) / 2) * 9, perp = h1 + 90;
    const o = pt(perp, off).map(v => v - c);
    const [x1, y1] = pt(h1 + 180, R - 8), [x2, y2] = pt(h1, R - 8);
    const [lx1, ly1] = pt(h1 + 180, R + 6), [lx2, ly2] = pt(h1, R + 6);
    const hlA = best && best.id === le, hlB = best && best.id === he;
    return `<line x1="${x1 + o[0]}" y1="${y1 + o[1]}" x2="${x2 + o[0]}" y2="${y2 + o[1]}" stroke="var(--ink)" stroke-width="7" stroke-linecap="butt"/>
      <line x1="${x1 + o[0]}" y1="${y1 + o[1]}" x2="${x2 + o[0]}" y2="${y2 + o[1]}" stroke="var(--panel)" stroke-width="1" stroke-dasharray="3 3"/>
      <text x="${lx1 + o[0]}" y="${ly1 + o[1]}" class="rwl${hlA ? " on" : ""}">${esc(le)}</text><text x="${lx2 + o[0]}" y="${ly2 + o[1]}" class="rwl${hlB ? " on" : ""}">${esc(he)}</text>`;
  }).join("");
  let wind = "";
  if (m && typeof m.wdir === "number" && (m.wspd || 0) >= 3) {
    const [sx, sy] = pt(m.wdir, R + 2), [ex, ey] = pt(m.wdir, 14);
    wind = `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="var(--route)" stroke-width="3" stroke-linecap="round" marker-end="url(#ah)"/>`;
  }
  return `<svg class="rwsvg" viewBox="-8 -8 136 136" role="img" aria-label="Runway and wind diagram"><defs><marker id="ah" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--route)"/></marker></defs>
    <circle cx="60" cy="60" r="${R + 14}" fill="var(--panel-2)" stroke="var(--line)"/><text x="60" y="-1" class="rwn">N</text>${lines}${wind}</svg>`;
}
function phaseLabel(t) {
  if (t.phase === "landing") return "Coming in to land";
  if (t.phase === "departing") return "Just taken off";
  if (t.phase === "ground") return "On the ground";
  return "Flying nearby";
}
function renderAirport() {
  const ap = apOpen; if (!ap) return;
  const code = ap.a || ap.i, short = ap.n.replace(/ (International )?Airport$/i, "");
  const myCount = PLANES.reduce((a, p) => a + p.sightings.filter(s => s.airport === code || s.airport === ap.i).length, 0);
  const L = apLive, m = L && L.metar;
  let wx = `<section class="status none"><p class="expl">${L === null ? "Loading the latest weather…" : "No weather report for this airport right now."}</p></section>`;
  if (m) {
    const best = runwayInUse(ap, m);
    const windTxt = typeof m.wdir === "number" && (m.wspd || 0) >= 1 ? `From the ${compass(m.wdir)} (${m.wdir}°) at ${m.wspd} kt${m.wgst ? `, gusting ${m.wgst}` : ""}` : m.wdir === "VRB" ? `Light and changing direction, ${m.wspd || 0} kt` : "Calm";
    const vis = m.visib ? (/\+/.test(m.visib) || parseFloat(m.visib) >= 6 ? "10 km or more" : `${Math.round(parseFloat(m.visib) * 1.609)} km`) : "–";
    const mins = m.time ? (Date.now() - Date.parse(m.time)) / 60000 : null;
    wx = `<section class="wxcard">
      <div class="st-top"><span class="pill ${m.cat === "VFR" ? "live" : "last"}">${m.cat === "VFR" ? "Good flying weather" : m.cat ? "Low cloud or poor visibility" : "Weather"}</span>${mins != null ? `<span class="upd">Reported ${fmtAgo(mins)}</span>` : ""}</div>
      <div class="wxmain"><b>${m.temp != null ? Math.round(m.temp) + "°C" : ""}</b><span>${esc(skyText(m))}</span></div>
      <dl class="kv two"><div><dt>Wind</dt><dd class="small">${esc(windTxt)}</dd></div><div><dt>Visibility</dt><dd class="small">${vis}</dd></div></dl>
      ${ap.r && ap.r.length ? `<div class="rwrow">${runwaySVG(ap, m, best && !best.calm ? best : null)}<p>${best && best.calm ? "The wind is calm, so planes could be using any runway." : best ? `Planes are probably using <b>runway ${esc(best.id)}</b>. They take off and land into the wind, because it helps them lift off and slow down.` : ""}</p></div>` : ""}
      ${m.raw ? `<details class="raw"><summary>What the pilots read</summary><code>${esc(m.raw)}</code></details>` : ""}
    </section>`;
  }
  let traffic = "";
  if (L && L.traffic) {
    const groups = ["landing", "departing", "nearby", "ground"].map(ph => [ph, L.traffic.filter(t => t.phase === ph)]).filter(g => g[1].length);
    traffic = groups.length ? groups.map(([ph, list]) => `<h4 class="tgh">${phaseLabel({ phase: ph })} · ${list.length}</h4>` + list.slice(0, ph === "ground" ? 12 : 10).map(t => {
      const mine = t.reg && PLANES.find(p => p.reg === t.reg);
      const routeTxt = t.route ? (ph === "landing" && t.route.fromName ? `from ${t.route.fromName}` : t.route.toName ? `to ${t.route.toName}` : "") : "";
      const al = t.callsign && AIRLINES[t.callsign.slice(0, 3)] ? AIRLINES[t.callsign.slice(0, 3)].name : "";
      const ty = typeInfo(t.type);
      const bits = [ty ? ty.name : t.type, al].filter(Boolean).join(" · ");
      const miles = Math.round(t.dist * 1.15078 * 10) / 10;
      const nums = ph === "ground" ? "" : `${num(t.alt)} ft · ${miles < 1 ? "under a mile" : miles + " miles"} away`;
      return `<div class="trow${apHl === t.key ? " hl" : ""}" data-key="${esc(t.key)}"><button class="tmain" type="button" data-fly="${esc(t.key)}"><svg class="tg ${ph}" viewBox="0 0 24 24" style="rotate:${t.track || 0}deg"><path d="${PLANE_D}"/></svg><div><div class="r1">${esc(t.reg || t.callsign || "Unknown")}${mine ? `<em class="minechip">In the logbook</em>` : ""}</div><div class="r2">${esc(bits || "Type unknown")}${routeTxt ? " · " + esc(routeTxt) : ""}</div>${nums ? `<div class="r2">${nums}</div>` : ""}</div></button>${t.reg && canAdd() ? `<button class="btn flat logit" type="button" data-log="${esc(t.reg)}">Log it</button>` : ""}</div>`;
    }).join("")).join("") : `<p class="empty">No planes around the airport right now.</p>`;
    if (L.overhead) traffic += `<p class="hint">Plus ${L.overhead} more flying high overhead.</p>`;
  } else if (L && L.traffic === null) traffic = `<p class="empty">Live planes aren't available right now. Try again in a minute.</p>`;
  else traffic = `<p class="empty">Looking for planes…</p>`;
  const body = $("#airport .sh-body"), st = body ? body.scrollTop : 0;
  $("#airport").innerHTML = `
    <div class="sh-head"><div><div class="reg">${esc(code)}</div><div class="sh-sub">${esc(short)}${ap.m ? " · " + esc(ap.m) : ""} · ${esc(ap.i)}</div></div>
      <button class="icon-btn" data-close type="button" aria-label="Close">${CLOSE_SVG}</button></div>
    <div class="sh-body">
      ${wx}
      ${myCount ? `<button class="btn flat" type="button" id="apMine">${myCount} ${myCount === 1 ? "spot" : "spots"} here in the logbook</button>` : ""}
      <section><h3 class="eyebrow">Around the airport now <span class="upd" data-upd></span></h3>${traffic}</section>
      <p class="credit">Weather from aviationweather.gov. Planes from adsb.lol. Runway guess based on the wind.</p>
    </div>`;
  const nb = $("#airport .sh-body"); if (nb) nb.scrollTop = st;
  const mineBtn = $("#apMine"); if (mineBtn) mineBtn.addEventListener("click", () => openLogbook(PLANES.some(p => p.sightings.some(s => s.airport === code)) ? code : ap.i));
  $("#airport").querySelectorAll("[data-log]").forEach(b => b.addEventListener("click", () => openAdd({ reg: b.dataset.log, airport: code })));
  $("#airport").querySelectorAll("[data-fly]").forEach(b => b.addEventListener("click", () => highlightTraffic(b.dataset.fly, false)));
  updClock();
}
function highlightTraffic(key, scroll) {
  apHl = key;
  if (mapApi) mapApi.highlightTraffic(key);
  document.querySelectorAll("#airport .trow").forEach(r => r.classList.toggle("hl", r.dataset.key === key));
  const row = document.querySelector(`#airport .trow[data-key="${CSS.escape(key)}"]`);
  if (scroll && row) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
  const t = apLive && apLive.traffic && apLive.traffic.find(t => t.key === key);
  if (!scroll && t && mapApi) mapApi.flyTo([t.lon, t.lat], Math.max(mapApi.map.getZoom(), 11), mapPadding());
}
async function loadAirportLive() {
  const ap = apOpen; if (!ap) return;
  try { const res = await store.airportLive(ap); if (apOpen !== ap) return; apLive = res; feedState.at = Date.now(); }
  catch (e) { if (apOpen !== ap) return; apLive = { metar: apLive && apLive.metar, traffic: null, overhead: 0 }; }
  renderAirport();
  if (mapApi) mapApi.setTraffic((apLive.traffic || []).map(t => ({ key: t.key, ll: [t.lon, t.lat], track: t.track, label: t.reg || t.callsign || "", phase: t.phase, mine: !!(t.reg && PLANES.find(p => p.reg === t.reg)) })));
}
function openAirport(ap) {
  if (!ap) return;
  selected = null; apOpen = ap; apLive = null; apHl = null;
  renderAirport(); openSheet("airport"); syncMap();
  flyTo([ap.x, ap.y], 10.6);
  loadAirportLive();
  clearInterval(apTimer); apTimer = setInterval(() => { if (document.visibilityState === "visible") loadAirportLive(); }, 15000);
}
function stopAirport() { if (!apOpen) return; apOpen = null; apLive = null; clearInterval(apTimer); if (mapApi) mapApi.setTraffic([]); }

/* ================= add a spot ================= */
const apSel = $("#apIn");
(function fillAirports() {
  const groups = {};
  AIRPORT_LIST.forEach(([code, n, , , g]) => { (groups[g] = groups[g] || []).push([code, n]); });
  Object.entries(groups).forEach(([g, list]) => {
    const og = document.createElement("optgroup"); og.label = g;
    list.sort((a, b) => a[1].localeCompare(b[1])).forEach(([code, n]) => { const o = document.createElement("option"); o.value = code; o.textContent = `${n} (${code})`; og.appendChild(o); });
    apSel.appendChild(og);
  });
})();
function ensureAirportOption(code) {
  if (!code || [...apSel.options].some(o => o.value === code)) return;
  const a = getAirport(code); if (!a) return;
  let og = apSel.querySelector('optgroup[data-extra]');
  if (!og) { og = document.createElement("optgroup"); og.label = "Other airports"; og.dataset.extra = "1"; apSel.prepend(og); }
  const o = document.createElement("option"); o.value = code; o.textContent = `${a.n} (${code})`; og.appendChild(o);
}
let pending = [], found = null, lookupSeq = 0, exifUsed = false;
function resetAdd() {
  $("#regIn").value = ""; $("#noteIn").value = ""; $("#lookupOut").innerHTML = ""; $("#addErr").hidden = true; $("#planeFields").hidden = true;
  $("#tyIn").value = ""; $("#alIn").value = ""; $("#exifHint").hidden = true; exifUsed = false;
  pending = []; renderPrev(); found = null;
  $("#dateIn").value = todayISO(); $("#dateIn").max = todayISO();
  const last = lsGet("spotters.lastAirport") || "LBA"; ensureAirportOption(last); apSel.value = last;
  const sb = $("#saveBtn"); sb.disabled = false; sb.textContent = "Save to logbook";
}
function openAdd(prefill) {
  if (!canAdd()) return;
  resetAdd(); selected = null; openSheet("add"); syncMap(); if (mapApi) mapApi.setPadding(mapPadding());
  if (prefill && prefill.airport) { ensureAirportOption(prefill.airport); apSel.value = prefill.airport; }
  if (prefill && prefill.reg) { $("#regIn").value = prefill.reg; doLookup(); }
  else setTimeout(() => $("#regIn").focus(), 350);
}
$("#openAdd").addEventListener("click", () => openAdd());
$("#welcomeAdd").addEventListener("click", () => openAdd());
const tick = `<svg width="22" height="22" viewBox="0 0 24 24" style="flex:none"><path d="${PLANE_D}" fill="var(--live)" stroke="var(--live-ink)" stroke-width="1.1"/></svg>`;
function cleanOwner(s) {
  if (!s) return "";
  return s.replace(/\b(limited|ltd\.?|plc|llc|inc\.?|s\.?a\.?|gmbh|airline company|airlines? company|holdings?|company)\b/gi, "").replace(/\s{2,}/g, " ").replace(/[,.\s]+$/, "").trim();
}
function airlineFrom(info) {
  const cs = info.live && info.live.callsign ? info.live.callsign.slice(0, 3).toUpperCase() : null;
  if (cs && AIRLINES[cs]) return { name: AIRLINES[cs].name, icao: cs };
  if (info.operatorIcao && AIRLINES[info.operatorIcao]) return { name: AIRLINES[info.operatorIcao].name, icao: info.operatorIcao };
  if (info.live && info.live.route && info.live.route.airline && info.live.route.airline.name) return { name: info.live.route.airline.name, icao: info.live.route.airline.icao };
  return { name: cleanOwner(info.owner), icao: info.operatorIcao || null };
}
function typeFrom(info) {
  const t = typeInfo(info.icaoType); if (t) return t.name;
  return [info.manufacturer, info.type].filter(Boolean).join(" ");
}
async function doLookup() {
  const reg = $("#regIn").value.trim().toUpperCase().replace(/\s+/g, ""); $("#regIn").value = reg;
  const out = $("#lookupOut");
  if (!reg) { out.innerHTML = ""; found = null; $("#planeFields").hidden = true; return null; }
  const mine = PLANES.find(p => p.reg === reg);
  if (mine) {
    const n = spots(mine); found = { reg, existing: mine }; $("#planeFields").hidden = true;
    out.innerHTML = `<div class="found again">${tick}<div><b>You've seen this one before!</b><div class="muted">${esc(mine.type_name)} · ${esc(mine.airline)}. Spotted ${n === 1 ? "once" : n === 2 ? "twice" : n + " times"} already, so this will be spot number ${n + 1}.</div></div></div>`;
    return found;
  }
  const seq = ++lookupSeq;
  out.innerHTML = `<p class="hint">Looking up ${esc(reg)}…</p>`;
  $("#lookupBtn").disabled = true;
  let info;
  try { info = await store.lookup(reg); }
  catch (e) { info = { reg, found: false, failed: true }; }
  finally { $("#lookupBtn").disabled = false; }
  if (seq !== lookupSeq) return found;
  const al = airlineFrom(info);
  found = { reg, info, airline_icao: al.icao, hex: info.hex || (info.live && info.live.hex) || null, icao_type: info.icaoType || null };
  $("#tyIn").value = typeFrom(info); $("#alIn").value = al.name; $("#planeFields").hidden = false;
  if (info.found) {
    const L = info.live;
    const liveLine = L ? (L.route ? `Flying now: ${esc(L.route.from.code)} → ${esc(L.route.to.code)}` : L.onGround ? "Broadcasting now, on the ground" : "Flying now") : "Not broadcasting right now";
    out.innerHTML = `<div class="found">${info.photo ? `<img class="ref" src="${esc(info.photo)}" alt="" referrerpolicy="no-referrer">` : tick}<div><b>${esc(typeFrom(info) || "Aircraft found")}</b>${al.name ? ` · ${esc(al.name)}` : ""}<div class="muted">${liveLine}. A new plane for your logbook! Fix the details below if anything looks wrong.</div></div></div>`;
  } else {
    out.innerHTML = `<div class="found warn">${tick}<div><b>${info.failed ? "The lookup service didn't answer" : "We couldn't find " + esc(reg)}</b><div class="muted">${info.failed ? "You can still save it and type the details yourself." : "Check the registration. If it's right, type the details below and save it anyway."}</div></div></div>`;
  }
  return found;
}
$("#lookupBtn").addEventListener("click", doLookup);
$("#regIn").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); doLookup(); } });
$("#regIn").addEventListener("input", () => { if (found && found.reg !== $("#regIn").value.trim().toUpperCase()) { found = null; $("#lookupOut").innerHTML = ""; $("#planeFields").hidden = true; } });
$("#mediaIn").addEventListener("change", async e => {
  const files = [...e.target.files]; e.target.value = "";
  $("#addErr").hidden = true;
  for (const f of files) {
    const item = { kind: f.type.startsWith("video") ? "video" : "photo", busy: true, name: f.name };
    pending.push(item); renderPrev();
    if (!exifUsed && item.kind === "photo") {
      const ex = await readExif(f);
      const bits = [];
      if (ex.date && ex.date <= todayISO()) { $("#dateIn").value = ex.date; bits.push("date"); }
      if (ex.lat != null) { const a = nearestAirport([ex.lon, ex.lat], 25); if (a) { ensureAirportOption(a.code); apSel.value = a.code; bits.push("airport"); } }
      if (bits.length) { exifUsed = true; const h = $("#exifHint"); h.textContent = `Set the ${bits.join(" and ")} from your photo.`; h.hidden = false; }
    }
    try {
      Object.assign(item, item.kind === "video" ? await prepareVideo(f) : await preparePhoto(f), { busy: false });
      item.preview = URL.createObjectURL(item.poster || item.blob);
    } catch (err) {
      pending.splice(pending.indexOf(item), 1);
      $("#addErr").textContent = err.message; $("#addErr").hidden = false;
    }
    renderPrev();
  }
});
function renderPrev() {
  $("#mediaPrev").innerHTML = pending.map((m, i) => m.busy
    ? `<div class="busy">Getting ${m.kind} ready…</div>`
    : `<div>${m.preview ? `<img src="${m.preview}" alt="">` : ""}${m.kind === "video" ? `<span class="vbadge">VIDEO</span>` : ""}<button type="button" data-rm="${i}" aria-label="Remove">×</button></div>`).join("");
  $("#mediaPrev").querySelectorAll("[data-rm]").forEach(b => b.addEventListener("click", () => { const [m] = pending.splice(+b.dataset.rm, 1); if (m.preview) URL.revokeObjectURL(m.preview); renderPrev(); }));
}
$("#addForm").addEventListener("submit", async e => {
  e.preventDefault();
  const err = $("#addErr"), btn = $("#saveBtn");
  const reg = $("#regIn").value.trim().toUpperCase().replace(/\s+/g, "");
  err.hidden = true;
  if (!reg) { err.textContent = "Type the registration painted on the plane, for example G-JZHA."; err.hidden = false; $("#regIn").focus(); return; }
  if (pending.some(m => m.busy)) { err.textContent = "Hang on, your photos are still getting ready."; err.hidden = false; return; }
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    if (!found || found.reg !== reg) await doLookup();
    const date = $("#dateIn").value || todayISO();
    const spot = {
      reg, existingPlaneId: found && found.existing ? found.existing.id : null,
      sighting: { airport: apSel.value, spotted_on: date > todayISO() ? todayISO() : date, note: $("#noteIn").value.trim().slice(0, 1000) },
      files: pending.map(m => ({ kind: m.kind, blob: m.blob, poster: m.poster, ext: m.ext }))
    };
    if (!spot.existingPlaneId) {
      const typed = $("#alIn").value.trim();
      let icao = found && found.airline_icao;
      if (icao && (!AIRLINES[icao] || AIRLINES[icao].name.toLowerCase() !== typed.toLowerCase())) icao = Object.keys(AIRLINES).find(k => AIRLINES[k].name.toLowerCase() === typed.toLowerCase()) || (AIRLINES[icao] ? null : icao);
      spot.plane = { type_name: $("#tyIn").value.trim(), airline: typed, airline_icao: icao || null, icao_type: found && found.icao_type, hex: found && found.hex };
    }
    lsSet("spotters.lastAirport", apSel.value);
    const planeId = await store.addSpot(spot, (i, n) => { btn.textContent = `Uploading ${i} of ${n}…`; });
    const wasNew = !spot.existingPlaneId;
    pending.forEach(m => m.preview && URL.revokeObjectURL(m.preview)); pending = [];
    await reload(planeId);
    await refreshPositions();
    const p = PLANES.find(x => x.id === planeId);
    if (p) select(p.id, true);
    toast(wasNew ? `${reg} added to your logbook!` : `${reg} spotted again! That's ${p ? spots(p) : "another"} times.`);
  } catch (ex) {
    err.textContent = "Couldn't save: " + (ex.message || ex); err.hidden = false;
    btn.disabled = false; btn.textContent = "Save to logbook";
  }
});

/* ================= live positions ================= */
let posTimer = null, posBusy = false;
async function refreshPositions() {
  if (posBusy || !PLANES.length) return;
  posBusy = true;
  try {
    const res = await store.positions(PLANES.map(p => p.reg));
    const now = Date.now();
    feedState = { ok: !(res.errors && res.errors >= PLANES.length), at: now };
    const failed = new Set(res.failed || []);
    for (const p of PLANES) {
      const L = res.planes[p.reg];
      const isLive = L && L.seenPos != null && L.seenPos <= LIVE_MAX_AGE_S;
      if (!isLive) {
        // If the lookup failed (rather than the plane going quiet), keep showing it as live for a few minutes.
        if (!(failed.has(p.reg) && p.live && now - (p.liveAt || 0) < KEEP_LIVE_ON_ERROR_MS)) p.live = null;
        continue;
      }
      p.live = L; p.liveAt = now;
      const moved = !p.last || d3.geoDistance([p.last.lon, p.last.lat], [L.lon, L.lat]) * EARTH_KM > 10 || p.last.onGround !== !!L.onGround;
      if (moved || now - p.last.at > 10 * 60000) {
        p.last = { lat: L.lat, lon: L.lon, alt: L.alt, track: L.track, onGround: !!L.onGround, at: now };
        store.savePosition(p, L).catch(() => { /* not fatal */ });
      }
    }
  } catch (e) {
    feedState = { ok: false, at: Date.now() };
  } finally {
    posBusy = false;
    syncMap(); updBrand();
    const s = PLANES.find(p => p.id === selected);
    if (s && $("#detail").classList.contains("open")) { const sb = $("#detail .sh-body"), st = sb ? sb.scrollTop : 0; renderDetail(s); const nb = $("#detail .sh-body"); if (nb) nb.scrollTop = st; }
  }
}
function startPositionLoop() {
  clearInterval(posTimer);
  posTimer = setInterval(() => { if (document.visibilityState === "visible") refreshPositions(); }, store.mode === "demo" ? 10000 : 30000);
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !me) return;
  if (Date.now() - dataLoadedAt > 4 * 3600e3) reload(selected);
  else if (Date.now() - feedState.at > 25000) refreshPositions();
});
function updBrand() {
  const live = PLANES.filter(p => p.live).length, total = PLANES.reduce((a, p) => a + spots(p), 0);
  const feed = feedState.ok ? `<span class="dot"></span><span>${live} live</span>` : `<span class="feedwarn">Live data unavailable</span>`;
  $("#brandSub").innerHTML = `<span>${PLANES.length} planes<span class="wide"> · ${total} spots</span></span><span>·</span>${feed}`;
}
function updClock() {
  const s = Math.round((Date.now() - feedState.at) / 1000);
  document.querySelectorAll("[data-upd]").forEach(x => x.textContent = !feedState.at ? "" : s < 5 ? "Updated just now" : `Updated ${s}s ago`);
}
setInterval(updClock, 1000);
setInterval(() => syncMap(), 60000);

/* ================= data loading ================= */
async function reload(selectId) {
  const prevLive = Object.fromEntries(PLANES.map(p => [p.reg, { live: p.live, liveAt: p.liveAt }]));
  PLANES = await store.loadAll();
  PLANES.forEach(p => { if (prevLive[p.reg]) Object.assign(p, prevLive[p.reg]); });
  dataLoadedAt = Date.now();
  syncMap(); updBrand(); updWelcome();
  if (selectId && PLANES.find(p => p.id === selectId) && $("#detail").classList.contains("open")) renderDetail(PLANES.find(p => p.id === selectId));
  if ($("#logbook").classList.contains("open")) renderList();
  if ($("#stats").classList.contains("open")) renderStats();
}

/* ================= sign in, reset, new password ================= */
let newPwMode = "reset";
function showAuth(view, opt = {}) {
  $("#login").hidden = false; $("#boot").hidden = true;
  ["loginForm", "forgotForm", "newPwForm"].forEach(id => { $("#" + id).hidden = true; });
  if (view === "login") {
    $("#loginForm").hidden = false;
    $("#demoNote").hidden = store.mode !== "demo";
    $("#toForgot").hidden = store.mode === "demo";
    const le = $("#loginErr"); le.hidden = !opt.msg; le.textContent = opt.msg || "";
    setTimeout(() => $("#em").focus(), 100);
  } else if (view === "forgot") {
    $("#forgotForm").hidden = false; $("#forgotOk").hidden = true; $("#forgotErr").hidden = !opt.msg; $("#forgotErr").textContent = opt.msg || "";
    $("#fem").value = $("#em").value; $("#forgotBtn").disabled = false; $("#forgotBtn").textContent = "Send me a link";
    setTimeout(() => $("#fem").focus(), 100);
  } else if (view === "newpw") {
    newPwMode = opt.mode || "reset";
    $("#newPwForm").hidden = false; $("#newPwErr").hidden = true; $("#np1").value = ""; $("#np2").value = "";
    $("#newPwTitle").textContent = newPwMode === "invite" ? "Welcome! Choose a password" : newPwMode === "change" ? "Change your password" : "Choose a new password";
    $("#newPwIntro").textContent = newPwMode === "invite" ? "You've been invited to the Spotter's Logbook. Pick a password to sign in with from now on. It needs at least 8 characters." : "Pick something you'll remember. It needs at least 8 characters.";
    $("#newPwCancel").hidden = newPwMode !== "change";
    $("#npUser").value = (me && me.email) || "";
    setTimeout(() => $("#np1").focus(), 100);
  }
}
function hideAuth() { $("#login").hidden = true; }
$("#toForgot").addEventListener("click", () => showAuth("forgot"));
$("#backToLogin").addEventListener("click", () => showAuth("login"));
$("#newPwCancel").addEventListener("click", hideAuth);
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = $("#loginBtn"), le = $("#loginErr");
  const email = $("#em").value.trim(), pw = $("#pw").value;
  if (store.mode !== "demo" && (!email || !pw)) { le.textContent = "Enter your email and password."; le.hidden = false; return; }
  btn.disabled = true; btn.textContent = "Signing in…"; le.hidden = true;
  try {
    const user = await store.signIn(email, pw);
    if (!user.role) { await store.signOut(); throw new Error("This account hasn't been given access yet. Ask Dad to add it."); }
    me = user; $("#pw").value = "";
    await startApp();
  } catch (ex) {
    const msg = ex.message || "";
    le.textContent = /invalid login/i.test(msg) ? "That email and password don't match. Check them, or tap \"Forgotten your password?\" below."
      : /not confirmed/i.test(msg) ? "This account hasn't been confirmed yet. Ask Dad to confirm it in Supabase."
      : /rate|too many/i.test(msg) ? "Too many tries. Wait a minute and try again." : msg;
    le.hidden = false;
  } finally { btn.disabled = false; btn.textContent = "Sign in"; }
});
$("#forgotForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("#fem").value.trim(), btn = $("#forgotBtn"), er = $("#forgotErr");
  er.hidden = true;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { er.textContent = "Type the email address you sign in with."; er.hidden = false; return; }
  btn.disabled = true; btn.textContent = "Sending…";
  try {
    await store.resetPassword(email);
    const ok = $("#forgotOk"); ok.textContent = `If ${email} has an account, an email with a reset link is on its way. Open the link on this iPad or phone. It works for one hour.`; ok.hidden = false;
    btn.textContent = "Sent";
  } catch (ex) {
    const msg = ex.message || "";
    er.textContent = /rate|seconds|limit/i.test(msg) ? "A link was sent very recently. Wait a few minutes before asking for another one."
      : /not authorized|smtp|send/i.test(msg) ? "The email couldn't be sent. Ask Dad to check the email settings in Supabase." : msg;
    er.hidden = false; btn.disabled = false; btn.textContent = "Send me a link";
  }
});
$("#newPwForm").addEventListener("submit", async e => {
  e.preventDefault();
  const a = $("#np1").value, b = $("#np2").value, er = $("#newPwErr"), btn = $("#newPwBtn");
  er.hidden = true;
  if (a.length < 8) { er.textContent = "Use at least 8 characters."; er.hidden = false; return; }
  if (a !== b) { er.textContent = "The two passwords don't match. Type them again."; er.hidden = false; return; }
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    await store.setPassword(a);
    toast(newPwMode === "change" ? "Password changed" : "Password saved. You're signed in!");
    hideAuth();
    if (!me) { const u = await store.currentUser(); if (u && u.role) { me = u; await startApp(); } else showAuth("login", { msg: "Password saved. Sign in with it now." }); }
  } catch (ex) {
    const msg = ex.message || "";
    er.textContent = /different from the old/i.test(msg) ? "That's your old password. Pick a new one." : /session|expired|jwt/i.test(msg) ? "The reset link has expired. Go back and ask for a new one." : msg;
    er.hidden = false;
  } finally { btn.disabled = false; btn.textContent = "Save password"; }
});
async function signOut() {
  clearInterval(posTimer); stopAirport();
  await store.signOut();
  me = null; PLANES = []; closeSheets(true); syncMap(); updBrand(); applyRole(); showAuth("login");
}
function applyRole() { document.body.classList.toggle("viewer", !!me && !canAdd()); updWelcome(); }
async function startApp() {
  hideAuth(); $("#boot").hidden = true; applyRole();
  try { await reload(null); }
  catch (e) { toast("Couldn't load the logbook: " + e.message, 6000); }
  refreshPositions(); startPositionLoop();
}

/* ================= boot ================= */
function drawSpace() {
  const c = $("#bg"), dpr = Math.min(2, devicePixelRatio || 1), w = c.clientWidth, h = c.clientHeight;
  c.width = w * dpr; c.height = h * dpr; const x = c.getContext("2d"); x.scale(dpr, dpr);
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, css("--space-a")); g.addColorStop(1, css("--space-b")); x.fillStyle = g; x.fillRect(0, 0, w, h);
  if (css("--stars") === "1") { let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let i = 0; i < w * h / 2600; i++) { x.globalAlpha = .25 + r() * .7; x.fillStyle = r() < .15 ? "#FFE9B8" : "#fff"; x.beginPath(); x.arc(r() * w, r() * h, r() < .92 ? r() * .9 + .2 : r() * 1.3 + .8, 0, 7); x.fill(); } }
}
async function boot() {
  drawSpace(); addEventListener("resize", () => { drawSpace(); if (mapApi) mapApi.resize(); });
  if (window.matchMedia) { const mq = matchMedia("(prefers-color-scheme: dark)"); mq.addEventListener && mq.addEventListener("change", drawSpace); }
  if (innerWidth < 640) $("#legend").open = false;
  updBrand();
  loadCountries();
  const apReady = loadAirports();
  try { store = await createStore(window.SPOTTERS_CONFIG || {}); }
  catch (e) { $("#boot").textContent = "Couldn't connect. Check your internet and refresh."; return; }
  apReady.then(() => initMap());
  store.onSignedOut(() => { if (me) { me = null; PLANES = []; syncMap(); applyRole(); showAuth("login", { msg: "You've been signed out." }); } });
  if (store.authLink.error) { showAuth("forgot", { msg: store.authLink.error }); return; }
  try {
    const user = await store.currentUser();
    if (user && user.role) {
      me = user;
      if (store.authLink.intent) { await startApp(); showAuth("newpw", { mode: store.authLink.intent }); return; }
      await startApp(); return;
    }
    if (user && !user.role) { await store.signOut(); showAuth("login", { msg: "This account hasn't been given access yet. Ask Dad to add it." }); return; }
  } catch (e) { /* fall through to login */ }
  showAuth("login");
}
boot();
// Handy for testing from the browser console.
window.spotters = { openAirport: code => openAirport(AP_BY[code]), openAdd };
