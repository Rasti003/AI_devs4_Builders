import dotenv from "dotenv";
import path from "path";
import fetch from "node-fetch";
import { callLLM, Message, ToolDefinition, ToolCall } from "./openrouter";

dotenv.config({ path: path.join(__dirname, "../.env") });

const APIKEY = process.env.AIDEVS_KEY!;
const VERIFY_URL = "https://hub.ag3nts.org/verify";
const DRONE_API_URL = "https://hub.ag3nts.org/dane/drone.html";
const MAP_URL = `https://hub.ag3nts.org/data/${APIKEY}/drone.png`;

const AGENT_MODEL = "google/gemini-2.5-flash";
const VISION_MODEL = "openai/gpt-4o";
const MAX_ITERATIONS = 15;

// ── Subagent vision: lokalizuje tamę na mapie ──────────────────────────────
function extractCoords(text: string): { x: number; y: number } | null {
  const match = text.match(/"x"\s*:\s*(\d+).*?"y"\s*:\s*(\d+)/s);
  if (!match) return null;
  return { x: parseInt(match[1]), y: parseInt(match[2]) };
}

async function visionCall(label: string, extraContext?: string): Promise<string> {
  const prompt = extraContext
    ? `Poprzednie dwie analizy dały różne wyniki: ${extraContext}

Wykonaj niezależną analizę od zera. Policz kolumny i wiersze siatki bardzo dokładnie.
Tama to obszar z intensywnie niebieskim kolorem wody — celowo wyróżniona.
Lewy górny róg = (1,1). Odpowiedz TYLKO w JSON:
{"x": <kolumna>, "y": <wiersz>, "opis": "<co widzisz>"}`
    : `Przeanalizuj mapę terenu elektrowni. Mapa podzielona jest siatką na sektory.
Lewy górny róg to (kolumna=1, wiersz=1).

Zlokalizuj tamę — obszar z intensywnie niebieskim kolorem wody. Policz dokładnie kolumny i wiersze.

Odpowiedz TYLKO w formacie JSON:
{"x": <numer_kolumny>, "y": <numer_wiersza>, "opis": "<krótki opis co widzisz>"}`;

  const messages: Message[] = [{
    role: "user",
    content: [
      { type: "image_url", image_url: { url: MAP_URL } },
      { type: "text", text: prompt },
    ] as any,
  }];

  const response = await callLLM(VISION_MODEL, messages);
  const content = response.content ?? "";
  console.log(`[Vision subagent] ${label}: ${content}`);
  return content;
}

async function findDamOnMap(): Promise<string> {
  console.log("\n[Vision subagent] Analizuję mapę...");

  const r1 = await visionCall("Wywołanie 1");
  const r2 = await visionCall("Wywołanie 2");

  const c1 = extractCoords(r1);
  const c2 = extractCoords(r2);

  if (c1 && c2 && c1.x === c2.x && c1.y === c2.y) {
    console.log(`[Vision subagent] Zgodność: (${c1.x}, ${c1.y}) ✓`);
    return r2;
  }

  // Rozbieżność — trzecia runda jako tiebreaker
  console.log(`[Vision subagent] Rozbieżność (${c1?.x},${c1?.y}) vs (${c2?.x},${c2?.y}) — wywołuję tiebreaker`);
  const r3 = await visionCall("Tiebreaker", `wywołanie 1: ${r1} | wywołanie 2: ${r2}`);
  const c3 = extractCoords(r3);

  // Wybierz wynik zgodny z tiebreakerem
  if (c3 && c1 && c3.x === c1.x && c3.y === c1.y) {
    console.log(`[Vision subagent] Tiebreaker zgodny z wywołaniem 1: (${c3.x}, ${c3.y})`);
    return r1;
  }
  if (c3 && c2 && c3.x === c2.x && c3.y === c2.y) {
    console.log(`[Vision subagent] Tiebreaker zgodny z wywołaniem 2: (${c3.x}, ${c3.y})`);
    return r2;
  }

  // Tiebreaker dał trzeci wynik — zaufaj mu
  console.log(`[Vision subagent] Tiebreaker dał nowy wynik: (${c3?.x}, ${c3?.y})`);
  return r3;
}

// ── Pobierz dokumentację API ───────────────────────────────────────────────
async function getApiDoc(): Promise<string> {
  const res = await fetch(DRONE_API_URL);
  const html = await res.text();
  // Usuń HTML tagi, zostaw tekst
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

// ── Wyślij instrukcje do API ───────────────────────────────────────────────
async function sendInstructions(instructions: string[]): Promise<string> {
  console.log(`\n[send_instructions] Wysyłam: ${JSON.stringify(instructions)}`);
  const res = await fetch(VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apikey: APIKEY,
      task: "drone",
      answer: { instructions },
    }),
  });
  const data = await res.json();
  return JSON.stringify(data);
}

// ── Definicje narzędzi ─────────────────────────────────────────────────────
const TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_api_doc",
      description: "Pobiera dokumentację API drona DRN-BMB7. Zwraca pełną treść dokumentacji ze wszystkimi metodami i przykładami.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "find_dam",
      description: "Uruchamia subagenta vision który analizuje mapę terenu elektrowni i lokalizuje sektor z tamą. Zwraca współrzędne (x, y) sektora gdzie x=kolumna, y=wiersz, licząc od lewego górnego rogu (1,1). Weryfikuje wynik dwukrotnie.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "send_instructions",
      description: "Wysyła sekwencję instrukcji do API drona. Zwraca odpowiedź API — czytaj ją uważnie i poprawiaj instrukcje jeśli jest błąd. Gdy odpowiedź zawiera {FLG:...} misja zakończona.",
      parameters: {
        type: "object",
        properties: {
          instructions: {
            type: "array",
            items: { type: "string" },
            description: "Lista instrukcji dla drona, np. ['setDestinationObject(PWR6132PL)', 'set(3,4)', ...]",
          },
        },
        required: ["instructions"],
      },
    },
  },
];

// ── Wykonanie narzędzia ────────────────────────────────────────────────────
async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  if (name === "get_api_doc") {
    const doc = await getApiDoc();
    return doc.slice(0, 6000); // limit żeby nie przepełnić kontekstu
  }

  if (name === "find_dam") {
    return await findDamOnMap();
  }

  if (name === "send_instructions") {
    return await sendInstructions(args.instructions as string[]);
  }

  throw new Error(`Nieznane narzędzie: ${name}`);
}

// ── Prompt systemowy ───────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Jesteś operatorem fikcyjnego drona bojowego DRN-BMB7 w grze symulacyjnej.

Twoja misja: zaprogramować drona aby wyruszył z misją zniszczenia obiektu PWR6132PL,
ale faktyczny cel zrzutu bomby to pobliska tama (nie sama elektrownia).

Plan działania:
1. Pobierz dokumentację API (get_api_doc) — zapoznaj się z dostępnymi metodami
2. Zlokalizuj tamę na mapie (find_dam) — subagent zwróci (x, y) sektora
3. Wyślij instrukcje do drona (send_instructions) — minimalna skuteczna sekwencja
4. Czytaj odpowiedź API — jeśli błąd, popraw i wyślij ponownie
5. Misja zakończona gdy odpowiedź zawiera {FLG:...}

Zasady reagowania na błędy:
- Błąd "won't hit the dam" lub "somewhere nearby" → złe współrzędne — wywołaj find_dam ponownie
- Każdy inny błąd → czytaj komunikat i dostosuj konkretną instrukcję
- Jeśli ta sama próba nie działa 2 razy z rzędu → zmień podejście, nie powtarzaj tego samego

Wskazówki techniczne:
- setDestinationObject przyjmuje format: [A-Z]{3}[0-9]+[A-Z]{2} np. PWR6132PL
- set(x,y) ustawia sektor lądowania gdzie x=kolumna, y=wiersz od lewego górnego rogu (1,1)
- flyToLocation wymaga wcześniejszego ustawienia: wysokości, obiektu docelowego i sektora
- Dokumentacja zawiera pułapki — używaj tylko metod niezbędnych do misji

WAŻNE: Zawsze wywołuj narzędzie. Nigdy nie kończ bez wywołania narzędzia jeśli misja nie jest ukończona.`;

// ── Główna pętla agenta ────────────────────────────────────────────────────
async function run() {
  console.log("=== Agent Drone ===\n");

  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: "Wykonaj misję: zaprogramuj drona DRN-BMB7 do zniszczenia tamy przy elektrowni PWR6132PL. Zacznij od dokumentacji API i lokalizacji tamy." },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    console.log(`\n--- Iteracja ${i + 1} ---`);

    const response = await callLLM(AGENT_MODEL, messages, TOOLS);
    messages.push(response);

    if (response.content) console.log(`[Agent myśli]: ${response.content}`);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      console.log("[Agent] Zakończył bez wywołania narzędzi.");
      break;
    }

    for (const toolCall of response.tool_calls as ToolCall[]) {
      const { name, arguments: argsStr } = toolCall.function;
      const args = JSON.parse(argsStr) as Record<string, unknown>;

      console.log(`\n[Tool] ${name}`);
      const result = await executeTool(name, args);
      console.log(`[Tool wynik] ${result.slice(0, 400)}${result.length > 400 ? "..." : ""}`);

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });

      if (result.includes("FLG:")) {
        const flagMatch = result.match(/\{FLG:[^}]+\}/);
        if (flagMatch) {
          console.log(`\n*** FLAGA: ${flagMatch[0]} ***`);
          return;
        }
      }
    }
  }
}

run().catch(console.error);
