import dotenv from 'dotenv';
import { resolve } from 'node:path';
import {
  loadSuspects,
  loadPowerPlants,
  loadPowerPlantsWithCoordinates,
  getLocationsForPerson,
  getAccessLevel,
  haversineDistanceKm,
  sendResultToVerify,
  type Coordinate,
  type VerifyAnswer
} from './findhim_tools.js';
import { findGlobalClosestPair } from './findhim_logic.js';

dotenv.config();
dotenv.config({ path: resolve(process.cwd(), '..', '.env') });
dotenv.config({ path: resolve(process.cwd(), '..', '..', '.env') });

const MAX_ITERATIONS = 14;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Brak zmiennej ${name}. Dodaj do .env w katalogu głównym repo.`);
  }
  return value.trim();
}

/** Agent (LLM) podaje współrzędne miejsca – bez zewnętrznego API geokodowania. */
async function geocodePlaceViaLLM(placeName: string, apiKey: string): Promise<Coordinate> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://example.local',
      'X-Title': 'AI_DEVS4 findhim geocode'
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: `Podaj przybliżone współrzędne geograficzne (latitude, longitude) dla miejscowości "${placeName}" w Polsce. Odpowiedz wyłącznie w formacie JSON, bez innych słów: {"latitude": number, "longitude": number}`
        }
      ],
      max_tokens: 100
    })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LLM geocode HTTP ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content?.trim() ?? '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`LLM nie zwróciło JSON dla: ${placeName}`);
  const parsed = JSON.parse(jsonMatch[0]) as { latitude?: number; longitude?: number };
  const lat = Number(parsed.latitude);
  const lon = Number(parsed.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`Nieprawidłowe współrzędne z LLM dla: ${placeName}`);
  }
  return { latitude: lat, longitude: lon };
}

const TOOLS: { type: 'function'; function: { name: string; description: string; parameters: object } }[] = [
  {
    type: 'function',
    function: {
      name: 'load_suspects',
      description: 'Pobiera listę podejrzanych osób z answer_final.json (s01e01).',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'load_power_plants',
      description: 'Pobiera listę elektrowni z findhim_locations.json (kody i nazwy miast).',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_person_locations',
      description: 'Pobiera listę współrzędnych (latitude, longitude), gdzie widziano daną osobę.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Imię' },
          surname: { type: 'string', description: 'Nazwisko' }
        },
        required: ['name', 'surname']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_access_level',
      description: 'Pobiera poziom dostępu osoby (birthYear = rok urodzenia, np. 1987).',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          surname: { type: 'string' },
          birthYear: { type: 'integer', description: 'Rok urodzenia' }
        },
        required: ['name', 'surname', 'birthYear']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'compute_distance_km',
      description: 'Oblicza odległość w km między dwoma punktami (wzór Haversine).',
      parameters: {
        type: 'object',
        properties: {
          lat1: { type: 'number' },
          lon1: { type: 'number' },
          lat2: { type: 'number' },
          lon2: { type: 'number' }
        },
        required: ['lat1', 'lon1', 'lat2', 'lon2']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_plant_coordinates',
      description: 'Zwraca współrzędne (latitude, longitude) dla wszystkich elektrowni (po nazwie miasta). Użyj przed liczeniem odległości.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  }
];

type ToolCall = { id: string; type: string; function: { name: string; arguments: string } };
type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

function runTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'load_suspects':
      return loadSuspects().then((s) => JSON.stringify(s, null, 0));
    case 'load_power_plants':
      return loadPowerPlants().then((p) => JSON.stringify(p, null, 0));
    case 'get_person_locations': {
      const name_ = String(args.name ?? '');
      const surname = String(args.surname ?? '');
      if (!name_ || !surname) return Promise.resolve(JSON.stringify({ error: 'name i surname są wymagane' }));
      return getLocationsForPerson({ name: name_, surname }).then((c) => JSON.stringify(c, null, 0));
    }
    case 'get_access_level': {
      const name_ = String(args.name ?? '');
      const surname = String(args.surname ?? '');
      const birthYear = Number(args.birthYear);
      if (!name_ || !surname || !Number.isInteger(birthYear)) {
        return Promise.resolve(JSON.stringify({ error: 'name, surname i birthYear (liczba) są wymagane' }));
      }
      return getAccessLevel({ name: name_, surname, birthYear }).then((level) => JSON.stringify({ accessLevel: level }));
    }
    case 'compute_distance_km': {
      const lat1 = Number(args.lat1);
      const lon1 = Number(args.lon1);
      const lat2 = Number(args.lat2);
      const lon2 = Number(args.lon2);
      const d = haversineDistanceKm(
        { latitude: lat1, longitude: lon1 },
        { latitude: lat2, longitude: lon2 }
      );
      return Promise.resolve(JSON.stringify({ distanceKm: d }));
    }
    case 'get_plant_coordinates':
      return (async () => {
        const plants = await loadPowerPlants();
        const apiKey = requireEnv('OPENROUTER_API_KEY');
        const result: { name: string; code: string; latitude: number; longitude: number }[] = [];
        for (const p of plants) {
          const coords = await geocodePlaceViaLLM(p.name, apiKey);
          result.push({ name: p.name, code: p.code, latitude: coords.latitude, longitude: coords.longitude });
        }
        return JSON.stringify(result, null, 0);
      })();
    default:
      return Promise.resolve(JSON.stringify({ error: `Nieznane narzędzie: ${name}` }));
  }
}

async function main() {
  const apiKey = requireEnv('OPENROUTER_API_KEY');

  const systemPrompt = `Jesteś agentem rozwiązującym zadanie "findhim".
Masz listę podejrzanych i listę elektrowni atomowych (z kodami jak PWR1234PL).
Twoje zadanie:
1. Pobierz listę podejrzanych (load_suspects) i listę elektrowni z współrzędnymi (get_plant_coordinates).
2. Dla każdej osoby pobierz jej lokalizacje (get_person_locations) i policz minimalną odległość do którejkolwiek elektrowni (compute_distance_km).
3. Znajdź osobę, która była NAJBLIJEJ którejś elektrowni (najmniejsza odległość).
4. Pobierz jej poziom dostępu (get_access_level) z polem birthYear = rok urodzenia tej osoby (pole "born" z listy podejrzanych).
5. Odpowiedz JEDEN raz, w formacie JSON, wyłącznie takim obiektem (bez dodatkowego tekstu):
{"name":"Imię","surname":"Nazwisko","accessLevel":liczba,"powerPlant":"KOD_ELEKTROWNI"}
Kod elektrowni to format PWR0000PL (np. PWR3847PL).`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Znajdź osobę podejrzaną, która była najbliżej którejś elektrowni. Użyj narzędzi, a na koniec podaj wynik w formacie JSON: {"name":"...","surname":"...","accessLevel":...,"powerPlant":"PWR....PL"}' }
  ];

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://example.local',
        'X-Title': 'AI_DEVS4 S1E2 findhim'
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages,
        tools: TOOLS,
        tool_choice: 'auto',
        max_tokens: 4096
      })
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenRouter HTTP ${res.status}\n${text}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string | null; tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[] } }[];
    };
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('Brak odpowiedzi w OpenRouter');

    messages.push({
      role: 'assistant',
      content: msg.content ?? null,
      tool_calls: msg.tool_calls
    });

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      const content = msg.content?.trim() ?? '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const agentAnswer = JSON.parse(jsonMatch[0]) as VerifyAnswer;
          if (agentAnswer.name && agentAnswer.surname && typeof agentAnswer.accessLevel === 'number' && agentAnswer.powerPlant) {
            console.log('Odpowiedź agenta (tylko do podglądu):', JSON.stringify(agentAnswer, null, 2));
          }
        } catch {
          //
        }
      }
      if (content) console.log('Odpowiedź modelu:', content.slice(0, 300) + (content.length > 300 ? '...' : ''));
      console.log('Wysyłam na /verify wynik wyliczony offline (deterministycznie), żeby uniknąć błędów modelu.');
      const suspects = await loadSuspects();
      const plants = await loadPowerPlantsWithCoordinates();
      const result = await findGlobalClosestPair(suspects, plants);
      const accessLevel = await getAccessLevel({
        name: result.suspect.name,
        surname: result.suspect.surname,
        birthYear: result.suspect.born
      });
      const verifyAnswer: VerifyAnswer = {
        name: result.suspect.name,
        surname: result.suspect.surname,
        accessLevel,
        powerPlant: result.plant.code
      };
      console.log('Wynik offline:', JSON.stringify(verifyAnswer, null, 2));
      const { ok, body } = await sendResultToVerify(verifyAnswer);
      console.log(ok ? 'Wysłano na /verify OK.' : 'Błąd /verify:', body);
      return;
    }

    for (const tc of msg.tool_calls) {
      const fn = tc.function;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(fn.arguments || '{}');
      } catch {
        //
      }
      const out = await runTool(fn.name, args);
      messages.push({ role: 'tool', tool_call_id: tc.id, content: out });
    }
  }

  console.log('Przekroczono limit iteracji. Uruchamiam ścieżkę offline...');
  const suspects = await loadSuspects();
  const plants = await loadPowerPlantsWithCoordinates();
  const result = await findGlobalClosestPair(suspects, plants);
  const accessLevel = await getAccessLevel({
    name: result.suspect.name,
    surname: result.suspect.surname,
    birthYear: result.suspect.born
  });
  const verifyAnswer: VerifyAnswer = {
    name: result.suspect.name,
    surname: result.suspect.surname,
    accessLevel,
    powerPlant: result.plant.code
  };
  const { ok, body } = await sendResultToVerify(verifyAnswer);
  console.log(ok ? 'Wysłano na /verify OK.' : 'Błąd /verify:', body);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
