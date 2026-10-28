// Demo mode: sample planes and a pretend live feed, used when Supabase isn't set up yet.
import { AIRPORTS, AIRLINES } from './data.js';

const SKY = { blue: ["#4F8CC9", "#CFE4F4"], gold: ["#D9824B", "#F8D9A6"], grey: ["#8E9AA4", "#D7DCE0"], dusk: ["#24345A", "#C47A5E"] };
function photo(liv, sky, pose, quad, tag) {
  const s = SKY[sky]; let win = ""; for (let x = 70; x <= 242; x += 8) win += `<circle cx="${x}" cy="32" r="2.1" fill="#2B3540" opacity=".75"/>`;
  const eng = (x, y) => `<rect x="${x}" y="${y}" width="40" height="15" rx="7" fill="${liv.body}" stroke="#9AA3AB"/><rect x="${x}" y="${y}" width="9" height="15" rx="4" fill="#3B4650"/>`;
  const plane = `<path d="M18 20 L-6 -34 L20 -34 L64 20Z" fill="${liv.tail}"/><path d="M-2 14 L22 6 L48 14 L22 18Z" fill="${liv.tail}" opacity=".9"/>
    <path d="M10 40 C10 28 26 20 46 20 L262 20 C284 20 300 29 310 38 C301 47 284 54 262 54 L46 54 C26 54 10 50 10 40Z" fill="${liv.body}" stroke="#A6AFB7"/>
    <path d="M14 46 C30 54 40 54 46 54 L262 54 C284 54 300 47 310 38 L306 42 C292 50 276 50 262 50 L46 50 C34 50 22 49 14 46Z" fill="${liv.belly}"/>
    <rect x="46" y="41" width="236" height="3.5" fill="${liv.stripe}"/>${win}<path d="M286 27 L298 27 L304 33 L288 33Z" fill="#2B3540"/>
    <path d="M118 47 L190 47 L152 86 L132 86Z" fill="#B5BDC4"/>${quad ? eng(98, 58) : ""}${eng(140, 60)}
    <rect x="160" y="54" width="3" height="${pose === "ground" ? 26 : 10}" fill="#56606A"/>
    ${pose === "ground" ? `<circle cx="161" cy="82" r="5" fill="#222"/><circle cx="280" cy="80" r="4.5" fill="#222"/><rect x="279" y="54" width="2.5" height="24" fill="#56606A"/>` : ""}`;
  const tr = pose === "climb" ? "translate(52 128) rotate(-9)" : pose === "approach" ? "translate(48 100) rotate(4)" : pose === "ground" ? "translate(46 118)" : "translate(48 104)";
  const clouds = pose === "ground" ? "" : `<ellipse cx="70" cy="205" rx="90" ry="22" fill="#fff" opacity=".45"/><ellipse cx="330" cy="225" rx="120" ry="26" fill="#fff" opacity=".35"/>`;
  const ground = pose === "ground" ? `<rect y="196" width="400" height="70" fill="#6F8A5B"/><rect y="206" width="400" height="26" fill="#55595E"/><path d="M0 219 H400" stroke="#F2D04B" stroke-width="2" stroke-dasharray="16 12"/>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 266"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s[0]}"/><stop offset="1" stop-color="${s[1]}"/></linearGradient></defs><rect width="400" height="266" fill="url(#g)"/>${clouds}${ground}<g transform="${tr}">${plane}</g><text x="14" y="24" font-family="Menlo,monospace" font-size="11" font-weight="600" fill="#fff" opacity=".85" letter-spacing="1">${tag}</text></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

let uid = 0;
const id = () => "demo-" + (++uid);
const ph = (l, sky, pose, quad) => { const u = photo(AIRLINES[l], sky, pose, quad, "SAMPLE PHOTO"); return { id: id(), kind: "photo", url: u, poster: u, sample: true }; };
const vd = (l, sky, pose, quad) => { const u = photo(AIRLINES[l], sky, pose, quad, "SAMPLE VIDEO"); return { id: id(), kind: "video", url: null, poster: u, sample: true }; };
const S = (airport, spotted_on, note, media) => ({ id: id(), airport, spotted_on, note, media, created_by: "demo" });
const ago = h => Date.now() - h * 3600e3;

const sims = {};
function P(reg, airline_icao, icao_type, type_name, airline, sightings, extra = {}) {
  const p = { id: id(), reg, hex: null, icao_type, type_name, airline, airline_icao, last: null, live: null, sightings };
  if (extra.sim) sims[reg] = { ...extra.sim, t: Date.now() };
  if (extra.last) p.last = extra.last;
  return p;
}

export function demoPlanes() {
  return [
    P("G-JZHA", "EXS", "B738", "Boeing 737-800", "Jet2", [S("LBA", "2026-10-19", "Third time! Took off from runway 32.", [ph("EXS", "grey", "climb"), vd("EXS", "grey", "ground")]), S("LBA", "2026-07-06", "Pushing back from the gate.", [ph("EXS", "blue", "ground")]), S("LBA", "2026-04-20", "My first ever spot at Leeds!", [ph("EXS", "gold", "approach")])], { sim: { from: "LBA", to: "ALC", p: .72, alt: 36000, gs: 452, cs: "EXS21K" } }),
    P("G-JZHL", "EXS", "B738", "Boeing 737-800", "Jet2", [S("MAN", "2026-08-02", "Saw it again at Manchester!", [ph("EXS", "gold", "ground")]), S("LBA", "2026-07-06", "", [ph("EXS", "blue", "climb")])], { last: { lat: 39.5517, lon: 2.7389, alt: 0, track: 240, onGround: true, at: ago(4) } }),
    P("EI-DWF", "RYR", "B738", "Boeing 737-800", "Ryanair", [S("LBA", "2026-10-19", "Coming back to Leeds right now!", [ph("RYR", "blue", "approach")]), S("LBA", "2026-07-06", "", [ph("RYR", "grey", "ground")])], { sim: { from: "DUB", to: "LBA", p: .38, alt: 24000, gs: 418, cs: "RYR3TL" } }),
    P("EI-IFB", "RYR", "B38M", "Boeing 737 MAX 8", "Ryanair", [S("MAN", "2026-05-30", "Brand new MAX, the engines look different.", [ph("RYR", "blue", "climb")])], { sim: { from: "MAN", to: "FCO", p: .5, alt: 37000, gs: 461, cs: "RYR86AB" } }),
    P("G-XWBA", "BAW", "A35K", "Airbus A350-1000", "British Airways", [S("LHR", "2026-09-14", "Watched it take off from the viewing area. The engines were huge!", [ph("BAW", "blue", "climb"), vd("BAW", "blue", "ground"), ph("BAW", "grey", "approach")])], { sim: { from: "LHR", to: "JFK", p: .56, alt: 38000, gs: 488, cs: "BAW117" } }),
    P("G-STBA", "BAW", "B77W", "Boeing 777-300ER", "British Airways", [S("LHR", "2026-09-14", "Took off right after G-XWBA.", [ph("BAW", "gold", "climb")])], { last: { lat: 13.2, lon: 18.6, alt: 39000, track: 165, onGround: false, at: ago(1.6) } }),
    P("G-VNEW", "VIR", "B789", "Boeing 787-9", "Virgin Atlantic", [S("MAN", "2026-08-02", "Red tail, landed on runway 23R.", [ph("VIR", "gold", "approach"), ph("VIR", "blue", "ground")])], { sim: { from: "MAN", to: "ATL", p: .31, alt: 37000, gs: 502, cs: "VIR127" } }),
    P("A6-EUA", "UAE", "A388", "Airbus A380", "Emirates", [S("MAN", "2026-08-02", "Double decker! Biggest plane ever.", [ph("UAE", "blue", "climb", true), vd("UAE", "gold", "approach", true)]), S("MAN", "2026-05-30", "", [ph("UAE", "grey", "ground", true)])], { last: { lat: 25.2532, lon: 55.3644, alt: 0, track: 120, onGround: true, at: ago(6) } }),
    P("9V-SMF", "SIA", "A359", "Airbus A350-900", "Singapore Airlines", [S("MAN", "2026-08-02", "Longest flight I've spotted so far.", [ph("SIA", "dusk", "approach"), ph("SIA", "blue", "ground")])], { sim: { from: "SIN", to: "MAN", p: .33, alt: 39000, gs: 511, cs: "SIA52" } }),
    P("A7-BEF", "QTR", "B77W", "Boeing 777-300ER", "Qatar Airways", [S("MAN", "2026-08-02", "", [ph("QTR", "blue", "climb")])], { sim: { from: "MAN", to: "DOH", p: .58, alt: 38000, gs: 495, cs: "QTR22" } }),
    P("G-EZTH", "EZY", "A320", "Airbus A320", "easyJet", [S("MAN", "2026-05-30", "Orange tail.", [ph("EZY", "blue", "ground")])], { last: { lat: 46.2381, lon: 6.1092, alt: 0, track: 220, onGround: true, at: ago(14) } })
  ];
}

export const DEMO_LOOKUP = {
  "G-TUKO": { found: true, icaoType: "B789", type: "787-9", manufacturer: "Boeing", owner: "TUI Airways", operatorIcao: "TOM", sim: { from: "MAN", to: "MCO", p: .47, alt: 38000, gs: 497, cs: "TOM26" } },
  "D-AIXP": { found: true, icaoType: "A359", type: "A350-941", manufacturer: "Airbus", owner: "Lufthansa", operatorIcao: "DLH" }
};

function ap(code) { const a = AIRPORTS[code]; return { code, name: a.n, city: a.n, lat: a.c[1], lon: a.c[0] }; }
function interp(a, b, t) { // great-circle interpolation, degrees
  const r = Math.PI / 180, [l1, p1] = [a.lon * r, a.lat * r], [l2, p2] = [b.lon * r, b.lat * r];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  if (d === 0) return { lat: a.lat, lon: a.lon };
  const A = Math.sin((1 - t) * d) / Math.sin(d), B = Math.sin(t * d) / Math.sin(d);
  const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
  const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
  const z = A * Math.sin(p1) + B * Math.sin(p2);
  return { lat: Math.atan2(z, Math.hypot(x, y)) / r, lon: Math.atan2(y, x) / r, d };
}
function bearing(a, b) {
  const r = Math.PI / 180, y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}
export function addSim(reg, sim) { sims[reg] = { ...sim, t: Date.now() }; }
export function demoLive(reg) {
  const s = sims[reg]; if (!s) return null;
  const A = ap(s.from), B = ap(s.to), now = Date.now();
  const dKm = interp(A, B, .5).d * 6371;
  s.p = Math.min(.995, s.p + (s.gs * 1.852 * (now - s.t) / 3600e3) / dKm); s.t = now;
  const pos = interp(A, B, s.p), ahead = interp(A, B, Math.min(1, s.p + .002));
  return { lat: pos.lat, lon: pos.lon, alt: s.alt, gs: s.gs, track: bearing(pos, ahead), onGround: false, callsign: s.cs, seenPos: 2, route: { from: A, to: B } };
}
