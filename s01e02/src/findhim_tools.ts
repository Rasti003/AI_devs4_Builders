import dotenv from 'dotenv';
import { resolve } from 'node:path';
import { promises as fs } from 'node:fs';
import { z } from 'zod';

dotenv.config();
dotenv.config({ path: resolve(process.cwd(), '..', '.env') });
dotenv.config({ path: resolve(process.cwd(), '..', '..', '.env') });

export type Suspect = {
  name: string;
  surname: string;
  born: number;
  city: string;
  tags: string[];
};

export type PowerPlant = {
  code: string;
  name: string;
  isActive?: boolean;
  power?: string;
};

export type Coordinate = {
  latitude: number;
  longitude: number;
};

const SuspectsFileSchema = z.object({
  answer: z.array(
    z.object({
      name: z.string(),
      surname: z.string(),
      born: z.number(),
      city: z.string(),
      tags: z.array(z.string())
    })
  )
});

const PowerPlantEntrySchema = z.object({
  code: z.string().min(1),
  is_active: z.boolean().optional(),
  power: z.string().optional()
});

const PowerPlantsPayloadSchema = z.object({
  power_plants: z.record(PowerPlantEntrySchema)
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Brak zmiennej środowiskowej ${name}. Uzupełnij .env w katalogu głównym repo.`);
  }
  return value.trim();
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} przy ${init?.method ?? 'GET'} ${url}\n${text}`);
  }
  return res.json();
}

export async function loadSuspects(): Promise<Suspect[]> {
  const jsonPath = resolve(process.cwd(), '..', 's01e01', 'answer_final.json');
  const content = await fs.readFile(jsonPath, 'utf8');
  const parsed = SuspectsFileSchema.parse(JSON.parse(content));

  return parsed.answer.map((s) => ({
    name: s.name,
    surname: s.surname,
    born: s.born,
    city: s.city,
    tags: s.tags
  }));
}

/** Pobiera listę elektrowni z huba. Zwraca tylko aktywne (is_active !== false). */
export async function loadPowerPlants(): Promise<PowerPlant[]> {
  const key = requireEnv('AIDEVS_KEY');
  const url = `https://hub.ag3nts.org/data/${encodeURIComponent(key)}/findhim_locations.json`;

  const raw = await fetchJson(url);
  const parsed = PowerPlantsPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    const keys =
      raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.keys(raw as object) : [];
    throw new Error(
      [
        'Nieoczekiwany format JSON z findhim_locations.json.',
        `Walidacja: ${parsed.error.issues[0]?.message ?? 'unknown error'}`,
        keys.length ? `Klucze w obiekcie: ${keys.join(', ')}` : `Typ odpowiedzi: ${typeof raw}`
      ].join('\n')
    );
  }

  const entries = parsed.data.power_plants;
  const all = Object.entries(entries).map(([name, plant]) => ({
    name,
    code: plant.code,
    isActive: plant.is_active,
    power: plant.power
  }));
  return all.filter((p) => p.isActive !== false);
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

let lastNominatimCall = 0;
const NOMINATIM_MIN_INTERVAL_MS = 1100;

async function nominatimThrottle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastNominatimCall;
  if (elapsed < NOMINATIM_MIN_INTERVAL_MS) {
    await sleepMs(NOMINATIM_MIN_INTERVAL_MS - elapsed);
  }
}

/** Geokodowanie nazwy miejsca (miasto / elektrownia) przez Nominatim (OpenStreetMap). Bez klucza API. Respektuje 1 req/s. */
export async function geocodePlace(placeName: string): Promise<Coordinate> {
  await nominatimThrottle();
  console.log('[OSM] Geokodowanie:', placeName);
  const query = encodeURIComponent(`${placeName.trim()}, Poland`);
  const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'AI_DEVS4-findhim/1.0 (TypeScript)' }
  });
  if (!res.ok) {
    throw new Error(`Geokodowanie nie powiodło się dla "${placeName}": HTTP ${res.status}`);
  }
  const data = (await res.json()) as { lat?: string; lon?: string }[];
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`Brak wyników geokodowania dla: ${placeName}`);
  }
  const lat = Number.parseFloat(data[0].lat ?? '');
  const lon = Number.parseFloat(data[0].lon ?? '');
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`Nieprawidłowe współrzędne z geokodowania: ${placeName}`);
  }
  lastNominatimCall = Date.now();
  return { latitude: lat, longitude: lon };
}

/** Reverse geocode: współrzędne → nazwa miejscowości (Nominatim/OSM). Respektuje 1 req/s. */
export async function reverseGeocodePlace(lat: number, lon: number): Promise<string> {
  await nominatimThrottle();
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'AI_DEVS4-findhim/1.0 (TypeScript)' }
  });
  if (!res.ok) {
    lastNominatimCall = Date.now();
    return `${lat}, ${lon}`;
  }
  const data = (await res.json()) as { address?: { city?: string; town?: string; village?: string; municipality?: string; county?: string }; display_name?: string };
  const addr = data.address;
  if (addr) {
    const name = addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? addr.county;
    if (name) return name;
  }
  lastNominatimCall = Date.now();
  return typeof data.display_name === 'string' ? data.display_name.split(',')[0]?.trim() ?? `${lat}, ${lon}` : `${lat}, ${lon}`;
}

export type PowerPlantWithCoordinates = PowerPlant & { coordinates: Coordinate };

/** Zwraca elektrownie z współrzędnymi (tylko aktywne – loadPowerPlants już je filtruje). */
export async function loadPowerPlantsWithCoordinates(): Promise<PowerPlantWithCoordinates[]> {
  const plants = await loadPowerPlants();
  const result: PowerPlantWithCoordinates[] = [];
  for (const p of plants) {
    const coordinates = await geocodePlace(p.name);
    result.push({ ...p, coordinates });
  }
  return result;
}

export type VerifyAnswer = {
  name: string;
  surname: string;
  accessLevel: number;
  powerPlant: string;
};

export async function sendResultToVerify(answer: VerifyAnswer): Promise<{ ok: boolean; body: unknown }> {
  console.log('[verify] Wysyłam:', JSON.stringify(answer));
  const apikey = requireEnv('AIDEVS_KEY');
  const res = await fetch('https://hub.ag3nts.org/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ apikey, task: 'findhim', answer })
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, body };
}

export async function getLocationsForPerson(person: {
  name: string;
  surname: string;
}): Promise<Coordinate[]> {
  const apikey = requireEnv('AIDEVS_KEY');

  const data = (await fetchJson('https://hub.ag3nts.org/api/location', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({
      apikey,
      name: person.name,
      surname: person.surname
    })
  })) as { latitude: number; longitude: number }[];

  return data.map((c) => ({
    latitude: c.latitude,
    longitude: c.longitude
  }));
}

export async function getAccessLevel(person: {
  name: string;
  surname: string;
  birthYear: number;
}): Promise<number> {
  const apikey = requireEnv('AIDEVS_KEY');

  const data = (await fetchJson('https://hub.ag3nts.org/api/accesslevel', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({
      apikey,
      name: person.name,
      surname: person.surname,
      birthYear: person.birthYear
    })
  })) as { accessLevel: number };

  if (typeof data.accessLevel !== 'number') {
    throw new Error('Brak poprawnego pola accessLevel w odpowiedzi /api/accesslevel.');
  }

  return data.accessLevel;
}

export function haversineDistanceKm(a: Coordinate, b: Coordinate): number {
  const R = 6371; // promień Ziemi w km
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);

  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

export type NearestPlantResult = {
  name: string;
  surname: string;
  nearest_plant_code: string;
  distance_km: number;
};

/** Dla jednej osoby zwraca kod najbliższej elektrowni (aktywnej) i odległość w km. */
export async function getNearestPlantForPerson(name: string, surname: string): Promise<NearestPlantResult> {
  const locations = await getLocationsForPerson({ name, surname });
  if (locations.length === 0) {
    return { name, surname, nearest_plant_code: '', distance_km: Infinity };
  }
  const plants = await loadPowerPlantsWithCoordinates();
  let minDistance = Infinity;
  let nearestCode = '';
  for (const loc of locations) {
    for (const plant of plants) {
      const d = haversineDistanceKm(loc, plant.coordinates);
      if (d < minDistance) {
        minDistance = d;
        nearestCode = plant.code;
      }
    }
  }
  return {
    name,
    surname,
    nearest_plant_code: nearestCode,
    distance_km: Math.round(minDistance * 100) / 100
  };
}

