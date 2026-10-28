// Points, rarity, ranks and the collection album's reference lists.
import { AIRLINES, TYPES, AIRPORT_LIST } from './data.js';

export const TIERS = {
  common:    { label: 'Common',    points: 10,  order: 0 },
  uncommon:  { label: 'Uncommon',  points: 25,  order: 1 },
  rare:      { label: 'Rare',      points: 50,  order: 2 },
  epic:      { label: 'Epic',      points: 100, order: 3 },
  legendary: { label: 'Legendary', points: 250, order: 4 }
};

// How rare each aircraft type is to spot in the UK. Anything not listed counts as uncommon.
const RARITY = {
  common: ['A319', 'A320', 'A20N', 'A321', 'A21N', 'B737', 'B738', 'B38M', 'B739', 'B39M', 'E170', 'E190', 'E195', 'AT72', 'AT75', 'AT76', 'DH8D', 'BCS1', 'BCS3'],
  uncommon: ['A318', 'B752', 'B753', 'B763', 'A332', 'A333', 'B788', 'B789', 'E290', 'E295', 'A339', 'SF34', 'CRJ9', 'CRJX', 'B734'],
  rare: ['A359', 'A35K', 'B772', 'B77W', 'B78X', 'B77L', 'DHC6', 'B764', 'A310', 'B712', 'BA46', 'B462', 'B463', 'F100', 'B77F', 'B76F'],
  epic: ['A388', 'B744', 'B748', 'B74F', 'B48F', 'A346', 'A345', 'A343', 'A342', 'MD11', 'A3ST', 'A337', 'B742', 'DC10', 'B732'],
  legendary: ['A124', 'A225', 'IL76', 'IL62', 'AN12', 'C17', 'A400', 'C5M', 'C130', 'C30J', 'K35R', 'E3TF', 'B52', 'CONC', 'B74S', 'BLCF', 'A3ST', 'B703', 'VC10', 'U2', 'TU95']
};
const TIER_OF = {};
Object.entries(RARITY).forEach(([tier, list]) => list.forEach(t => { if (!TIER_OF[t]) TIER_OF[t] = tier; }));
export function tierOf(icaoType) { return icaoType ? (TIER_OF[icaoType] || 'uncommon') : 'common'; }

export const BONUS = { newType: 30, newAirline: 20, newAirport: 15, again: 3 };

export const RANKS = [
  { at: 0, name: 'Cadet Spotter' },
  { at: 100, name: 'Runway Watcher' },
  { at: 250, name: 'Plane Spotter' },
  { at: 500, name: 'Senior Spotter' },
  { at: 900, name: 'Second Officer' },
  { at: 1500, name: 'First Officer' },
  { at: 2500, name: 'Captain' },
  { at: 4000, name: 'Senior Captain' },
  { at: 6500, name: 'Chief Pilot' },
  { at: 10000, name: 'Legend of the Skies' }
];
export function rankFor(points) {
  let i = 0; while (i + 1 < RANKS.length && points >= RANKS[i + 1].at) i++;
  const cur = RANKS[i], next = RANKS[i + 1] || null;
  return { level: i + 1, name: cur.name, points, next, progress: next ? (points - cur.at) / (next.at - cur.at) : 1, toNext: next ? next.at - points : 0 };
}

// Replay every spot in date order and award points. Returns totals plus a per-spot breakdown.
export function score(planes) {
  const all = [];
  planes.forEach(p => p.sightings.forEach(s => all.push({ p, s })));
  all.sort((a, b) => a.s.spotted_on.localeCompare(b.s.spotted_on) || String(a.s.created_at || '').localeCompare(String(b.s.created_at || '')));
  const seenPlane = new Set(), seenType = new Set(), seenAirline = new Set(), seenAirport = new Set();
  const bySighting = {};
  let total = 0;
  for (const { p, s } of all) {
    const reasons = [];
    const tier = tierOf(p.icao_type);
    if (!seenPlane.has(p.reg)) { seenPlane.add(p.reg); reasons.push({ label: `New plane (${TIERS[tier].label})`, points: TIERS[tier].points, tier }); }
    else reasons.push({ label: 'Spotted again', points: BONUS.again });
    const typeKey = p.icao_type || p.type_name;
    if (typeKey && !seenType.has(typeKey)) { seenType.add(typeKey); reasons.push({ label: `New aircraft type: ${p.type_name || p.icao_type}`, points: BONUS.newType }); }
    const al = (p.airline || '').toLowerCase();
    if (al && !seenAirline.has(al)) { seenAirline.add(al); reasons.push({ label: `New airline: ${p.airline}`, points: BONUS.newAirline }); }
    if (s.airport && !seenAirport.has(s.airport)) { seenAirport.add(s.airport); reasons.push({ label: `New airport`, points: BONUS.newAirport }); }
    const pts = reasons.reduce((a, r) => a + r.points, 0);
    bySighting[s.id] = { points: pts, reasons, tier };
    total += pts;
  }
  return { total, bySighting, rank: rankFor(total) };
}

// Airlines for the album, grouped by where they fly from, one card per airline name.
const REGION = {
  'UK & Ireland': ['EXS', 'RYR', 'BAW', 'VIR', 'EZY', 'TOM', 'EIN', 'LOG', 'BCY', 'CFE'],
  'Europe': ['DLH', 'KLM', 'AFR', 'WZZ', 'IBE', 'VLG', 'TAP', 'SAS', 'FIN', 'EWG', 'NOZ', 'AEA', 'TVF', 'SWR', 'AUA', 'BEL', 'ICE', 'THY'],
  'Rest of the world': ['UAE', 'QTR', 'ETD', 'SIA', 'AAL', 'UAL', 'DAL', 'ACA', 'CPA', 'QFA', 'AIC', 'SVA', 'FDB', 'ELY', 'PIA', 'MAU', 'CCA', 'JAL', 'ANA', 'KAL', 'GFA', 'OMA'],
  'Cargo': ['FDX', 'UPS', 'DHK', 'TAY', 'GTI']
};
export function albumAirlines() {
  return Object.entries(REGION).map(([region, codes]) => ({ region, airlines: codes.filter(c => AIRLINES[c]).map(c => ({ code: c, ...AIRLINES[c] })) }));
}
export function albumTypes() {
  const byTier = {};
  Object.entries(TYPES).forEach(([code, t]) => { const tier = tierOf(code); (byTier[tier] = byTier[tier] || []).push({ code, ...t, tier }); });
  return Object.keys(TIERS).filter(t => byTier[t]).map(tier => ({ tier, types: byTier[tier] }));
}
export function albumAirports() {
  return AIRPORT_LIST.filter(a => a[4] === 'UK & Ireland').map(([code, n]) => ({ code, n }));
}
