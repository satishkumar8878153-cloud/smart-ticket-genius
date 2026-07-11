export type TicketClass = "SL" | "3A" | "2A" | "1A" | "CC" | "EC";

export const CLASSES: { code: TicketClass; label: string }[] = [
  { code: "SL", label: "Sleeper" },
  { code: "3A", label: "AC 3-Tier" },
  { code: "2A", label: "AC 2-Tier" },
  { code: "1A", label: "AC First" },
  { code: "CC", label: "Chair Car" },
  { code: "EC", label: "Executive" },
];

export type SeatStatus = {
  label: string;
  tone: "success" | "warning" | "danger" | "muted";
};

export type ClassAvailability = Record<TicketClass, SeatStatus>;

export type TrainRecommendation = {
  trainName: string;
  trainNumber: string;
  departure: string;
  arrival: string;
  duration: string;
  confirmProbability: number;
  recommendationScore: number;
  reason: string;
  bestClass: TicketClass;
  availability: ClassAvailability;
};

export type AlternateStation = {
  code: string;
  name: string;
  distanceKm: number;
  extraTravel: string;
  availability: SeatStatus;
};

export type AlternateDate = {
  date: string;
  weekday: string;
  status: SeatStatus;
  fare: number;
};

export type SearchQuery = {
  source: string;
  destination: string;
  date: string;
  travelClass: TicketClass;
};

export type SearchResult = {
  query: SearchQuery;
  best: TrainRecommendation;
  otherTrains: TrainRecommendation[];
  alternateStations: AlternateStation[];
  alternateDates: AlternateDate[];
  aiInsights: string[];
};

const STATUS = {
  available: (n: number): SeatStatus => ({ label: `AVL ${n}`, tone: "success" }),
  rac: (n: number): SeatStatus => ({ label: `RAC ${n}`, tone: "warning" }),
  waitlist: (n: number): SeatStatus => ({ label: `WL ${n}`, tone: "danger" }),
  na: (): SeatStatus => ({ label: "—", tone: "muted" }),
};

function seed(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randStatus(r: () => number, bias = 0): SeatStatus {
  const v = r() + bias;
  if (v < 0.35) return STATUS.available(Math.floor(r() * 120) + 5);
  if (v < 0.6) return STATUS.rac(Math.floor(r() * 40) + 1);
  if (v < 0.9) return STATUS.waitlist(Math.floor(r() * 90) + 5);
  return STATUS.na();
}

function buildAvailability(r: () => number, bias = 0): ClassAvailability {
  return {
    SL: randStatus(r, bias),
    "3A": randStatus(r, bias + 0.05),
    "2A": randStatus(r, bias + 0.1),
    "1A": randStatus(r, bias + 0.15),
    CC: randStatus(r, bias + 0.2),
    EC: randStatus(r, bias + 0.25),
  };
}

const TRAIN_POOL = [
  { trainName: "Rajdhani Express", trainNumber: "12951", departure: "16:55", arrival: "08:35", duration: "15h 40m" },
  { trainName: "Shatabdi Express", trainNumber: "12002", departure: "06:00", arrival: "14:05", duration: "8h 05m" },
  { trainName: "Duronto Express", trainNumber: "12213", departure: "23:00", arrival: "12:45", duration: "13h 45m" },
  { trainName: "Vande Bharat", trainNumber: "22439", departure: "05:30", arrival: "13:20", duration: "7h 50m" },
  { trainName: "Tejas Express", trainNumber: "22120", departure: "15:40", arrival: "23:35", duration: "7h 55m" },
];

export function generateSearchResult(query: SearchQuery): SearchResult {
  const r = seed(`${query.source}-${query.destination}-${query.date}-${query.travelClass}`);

  const trains: TrainRecommendation[] = TRAIN_POOL.map((t, i) => {
    const confirm = Math.round(55 + r() * 44);
    const score = Math.round(60 + r() * 39);
    const availability = buildAvailability(r, i === 0 ? -0.15 : 0);
    return {
      ...t,
      confirmProbability: confirm,
      recommendationScore: score,
      bestClass: query.travelClass,
      reason:
        i === 0
          ? `High confirm probability in ${query.travelClass}, on-time record above 92%, and fastest overnight arrival.`
          : `Consistent availability and competitive travel time on the ${query.source} → ${query.destination} corridor.`,
      availability,
    };
  }).sort(
    (a, b) =>
      b.recommendationScore * 0.6 +
      b.confirmProbability * 0.4 -
      (a.recommendationScore * 0.6 + a.confirmProbability * 0.4),
  );

  const [best, ...rest] = trains;

  const stationNames = ["Central Jn", "Cantt", "City Jn", "Terminus", "Nagar"];
  const alternateStations: AlternateStation[] = stationNames.slice(0, 4).map((n, i) => ({
    code: `${query.source.slice(0, 3).toUpperCase()}${i + 1}`,
    name: `${query.source} ${n}`,
    distanceKm: Math.round(8 + r() * 55),
    extraTravel: `${Math.round(15 + r() * 40)} min`,
    availability: randStatus(r, -0.2),
  }));

  const today = new Date(query.date || Date.now());
  const alternateDates: AlternateDate[] = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return {
      date: d.toISOString().slice(0, 10),
      weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
      status: randStatus(r, i === 0 ? 0.1 : -0.1),
      fare: Math.round(950 + r() * 2400),
    };
  });

  const aiInsights = [
    `Historical data shows ${best.trainName} confirms ${best.confirmProbability}% of ${query.travelClass} bookings on this route.`,
    `Booking 4 days earlier boosts confirmation probability by an estimated ~18%.`,
    `${alternateStations[0].name} offers better ${query.travelClass} availability with only ${alternateStations[0].extraTravel} extra travel.`,
    `Traveling on ${alternateDates[3].weekday} typically has 22% lower demand than weekends.`,
  ];

  return {
    query,
    best,
    otherTrains: rest,
    alternateStations,
    alternateDates,
    aiInsights,
  };
}

export const POPULAR_STATIONS = [
  "New Delhi",
  "Mumbai Central",
  "Chennai Central",
  "Kolkata",
  "Bengaluru",
  "Hyderabad",
  "Pune",
  "Ahmedabad",
  "Jaipur",
  "Lucknow",
];
