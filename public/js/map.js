// The 3D globe: MapLibre with free OpenStreetMap tiles (OpenFreeMap) or Sentinel-2 satellite imagery (EOX).
// Planes, spot pins and nearby-airport traffic are HTML markers; routes and airports are map layers.
import { PLANE_D } from './data.js';

const maplibregl = window.maplibregl;
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const SAT_TILES = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg';
const SAT_ATTR = '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless 2024 by EOX</a> (contains modified Copernicus Sentinel data)';
const ROUTE = '#E3177E';
const HOME_CENTER = [-3, 38];
const SKY = {
  'sky-color': '#0E2038', 'horizon-color': '#9cc7f0', 'fog-color': '#ffffff',
  'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0]
};

function pickFont(style, bold) {
  const fonts = [];
  (style.layers || []).forEach(l => { const f = l.layout && l.layout['text-font']; if (Array.isArray(f) && typeof f[0] === 'string') fonts.push(f); });
  return fonts.find(f => /bold/i.test(f[0])) && bold ? fonts.find(f => /bold/i.test(f[0])) : (fonts.find(f => /regular/i.test(f[0])) || fonts[0] || ['Noto Sans Regular']);
}

function satelliteStyle(base) {
  const s = JSON.parse(JSON.stringify(base));
  s.sources.satellite = { type: 'raster', tiles: [SAT_TILES], tileSize: 256, maxzoom: 14, attribution: SAT_ATTR };
  const keepLine = /transportation|boundary|aeroway/;
  s.layers = s.layers.filter(l => l.type === 'symbol' || (l.type === 'line' && keepLine.test(l['source-layer'] || '')));
  s.layers.forEach(l => {
    const sl = l['source-layer'] || '';
    if (l.type === 'line' && /transportation/.test(sl)) l.paint = { ...(l.paint || {}), 'line-opacity': 0.5 };
    if (l.type === 'line' && /boundary/.test(sl)) l.paint = { ...(l.paint || {}), 'line-color': '#ffffff', 'line-opacity': 0.55 };
    if (l.type === 'symbol' && l.layout && l.layout['text-field']) l.paint = { ...(l.paint || {}), 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.8)', 'text-halo-width': 1.4 };
  });
  s.layers.unshift({ id: 'satellite', type: 'raster', source: 'satellite', paint: { 'raster-fade-duration': 150 } });
  s.layers.unshift({ id: 'sat-bg', type: 'background', paint: { 'background-color': '#0b1d33' } });
  return s;
}

function prep(style) {
  const s = JSON.parse(JSON.stringify(style));
  s.projection = { type: 'globe' };
  s.sky = SKY;
  return s;
}

const toRad = d => d * Math.PI / 180;
function angDeg(a, b) {
  const h = Math.sin(toRad(b[1] - a[1]) / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(toRad(b[0] - a[0]) / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h))) * 180 / Math.PI;
}
const overlap = (r, boxes) => boxes.some(o => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y);

export async function createMap(opts) {
  let base;
  try {
    const r = await fetch(opts.styleUrl || STYLE_URL);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    base = await r.json();
  } catch (e) {
    throw new Error("Couldn't load the map. Check your internet connection and refresh.");
  }
  const styles = { map: prep(base), satellite: prep(satelliteStyle(base)) };
  const fontBold = pickFont(base, true);
  let mode = opts.mode === 'satellite' ? 'satellite' : 'map';

  const map = new maplibregl.Map({
    container: opts.container,
    style: styles[mode],
    center: HOME_CENTER,
    zoom: homeZoom(),
    attributionControl: false,
    maxPitch: 70,
    fadeDuration: 150,
    dragRotate: true,
    touchPitch: true
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

  // ---------- data for layers ----------
  let airportsFC = { type: 'FeatureCollection', features: [] };
  let routesFC = { type: 'FeatureCollection', features: [] };
  let spotFC = { type: 'FeatureCollection', features: [] };

  function homeZoom() {
    const el = opts.container, w = el.clientWidth || 800, h = (el.clientHeight || 800) - 120;
    const radius = 0.44 * Math.min(w, h);
    return Math.max(0.3, Math.log2(radius * 2 * Math.PI / 512));
  }

  function addOverlays() {
    try { map.setProjection({ type: 'globe' }); } catch (e) { /* older engine */ }
    try { map.setSky(SKY); } catch (e) { /* optional */ }
    const sat = mode === 'satellite';
    if (!map.getSource('airports')) map.addSource('airports', { type: 'geojson', data: airportsFC });
    if (!map.getSource('routes')) map.addSource('routes', { type: 'geojson', data: routesFC });
    if (!map.getSource('spotline')) map.addSource('spotline', { type: 'geojson', data: spotFC });
    const AP_FILTER = ['any', ['get', 'mine'], ['all', ['==', ['get', 's'], 1], ['>=', ['zoom'], 2.6]], ['>=', ['zoom'], 5.5]];
    if (!map.getLayer('ap-dot')) map.addLayer({
      id: 'ap-dot', type: 'circle', source: 'airports', filter: AP_FILTER,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, ['case', ['get', 'mine'], 3.4, ['==', ['get', 's'], 1], 2.2, 1.6], 6, ['case', ['get', 'mine'], 7, ['==', ['get', 's'], 1], 5.5, 4], 11, 8],
        'circle-color': ['case', ['get', 'mine'], ROUTE, '#1F6FD1'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 1, 0.8, 6, 1.8],
        'circle-pitch-alignment': 'map'
      }
    });
    if (!map.getLayer('ap-label')) map.addLayer({
      id: 'ap-label', type: 'symbol', source: 'airports', minzoom: 3, filter: AP_FILTER,
      layout: {
        'text-field': ['step', ['zoom'], ['get', 'code'], 8, ['concat', ['get', 'code'], '  ', ['get', 'name']]],
        'text-font': fontBold,
        'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 8, 12.5],
        'text-offset': [0, 0.9], 'text-anchor': 'top',
        'symbol-sort-key': ['case', ['get', 'mine'], 0, ['get', 's']]
      },
      paint: { 'text-color': sat ? '#ffffff' : '#0F3D75', 'text-halo-color': sat ? 'rgba(0,0,0,0.85)' : '#ffffff', 'text-halo-width': 1.5 }
    });
    if (!map.getLayer('rt-next')) map.addLayer({
      id: 'rt-next', type: 'line', source: 'routes', filter: ['==', ['get', 'k'], 'next'],
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': ROUTE, 'line-width': ['case', ['get', 'sel'], 3, 2], 'line-dasharray': [1, 2.4], 'line-opacity': ['case', ['get', 'dim'], 0.25, 0.9] }
    });
    if (!map.getLayer('rt-flown')) map.addLayer({
      id: 'rt-flown', type: 'line', source: 'routes', filter: ['==', ['get', 'k'], 'flown'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ROUTE, 'line-width': ['case', ['get', 'sel'], 4, 2.6], 'line-opacity': ['case', ['get', 'dim'], 0.3, 1] }
    });
    if (!map.getLayer('spotline')) map.addLayer({
      id: 'spotline', type: 'line', source: 'spotline', layout: { 'line-cap': 'round' },
      paint: { 'line-color': sat ? '#ffffff' : '#13202B', 'line-width': 2, 'line-dasharray': [0.3, 2.2], 'line-opacity': 0.85 }
    });
  }
  map.on('style.load', addOverlays);

  // ---------- clicks ----------
  map.on('click', e => {
    const { x, y } = e.point;
    const hits = map.getLayer('ap-dot') ? map.queryRenderedFeatures([[x - 12, y - 12], [x + 12, y + 12]], { layers: ['ap-dot'] }) : [];
    if (hits.length) {
      hits.sort((a, b) => {
        const pa = map.project(a.geometry.coordinates), pb = map.project(b.geometry.coordinates);
        return Math.hypot(pa.x - x, pa.y - y) - Math.hypot(pb.x - x, pb.y - y);
      });
      opts.onAirport && opts.onAirport(hits[0].properties.key);
    } else opts.onBackground && opts.onBackground();
  });
  map.on('mousemove', e => {
    if (!map.getLayer('ap-dot')) return;
    const { x, y } = e.point;
    const hit = map.queryRenderedFeatures([[x - 8, y - 8], [x + 8, y + 8]], { layers: ['ap-dot'] }).length;
    map.getCanvas().style.cursor = hit ? 'pointer' : '';
  });

  // ---------- spinning ----------
  let spinning = !!opts.spin, busy = false;
  function spinStep() {
    if (!spinning || busy || map.getZoom() > 3.5 || map.isMoving()) return;
    const c = map.getCenter();
    map.easeTo({ center: [c.lng + 4, c.lat], duration: 2500, easing: t => t });
  }
  map.on('moveend', () => { if (spinning) setTimeout(spinStep, 0); });
  const userStart = () => { busy = true; if (spinning) { spinning = false; opts.onSpinStop && opts.onSpinStop(); } };
  const userEnd = () => { busy = false; };
  ['mousedown', 'touchstart', 'wheel', 'dragstart', 'pitchstart', 'rotatestart'].forEach(ev => map.on(ev, userStart));
  ['mouseup', 'touchend', 'dragend'].forEach(ev => map.on(ev, userEnd));
  map.on('load', () => spinStep());

  // ---------- HTML markers ----------
  const planeMk = new Map(), pinMk = new Map(), trafMk = new Map();
  function marker(el, ll) { return new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(ll).addTo(map); }

  let planeData = [];
  function setPlanes(list) {
    planeData = list;
    const seen = new Set();
    list.forEach(p => {
      seen.add(p.id);
      let m = planeMk.get(p.id);
      if (!m) {
        const el = document.createElement('button');
        el.type = 'button';
        el.innerHTML = `<span class="hit"></span><span class="ring"></span><svg class="glyph" viewBox="0 0 24 24"><path d="${PLANE_D}"/></svg><span class="tag"></span>`;
        el.addEventListener('click', ev => { ev.stopPropagation(); opts.onPlane && opts.onPlane(el._id); });
        m = { el, mk: marker(el, p.ll) };
        planeMk.set(p.id, m);
      }
      m.el._id = p.id; m.data = p;
      m.mk.setLngLat(p.ll);
      m.el.className = `pl ${p.status}${p.sel ? ' sel' : ''}${p.dim ? ' dim' : ''}`;
      m.el.hidden = !p.show;
      m.el.setAttribute('aria-label', p.aria);
      const tag = m.el.querySelector('.tag');
      if (tag.textContent !== p.label) { tag.textContent = p.label; m.w = 0; }
    });
    for (const [id, m] of planeMk) if (!seen.has(id)) { m.mk.remove(); planeMk.delete(id); }
    layout();
  }
  function setPins(list) {
    const seen = new Set();
    list.forEach(p => {
      seen.add(p.code);
      let m = pinMk.get(p.code);
      if (!m) {
        const el = document.createElement('button');
        el.type = 'button'; el.className = 'pin';
        el.innerHTML = `<span class="head"><svg viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="12" rx="2.5"/><circle cx="12" cy="13" r="3"/></svg></span><span class="lbl"></span>`;
        el.addEventListener('click', ev => { ev.stopPropagation(); opts.onPin && opts.onPin(p.code); });
        m = { el, mk: marker(el, p.ll) };
        pinMk.set(p.code, m);
      }
      m.data = p;
      m.el.querySelector('.lbl').textContent = `${p.code} · ${p.count}`;
      m.el.setAttribute('aria-label', `${p.name}: ${p.count} spots`);
      m.el.hidden = !p.show;
    });
    for (const [k, m] of pinMk) if (!seen.has(k)) { m.mk.remove(); pinMk.delete(k); }
    layout();
  }
  function setTraffic(list) {
    const seen = new Set();
    list.forEach(t => {
      seen.add(t.key);
      let m = trafMk.get(t.key);
      if (!m) {
        const el = document.createElement('button');
        el.type = 'button';
        el.innerHTML = `<svg class="glyph" viewBox="0 0 24 24"><path d="${PLANE_D}"/></svg><span class="tag"></span>`;
        el.addEventListener('click', ev => { ev.stopPropagation(); opts.onTraffic && opts.onTraffic(el._key); });
        m = { el, mk: marker(el, t.ll) };
        trafMk.set(t.key, m);
      }
      m.el._key = t.key; m.data = t;
      m.el.className = `trf ${t.phase}${t.mine ? ' mine' : ''}`;
      m.mk.setLngLat(t.ll);
      const tag = m.el.querySelector('.tag'); if (tag.textContent !== t.label) { tag.textContent = t.label; m.w = 0; }
    });
    for (const [k, m] of trafMk) if (!seen.has(k)) { m.mk.remove(); trafMk.delete(k); }
    layout();
  }

  // Hide markers on the far side of the globe, rotate planes to their heading, and stop labels piling up.
  let raf = 0;
  function layout() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; doLayout(); }); }
  function doLayout() {
    const c = map.getCenter(), center = [c.lng, c.lat], z = map.getZoom(), bearing = map.getBearing();
    const limit = z < 5 ? 84 : 180;
    const boxes = [];
    const place = (m, tagSel, ll) => {
      const far = angDeg(center, ll) > limit;
      m.el.classList.toggle('far', far);
      if (far || m.el.hidden) return null;
      return map.project(ll);
    };
    [...planeMk.values()].sort((a, b) => (b.data.sel - a.data.sel) || ((a.data.status === 'live') ? -1 : 1)).forEach(m => {
      const p = m.data, q = place(m, '.tag', p.ll); if (!q) return;
      m.el.querySelector('.glyph').style.rotate = ((p.track || 0) - bearing).toFixed(1) + 'deg';
      const tag = m.el.querySelector('.tag');
      if (!m.w) m.w = tag.offsetWidth || 70;
      const r = { x: q.x + 16, y: q.y - 13, w: m.w + 4, h: 26 };
      const ok = p.sel || !overlap(r, boxes); tag.classList.toggle('off', !ok); if (ok) boxes.push(r);
      boxes.push({ x: q.x - 14, y: q.y - 14, w: 28, h: 28 });
    });
    trafMk.forEach(m => {
      const t = m.data, q = place(m, '.tag', t.ll); if (!q) return;
      m.el.querySelector('.glyph').style.rotate = ((t.track || 0) - bearing).toFixed(1) + 'deg';
      const tag = m.el.querySelector('.tag');
      if (!m.w) m.w = tag.offsetWidth || 60;
      const r = { x: q.x + 11, y: q.y - 10, w: m.w + 2, h: 20 };
      const ok = !overlap(r, boxes) || t.hl; tag.classList.toggle('off', !ok); if (ok) boxes.push(r);
    });
    pinMk.forEach(m => {
      const q = place(m, '.lbl', m.data.ll); if (!q) return;
      const lbl = m.el.querySelector('.lbl');
      if (!m.w) m.w = lbl.offsetWidth || 60;
      const r = { x: q.x + 14, y: q.y - 36, w: m.w, h: 20 };
      lbl.classList.toggle('off', overlap(r, boxes)); boxes.push(r);
    });
  }
  map.on('move', layout);
  map.on('resize', layout);

  // ---------- public API ----------
  return {
    map,
    get mode() { return mode; },
    setMode(m) {
      if (m === mode) return;
      mode = m;
      map.setStyle(styles[mode], { diff: false });
    },
    setAirports(features) { airportsFC = { type: 'FeatureCollection', features }; const s = map.getSource('airports'); if (s) s.setData(airportsFC); },
    setRoutes(features) { routesFC = { type: 'FeatureCollection', features }; const s = map.getSource('routes'); if (s) s.setData(routesFC); },
    setSpotLine(coords) { spotFC = { type: 'FeatureCollection', features: coords ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] : [] }; const s = map.getSource('spotline'); if (s) s.setData(spotFC); },
    setPlanes, setPins, setTraffic,
    highlightTraffic(key) { trafMk.forEach((m, k) => { m.data.hl = k === key; m.el.classList.toggle('hl', k === key); }); layout(); },
    flyTo(ll, zoom, padding) { map.flyTo({ center: ll, zoom, padding, duration: 1800, essential: true, curve: 1.5 }); },
    flyHome(padding) { map.flyTo({ center: HOME_CENTER, zoom: homeZoom(), padding, pitch: 0, bearing: 0, duration: 1500, essential: true }); },
    zoomBy(d) { map.easeTo({ zoom: map.getZoom() + d, duration: 300 }); },
    setPadding(padding) { map.easeTo({ padding, duration: 450 }); },
    setSpin(on) { spinning = on; if (on) spinStep(); else map.stop(); },
    resize() { map.resize(); },
    onReady(fn) { if (map.loaded()) fn(); else map.once('load', fn); }
  };
}

// Great-circle points between two [lon, lat] points, with longitudes kept continuous across the date line.
export function arc(a, b, n = 64) {
  const I = window.d3.geoInterpolate(a, b), out = [];
  for (let i = 0; i <= n; i++) {
    const p = I(i / n);
    if (out.length) { const prev = out[out.length - 1][0]; while (p[0] - prev > 180) p[0] -= 360; while (p[0] - prev < -180) p[0] += 360; }
    out.push(p);
  }
  return out;
}
