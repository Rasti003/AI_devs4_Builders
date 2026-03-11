import dotenv from 'dotenv';
import { resolve } from 'node:path';
import {
  loadSuspects,
  loadPowerPlants,
  loadPowerPlantsWithCoordinates,
  getLocationsForPerson,
  getAccessLevel,
  getNearestPlantForPerson,
  haversineDistanceKm,
  reverseGeocodePlace,
  sendResultToVerify,
  type VerifyAnswer
} from './findhim_tools.js';

dotenv.config();
dotenv.config({ path: resolve(process.cwd(), '..', '.env') });
dotenv.config({ path: resolve(process.cwd(), '..', '..', '.env') });

const MAX_ITERATIONS = 14;
const LIGHT_MODEL = 'openai/gpt-4o-mini';
const STRONG_MODEL = 'openai/gpt-5.4';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Brak zmiennej ${name}. Dodaj do .env w katalogu głównym repo.`);
  }
  return value.trim();
}

const TOOLS: { type: 'function'; function: { name: string; description: string; parameters: object } }[] = [
  {
    type: 'function',
    function: {
      name: 'load_suspects',
      description: 'Pobiera listę WSZYSTKICH podejrzanych (name, surname, born, city). W odpowiedzi końcowej podaj name i surname DOKŁADNIE tak jak tutaj (wielkość liter, znaki).',
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
      name: 'get_nearest_plant_for_person',
      description: 'Dla jednej osoby zwraca kod najbliższej elektrowni (nearest_plant_code) i odległość w km (distance_km). Wywołaj dla KAŻDEJ osoby z listy podejrzanych – potem wybierz osobę z NAJMNIEJSZĄ distance_km.',
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
      name: 'reverse_geocode',
      description: 'Przekształca współrzędne (latitude, longitude) w nazwę miejscowości w Polsce. Użyj dla lokalizacji osób – dostaniesz znane nazwy (Warszawa, Gdańsk itd.), co ułatwia wybór właściwej elektrowni i uniknięcie pomyłek.',
      parameters: {
        type: 'object',
        properties: {
          latitude: { type: 'number', description: 'Szerokość geograficzna' },
          longitude: { type: 'number', description: 'Długość geograficzna' }
        },
        required: ['latitude', 'longitude']
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
      description: 'Oblicza odległość w km między dwoma punktami (Haversine). Zapamiętaj kod elektrowni (PWR....PL), dla której odległość była najmniejsza – ten kod musisz podać w polu powerPlant w odpowiedzi końcowej.',
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
      description: 'Zwraca listę elektrowni z findhim_locations.json z współrzędnymi z OpenStreetMap (Nominatim) – nazwa, kod PWR....PL, latitude, longitude. Użyj przed compute_distance_km. W odpowiedzi końcowej powerPlant = kod elektrowni o najmniejszej odległości.',
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
      return loadSuspects().then((s) => {
        const out = JSON.stringify(s, null, 0);
        console.log('[agent] load_suspects ->', s.length, 'osób');
        return out;
      });
    case 'load_power_plants':
      return loadPowerPlants().then((p) => {
        const out = JSON.stringify(p, null, 0);
        console.log('[agent] load_power_plants ->', p.length, 'elektrowni');
        return out;
      });
    case 'get_nearest_plant_for_person': {
      const name_ = String(args.name ?? '');
      const surname = String(args.surname ?? '');
      if (!name_ || !surname) {
        return Promise.resolve(JSON.stringify({ error: 'name i surname są wymagane' }));
      }
      console.log('[agent] get_nearest_plant_for_person(', name_, surname, ')...');
      return getNearestPlantForPerson(name_, surname).then((r) => {
        console.log('[agent]   ->', r.nearest_plant_code, r.distance_km, 'km');
        return JSON.stringify(r, null, 0);
      });
    }
    case 'get_person_locations': {
      const name_ = String(args.name ?? '');
      const surname = String(args.surname ?? '');
      if (!name_ || !surname) return Promise.resolve(JSON.stringify({ error: 'name i surname są wymagane' }));
      console.log('[agent] get_person_locations(', name_, surname, ')...');
      return getLocationsForPerson({ name: name_, surname }).then((c) => {
        const out = JSON.stringify(c, null, 0);
        console.log('[agent]   ->', c.length, 'lokalizacji');
        return out;
      });
    }
    case 'reverse_geocode': {
      const lat = Number(args.latitude);
      const lon = Number(args.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return Promise.resolve(JSON.stringify({ error: 'latitude i longitude (liczby) są wymagane' }));
      }
      console.log('[agent] reverse_geocode(', lat.toFixed(2), lon.toFixed(2), ')...');
      return reverseGeocodePlace(lat, lon).then((placeName) => {
        console.log('[agent]   ->', placeName);
        return JSON.stringify({ placeName });
      });
    }
    case 'get_access_level': {
      const name_ = String(args.name ?? '');
      const surname = String(args.surname ?? '');
      const birthYear = Number(args.birthYear);
      if (!name_ || !surname || !Number.isInteger(birthYear)) {
        return Promise.resolve(JSON.stringify({ error: 'name, surname i birthYear (liczba) są wymagane' }));
      }
      console.log('[agent] get_access_level(', name_, surname, 'born', birthYear, ')...');
      return getAccessLevel({ name: name_, surname, birthYear }).then((level) => {
        console.log('[agent]   -> accessLevel:', level);
        return JSON.stringify({ accessLevel: level });
      });
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
        console.log('[agent] get_plant_coordinates (Nominatim/OSM)...');
        const plants = await loadPowerPlantsWithCoordinates();
        const result = plants.map((p) => ({
          name: p.name,
          code: p.code,
          latitude: p.coordinates.latitude,
          longitude: p.coordinates.longitude
        }));
        console.log('[agent]   ->', result.length, 'elektrowni:', result.map((r) => r.code).join(', '));
        return JSON.stringify(result, null, 0);
      })();
    default:
      return Promise.resolve(JSON.stringify({ error: `Nieznane narzędzie: ${name}` }));
  }
}

/** Kontekst przy ponownej próbie: mocniejszy model dostaje poprzednią odpowiedź i błąd verify. */
interface RetryContext {
  previousAnswer: VerifyAnswer;
  verifyError: unknown;
}

/** Uruchamia agenta z podanym modelem; zwraca odpowiedź i wynik /verify. Gdy brak poprawnego JSON lub limit iteracji – rzuca. */
async function runAgentWithModel(
  apiKey: string,
  model: string,
  retryContext?: RetryContext
): Promise<{ answer: VerifyAnswer; verifyOk: boolean; verifyBody: unknown }> {
  const suspects = await loadSuspects();
  const peopleList = suspects.map((s) => ({ name: s.name, surname: s.surname, born: s.born }));

  const systemPrompt = `ZADANIE (findhim): Namierz, która z podejrzanych osób przebywała najbliżej jednej z elektrowni atomowych. Ustal jej poziom dostępu i kod elektrowni. Odpowiedź prześlij do /verify (task: findhim).

NAJPROSTSZA ŚCIEŻKA:
1) Dla KAŻDEJ osoby z listy podejrzanych wywołaj get_nearest_plant_for_person(name, surname). Dostaniesz distance_km i nearest_plant_code.
2) Porównaj distance_km – poprawna jest TYLKO ta osoba, która ma NAJMNIEJSZĄ wartość (np. 7.2 km < 15 km).
3) Dla tej osoby wywołaj get_access_level(name, surname, birthYear) – birthYear = pole "born" z listy.
4) Odpowiedz JEDEN raz, wyłącznie JSON: {"name":"...","surname":"...","accessLevel":liczba,"powerPlant":"PWR....PL"}. Pole powerPlant = nearest_plant_code wybranej osoby. Name i surname DOKŁADNIE jak na liście (wielkość liter).

Inne narzędzia: load_suspects (lista), get_plant_coordinates (elektrownie z OSM), get_person_locations, compute_distance_km – jeśli wolisz liczyć ręcznie.`;

  const peopleListStr = JSON.stringify(peopleList, null, 0);
  const initialUserContent = retryContext
    ? `Poprzednia odpowiedź odrzucona: ${JSON.stringify(retryContext.previousAnswer)}. Błąd verify: ${JSON.stringify(retryContext.verifyError)}. Rozwiąż od zera.

Podejrzani (name, surname, born):\n${peopleListStr}\n\nDla KAŻDEJ z powyższej listy wywołaj get_nearest_plant_for_person(name, surname). Wybierz osobę z NAJMNIEJSZĄ distance_km. Dla niej get_access_level(birthYear=born). Zwróć JSON: {"name":"...","surname":"...","accessLevel":...,"powerPlant":"PWR....PL"} – name i surname dokładnie z listy.`
    : `Podejrzani (name, surname, born) – to są WSZYSTKIE osoby do sprawdzenia:\n${peopleListStr}\n\nZnajdź osobę, która była najbliżej którejś elektrowni. Dla KAŻDEJ z powyższej listy wywołaj get_nearest_plant_for_person(name, surname). Wybierz osobę z NAJMNIEJSZĄ distance_km. Dla niej wywołaj get_access_level(name, surname, birthYear) z birthYear = born. Odpowiedz jednym JSON: {"name":"...","surname":"...","accessLevel":liczba,"powerPlant":"PWR....PL"} (powerPlant = nearest_plant_code tej osoby).`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: initialUserContent }
  ];

  console.log('[agent] Model:', model, retryContext ? '(retry z kontekstem)' : '');

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    console.log('[agent] Iteracja', iter + 1, '/', MAX_ITERATIONS);
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://example.local',
        'X-Title': 'AI_DEVS4 S1E2 findhim'
      },
      body: JSON.stringify({
        model,
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

    const rawBody = await res.text();
    let data: {
      choices?: { message?: { content?: string | null; tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[] } }[];
    };
    try {
      data = JSON.parse(rawBody) as typeof data;
    } catch (e) {
      throw new Error(`Nie można sparsować odpowiedzi OpenRouter (model ${model}): ${e instanceof Error ? e.message : e}. Początek: ${rawBody.slice(0, 300)}`);
    }
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
            console.log('[agent] Odpowiedź agenta (JSON OK), wysyłam na /verify...');
            const { ok, body } = await sendResultToVerify(agentAnswer);
            return { answer: agentAnswer, verifyOk: ok, verifyBody: body };
          }
        } catch {
          //
        }
      }
      // Pusta odpowiedź – jedna próba doprecyzowania (np. GPT-5 czasem zwraca pusty content)
      if (content.length === 0 && iter < MAX_ITERATIONS - 1) {
        messages.push({
          role: 'user',
          content: 'Twoja ostatnia wiadomość była pusta. Podaj wynik w formacie JSON: {"name":"...","surname":"...","accessLevel":liczba,"powerPlant":"PWR....PL"}'
        });
        continue;
      }
      const rawPreview = content.length > 2000 ? content.slice(0, 2000) + '...[ucięto]' : content;
      const reason =
        content.length === 0
          ? 'Agent zwrócił pustą odpowiedź (0 znaków). Możliwe: ucięta odpowiedź API lub błąd modelu.'
          : 'Agent nie zwrócił poprawnego JSON (name, surname, accessLevel, powerPlant).';
      throw new Error(reason + '\nRaw odpowiedź (' + content.length + ' znaków):\n' + rawPreview);
    }

    console.log('[agent] Wywołania narzędzi:', msg.tool_calls.length);
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

  throw new Error('Przekroczono limit iteracji agenta.');
}

async function main() {
  const apiKey = requireEnv('OPENROUTER_API_KEY');

  console.log('=== Findhim agent ===');
  console.log('Lekki model:', LIGHT_MODEL, '| Mocniejszy (retry):', STRONG_MODEL);
  console.log('Uruchamiam lekki model...\n');

  let result = await runAgentWithModel(apiKey, LIGHT_MODEL);
  console.log('\nOdpowiedź agenta (lekki model):', JSON.stringify(result.answer, null, 2));
  if (result.verifyOk) {
    console.log('Wysłano na /verify OK.');
    return;
  }
  console.log('Błąd /verify:', result.verifyBody);
  console.log('\n--- Jedna próba mocniejszym modelem (z kontekstem) ---\n');
  result = await runAgentWithModel(apiKey, STRONG_MODEL, {
    previousAnswer: result.answer,
    verifyError: result.verifyBody
  });
  console.log('\nOdpowiedź agenta (mocniejszy model):', JSON.stringify(result.answer, null, 2));
  if (result.verifyOk) {
    console.log('Wysłano na /verify OK.');
    return;
  }
  console.log('Verify ponownie nie powiódł się.');
  throw new Error('Verify nie powiódł się także z mocniejszym modelem. ' + JSON.stringify(result.verifyBody));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
