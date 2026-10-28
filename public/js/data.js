// Reference data bundled with the app: airports, airlines, aircraft types, landmarks and cities.

export const PLANE_D = "M12 1.6c.8 0 1.35.95 1.35 2.1v5.3l7.9 4.7v2l-7.9-2.45v5l2.25 1.65v1.55L12 20.5l-3.6.95v-1.55l2.25-1.65v-5L2.75 15.7v-2l7.9-4.7V3.7c0-1.15.55-2.1 1.35-2.1z";

// Airports he might spot from. [code, name, lat, lon, group]
export const AIRPORT_LIST = [
  ["LBA","Leeds Bradford",53.8659,-1.6606,"UK & Ireland"],["MAN","Manchester",53.3537,-2.2750,"UK & Ireland"],
  ["LHR","London Heathrow",51.4700,-0.4543,"UK & Ireland"],["LGW","London Gatwick",51.1537,-0.1821,"UK & Ireland"],
  ["STN","London Stansted",51.8860,0.2389,"UK & Ireland"],["LTN","London Luton",51.8747,-0.3683,"UK & Ireland"],
  ["LCY","London City",51.5048,0.0495,"UK & Ireland"],["SEN","London Southend",51.5714,0.6956,"UK & Ireland"],
  ["BHX","Birmingham",52.4539,-1.7480,"UK & Ireland"],["EMA","East Midlands",52.8311,-1.3281,"UK & Ireland"],
  ["LPL","Liverpool",53.3336,-2.8497,"UK & Ireland"],["NCL","Newcastle",55.0375,-1.6917,"UK & Ireland"],
  ["MME","Teesside",54.5092,-1.4294,"UK & Ireland"],["HUY","Humberside",53.5744,-0.3508,"UK & Ireland"],
  ["BRS","Bristol",51.3827,-2.7191,"UK & Ireland"],["CWL","Cardiff",51.3967,-3.3433,"UK & Ireland"],
  ["EXT","Exeter",50.7344,-3.4139,"UK & Ireland"],["SOU","Southampton",50.9503,-1.3568,"UK & Ireland"],
  ["BOH","Bournemouth",50.7800,-1.8425,"UK & Ireland"],["NQY","Newquay",50.4406,-4.9954,"UK & Ireland"],
  ["NWI","Norwich",52.6758,1.2828,"UK & Ireland"],["EDI","Edinburgh",55.9500,-3.3725,"UK & Ireland"],
  ["GLA","Glasgow",55.8719,-4.4331,"UK & Ireland"],["PIK","Glasgow Prestwick",55.5094,-4.5867,"UK & Ireland"],
  ["ABZ","Aberdeen",57.2019,-2.1978,"UK & Ireland"],["INV","Inverness",57.5425,-4.0475,"UK & Ireland"],
  ["BFS","Belfast International",54.6575,-6.2158,"UK & Ireland"],["BHD","Belfast City",54.6181,-5.8725,"UK & Ireland"],
  ["IOM","Isle of Man",54.0833,-4.6239,"UK & Ireland"],["JER","Jersey",49.2079,-2.1955,"UK & Ireland"],
  ["GCI","Guernsey",49.4350,-2.6019,"UK & Ireland"],["DUB","Dublin",53.4264,-6.2499,"UK & Ireland"],
  ["SNN","Shannon",52.7020,-8.9248,"UK & Ireland"],["ORK","Cork",51.8413,-8.4911,"UK & Ireland"],
  ["AMS","Amsterdam Schiphol",52.3105,4.7683,"Europe"],["CDG","Paris Charles de Gaulle",49.0097,2.5479,"Europe"],
  ["FRA","Frankfurt",50.0379,8.5622,"Europe"],["MUC","Munich",48.3538,11.7861,"Europe"],
  ["MAD","Madrid",40.4983,-3.5676,"Europe"],["BCN","Barcelona",41.2974,2.0833,"Europe"],
  ["PMI","Palma de Mallorca",39.5517,2.7389,"Europe"],["AGP","Málaga",36.6749,-4.4991,"Europe"],
  ["ALC","Alicante",38.2822,-0.5582,"Europe"],["FAO","Faro",37.0144,-7.9659,"Europe"],
  ["LIS","Lisbon",38.7742,-9.1342,"Europe"],["TFS","Tenerife South",28.0445,-16.5725,"Europe"],
  ["LPA","Gran Canaria",27.9319,-15.3866,"Europe"],["ACE","Lanzarote",28.9455,-13.6052,"Europe"],
  ["FCO","Rome Fiumicino",41.8003,12.2389,"Europe"],["GVA","Geneva",46.2381,6.1092,"Europe"],
  ["ZRH","Zurich",47.4582,8.5555,"Europe"],["CPH","Copenhagen",55.6180,12.6508,"Europe"],
  ["IST","Istanbul",41.2753,28.7519,"Europe"],["ATH","Athens",37.9364,23.9445,"Europe"],
  ["JFK","New York JFK",40.6413,-73.7781,"Further away"],["MCO","Orlando",28.4312,-81.3081,"Further away"],
  ["LAX","Los Angeles",33.9416,-118.4085,"Further away"],["ATL","Atlanta",33.6407,-84.4277,"Further away"],
  ["YYZ","Toronto",43.6777,-79.6248,"Further away"],["DXB","Dubai",25.2532,55.3644,"Further away"],
  ["DOH","Doha",25.2731,51.6081,"Further away"],["AUH","Abu Dhabi",24.4330,54.6511,"Further away"],
  ["SIN","Singapore Changi",1.3644,103.9915,"Further away"],["HKG","Hong Kong",22.3080,113.9185,"Further away"],
  ["HND","Tokyo Haneda",35.5494,139.7798,"Further away"],["SYD","Sydney",-33.9399,151.1753,"Further away"],
  ["JNB","Johannesburg",-26.1367,28.2460,"Further away"],["CPT","Cape Town",-33.9715,18.6021,"Further away"]
];
export const AIRPORTS = Object.fromEntries(AIRPORT_LIST.map(([code, n, lat, lon, g]) => [code, { code, n, c: [lon, lat], g }]));

// Airlines by ICAO code (also the first three letters of most callsigns): name + livery colours
const A = (name, tail, stripe, body = "#F5F7F9", belly) => ({ name, tail, stripe, body, belly: belly || body });
export const AIRLINES = {
  EXS: A("Jet2", "#D0112B", "#D0112B"),
  RYR: A("Ryanair", "#073590", "#F1C933", "#F5F7FA", "#073590"), RUK: A("Ryanair", "#073590", "#F1C933", "#F5F7FA", "#073590"),
  BAW: A("British Airways", "#1B3C78", "#C8102E", "#F3F5F8", "#1B3C78"), SHT: A("British Airways", "#1B3C78", "#C8102E", "#F3F5F8", "#1B3C78"),
  CFE: A("BA CityFlyer", "#1B3C78", "#C8102E", "#F3F5F8", "#1B3C78"), EFW: A("BA Euroflyer", "#1B3C78", "#C8102E", "#F3F5F8", "#1B3C78"),
  VIR: A("Virgin Atlantic", "#C8102E", "#6B1F5C", "#F6F4F6", "#E4E0E6"),
  EZY: A("easyJet", "#FF6A13", "#FF6A13", "#F7F7F7", "#FF6A13"), EJU: A("easyJet", "#FF6A13", "#FF6A13", "#F7F7F7", "#FF6A13"), EZS: A("easyJet", "#FF6A13", "#FF6A13", "#F7F7F7", "#FF6A13"),
  TOM: A("TUI Airways", "#70CBF4", "#0A2A5E"), UAE: A("Emirates", "#D71921", "#B89A55", "#F1F0EA"),
  QTR: A("Qatar Airways", "#5C0632", "#5C0632", "#F4F3F2", "#E8E2E4"), ETD: A("Etihad", "#BD8B13", "#7A6A4F", "#F1EEE8"),
  SIA: A("Singapore Airlines", "#003F87", "#F2AE2E"), DLH: A("Lufthansa", "#05164D", "#05164D"),
  KLM: A("KLM", "#00A1DE", "#00A1DE", "#F5F8FA", "#00A1DE"), AFR: A("Air France", "#002157", "#E1001A"),
  EIN: A("Aer Lingus", "#00856F", "#00856F"), LOG: A("Loganair", "#1B365D", "#D52B1E"),
  WZZ: A("Wizz Air", "#C6007E", "#C6007E"), WUK: A("Wizz Air", "#C6007E", "#C6007E"),
  THY: A("Turkish Airlines", "#C70A0C", "#C70A0C"), AAL: A("American Airlines", "#0078D2", "#C30019", "#D8DDE1"),
  UAL: A("United Airlines", "#002244", "#0033A0"), DAL: A("Delta", "#C01933", "#003268"),
  ACA: A("Air Canada", "#111111", "#D22630"), CPA: A("Cathay Pacific", "#006564", "#006564"),
  QFA: A("Qantas", "#E40000", "#E40000"), IBE: A("Iberia", "#D7192D", "#FFC72C"),
  VLG: A("Vueling", "#FFCC00", "#3D3D3D"), TAP: A("TAP Air Portugal", "#00A859", "#E2001A"),
  SAS: A("SAS", "#000F9F", "#000F9F"), FIN: A("Finnair", "#0B1560", "#0B1560"),
  EWG: A("Eurowings", "#8A1538", "#8A1538"), NOZ: A("Norwegian", "#D81939", "#D81939"), NSZ: A("Norwegian", "#D81939", "#D81939"),
  AIC: A("Air India", "#E31E24", "#C8A04A"), SVA: A("Saudia", "#006C35", "#C8A04A"), ICE: A("Icelandair", "#003A7D", "#F5B100"),
  FDB: A("flydubai", "#00447C", "#F15A22"), AEA: A("Air Europa", "#0B2A6F", "#0B2A6F"), TVF: A("Transavia", "#00D66C", "#1E2B5A"),
  SWR: A("Swiss", "#E2001A", "#E2001A"), AUA: A("Austrian", "#E2001A", "#E2001A"), BEL: A("Brussels Airlines", "#00205B", "#E2001A"),
  ELY: A("El Al", "#1B3A8C", "#1B3A8C"), PIA: A("PIA", "#006A4E", "#006A4E"), MAU: A("Air Mauritius", "#DA291C", "#00843D"),
  CCA: A("Air China", "#C8102E", "#C8102E"), JAL: A("Japan Airlines", "#C8102E", "#C8102E"), ANA: A("ANA", "#13448F", "#13448F"),
  KAL: A("Korean Air", "#7BB3E0", "#00256C", "#EAF3FA"), GFA: A("Gulf Air", "#B48A3C", "#5C2D91"), OMA: A("Oman Air", "#8E2A3A", "#B3965A"),
  BCY: A("CityJet", "#1D2F64", "#1D2F64"), TAY: A("ASL Airlines", "#003E7E", "#003E7E"), GTI: A("Atlas Air", "#002D72", "#002D72"),
  FDX: A("FedEx", "#4D148C", "#FF6600"), UPS: A("UPS", "#351C15", "#FFB500"), DHK: A("DHL", "#FFCC00", "#D40511"), BCS: A("DHL", "#FFCC00", "#D40511")
};
export const GENERIC_LIVERY = A("", "#5A6B7B", "#5A6B7B", "#EEF1F4", "#D9DEE3");

export function liveryFor(plane) {
  if (plane && plane.airline_icao && AIRLINES[plane.airline_icao]) return AIRLINES[plane.airline_icao];
  const name = (plane && plane.airline || "").toLowerCase();
  if (name) {
    for (const k in AIRLINES) if (AIRLINES[k].name.toLowerCase() === name) return AIRLINES[k];
    let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const hue = h % 360;
    return { ...GENERIC_LIVERY, tail: `hsl(${hue} 60% 38%)`, stripe: `hsl(${hue} 60% 38%)` };
  }
  return GENERIC_LIVERY;
}

// Aircraft types by ICAO type designator
const T = (name, span, seats, wide, fact, quad = false) => ({ name, span, seats, wide, fact, quad });
export const TYPES = {
  A318: T("Airbus A318", 34.1, "up to 132", false, "The smallest Airbus jet. A few fly a business-class-only route from London City to New York."),
  A319: T("Airbus A319", 35.8, "up to 156", false, "A shorter A320, handy for quieter routes and short runways."),
  A320: T("Airbus A320", 35.8, "up to 186", false, "It was the first airliner flown with fully digital fly-by-wire controls."),
  A20N: T("Airbus A320neo", 35.8, "up to 194", false, "The 'neo' stands for New Engine Option. Its big engines use about 20% less fuel."),
  A321: T("Airbus A321", 35.8, "up to 220", false, "The longest member of the A320 family, almost 45 m long."),
  A21N: T("Airbus A321neo", 35.8, "up to 244", false, "Some versions can fly from the UK to the east coast of America, which is a long way for a single-aisle jet."),
  BCS1: T("Airbus A220-100", 35.1, "up to 135", false, "It was designed by Bombardier in Canada as the CSeries, then Airbus took it over."),
  BCS3: T("Airbus A220-300", 35.1, "up to 160", false, "It was designed by Bombardier in Canada as the CSeries, then Airbus took it over."),
  A332: T("Airbus A330-200", 60.3, "about 250", true, "Some A330s are turned into air-to-air refuellers that top up other planes in flight."),
  A333: T("Airbus A330-300", 60.3, "about 290", true, "Its wing is almost the same as the four-engined A340's."),
  A339: T("Airbus A330-900", 64.0, "about 290", true, "Its Rolls-Royce Trent 7000 engines were built specially for it."),
  A359: T("Airbus A350-900", 64.75, "about 300", true, "Singapore Airlines flies a special version of it non-stop to New York, one of the longest flights in the world."),
  A35K: T("Airbus A350-1000", 64.75, "about 330", true, "Its wingtips curve upwards, which helps it use less fuel."),
  A388: T("Airbus A380", 79.75, "about 500", true, "The biggest passenger plane in the world, with two full decks from nose to tail.", true),
  B737: T("Boeing 737-700", 35.8, "up to 149", false, "The 737 first flew in 1967, and it's still being built today."),
  B738: T("Boeing 737-800", 35.8, "up to 189", false, "The 737 family is the best-selling jet airliner ever built."),
  B739: T("Boeing 737-900", 35.8, "up to 220", false, "The longest of the 'Next Generation' 737s."),
  B38M: T("Boeing 737 MAX 8", 35.9, "up to 197", false, "Look for the split 'scimitar' winglets, which point both up and down."),
  B39M: T("Boeing 737 MAX 9", 35.9, "up to 220", false, "Look for the split 'scimitar' winglets, which point both up and down."),
  B752: T("Boeing 757-200", 38.05, "about 200", false, "Pilots love it because it's so powerful. It can climb really steeply."),
  B763: T("Boeing 767-300", 47.6, "about 260", true, "Lots of 767s now carry parcels for companies like DHL and UPS."),
  B772: T("Boeing 777-200", 60.9, "about 300", true, "Each of its main landing gear legs has six wheels."),
  B77W: T("Boeing 777-300ER", 64.8, "300 to 400", true, "Its engines are almost as wide as the body of a 737."),
  B77L: T("Boeing 777-200LR", 64.8, "about 300", true, "It once flew 21,600 km non-stop from Hong Kong to London the long way round."),
  B788: T("Boeing 787-8", 60.1, "about 240", true, "About half of the plane is made from carbon-fibre composite instead of aluminium."),
  B789: T("Boeing 787-9", 60.1, "about 290", true, "Its windows have no blinds. Passengers press a button and the glass dims itself."),
  B78X: T("Boeing 787-10", 60.1, "about 330", true, "The longest Dreamliner, at 68 m."),
  B744: T("Boeing 747-400", 64.4, "about 400", true, "Known as the Queen of the Skies. Its hump holds the cockpit and an upper deck.", true),
  B748: T("Boeing 747-8", 68.4, "about 410", true, "The longest 747 ever, at 76.3 m. The last one was built in 2023.", true),
  E170: T("Embraer 170", 26.0, "about 76", false, "Built in Brazil by Embraer."),
  E190: T("Embraer 190", 28.7, "about 100", false, "Built in Brazil. It can land at London City, which has a really short runway."),
  E195: T("Embraer 195", 28.7, "about 120", false, "Built in Brazil, it's the biggest of the first E-Jet family."),
  E290: T("Embraer E190-E2", 33.7, "about 110", false, "The E2 has longer, thinner wings than the original E-Jets."),
  E295: T("Embraer E195-E2", 35.1, "about 140", false, "The E2 has longer, thinner wings than the original E-Jets."),
  DH8D: T("De Havilland Dash 8-400", 28.4, "about 78", false, "A turboprop, so it has propellers driven by jet engines."),
  AT72: T("ATR 72", 27.05, "about 70", false, "A turboprop built in France and Italy, great on short island hops."),
  AT76: T("ATR 72-600", 27.05, "about 72", false, "A turboprop built in France and Italy, great on short island hops."),
  AT75: T("ATR 72-500", 27.05, "about 70", false, "A turboprop built in France and Italy, great on short island hops."),
  SF34: T("Saab 340", 21.4, "about 34", false, "A small Swedish turboprop. Loganair flies them around Scotland."),
  DHC6: T("Twin Otter", 19.8, "up to 19", false, "Loganair flies one onto the beach at Barra, the only scheduled beach runway in the world.")
};

export function typeInfo(icao) { return icao && TYPES[icao] ? TYPES[icao] : null; }

export const ICONS = {
  eiffel: '<path d="M12 2v3M10.6 5h2.8l1.4 6.5h-5.6zM8.7 11.5h6.6l2.7 9.5h-3.3L12 16l-2.7 5H6z"/>',
  bigben: '<path d="M9.5 21V9h5v12M8 21h8M9.5 9L12 3l2.5 6"/><circle cx="12" cy="12.5" r="1.6"/>',
  liberty: '<path d="M12 21v-8M9 21h6M10 13h4l-.5-4h-3zM12 9V7M13.5 8.5l2.5-5M15 2.5l2 1"/><circle cx="12" cy="6" r="1.2"/>',
  pyramid: '<path d="M1.5 20l7-12 7 12zM10.5 20l5.5-8.5 6.5 8.5"/>',
  burj: '<path d="M12 2v4M10.8 6h2.4l1.3 7h-5zM9.5 13h5l1.5 8H8zM7 21h10"/>',
  taj: '<path d="M7 21v-7.5a5 5 0 0 1 10 0V21M5 21h14M12 8.5V5.5M4 21v-9M20 21v-9"/>',
  wall: '<path d="M2 21V11h3v2.5h3V11h3v2.5h3V11h3v2.5h3V11h2v10z"/>',
  mountain: '<path d="M1.5 20.5l7.5-13 4.5 7 2.5-3.5 6.5 9.5z"/><path d="M7 10.6l2 1.6 2-1.4"/>',
  opera: '<path d="M2.5 18.5h19M4.5 18.5C4.5 13 8 8.5 12 6.5c-1.2 4-1.2 8 0 12M11.5 18.5c0-4 2.5-7.5 7-9.5-1.2 3-1.2 6.5 0 9.5"/>',
  bridge: '<path d="M2 15h20M6.5 21V4M17.5 21V4M6.5 6.5c3 5.5 8 5.5 11 0M2 8.5c2 2.5 3.5 4.5 4.5 6.5M22 8.5c-2 2.5-3.5 4.5-4.5 6.5"/>',
  christ: '<path d="M12 6v15M3.5 9h17M10 21h4"/><circle cx="12" cy="4" r="1.6"/>',
  biplane: '<path d="M2.5 8h19M2.5 13.5h19M8 8v5.5M16 8v5.5M12 5.5v12M9.5 17.5h5"/>',
  factory: '<path d="M2.5 21V11l5 3v-3l5 3V6.5h9V21z"/><path d="M15.5 10.5h3M15.5 14h3"/>',
  wing: '<path d="M2 15l9-2 4-8h2l-1.5 8 6.5 1v2l-6.5 1 1.5 6h-2l-4-6-9-1z"/>',
  concorde: '<path d="M2 13.5l9-1.5 9.5-1 1.5 1.5-1.5 1.5-9.5-.5-9-1zM8 12.5l3-6h1.5l-1 6M8 14l3 4h1.5l-1-4"/>'
};

export const LANDMARKS = [
  { n: "Eiffel Tower", pl: "Paris, France", c: [2.2945, 48.8584], ic: "eiffel", f: "It's 330 m tall, and in hot summer weather the iron expands so it grows by up to 15 cm." },
  { n: "Big Ben", pl: "London, UK", c: [-0.1246, 51.5007], ic: "bigben", f: "Big Ben is really the name of the giant bell inside, not the tower. The bell weighs about 13.7 tonnes." },
  { n: "Statue of Liberty", pl: "New York, USA", c: [-74.0445, 40.6892], ic: "liberty", f: "A present from France in 1886. Her torch is 93 m above the ground." },
  { n: "Pyramids of Giza", pl: "Cairo, Egypt", c: [31.1342, 29.9792], ic: "pyramid", f: "The Great Pyramid was the tallest building on Earth for around 3,800 years." },
  { n: "Burj Khalifa", pl: "Dubai, UAE", c: [55.2744, 25.1972], ic: "burj", f: "The tallest building in the world at 828 m. Pilots landing at Dubai can see it from miles away." },
  { n: "Taj Mahal", pl: "Agra, India", c: [78.0421, 27.1751], ic: "taj", f: "About 20,000 workers spent more than 20 years building it." },
  { n: "Great Wall of China", pl: "Near Beijing, China", c: [116.5704, 40.4319], ic: "wall", f: "Add up all its sections and it's over 21,000 km long." },
  { n: "Mount Everest", pl: "Nepal and China", c: [86.925, 27.9881], ic: "mountain", f: "The highest mountain at 8,849 m. Airliners cruise at about 11,000 m, only a little higher than the summit." },
  { n: "Sydney Opera House", pl: "Sydney, Australia", c: [151.2153, -33.8568], ic: "opera", f: "Its roof is covered in over a million white and cream tiles." },
  { n: "Golden Gate Bridge", pl: "San Francisco, USA", c: [-122.4783, 37.8199], ic: "bridge", f: "It's painted a colour called International Orange so ships can see it in the fog." },
  { n: "Christ the Redeemer", pl: "Rio de Janeiro, Brazil", c: [-43.2105, -22.9519], ic: "christ", f: "The statue is 30 m tall and gets struck by lightning several times a year." },
  { n: "Wright brothers' first flight", pl: "Kitty Hawk, USA", c: [-75.6681, 36.0146], ic: "biplane", aero: true, f: "In 1903 Orville Wright flew the first powered aeroplane here. The flight lasted 12 seconds." },
  { n: "Boeing Everett factory", pl: "Seattle, USA", c: [-122.2747, 47.9216], ic: "factory", aero: true, f: "The biggest building in the world by volume. Boeing builds 767s and 777s inside." },
  { n: "Airbus Toulouse", pl: "Toulouse, France", c: [1.3633, 43.6293], ic: "wing", aero: true, f: "Airbus puts together A350s here, and every A380 was assembled here too." },
  { n: "Aerospace Bristol", pl: "Filton, UK", c: [-2.5876, 51.5157], ic: "concorde", aero: true, f: "Home of Concorde 216, the very last Concorde ever to fly. It landed here in 2003." },
  { n: "Barra beach runway", pl: "Outer Hebrides, Scotland", c: [-7.4431, 57.0228], ic: "wing", aero: true, f: "The only airport in the world where scheduled flights land on a beach. The timetable depends on the tide." }
];

export const CITIES = [
  ["London",-0.1276,51.5072,1],["New York",-74.006,40.7128,1],["Paris",2.3522,48.8566,1],["Tokyo",139.69,35.68,1],["Dubai",55.27,25.2,1],
  ["Singapore",103.82,1.35,1],["Sydney",151.21,-33.87,1],["Los Angeles",-118.24,34.05,1],["Rio de Janeiro",-43.17,-22.91,1],["Cairo",31.24,30.04,1],
  ["Beijing",116.41,39.9,1],["Moscow",37.62,55.76,1],["Mumbai",72.88,19.08,1],["Johannesburg",28.05,-26.2,1],["Mexico City",-99.13,19.43,1],["Toronto",-79.38,43.65,1],
  ["Leeds",-1.5491,53.8008,2],["Manchester",-2.2426,53.4808,2],["Madrid",-3.7038,40.4168,2],["Rome",12.4964,41.9028,2],["Berlin",13.405,52.52,2],
  ["Istanbul",28.9784,41.0082,2],["Hong Kong",114.17,22.32,2],["Bangkok",100.5,13.76,2],["Chicago",-87.63,41.88,2],["Miami",-80.19,25.76,2],
  ["San Francisco",-122.42,37.77,2],["Buenos Aires",-58.38,-34.6,2],["Lagos",3.38,6.52,2],["Nairobi",36.82,-1.29,2],["Delhi",77.21,28.61,2],
  ["Seoul",126.98,37.57,2],["Doha",51.53,25.29,2],["Reykjavik",-21.94,64.15,2],["Atlanta",-84.39,33.75,2],["Dublin",-6.26,53.35,2],
  ["Amsterdam",4.9,52.37,2],["Perth",115.86,-31.95,2],["Auckland",174.76,-36.85,2],["Vancouver",-123.12,49.28,2],["Lima",-77.04,-12.05,2],["Cape Town",18.42,-33.92,2],
  ["Edinburgh",-3.19,55.95,3],["Alicante",-0.48,38.35,3],["Geneva",6.14,46.2,3],["Palma",2.65,39.57,3],["Frankfurt",8.68,50.11,3],["Barcelona",2.17,41.39,3],
  ["Lisbon",-9.14,38.72,3],["Athens",23.73,37.98,3],["Oslo",10.75,59.91,3],["Stockholm",18.07,59.33,3],["Vienna",16.37,48.21,3],["Birmingham",-1.89,52.49,3],
  ["Newcastle",-1.61,54.98,3],["Glasgow",-4.25,55.86,3],["Orlando",-81.38,28.54,3],["Boston",-71.06,42.36,3],["Cancún",-86.85,21.16,3],["Marrakesh",-7.99,31.63,3],
  ["York",-1.08,53.96,4],["Sheffield",-1.47,53.38,4],["Liverpool",-2.98,53.41,4],["Bristol",-2.59,51.45,4],["Cardiff",-3.18,51.48,4],["Belfast",-5.93,54.6,4],
  ["Harrogate",-1.54,53.99,4],["Bradford",-1.75,53.79,4],["Hull",-0.33,53.74,4],["Nottingham",-1.15,52.95,4]
];
