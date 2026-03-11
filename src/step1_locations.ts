import 'dotenv/config';
import { z } from 'zod';

const LocationSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1)
});

const PowerPlantSchema = z.object({
  code: z.string().min(1),
  is_active: z.boolean().optional(),
  power: z.string().optional()
});

const LocationsPayloadSchema = z.union([
  z.array(LocationSchema),
  z.object({ locations: z.array(LocationSchema) }),
  z.object({ data: z.array(LocationSchema) }),
  z.object({ power_plants: z.record(PowerPlantSchema) })
]);

function extractLocations(payload: z.infer<typeof LocationsPayloadSchema>): z.infer<typeof LocationSchema>[] {
  if (Array.isArray(payload)) return payload;
  if ('locations' in payload) return payload.locations;
  if ('data' in payload) return payload.data;
  // power_plants: mapa { "<nazwa>": { code, ... } }
  return Object.entries(payload.power_plants).map(([name, plant]) => ({
    name,
    code: plant.code
  }));
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(
      `Brak zmiennej środowiskowej ${name}. Uzupełnij .env (zobacz .env.example).`
    );
  }
  return value.trim();
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} przy GET ${url}\n${text}`);
  }
  return res.json();
}

async function main() {
  const key = requireEnv('AIDEVS_KEY');
  const url = `https://hub.ag3nts.org/data/${encodeURIComponent(key)}/findhim_locations.json`;

  const raw = await fetchJson(url);
  const parsed = LocationsPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    const keys =
      raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.keys(raw as object) : [];
    throw new Error(
      [
        'Nieoczekiwany format JSON z endpointu (krok 1).',
        `Walidacja: ${parsed.error.issues[0]?.message ?? 'unknown error'}`,
        keys.length ? `Klucze w obiekcie: ${keys.join(', ')}` : `Typ odpowiedzi: ${typeof raw}`
      ].join('\n')
    );
  }

  const locations = extractLocations(parsed.data);

  console.log(`Pobrano ${locations.length} elektrowni:`);
  for (const loc of locations) {
    console.log(`- ${loc.code}: ${loc.name}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

