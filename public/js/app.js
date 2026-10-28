import { PLANE_D, AIRPORT_LIST, AIRPORTS, AIRLINES, liveryFor, typeInfo, ICONS, LANDMARKS, CITIES } from './data.js';
import { createStore } from './store.js';
import { preparePhoto, prepareVideo, readExif } from './media.js';

const d3 = window.d3, topojson = window.topojson;
const RM = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const D2R = Math.PI / 180, R2D = 180 / Math.PI, EARTH_MI = 3958.8, EARTH_KM = 6371;
const LIVE_MAX_AGE_S = 90;

/* ================= small helpers ================= */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = d => { const x = new Date(d + "T12:00:00"); return isNaN(x) ? d : x.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };
const fmtAgo = m => m < 60 ? `${Math.max(1, Math.round(m))} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} hours ago` : `${Math.round(m / 1440)} days ago`;
const agoShort = m => m < 60 ? `${Math.max(1, Math.round(m))}m` : m < 48 * 60 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
const num = n => Math.round(n).toLocaleString("en-GB");
const todayISO = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const ICON_CLOCK = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const CLOSE_SVG = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
let toastT;
function toast(m, ms = 3500) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms); }
const apName = code => AIRPORTS[code] ? AIRPORTS[code].n : code;

/* ================= state ================= */
let store = null, me = null;
let PLANES = [];
let feedState = { ok: true, at: 0 };
let dataLoadedAt = 0;

const spots = p => p.sightings.length;
const latest = p => p.sightings.slice().sort((a, b) => b.spotted_on.localeCompare(a.spotted_on))[0];
const allMedia = p => p.sightings.slice().sort((a, b) => b.spotted_on.localeCompare(a.spotted_on)).flatMap(s => s.media.map(m => ({ ...m, date: s.spotted_on, sighting: s })));
const thumbOf = p => { const m = allMedia(p).find(m => m.poster); return m ? m.poster : null; };
const status = p => p.live ? "live" : p.last ? "last" : "none";
const lastAgo = p => (Date.now() - p.last.at) / 60000;
function posOf(p) { if (p.live) return [p.live.lon, p.live.lat]; if (p.last) return [p.last.lon, p.last.lat]; return null; }
function routeOf(p) { return p.live && p.live.route ? p.live.route : null; }
function routeGeo(p) {
  const r = routeOf(p); if (!r) return null;
  const A = [r.from.lon, r.from.lat], B = [r.to.lon, r.to.lat], pos = posOf(p);
  const dA = d3.geoDistance(A, pos), dB = d3.geoDistance(pos, B), d = d3.geoDistance(A, B);
  return { A, B, pos, d, f: dA + dB > 0 ? dA / (dA + dB) : 0, hmax: Math.max(.018, Math.min(.13, .012 + d * .1)) };
}
function hOf(p) {
  if (p.live) {
    if (p.live.onGround) return 0;
    const g = routeGeo(p); if (g) return Math.sin(Math.PI * g.f) * g.hmax;
    return Math.max(.012, Math.min(1, (p.live.alt || 0) / 40000)) * .05;
  }
  if (p.last && !p.last.onGround && (p.last.alt || 0) > 500) return .03;
  return 0;
}
function headingOf(p) { return p.live && p.live.track != null ? p.live.track : p.last && p.last.track != null ? p.last.track : 0; }
function destPoint([lon, lat], brngDeg, distRad) {
  const b = brngDeg * D2R, f1 = lat * D2R, l1 = lon * D2R;
  const f2 = Math.asin(Math.sin(f1) * Math.cos(distRad) + Math.cos(f1) * Math.sin(distRad) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(distRad) * Math.cos(f1), Math.cos(distRad) - Math.sin(f1) * Math.sin(f2));
  return [l2 * R2D, f2 * R2D];
}
function nearestAirport(ll, maxKm) {
  let best = null, bd = Infinity;
  AIRPORT_LIST.forEach(([code, n, lat, lon]) => { const d = d3.geoDistance(ll, [lon, lat]) * EARTH_KM; if (d < bd) { bd = d; best = { code, n }; } });
  return bd <= maxKm ? best : null;
}

/* ================= world shapes, place names ================= */
let landHi, landLo, bordHi, bordLo;
async function loadWorld() {
  const [hi, lo] = await Promise.all([fetch("/data/world-hi.json").then(r => r.json()), fetch("/data/world-lo.json").then(r => r.json())]);
  landHi = topojson.feature(hi, hi.objects.c); landLo = topojson.feature(lo, lo.objects.c);
  bordHi = topojson.mesh(hi, hi.objects.c, (a, b) => a !== b); bordLo = topojson.mesh(lo, lo.objects.c, (a, b) => a !== b);
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
  const ground = p.live ? p.live.onGround : p.last.onGround || (p.last.alt || 0) < 500;
  if (ground) { const a = nearestAirport(ll, 15); return a ? `On the ground at ${a.n} (${a.code})` : `On the ground in ${countryAt(ll) || "an unknown spot"}`; }
  return `Over ${overName(ll)}`;
}

/* ================= globe ================= */
const stage = $("#stage"), bg = $("#bg"), cv = $("#globe"), markers = $("#markers");
const ctx = cv.getContext("2d"), bctx = bg.getContext("2d");
const proj = d3.geoOrthographic().clipAngle(90).precision(.4);
const path = d3.geoPath(proj, ctx);
const grat = d3.geoGraticule().step([15, 15])();
let W = 0, H = 0, DPR = 1, R0 = 200;
const HOME = { lam: 2, phi: -40 };
const V = { lam: HOME.lam, phi: HOME.phi, R: 200, cx: 0, cy: 0 };
let rot = d3.geoRotation([V.lam, V.phi]);
let selected = null, filter = "all", showPins = false, spin = !RM, dirty = true, interacting = false, lastActive = 0, needHi = false;
let anim = null, vel = { l: 0, p: 0 }, dragging = false, sun = [0, 0];
const COL = { glow: "rgba(110,175,240,.55)", route: "#E3177E" };

function P(ll, h) {
  h = h || 0; const r = rot(ll), l = r[0] * D2R, f = r[1] * D2R, cf = Math.cos(f), k = V.R * (1 + h);
  const x = cf * Math.sin(l), y = Math.sin(f), z = cf * Math.cos(l);
  return { x: V.cx + k * x, y: V.cy - k * y, z, vis: z >= 0 || Math.hypot(x, y) * (1 + h) > 1.0001 };
}
function chromeTop() { const r = document.querySelector(".chrome.top").getBoundingClientRect(); return r.bottom + 8; }
function home() { const top = chromeTop(); return { cx: W / 2, cy: top + (H - top) / 2 }; }
function sizeAll() {
  W = stage.clientWidth; H = stage.clientHeight; DPR = Math.min(2, window.devicePixelRatio || 1);
  [bg, cv].forEach(c => { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); });
  const top = chromeTop(), oldR0 = R0;
  R0 = Math.max(120, Math.min(W * 0.43, (H - top - 40) * 0.47));
  V.R = V.R / oldR0 * R0;
  if (!document.body.classList.contains("sheet-open")) Object.assign(V, home());
  drawBg(); dirty = true;
}
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function drawBg() {
  COL.glow = css("--glow") || COL.glow; COL.route = css("--route") || COL.route;
  bctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const g = bctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, css("--space-a")); g.addColorStop(1, css("--space-b"));
  bctx.fillStyle = g; bctx.fillRect(0, 0, W, H);
  let s = css("--stars") === "1" ? 7 : 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  if (css("--stars") === "1") {
    const n = Math.round(W * H / 2600);
    for (let i = 0; i < n; i++) { const r = rnd() < .92 ? rnd() * .9 + .2 : rnd() * 1.3 + .8; bctx.globalAlpha = .25 + rnd() * .7; bctx.fillStyle = rnd() < .15 ? "#FFE9B8" : "#fff"; bctx.beginPath(); bctx.arc(rnd() * W, rnd() * H, r, 0, 7); bctx.fill(); }
    bctx.globalAlpha = 1;
  } else {
    bctx.fillStyle = "rgba(255,255,255,.55)";
    for (let i = 0; i < 9; i++) { const x = rnd() * W, y = rnd() * H, w = 60 + rnd() * 140; for (let j = 0; j < 4; j++) { bctx.beginPath(); bctx.ellipse(x + j * w * .28, y + (j % 2 ? -6 : 4), w * .3, w * .12, 0, 0, 7); bctx.fill(); } }
  }
}
function sunPos(d) {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0), day = (d - start) / 864e5, g = 2 * Math.PI / 365 * (day - 1);
  const decl = .006918 - .399912 * Math.cos(g) + .070257 * Math.sin(g) - .006758 * Math.cos(2 * g) + .000907 * Math.sin(2 * g) - .002697 * Math.cos(3 * g) + .00148 * Math.sin(3 * g);
  const eqt = 229.18 * (.000075 + .001868 * Math.cos(g) - .032077 * Math.sin(g) - .014615 * Math.cos(2 * g) - .040849 * Math.sin(2 * g));
  let lon = -(d.getUTCHours() * 60 + d.getUTCMinutes() + eqt - 720) / 4; lon = ((lon + 540) % 360) - 180;
  return [lon, decl * R2D];
}
sun = sunPos(new Date());
const visible = p => filter === "all" || status(p) === filter;

function strokePts(pts) {
  ctx.beginPath(); let on = false;
  for (const q of pts) { if (q.vis) { if (on) ctx.lineTo(q.x, q.y); else { ctx.moveTo(q.x, q.y); on = true; } } else on = false; }
  ctx.stroke();
}
function render(lo) {
  rot = d3.geoRotation([V.lam, V.phi]);
  proj.rotate([V.lam, V.phi]).scale(V.R).translate([V.cx, V.cy]);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
  const { cx, cy, R } = V;
  const gl = ctx.createRadialGradient(cx, cy, R * .92, cx, cy, R * 1.16); gl.addColorStop(0, COL.glow); gl.addColorStop(1, "rgba(80,150,255,0)");
  ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(cx, cy, R * 1.16, 0, 7); ctx.fill();
  const oc = ctx.createRadialGradient(cx - R * .3, cy - R * .35, R * .1, cx, cy, R); oc.addColorStop(0, "#4FA3E0"); oc.addColorStop(.7, "#1F6BB0"); oc.addColorStop(1, "#0F477F");
  ctx.fillStyle = oc; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
  ctx.beginPath(); path(grat); ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = .7; ctx.stroke();
  if (landHi) {
    const land = lo ? landLo : landHi, bord = lo ? bordLo : bordHi;
    ctx.beginPath(); path(land); ctx.fillStyle = "#86BE6C"; ctx.fill();
    ctx.beginPath(); path(land); ctx.strokeStyle = "rgba(40,90,45,.55)"; ctx.lineWidth = .6; ctx.stroke();
    ctx.beginPath(); path(bord); ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = .6; ctx.stroke();
  }
  const anti = [sun[0] + 180, -sun[1]];
  [[89.6, .12]].concat(d3.range(88, 74, -2).map(r => [r, .055])).forEach(([r, a]) => { ctx.beginPath(); path(d3.geoCircle().center(anti).radius(r)()); ctx.fillStyle = `rgba(3,10,40,${a})`; ctx.fill(); });
  const li = ctx.createRadialGradient(cx - R * .4, cy - R * .45, 0, cx, cy, R * 1.05); li.addColorStop(0, "rgba(255,255,255,.22)"); li.addColorStop(.45, "rgba(255,255,255,0)"); li.addColorStop(1, "rgba(0,12,40,.42)");
  ctx.fillStyle = li; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();

  const sel = PLANES.find(p => p.id === selected);
  if (sel && posOf(sel) && AIRPORTS[latest(sel).airport]) {
    const I = d3.geoInterpolate(AIRPORTS[latest(sel).airport].c, posOf(sel)); const pts = d3.range(41).map(i => P(I(i / 40), 0));
    ctx.setLineDash([2, 5]); ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,.85)"; strokePts(pts); ctx.setLineDash([]);
  }
  PLANES.forEach(p => {
    const g = routeGeo(p); if (!g || !visible(p)) return;
    const isSel = p.id === selected, dim = selected && !isSel, N = 60;
    const IA = d3.geoInterpolate(g.A, g.pos), IB = d3.geoInterpolate(g.pos, g.B);
    const flownG = [], flownA = [], nextG = [], nextA = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, fa = t * g.f, fb = g.f + t * (1 - g.f);
      const a = IA(t), b = IB(t);
      flownG.push(P(a, 0)); flownA.push(P(a, Math.sin(Math.PI * fa) * g.hmax));
      nextG.push(P(b, 0)); nextA.push(P(b, Math.sin(Math.PI * fb) * g.hmax));
    }
    ctx.globalAlpha = dim ? .25 : 1;
    ctx.setLineDash([3, 4]); ctx.lineWidth = 1.3; ctx.strokeStyle = "rgba(0,15,35,.45)"; strokePts(flownG.concat(nextG)); ctx.setLineDash([]);
    ctx.lineCap = "round"; ctx.shadowColor = COL.route; ctx.shadowBlur = isSel ? 10 : 5;
    ctx.strokeStyle = COL.route; ctx.lineWidth = isSel ? 3.6 : 2.6; strokePts(flownA);
    ctx.shadowBlur = 0; ctx.setLineDash([3, 6]); ctx.lineWidth = isSel ? 2.6 : 2; ctx.globalAlpha = (dim ? .25 : 1) * .85;
    strokePts(nextA); ctx.setLineDash([]); ctx.globalAlpha = 1;
  });
  PLANES.forEach(p => {
    const ll = posOf(p); if (!ll || !visible(p)) return; const h = hOf(p); if (h <= 0) return;
    const g = P(ll, 0), a = P(ll, h); if (!g.vis) return;
    ctx.globalAlpha = selected && p.id !== selected ? .3 : 1;
    ctx.fillStyle = "rgba(0,10,30,.4)"; ctx.beginPath(); ctx.ellipse(g.x, g.y, 6, 3.2, 0, 0, 7); ctx.fill();
    if (a.vis) { ctx.setLineDash([1.5, 3]); ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(a.x, a.y); ctx.stroke(); ctx.setLineDash([]); }
    ctx.globalAlpha = 1;
  });
  place();
}

/* ================= HTML markers ================= */
function buildMarkers() {
  markers.innerHTML = "";
  CITIES.forEach(c => { const e = document.createElement("div"); e.className = "city t" + Math.min(c[3], 3); e.innerHTML = `<i></i><span>${c[0]}</span>`; e._ll = [c[1], c[2]]; e._tier = c[3]; e._kind = "city"; markers.appendChild(e); });
  LANDMARKS.forEach((m, i) => {
    const e = document.createElement("button"); e.type = "button"; e.className = "lm" + (m.aero ? " aero" : ""); e.setAttribute("aria-label", m.n);
    e.innerHTML = `<span class="ic"><svg viewBox="0 0 24 24">${ICONS[m.ic]}</svg></span><span class="nm">${esc(m.n)}</span>`; e._ll = m.c; e._kind = "lm"; e._i = i;
    e.addEventListener("click", ev => { ev.stopPropagation(); showFact(i); }); markers.appendChild(e);
  });
  const counts = {}; PLANES.forEach(p => p.sightings.forEach(s => { if (AIRPORTS[s.airport]) counts[s.airport] = (counts[s.airport] || 0) + 1; }));
  Object.keys(counts).forEach(code => {
    const e = document.createElement("button"); e.type = "button"; e.className = "pin"; e.dataset.ap = code;
    e.setAttribute("aria-label", `${apName(code)}: ${counts[code]} spots`);
    e.innerHTML = `<span class="head"><svg viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="12" rx="2.5"/><circle cx="12" cy="13" r="3"/></svg></span><span class="lbl">${code} · ${counts[code]}</span>`;
    e._ll = AIRPORTS[code].c; e._kind = "pin"; e.addEventListener("click", ev => { ev.stopPropagation(); openLogbook(code); }); markers.appendChild(e);
  });
  PLANES.forEach(p => {
    const e = document.createElement("button"); e.type = "button"; e._kind = "pl"; e._p = p;
    e.innerHTML = `<span class="hit"></span><span class="ring"></span><svg class="glyph" viewBox="0 0 24 24"><path d="${PLANE_D}"/></svg><span class="tag"></span>`;
    e.addEventListener("click", ev => { ev.stopPropagation(); select(p.id, true); });
    markers.appendChild(e); p._el = e;
  });
  refreshMarkerLabels();
  dirty = true;
}
function refreshMarkerLabels() {
  PLANES.forEach(p => {
    const e = p._el; if (!e) return; const st = status(p);
    e.className = "pl " + st;
    const txt = esc(p.reg) + (st === "last" ? ` · ${agoShort(lastAgo(p))} ago` : "");
    const tag = e.querySelector(".tag"); if (tag.innerHTML !== txt) { tag.innerHTML = txt; e._w = 0; }
    e.setAttribute("aria-label", `${p.reg}, ${st === "live" ? "broadcasting now" : st === "last" ? "last seen " + fmtAgo(lastAgo(p)) : "no position yet"}`);
  });
}
const overlap = (r, boxes) => boxes.some(o => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y);
function wOf(e, sel) { if (!e._w) { const s = e.querySelector(sel); e._w = s && s.offsetWidth ? s.offsetWidth : 80; } return e._w; }
function show(e, x, y) { e.hidden = false; e.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`; }
function place() {
  const boxes = [], zoomK = V.R / R0, sel = PLANES.find(p => p.id === selected), kids = [...markers.children];
  kids.filter(e => e._kind === "pl").sort((a, b) => (b._p.id === selected) - (a._p.id === selected) || (status(a._p) === "live" ? -1 : 1)).forEach(e => {
    const p = e._p, ll = posOf(p); if (!ll || !visible(p)) { e.hidden = true; return; }
    const h = hOf(p), q = P(ll, h); if (!q.vis) { e.hidden = true; return; }
    const ahead = P(destPoint(ll, headingOf(p), .01), h);
    let ang = Math.atan2(ahead.y - q.y, ahead.x - q.x) * R2D + 90; if (!isFinite(ang)) ang = 0;
    show(e, q.x, q.y); e.querySelector(".glyph").style.rotate = ang.toFixed(1) + "deg";
    e.classList.toggle("sel", p.id === selected); e.classList.toggle("dim", !!selected && p.id !== selected);
    const tag = e.querySelector(".tag"), r = { x: q.x + 16, y: q.y - 13, w: wOf(e, ".tag") + 4, h: 26 };
    const ok = p.id === selected || !overlap(r, boxes); tag.classList.toggle("off", !ok); if (ok) boxes.push(r);
    boxes.push({ x: q.x - 14, y: q.y - 14, w: 28, h: 28 });
  });
  kids.filter(e => e._kind === "pin").forEach(e => {
    const on = showPins || (sel && sel.sightings.some(s => s.airport === e.dataset.ap)); const q = P(e._ll, 0);
    if (!on || !q.vis || q.z < .05) { e.hidden = true; return; }
    show(e, q.x, q.y); const r = { x: q.x + 14, y: q.y - 36, w: wOf(e, ".lbl") + 2, h: 20 };
    e.querySelector(".lbl").classList.toggle("off", overlap(r, boxes)); boxes.push(r, { x: q.x - 14, y: q.y - 38, w: 28, h: 30 });
  });
  kids.filter(e => e._kind === "lm").forEach(e => {
    const q = P(e._ll, 0); if (!q.vis || q.z < .12) { e.hidden = true; return; }
    const ic = { x: q.x - 15, y: q.y - 15, w: 30, h: 30 };
    if (overlap(ic, boxes) && zoomK < 2.2) { e.hidden = true; return; }
    show(e, q.x, q.y); boxes.push(ic);
    const r = { x: q.x + 17, y: q.y - 10, w: wOf(e, ".nm"), h: 18 };
    const ok = zoomK >= 1.9 && !overlap(r, boxes); e.querySelector(".nm").classList.toggle("off", !ok); if (ok) boxes.push(r);
  });
  kids.filter(e => e._kind === "city").forEach(e => {
    const need = [0, 0, 1.9, 3.6, 7][e._tier]; const q = P(e._ll, 0);
    if (zoomK < need || !q.vis || q.z < .1) { e.hidden = true; return; }
    const r = { x: q.x - 3, y: q.y - 9, w: wOf(e, "span") + 10, h: 18 };
    if (overlap(r, boxes)) { e.hidden = true; return; }
    show(e, q.x, q.y); boxes.push(r);
  });
}

/* ================= touch, mouse, animation ================= */
const ptrs = new Map(); let moved = 0, pinch = null, lastPt = null;
stage.addEventListener("pointerdown", e => {
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); anim = null; vel = { l: 0, p: 0 };
  if (ptrs.size === 1) { moved = 0; lastPt = { x: e.clientX, y: e.clientY, t: performance.now() }; }
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), R: V.R }; }
});
window.addEventListener("pointermove", e => {
  if (!ptrs.has(e.pointerId)) return;
  const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2 && pinch) { const [a, b] = [...ptrs.values()]; V.R = clampR(pinch.R * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d); moved += 10; stopSpin(); markActive(); return; }
  if (ptrs.size !== 1) return;
  const dx = e.clientX - prev.x, dy = e.clientY - prev.y; moved += Math.abs(dx) + Math.abs(dy);
  if (moved < 6) return;
  if (!dragging) { dragging = true; stage.classList.add("dragging"); stopSpin(); }
  const k = R2D / V.R * 1.05;
  V.lam += dx * k; V.phi = Math.max(-85, Math.min(85, V.phi - dy * k));
  const now = performance.now(), dt = Math.max(1, now - lastPt.t); vel = { l: dx * k / dt * 16, p: -dy * k / dt * 16 }; lastPt = { x: e.clientX, y: e.clientY, t: now };
  markActive();
});
function endPtr(e) {
  if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (ptrs.size === 0) { if (performance.now() - (lastPt ? lastPt.t : 0) > 80) vel = { l: 0, p: 0 }; setTimeout(() => { dragging = false; stage.classList.remove("dragging"); }, 0); }
}
window.addEventListener("pointerup", endPtr); window.addEventListener("pointercancel", endPtr);
stage.addEventListener("click", e => { if (moved >= 6) { e.stopPropagation(); e.preventDefault(); moved = 0; } }, true);
stage.addEventListener("click", e => { if (e.target === cv) { hideFact(); closeSheets(); } });
stage.addEventListener("wheel", e => { e.preventDefault(); anim = null; V.R = clampR(V.R * Math.exp(-e.deltaY * .0018)); markActive(); }, { passive: false });
const clampR = r => Math.max(R0 * .75, Math.min(R0 * 24, r));
function markActive() { dirty = true; interacting = true; lastActive = performance.now(); }
function stopSpin() { if (spin) { spin = false; $("#spin").setAttribute("aria-pressed", "false"); } }
function animateTo(target, ms) {
  const from = { ...V }; const dl = ((target.lam - from.lam) % 360 + 540) % 360 - 180;
  anim = { from, to: { lam: from.lam + dl, phi: target.phi, R: target.R, cx: target.cx, cy: target.cy }, t0: performance.now(), ms: RM ? 1 : ms || 1100 };
  vel = { l: 0, p: 0 };
}
function focusXY() {
  const open = document.body.classList.contains("sheet-open");
  if (open && W >= 768) return { cx: (W - 430) / 2, cy: H / 2 };
  if (open) return { cx: W / 2, cy: H * .25 };
  return home();
}
function flyTo(ll, zoom) { stopSpin(); animateTo({ lam: -ll[0], phi: -ll[1], R: clampR(R0 * zoom), ...focusXY() }); }
function flyHome() { animateTo({ ...HOME, R: R0, ...home() }); }
function frame(t) {
  let moving = false;
  if (anim) {
    const k = Math.min(1, (t - anim.t0) / anim.ms), e = d3.easeCubicInOut(k);
    for (const key of ["lam", "phi", "R", "cx", "cy"]) V[key] = anim.from[key] + (anim.to[key] - anim.from[key]) * e;
    const hop = Math.abs(anim.to.lam - anim.from.lam) + Math.abs(anim.to.phi - anim.from.phi);
    if (hop > 40) V.R *= 1 - Math.sin(Math.PI * e) * Math.min(.35, hop / 400);
    moving = true; if (k >= 1) anim = null;
  } else if (!dragging && (Math.abs(vel.l) > .01 || Math.abs(vel.p) > .01)) {
    V.lam += vel.l; V.phi = Math.max(-85, Math.min(85, V.phi + vel.p)); vel.l *= .93; vel.p *= .93; moving = true;
  } else if (spin && !dragging && !selected && ptrs.size === 0 && !document.body.classList.contains("sheet-open")) { V.lam += .06; moving = true; }
  if (moving) { dirty = true; interacting = true; lastActive = t; }
  if (dirty) { render(interacting); dirty = false; needHi = interacting; interacting = false; }
  else if (needHi && t - lastActive > 160) { render(false); needHi = false; }
  requestAnimationFrame(frame);
}

/* ================= landmark facts, welcome ================= */
function showFact(i) {
  const m = LANDMARKS[i]; closeSheets(true);
  const f = $("#fact");
  f.innerHTML = `<div class="fi"><svg viewBox="0 0 24 24">${ICONS[m.ic]}</svg></div><div><div class="kid">${m.aero ? "Aviation history" : "Did you know?"}</div><h3>${esc(m.n)}</h3><div class="pl2">${esc(m.pl)}</div><p>${esc(m.f)}</p></div><button class="icon-btn" type="button" id="factX" aria-label="Close fact">${CLOSE_SVG}</button>`;
  f.hidden = false; document.body.classList.add("fact-open"); $("#legend").open = false; $("#welcome").hidden = true;
  $("#factX").addEventListener("click", hideFact);
  markers.querySelectorAll(".lm").forEach(e => e.classList.toggle("on", e._i === i));
  flyTo(m.c, Math.max(V.R / R0, 3.2));
}
function hideFact() { $("#fact").hidden = true; document.body.classList.remove("fact-open"); markers.querySelectorAll(".lm.on").forEach(e => e.classList.remove("on")); updWelcome(); }
function updWelcome() { $("#welcome").hidden = PLANES.length > 0 || document.body.classList.contains("sheet-open") || !$("#fact").hidden; }
$("#welcomeAdd").addEventListener("click", () => openAdd());

/* ================= panels ================= */
function openSheet(id) {
  hideFact();
  document.querySelectorAll(".sheet").forEach(s => s.classList.toggle("open", s.id === id));
  document.body.classList.add("sheet-open"); updWelcome();
  const b = document.querySelector(`#${id} [data-close]`); if (b) setTimeout(() => b.focus({ preventScroll: true }), 60);
}
function closeSheets(keepView) {
  const was = document.body.classList.contains("sheet-open");
  document.querySelectorAll(".sheet").forEach(s => s.classList.remove("open"));
  document.body.classList.remove("sheet-open");
  if (selected) { selected = null; dirty = true; }
  if (was && !keepView) animateTo({ lam: V.lam, phi: V.phi, R: V.R, ...home() }, 500);
  updWelcome();
}
document.addEventListener("click", e => { if (e.target.closest("[data-close]")) closeSheets(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") { if (!$("#lightbox").hidden) closeLightbox(); else if (!$("#fact").hidden) hideFact(); else closeSheets(); } });

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
      <p class="expl">It isn't broadcasting right now, so the globe shows where it was last heard. ${p.last.onGround ? "It's probably parked between flights." : "It's flying where no receivers can hear it, and will pop back up when it's in range."}</p>
    </section>`;
  }
  return `<section class="status none"><div class="st-top"><span class="pill none">No position yet</span></div><p class="expl">We haven't heard this plane since you logged it. It'll appear on the globe as soon as it starts broadcasting.</p></section>`;
}
function renderDetail(p) {
  const media = allMedia(p), ty = typeInfo(p.icao_type), n = spots(p), admin = me && me.role === "admin";
  const tiles = media.map((m, i) => {
    const dt = `<span class="dt">${fmtDate(m.date)}</span>`;
    if (m.kind === "video") return `<button class="mtile" type="button" data-m="${i}" aria-label="Play video">${m.poster ? `<img src="${m.poster}" alt="" loading="lazy">` : ""}<span class="play"><span><svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg></span></span>${dt}</button>`;
    return `<button class="mtile" type="button" data-m="${i}" aria-label="Open photo ${i + 1}"><img src="${m.poster || m.url}" alt="Photo of ${esc(p.reg)}" loading="lazy">${dt}</button>`;
  }).join("");
  const sights = p.sightings.slice().sort((a, b) => b.spotted_on.localeCompare(a.spotted_on)).map(s => `<li><span class="nd"></span><div><b>${esc(apName(s.airport))}</b> <span class="m">${fmtDate(s.spotted_on)}</span>${s.note ? `<q>${esc(s.note)}</q>` : ""}${admin ? `<div class="acts"><button class="mini del" type="button" data-dels="${s.id}">Delete this spot</button></div>` : ""}</div></li>`).join("");
  const buses = ty ? Math.round(ty.span / 11.2 * 2) / 2 : 0;
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
        ${AIRPORTS[latest(p).airport] ? `<button class="btn flat" type="button" data-go="spot"><svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>Where I saw it</button>` : ""}
        ${posOf(p) ? `<button class="btn flat" type="button" data-go="plane"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>${p.live ? "Where it is now" : "Last position"}</button>` : ""}
      </div>
      ${admin ? `<div class="btnrow"><button class="btn danger" type="button" data-delp>Delete ${esc(p.reg)} from the logbook</button></div>` : ""}
    </div>`;
  const d = $("#detail");
  d.querySelectorAll("[data-m]").forEach(b => b.addEventListener("click", () => openLightbox(media[+b.dataset.m])));
  const gs = d.querySelector('[data-go="spot"]'); if (gs) gs.addEventListener("click", () => flyTo(AIRPORTS[latest(p).airport].c, 9));
  const gp = d.querySelector('[data-go="plane"]'); if (gp) gp.addEventListener("click", () => flyTo(posOf(p), Math.max(V.R / R0, 3)));
  d.querySelectorAll("[data-dels]").forEach(b => b.addEventListener("click", () => deleteSighting(p, p.sightings.find(s => s.id === b.dataset.dels))));
  const dp = d.querySelector("[data-delp]"); if (dp) dp.addEventListener("click", () => deletePlane(p));
  updClock();
}
function select(id, fly) {
  const p = PLANES.find(x => x.id === id); if (!p) return;
  selected = id; renderDetail(p); openSheet("detail"); dirty = true;
  if (fly) { const ll = posOf(p) || (AIRPORTS[latest(p).airport] || {}).c; if (ll) flyTo(ll, posOf(p) ? (p.live && !p.live.onGround ? 2.4 : 3.2) : 6); }
}

/* ================= photo / video viewer ================= */
let lbItem = null;
function openLightbox(m) {
  lbItem = m;
  const body = $("#lbBody");
  if (m.kind === "video") {
    body.innerHTML = m.url ? `<video src="${m.url}" controls playsinline autoplay ${m.poster ? `poster="${m.poster}"` : ""}></video>` : `<p style="color:#fff">This is a sample video, so there's nothing to play.</p>`;
  } else body.innerHTML = `<img src="${m.url || m.poster}" alt="">`;
  $("#lbDel").hidden = !(me && me.role === "admin") || m.sample;
  $("#lightbox").hidden = false;
}
function closeLightbox() { $("#lightbox").hidden = true; $("#lbBody").innerHTML = ""; lbItem = null; }
$("#lbClose").addEventListener("click", closeLightbox);
$("#lightbox").addEventListener("click", e => { if (e.target.id === "lightbox" || e.target.id === "lbBody") closeLightbox(); });
$("#lbDel").addEventListener("click", async () => {
  if (!lbItem || !confirm(`Delete this ${lbItem.kind}? This can't be undone.`)) return;
  try { await store.deleteMedia(lbItem); closeLightbox(); toast(`${lbItem ? lbItem.kind : "Item"} deleted`); await reload(selected); }
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

/* ================= logbook ================= */
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
  }).join("") : PLANES.length ? `<p class="empty">No planes match “${esc(q)}”.</p>` : `<p class="empty">Nothing logged yet. Tap Add spot to log your first plane.</p>`;
  $("#list").querySelectorAll(".row").forEach(r => r.addEventListener("click", () => select(r.dataset.id, true)));
  const admin = me && me.role === "admin";
  $("#acct").innerHTML = `
    ${store.mode === "demo" ? `<div class="banner">Demo mode: these are sample planes and nothing is saved.</div>` : ""}
    <div class="who">Signed in as <b>${esc(me.name || me.email)}</b>${admin ? " (admin)" : ""}</div>
    <div class="btnrow">
      ${admin ? `<button class="btn flat" type="button" id="exportBtn">Download backup</button>` : ""}
      <button class="btn flat" type="button" id="signOutBtn">Sign out</button>
    </div>`;
  $("#signOutBtn").addEventListener("click", signOut);
  const ex = $("#exportBtn"); if (ex) ex.addEventListener("click", exportBackup);
}
function openLogbook(ap) { logAp = ap || null; selected = null; $("#q").value = ""; renderList(); openSheet("logbook"); dirty = true; }
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
  const head = `<div class="sh-head"><div><h2>Hangar stats</h2><div class="sh-sub">Everything you've spotted so far</div></div><button class="icon-btn" data-close type="button" aria-label="Close">${CLOSE_SVG}</button></div>`;
  if (!total) {
    $("#stats").innerHTML = head + `<div class="sh-body"><p class="empty">No spots yet. Your stats and badges start filling up as soon as you log your first plane.</p><section><h3 class="eyebrow">Badges to earn</h3><div class="badges">${badgesHTML}</div></section></div>`;
    return;
  }
  const air = tally(p => p.airline), types = tally(p => p.type_name), aps = tally((p, s) => s.airport);
  const airPlane = name => PLANES.find(p => p.airline === name);
  const topPlane = PLANES.slice().sort((a, b) => spots(b) - spots(a) || latest(b).spotted_on.localeCompare(latest(a).spotted_on))[0];
  const live = PLANES.filter(p => p.live && !p.live.onGround);
  const hi = live.filter(p => p.live.alt != null).sort((a, b) => b.live.alt - a.live.alt)[0];
  const fast = live.filter(p => p.live.gs != null).sort((a, b) => b.live.gs - a.live.gs)[0];
  const far = PLANES.filter(p => posOf(p) && AIRPORTS[latest(p).airport]).map(p => ({ p, mi: d3.geoDistance(AIRPORTS[latest(p).airport].c, posOf(p)) * EARTH_MI })).sort((a, b) => b.mi - a.mi)[0];
  const inAir = PLANES.filter(p => posOf(p) && hOf(p) > 0).length, onGround = PLANES.filter(p => posOf(p) && hOf(p) === 0).length;
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
        ${far ? tile("Furthest from where you saw it", `<span class="v mono">${esc(far.p.reg)}</span>`, `${num(far.mi)} miles away`, "", far.p.id) : ""}
        ${tile("In the air / on the ground", `<span class="v">${inAir} / ${onGround}</span>`, `${PLANES.filter(p => p.live).length} broadcasting live`)}
      </div></section>
      ${air.length ? `<section><h3 class="eyebrow">Spots by airline</h3><div class="chart">${air.map(([n, v]) => `<div class="bar-row" title="${esc(n)}: ${v} spots"><span class="nm">${tailSVG(airPlane(n))}${esc(n)}</span><span class="trk"><span class="fill" style="width:${v / maxA * 100}%"></span></span><span class="val">${v}</span></div>`).join("")}</div></section>` : ""}
      <section><h3 class="eyebrow">Spots by month</h3><div class="cols">${months.map(m => `<div class="col" title="${m.label}: ${m.v} spots"><span class="cv${m.v ? "" : " z"}">${m.v}</span><span class="c" style="height:${m.v / maxM * 80}%"></span></div>`).join("")}</div><div class="collbl">${months.map(m => `<span>${m.label}</span>`).join("")}</div></section>
      <section><h3 class="eyebrow">Badges · ${earned} earned</h3><div class="badges">${badgesHTML}</div></section>
    </div>`;
  $("#stats").querySelectorAll("[data-sel]").forEach(b => b.addEventListener("click", () => select(b.dataset.sel, true)));
}
$("#openStats").addEventListener("click", () => { selected = null; renderStats(); openSheet("stats"); dirty = true; });

/* ================= filters, controls ================= */
document.querySelectorAll(".seg [data-f]").forEach(b => b.addEventListener("click", () => {
  filter = b.dataset.f; document.querySelectorAll(".seg [data-f]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  const s = PLANES.find(p => p.id === selected); if (s && !visible(s)) closeSheets(); dirty = true;
}));
$("#pinToggle").addEventListener("click", e => { showPins = !showPins; e.currentTarget.setAttribute("aria-pressed", String(showPins)); dirty = true; });
$("#zin").addEventListener("click", () => animateTo({ ...V, R: clampR(V.R * 1.8) }, 300));
$("#zout").addEventListener("click", () => animateTo({ ...V, R: clampR(V.R / 1.8) }, 300));
$("#zfit").addEventListener("click", () => { hideFact(); closeSheets(true); flyHome(); });
$("#spin").addEventListener("click", e => { spin = !spin; e.currentTarget.setAttribute("aria-pressed", String(spin)); if (spin) { closeSheets(true); hideFact(); } });

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
let pending = [], found = null, lookupSeq = 0, exifUsed = false;
function resetAdd() {
  $("#regIn").value = ""; $("#noteIn").value = ""; $("#lookupOut").innerHTML = ""; $("#addErr").hidden = true; $("#planeFields").hidden = true;
  $("#tyIn").value = ""; $("#alIn").value = ""; $("#exifHint").hidden = true; exifUsed = false;
  pending = []; renderPrev(); found = null;
  $("#dateIn").value = todayISO(); $("#dateIn").max = todayISO();
  apSel.value = lsGet("spotters.lastAirport") || "LBA";
  const sb = $("#saveBtn"); sb.disabled = false; sb.textContent = "Save to logbook";
}
function openAdd() { resetAdd(); selected = null; openSheet("add"); dirty = true; setTimeout(() => $("#regIn").focus(), 350); }
$("#openAdd").addEventListener("click", openAdd);
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
      if (ex.lat != null) { const a = nearestAirport([ex.lon, ex.lat], 25); if (a) { apSel.value = a.code; bits.push("airport"); } }
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
    for (const p of PLANES) {
      const L = res.planes[p.reg];
      const isLive = L && L.seenPos != null && L.seenPos <= LIVE_MAX_AGE_S;
      if (!isLive) {
        // keep the old live data briefly if the feed failed, otherwise fall back to last seen
        if (!(res.errors && p.live && now - (p.liveAt || 0) < 120000)) p.live = null;
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
    refreshMarkerLabels(); updBrand(); dirty = true;
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
setInterval(() => { sun = sunPos(new Date()); refreshMarkerLabels(); dirty = true; }, 60000);

/* ================= data loading ================= */
async function reload(selectId) {
  const prevLive = Object.fromEntries(PLANES.map(p => [p.reg, { live: p.live, liveAt: p.liveAt }]));
  PLANES = await store.loadAll();
  PLANES.forEach(p => { if (prevLive[p.reg]) Object.assign(p, prevLive[p.reg]); });
  dataLoadedAt = Date.now();
  buildMarkers(); updBrand(); updWelcome();
  if (selectId && PLANES.find(p => p.id === selectId) && $("#detail").classList.contains("open")) renderDetail(PLANES.find(p => p.id === selectId));
  if ($("#logbook").classList.contains("open")) renderList();
  if ($("#stats").classList.contains("open")) renderStats();
}

/* ================= sign in / out ================= */
function showLogin(msg) {
  $("#login").hidden = false; $("#boot").hidden = true;
  $("#demoNote").hidden = store.mode !== "demo";
  const le = $("#loginErr"); le.hidden = !msg; le.textContent = msg || "";
  setTimeout(() => $("#em").focus(), 100);
}
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
    le.textContent = /invalid login/i.test(ex.message) ? "That email and password don't match. Check them and try again." : ex.message; le.hidden = false;
  } finally { btn.disabled = false; btn.textContent = "Sign in"; }
});
async function signOut() {
  clearInterval(posTimer);
  await store.signOut();
  me = null; PLANES = []; closeSheets(true); buildMarkers(); updBrand(); showLogin();
}
async function startApp() {
  $("#login").hidden = true; $("#boot").hidden = true;
  try { await reload(null); }
  catch (e) { toast("Couldn't load your logbook: " + e.message, 6000); }
  refreshPositions(); startPositionLoop();
}

/* ================= boot ================= */
async function boot() {
  const themeChange = () => { drawBg(); dirty = true; };
  if (window.matchMedia) { const mq = matchMedia("(prefers-color-scheme: dark)"); mq.addEventListener && mq.addEventListener("change", themeChange); }
  let rT; new ResizeObserver(() => { clearTimeout(rT); rT = setTimeout(() => { sizeAll(); markers.querySelectorAll("*").forEach(e => e._w = 0); }, 100); }).observe(stage);
  if (innerWidth < 640) $("#legend").open = false;
  sizeAll(); V.R = R0; Object.assign(V, home());
  buildMarkers(); updBrand();
  requestAnimationFrame(frame);
  loadWorld().then(() => { dirty = true; }).catch(() => toast("Couldn't load the map shapes. Check your connection."));
  try { store = await createStore(window.SPOTTERS_CONFIG || {}); }
  catch (e) { $("#boot").textContent = "Couldn't connect. Check your internet and refresh."; return; }
  store.onSignedOut(() => { if (me) { me = null; PLANES = []; buildMarkers(); showLogin("You've been signed out."); } });
  try {
    const user = await store.currentUser();
    if (user && user.role) { me = user; await startApp(); return; }
    if (user && !user.role) await store.signOut();
  } catch (e) { /* fall through to login */ }
  showLogin();
}
boot();
